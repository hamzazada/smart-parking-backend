import mongoose from 'mongoose';
import dotenv from 'dotenv';
// Note the './src' path - this works because the file is in the root
import Booking from './src/models/booking.model.js';
import User from './src/models/user.model.js';

dotenv.config();

const historyData = [
  { vehicleId: "VH-7890", slot: "A2", entryTime: "09:15 AM", exitTime: "11:30 AM", amount: 112, status: "Completed" },
  { vehicleId: "VH-4567", slot: "A4", entryTime: "10:00 AM", exitTime: "03:45 PM", amount: 287, status: "Completed" },
  { vehicleId: "VH-1234", slot: "A1", entryTime: "11:20 AM", exitTime: "12:15 PM", amount: 46, status: "Completed" },
  { vehicleId: "VH-9876", slot: "A6", entryTime: "01:10 PM", exitTime: "02:30 PM", amount: 85, status: "Completed" }
];

function parseTime(timeStr) {
  const [time, modifier] = timeStr.split(' ');
  let [hours, minutes] = time.split(':');
  if (hours === '12') hours = '00';
  if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
  const date = new Date();
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
  return date;
}

async function seed() {
  const mongoUri = process.env.MONGODB_NON_SRV || process.env.MONGODB_URI;
  if (!mongoUri) { console.error("No MONGODB_URI in .env"); process.exit(1); }
  await mongoose.connect(mongoUri);

  try {
    let user = await User.findOne();
    if (!user) {
        console.log("Creating dummy user...");
        user = await User.create({ name: "Seeder", email: "seeder@test.com", password: "hash", role: "user" });
    }
    const bookings = historyData.map(item => ({
      user: user._id,
      vehiclePlate: item.vehicleId,
      slot: item.slot,
      start: parseTime(item.entryTime),
      end: parseTime(item.exitTime),
      amount: item.amount,
      status: item.status,
    }));
    await Booking.insertMany(bookings);
    console.log('✅ History imported!');
  } catch (err) { console.error(err); } 
  finally { await mongoose.disconnect(); }
}
seed();