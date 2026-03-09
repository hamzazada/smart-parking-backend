import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plate: { type: String, required: true },
  model: { type: String },
  lastSeen: { type: Date, default: Date.now },
  status: { type: String, enum: ['Active', 'Idle'], default: 'Idle' },
}, { timestamps: true });

export default mongoose.model('Vehicle', vehicleSchema);
