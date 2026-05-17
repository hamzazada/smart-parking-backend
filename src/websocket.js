// backend/src/websocket.js
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import url from 'url';

const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

const adminClients = new Set();
const userClients  = new Set();
let   piClient     = null;

function broadcast(clients, data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(msg);
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

export function broadcastSlotUpdate(data) {
  const msg = JSON.stringify({ type: 'slot_update', data });
  for (const ws of [...adminClients, ...userClients]) {
    if (ws.readyState === 1) ws.send(msg);
  }
}

export function initWebSocket(server) {
 const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const parsedUrl = url.parse(req.url, true);
    const path      = parsedUrl.pathname;
    const token     = parsedUrl.query.token || req.headers['authorization']?.replace('Bearer ', '');

    if (path === '/ws/pi') {
      const piSecret = parsedUrl.query.secret;
      if (piSecret !== (process.env.PI_SECRET || 'pi_secret_key')) {
        ws.close(4001, 'Unauthorized');
        return;
      }
      piClient = ws;
      console.log('[WS] Raspberry Pi connected');
      sendToAdmins({ type: 'pi_status', data: { status: 'connected' } });
      ws.on('message', (raw) => {
        try { handlePiMessage(JSON.parse(raw)); } catch (e) { console.error('[WS] Pi invalid JSON:', e.message); }
      });
      ws.on('close', () => {
        piClient = null;
        sendToAdmins({ type: 'pi_status', data: { status: 'disconnected' } });
        sendToAdmins({ type: 'alert', data: { message: 'Raspberry Pi disconnected', severity: 'error' } });
      });
      ws.on('error', (e) => console.error('[WS] Pi error:', e.message));
      return;
    }

    if (path === '/ws/admin') {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'admin') { ws.close(4003, 'Forbidden'); return; }
        ws.userId = decoded.sub;
      } catch { ws.close(4001, 'Unauthorized'); return; }
      adminClients.add(ws);
      console.log(`[WS] Admin connected: ${ws.userId} (total: ${adminClients.size})`);
      ws.send(JSON.stringify({ type: 'pi_status', data: { status: piClient ? 'connected' : 'disconnected' } }));
      ws.on('message', (raw) => {
        try { handleAdminCommand(JSON.parse(raw), ws); } catch (e) { console.error('[WS] Admin invalid JSON:', e.message); }
      });
      ws.on('close', () => { adminClients.delete(ws); });
      ws.on('error', (e) => console.error('[WS] Admin error:', e.message));
      return;
    }

    if (path === '/ws/user') {
      try { jwt.verify(token, JWT_SECRET); } catch { ws.close(4001, 'Unauthorized'); return; }
      userClients.add(ws);
      console.log(`[WS] User connected (total: ${userClients.size})`);
      ws.on('close', () => { userClients.delete(ws); console.log(`[WS] User disconnected (remaining: ${userClients.size})`); });
      ws.on('error', (e) => console.error('[WS] User error:', e.message));
      return;
    }

    ws.close(4004, 'Unknown path');
  });

  setInterval(() => {
    for (const ws of adminClients) { if (ws.readyState !== 1) { adminClients.delete(ws); continue; } ws.ping(); }
    for (const ws of userClients)  { if (ws.readyState !== 1) { userClients.delete(ws);  continue; } ws.ping(); }
    if (piClient && piClient.readyState !== 1) piClient = null;
  }, 30_000);

  console.log('[WS] WebSocket server initialized on /ws');
  return wss;
}

function handlePiMessage(msg) {
  switch (msg.type) {
    case 'system_health':   sendToAdmins({ type: 'system_health', data: msg.data }); break;
    case 'slot_update':     broadcastSlotUpdate(msg.data); break;
    case 'barrier_event':   sendToAdmins({ type: 'barrier_event', data: msg.data }); break;
    case 'camera_event':    sendToAdmins({ type: 'camera_event', data: msg.data }); break;
    case 'alert':           sendToAdmins({ type: 'alert', data: msg.data }); break;
    case 'plate_detected':  sendToAdmins({ type: 'plate_detected', data: msg.data }); break;
    default:                sendToAdmins(msg);
  }
}

function handleAdminCommand(msg, adminWs) {
  const ack = (ok, message) => {
    if (adminWs.readyState === 1) adminWs.send(JSON.stringify({ type: 'command_ack', ok, message, action: msg.action }));
  };
  switch (msg.action) {
    case 'barrier_open':
    case 'barrier_close':   sendToPi({ type: 'command', action: msg.action }) ? ack(true, `${msg.action} sent`) : ack(false, 'Pi not connected'); break;
    case 'camera_restart':  sendToPi({ type: 'command', action: 'camera_restart' }) ? ack(true, 'Sent') : ack(false, 'Pi not connected'); break;
    case 'request_health':  sendToPi({ type: 'command', action: 'send_health' }) ? ack(true, 'Sent') : ack(false, 'Pi not connected'); break;
    default:                ack(false, `Unknown action: ${msg.action}`);
  }
}

export { sendToAdmins, sendToPi };