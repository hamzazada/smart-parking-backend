// backend/fix-vehicle-status.js
// Run ONCE to fix any vehicles stuck as "Active" with no real session
// Command: node fix-vehicle-status.js
//
// Place this file in your backend/ folder (same level as package.json)
// then run:  node fix-vehicle-status.js

import mongoose from 'mongoose';
import dotenv   from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smart-parking';

// Inline schemas (so we don't need to import from src/)
const SessionSchema = new mongoose.Schema({
  user:         mongoose.Schema.Types.ObjectId,
  vehiclePlate: String,
  status:       String,
});
const VehicleSchema = new mongoose.Schema({
  user:   mongoose.Schema.Types.ObjectId,
  plate:  String,
  status: String,
});

const Session = mongoose.model('Session', SessionSchema);
const Vehicle = mongoose.model('Vehicle', VehicleSchema);

async function fix() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // Find all vehicles marked Active
  const activeVehicles = await Vehicle.find({ status: 'Active' }).lean();
  console.log(`Found ${activeVehicles.length} vehicles marked Active`);

  let fixed = 0;
  for (const v of activeVehicles) {
    // Check if there's a real active session for this vehicle
    const session = await Session.findOne({
      user:         v.user,
      vehiclePlate: v.plate.toUpperCase(),
      status:       'Active',
    });

    if (!session) {
      // No real session — reset to Idle
      await Vehicle.findByIdAndUpdate(v._id, { status: 'Idle' });
      console.log(`  Fixed: ${v.plate} → Idle (no active session found)`);
      fixed++;
    } else {
      console.log(`  OK:    ${v.plate} → Active session exists (slot: ${session.slot || '?'})`);
    }
  }

  console.log(`\n✅ Done. Fixed ${fixed} stale vehicle(s).`);
  await mongoose.disconnect();
}

fix().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});