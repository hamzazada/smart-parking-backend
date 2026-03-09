// backend/src/models/user.model.js
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, select: false },   // optional — OAuth users have no password

  // ── OAuth ────────────────────────────────────────────────
  provider:   { type: String, enum: ['local', 'google', 'github'], default: 'local' },
  providerId: { type: String, default: null },  // Google sub / GitHub id

  role:     { type: String, enum: ['user', 'admin'], default: 'user' },
  status:   { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  avatar:   { type: String, default: null },

  // ── Profile extras ──────────────────────────────────────
  phone:    { type: String, default: '' },
  company:  { type: String, default: '' },
  address:  { type: String, default: '' },
  jobTitle: { type: String, default: '' },

  // ── Notification preferences ────────────────────────────
  notifications: {
    email:           { type: Boolean, default: true  },
    push:            { type: Boolean, default: true  },
    sms:             { type: Boolean, default: false },
    parkingAlerts:   { type: Boolean, default: true  },
    paymentReceipts: { type: Boolean, default: true  },
    systemUpdates:   { type: Boolean, default: false },
  },

  // ── UI preferences ──────────────────────────────────────
  preferences: {
    language:   { type: String,  default: 'English'     },
    timezone:   { type: String,  default: 'PKT (UTC+5)' },
    dateFormat: { type: String,  default: 'DD/MM/YYYY'  },
    currency:   { type: String,  default: 'PKR'         },
    darkMode:   { type: Boolean, default: false         },
  },
}, { timestamps: true });

export default mongoose.models?.User || mongoose.model('User', userSchema);
