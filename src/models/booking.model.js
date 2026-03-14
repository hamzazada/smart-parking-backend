import mongoose from 'mongoose';

const BookingSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  slot:         { type: String, required: true },
  vehiclePlate: { type: String, required: true },

  status: {
    type:    String,
    enum:    ['Reserved', 'Active', 'Completed', 'Cancelled'],
    default: 'Reserved',
  },

  start:       { type: Date, default: Date.now },
  checkInTime: { type: Date, default: null },
  checkInMethod: {
    type:    String,
    enum:    ['manual', 'anpr', 'admin', null],
    default: null,
  },
  end:    { type: Date,    default: null },
  amount: { type: Number,  default: 0 },

  // ✅ Explicit paid flag — prevents "already paid" false positives
  paid:   { type: Boolean, default: false },

}, { timestamps: true });

BookingSchema.virtual('billingHours').get(function () {
  if (!this.checkInTime) return 0;
  const end = this.end || new Date();
  return Math.max(0, (end - this.checkInTime) / 3600000);
});

BookingSchema.virtual('estimatedFee').get(function () {
  const hours = this.billingHours;
  if (hours === 0) return 0;
  return parseFloat((Math.max(0.1, hours) * 50 * 1.16).toFixed(2));
});

BookingSchema.set('toJSON',   { virtuals: true });
BookingSchema.set('toObject', { virtuals: true });

export default mongoose.model('Booking', BookingSchema);