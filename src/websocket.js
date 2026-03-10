// backend/src/websocket.js
// WebSocket server — handles:
//   1. Raspberry Pi hardware connection (sends health, camera events, barrier events)
//   2. Admin browser connections (receives live data, sends commands)
//
// Usage: import { initWebSocket } from './websocket.js'; initWebSocket(server);

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import url from 'url';

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

// Track connected clients by type
const adminClients = new Set();  // browser admin connections
let   piClient     = null;        // Raspberry Pi hardware connection

// ── helpers ───────────────────────────────────────────────────
function broadcast(clients, data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);  // 1 = OPEN
  }
}

function sendToAdmins(data) {
  broadcast(adminClients, data);
}

function sendToPi(data) {
  if (piClient && piClient.readyState === 1) {
    piClient.send(JSON.stringify(data));
    return true;
  }
  return false;
}

// ── init ──────────────────────────────────────────────────────
export function initWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const path      = parsedUrl.pathname;
    const token     = parsedUrl.query.token || req.headers['authorization']?.replace('Bearer ', '');

    // ── /ws/pi — Raspberry Pi hardware ──────────────────────
    if (path === '/ws/pi') {
      const piSecret = parsedUrl.query.secret;
      if (piSecret !== (process.env.PI_SECRET || 'pi_secret_key')) {
        ws.close(4001, 'Unauthorized');
        console.log('[WS] Pi connection rejected: invalid secret');
        return;
      }

      piClient = ws;
      console.log('[WS] Raspberry Pi connected');
      sendToAdmins({ type: 'pi_status', data: { status: 'connected' } });

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          handlePiMessage(msg);
        } catch (e) {
          console.error('[WS] Pi invalid JSON:', e.message);
        }
      });

      ws.on('close', () => {
        piClient = null;
        console.log('[WS] Raspberry Pi disconnected');
        sendToAdmins({
          type: 'pi_status',
          data: { status: 'disconnected' },
        });
        sendToAdmins({
          type: 'alert',
          data: { message: 'Raspberry Pi disconnected', severity: 'error' },
        });
      });

      ws.on('error', (e) => console.error('[WS] Pi error:', e.message));
      return;
    }

    // ── /ws/admin — Admin browser client ─────────────────────
    if (path === '/ws/admin') {
      // Verify JWT
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') {
          ws.close(4003, 'Forbidden');
          return;
        }
        ws.userId = decoded.sub;
      } catch {
        ws.close(4001, 'Unauthorized');
        return;
      }

      adminClients.add(ws);
      console.log(`[WS] Admin connected: ${ws.userId} (total: ${adminClients.size})`);

      // Send current Pi status on connect
      ws.send(JSON.stringify({
        type: 'pi_status',
        data: { status: piClient ? 'connected' : 'disconnected' },
      }));

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw);
          handleAdminCommand(msg, ws);
        } catch (e) {
          console.error('[WS] Admin invalid JSON:', e.message);
        }
      });

      ws.on('close', () => {
        adminClients.delete(ws);
        console.log(`[WS] Admin disconnected (remaining: ${adminClients.size})`);
      });

      ws.on('error', (e) => console.error('[WS] Admin error:', e.message));
      return;
    }

    // Unknown path
    ws.close(4004, 'Unknown path');
  });

  // ── Heartbeat — ping all clients every 30s ────────────────
  setInterval(() => {
    for (const ws of adminClients) {
      if (ws.readyState !== 1) { adminClients.delete(ws); continue; }
      ws.ping();
    }
    if (piClient && piClient.readyState !== 1) piClient = null;
  }, 30_000);

  console.log('[WS] WebSocket server initialized on /ws');
  return wss;
}

// ── Handle messages from Raspberry Pi ────────────────────────
function handlePiMessage(msg) {
  switch (msg.type) {
    // Pi sends periodic system health data
    case 'system_health':
      // Forward to all admins
      sendToAdmins({ type: 'system_health', data: msg.data });
      break;

    // Pi sends slot occupancy updates (from camera/sensors)
    case 'slot_update':
      sendToAdmins({ type: 'slot_update', data: msg.data });
      break;

    // Pi sends barrier events (opened/closed/error)
    case 'barrier_event':
      sendToAdmins({ type: 'barrier_event', data: msg.data });
      break;

    // Pi sends camera events (streaming, error, reconnected)
    case 'camera_event':
      sendToAdmins({ type: 'camera_event', data: msg.data });
      break;

    // Pi sends a general alert
    case 'alert':
      sendToAdmins({ type: 'alert', data: msg.data });
      break;

    // Pi sends a plate detected event (from ANPR)
    case 'plate_detected':
      sendToAdmins({ type: 'plate_detected', data: msg.data });
      break;

    default:
      // Forward unknown messages as-is to admins
      sendToAdmins(msg);
  }
}

// ── Handle commands from Admin browser ───────────────────────
function handleAdminCommand(msg, adminWs) {
  const ack = (ok, message) => {
    if (adminWs.readyState === 1) {
      adminWs.send(JSON.stringify({ type: 'command_ack', ok, message, action: msg.action }));
    }
  };

  switch (msg.action) {
    case 'barrier_open':
    case 'barrier_close':
      if (sendToPi({ type: 'command', action: msg.action })) {
        ack(true, `${msg.action} command sent to Pi`);
      } else {
        ack(false, 'Raspberry Pi is not connected');
      }
      break;

    case 'camera_restart':
      if (sendToPi({ type: 'command', action: 'camera_restart' })) {
        ack(true, 'Camera restart command sent');
      } else {
        ack(false, 'Raspberry Pi is not connected');
      }
      break;

    case 'request_health':
      if (sendToPi({ type: 'command', action: 'send_health' })) {
        ack(true, 'Health refresh requested');
      } else {
        ack(false, 'Raspberry Pi is not connected');
      }
      break;

    default:
      ack(false, `Unknown action: ${msg.action}`);
  }
}

// ── Exports for use in other parts of the app ────────────────
export { sendToAdmins, sendToPi };
