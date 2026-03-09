// backend/src/models/support.model.js
import mongoose from 'mongoose';

const replySchema = new mongoose.Schema({
  message:   { type: String, required: true },
  fromAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const supportSchema = new mongoose.Schema({
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name:     { type: String, default: '' },
  email:    { type: String, default: '' },
  category: { type: String, enum: ['General','Booking','Payments','Technical','Security','Other'], default: 'General' },
  subject:  { type: String, required: true },
  message:  { type: String, required: true },
  status:   { type: String, enum: ['Open','In Progress','Resolved','Closed'], default: 'Open' },
  priority: { type: String, enum: ['Low','Medium','High'], default: 'Medium' },
  replies:  { type: [replySchema], default: [] },
  // legacy fields kept for backwards compat
  response:    { type: String, default: null },
  respondedAt: { type: Date,   default: null },
}, { timestamps: true });

export default mongoose.models?.Support || mongoose.model('Support', supportSchema);
