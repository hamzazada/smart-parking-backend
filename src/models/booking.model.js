import mongoose from 'mongoose';

const BookingSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  slot:         { type: String, required: true },
  vehiclePlate: { type: String, required: true },

  // Status flow: Reserved → Active → Completed | Cancelled
  status: {
    type:    String,
    enum:    ['Reserved', 'Active', 'Completed', 'Cancelled'],
    default: 'Reserved',
  },

  // When the booking was made (slot reserved)
  start: { type: Date, default: Date.now },

  // When the car physically arrived and was checked in → BILLING STARTS HERE
  checkInTime: { type: Date, default: null },

  // How check-in happened
 checkInMethod: {
    type:    String,
    enum:    ['manual', 'anpr', 'admin', null],
    default: null,
  },

  // When they left → BILLING ENDS HERE
  end: { type: Date, default: null },

  // Final calculated amount (only set on completion)
  amount: { type: Number, default: 0 },

}, { timestamps: true });

// Virtual: billing duration in hours (from checkInTime, not booking start)
BookingSchema.virtual('billingHours').get(function () {
  if (!this.checkInTime) return 0;
  const end = this.end || new Date();
  return Math.max(0, (end - this.checkInTime) / 3600000);
});

// Virtual: estimated fee with tax
BookingSchema.virtual('estimatedFee').get(function () {
  const hours = this.billingHours;
  if (hours === 0) return 0;
  const sub = Math.max(0.1, hours) * 50;
  return parseFloat((sub * 1.16).toFixed(2));
});

BookingSchema.set('toJSON',   { virtuals: true });
BookingSchema.set('toObject', { virtuals: true });

export default mongoose.model('Booking', BookingSchema);