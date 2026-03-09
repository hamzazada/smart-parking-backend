// backend/src/models/session.model.js
import mongoose from 'mongoose';

const FEE_PER_HOUR = 50;   // PKR 50/hour
const TAX_RATE     = 0.16; // 16% tax

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    bookingId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'Booking',
      default: null,
    },
    vehiclePlate: {
      type:      String,
      required:  true,
      uppercase: true,
      trim:      true,
    },
    slot: {
      type:    String,
      trim:    true,
    },
    start: {
      type:    Date,
      default: Date.now,
    },
    end: {
      type:    Date,
      default: null,
    },
    extendedHours: {
      type:    Number,
      default: 0,
    },
    status: {
      type:    String,
      enum:    ['Active', 'Completed'],
      default: 'Active',
    },
    // Fixed fee — always PKR 50/hr
    feePerHour: {
      type:    Number,
      default: FEE_PER_HOUR,
    },
    totalFee: {
      type:    Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Virtual: duration in minutes
sessionSchema.virtual('durationMinutes').get(function () {
  const end = this.end || new Date();
  return Math.floor((end - this.start) / 60000);
});

// Virtual: current fee with tax (PKR 50/hr + 16% tax)
sessionSchema.virtual('currentFee').get(function () {
  const end   = this.end || new Date();
  const hours = (end - this.start) / 3600000;
  const base  = hours * FEE_PER_HOUR;
  const total = base * (1 + TAX_RATE);
  return parseFloat(total.toFixed(2));
});

// Auto-calculate totalFee on complete
sessionSchema.pre('save', function (next) {
  if (this.status === 'Completed' && this.end) {
    const hours     = (this.end - this.start) / 3600000;
    const base      = hours * FEE_PER_HOUR;
    this.totalFee   = parseFloat((base * (1 + TAX_RATE)).toFixed(2));
    this.feePerHour = FEE_PER_HOUR;
  }
  next();
});

sessionSchema.set('toJSON',   { virtuals: true });
sessionSchema.set('toObject', { virtuals: true });

export default mongoose.models?.Session || mongoose.model('Session', sessionSchema);