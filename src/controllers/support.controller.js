// backend/src/controllers/support.controller.js
import Support from '../models/support.model.js';

// ─────────────────────────────────────────────────────────────
// GET /api/v1/support/faqs   — public
// Returns hardcoded FAQs (no DB needed)
// ─────────────────────────────────────────────────────────────
export async function getFaqs(req, res, next) {
  try {
    const faqs = [
      {
        id: 'F1', category: 'Booking',
        q: 'How do I book a parking spot?',
        a: 'Go to "Book Parking" from your dashboard. Select your desired slot from the grid, choose your registered vehicle (or type a plate manually), review the confirmation screen, and tap Confirm Booking.',
      },
      {
        id: 'F2', category: 'Payments',
        q: 'What payment methods are accepted?',
        a: 'We accept Credit/Debit cards, JazzCash, EasyPaisa, and Cash (Manual). All payments are processed through the Payment page after your session ends.',
      },
      {
        id: 'F3', category: 'Booking',
        q: 'Can I cancel my booking?',
        a: 'Yes. Go to Book Parking or Active Sessions and click Cancel on any active booking. Cancellation is free. The slot is released immediately.',
      },
      {
        id: 'F4', category: 'Sessions',
        q: 'How do I extend my parking session?',
        a: 'Open Active Sessions, find your session, and click the Extend button. Enter the number of additional hours you need.',
      },
      {
        id: 'F5', category: 'Billing',
        q: 'How is my parking fee calculated?',
        a: 'Fees are charged at PKR 50 per hour, prorated to the minute. A 16% tax is added at checkout. You can see the live running fee on the Active Sessions page.',
      },
      {
        id: 'F6', category: 'Billing',
        q: 'What if I overstay my booking?',
        a: 'Charges continue to accrue at PKR 50/hr for the extra time. You will see the updated amount on Active Sessions. Pay via the Payment page when you are ready to leave.',
      },
      {
        id: 'F7', category: 'Vehicles',
        q: 'Why should I register my vehicle?',
        a: 'Registered vehicles appear as a dropdown on the Book Parking page so you never have to type your plate again. Go to My Vehicles to add or remove vehicles.',
      },
      {
        id: 'F8', category: 'Security',
        q: 'Is my vehicle safe in the parking facility?',
        a: 'Yes. All parking facilities are equipped with 24/7 CCTV surveillance, on-site security personnel, and secure barrier-controlled entry/exit gates.',
      },
      {
        id: 'F9', category: 'Technical',
        q: 'The app is not loading. What should I do?',
        a: 'First check your internet connection. Then try a hard refresh (Ctrl+Shift+R). If the problem persists, clear your browser cache or submit a support ticket and we will investigate.',
      },
      {
        id: 'F10', category: 'General',
        q: 'How do I contact support?',
        a: 'Use the Create Ticket form on this page. Our team responds within 24 hours. For urgent issues you can also call +92 300 1234567.',
      },
    ];
    res.json({ success: true, data: faqs });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/support   — auth required
// Returns all tickets for the logged-in user, newest first
// Query: ?status=Open|In Progress|Resolved|Closed|All
// ─────────────────────────────────────────────────────────────
export async function listTickets(req, res, next) {
  try {
    const userId = req.user._id;
    const { status } = req.query;

    const filter = { user: userId };
    if (status && status !== 'All') filter.status = status;

    const tickets = await Support.find(filter).sort({ createdAt: -1 }).lean();

    // Counts per status for badge display
    const [open, inProgress, resolved] = await Promise.all([
      Support.countDocuments({ user: userId, status: 'Open'        }),
      Support.countDocuments({ user: userId, status: 'In Progress' }),
      Support.countDocuments({ user: userId, status: 'Resolved'    }),
    ]);

    res.json({
      success: true,
      data: tickets,
      counts: { open, inProgress, resolved, total: tickets.length },
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/support   — auth required
// Creates a new support ticket
// Body: { subject, message, category?, name?, email? }
// ─────────────────────────────────────────────────────────────
export async function createTicket(req, res, next) {
  try {
    const userId = req.user._id;
    const { subject, message, category = 'General', name = '', email = '' } = req.body;

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ success: false, message: 'subject and message are required' });
    }

    // Auto-set priority based on category
    const highPriority = ['Payments', 'Security', 'Technical'];
    const priority = highPriority.includes(category) ? 'High' : 'Medium';

    const ticket = await Support.create({
      user: userId,
      name:    name.trim(),
      email:   email.trim(),
      subject: subject.trim(),
      message: message.trim(),
      category,
      priority,
      status: 'Open',
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/support/:id   — auth required
// Get single ticket details
// ─────────────────────────────────────────────────────────────
export async function getTicketById(req, res, next) {
  try {
    const userId = req.user._id;
    const ticket = await Support.findById(req.params.id).lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    if (ticket.user?.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/v1/support/:id   — auth required
// User can delete their own Open ticket
// ─────────────────────────────────────────────────────────────
export async function deleteTicket(req, res, next) {
  try {
    const userId = req.user._id;
    const ticket = await Support.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    if (ticket.user?.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (ticket.status !== 'Open') {
      return res.status(400).json({ success: false, message: 'Only Open tickets can be deleted' });
    }

    await ticket.deleteOne();
    res.json({ success: true, message: 'Ticket deleted' });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/support/admin   — admin only
// Returns ALL tickets from all users
// ─────────────────────────────────────────────────────────────
export async function adminListTickets(req, res, next) {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'All') filter.status = status;

    const tickets = await Support.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const [open, inProgress, resolved] = await Promise.all([
      Support.countDocuments({ status: 'Open' }),
      Support.countDocuments({ status: 'In Progress' }),
      Support.countDocuments({ status: 'Resolved' }),
    ]);

    res.json({
      success: true,
      data: tickets,
      counts: { open, inProgress, resolved, total: tickets.length },
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/support/:id/status   — admin only
// Update ticket status
// ─────────────────────────────────────────────────────────────
export async function updateTicketStatus(req, res, next) {
  try {
    const { status } = req.body;
    const validStatuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const ticket = await Support.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).lean();

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: ticket });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/support/:id/reply   — admin only
// Add admin reply to ticket, auto-set status to In Progress
// ─────────────────────────────────────────────────────────────
export async function replyToTicket(req, res, next) {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ success: false, message: 'message is required' });
    }

    const ticket = await Support.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Add reply
    if (!ticket.replies) ticket.replies = [];
    ticket.replies.push({
      message: message.trim(),
      fromAdmin: true,
      createdAt: new Date(),
    });

    // Auto-move to In Progress if still Open
    if (ticket.status === 'Open') ticket.status = 'In Progress';

    await ticket.save();
    res.json({ success: true, data: ticket.toJSON() });
  } catch (err) {
    next(err);
  }
}