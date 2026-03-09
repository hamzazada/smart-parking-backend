import mongoose from 'mongoose';

const BookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  slot: { type: String, required: true },
  vehiclePlate: { type: String, required: true },
  start: { type: Date, default: Date.now },
  end: { type: Date, default: null },
  status: { type: String, enum: ['Active', 'Completed', 'Cancelled'], default: 'Active' },
  amount: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Booking', BookingSchema);