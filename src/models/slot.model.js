import mongoose from 'mongoose';

const slotSchema = new mongoose.Schema(
  {
    slotNumber: {
      type: String,
      required: [true, 'Slot number is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    floor: {
      type: String,
      default: 'G',
    },
    type: {
      type: String,
      enum: ['standard', 'compact', 'handicapped', 'ev'],
      default: 'standard',
    },
    isOccupied: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Slot', slotSchema);