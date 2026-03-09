#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';

async function main() {
  const name = process.env.ADMIN_NAME || process.argv[2] || 'Admin';
  const email = process.env.ADMIN_EMAIL || process.argv[3] || 'admin@parking.com';
  const password = process.env.ADMIN_PASSWORD || process.argv[4] || 'admin123';
  const resetPassword = process.argv.includes('--reset-password') || process.env.ADMIN_RESET === 'true';

  const mongoUri = process.env.MONGODB_NON_SRV || process.env.MONGODB_URI || 'mongodb://localhost:27017/test-db';
  console.log(`Connecting to MongoDB: ${mongoUri}`);
  await mongoose.connect(mongoUri);

  try {
    const existing = await User.findOne({ email }).select('+password');
    if (existing) {
      if (existing.role === 'admin' && !resetPassword) {
        console.log(`User with email ${email} already exists and is an admin.`);
      } else {
        existing.role = 'admin';
        if (resetPassword) {
          existing.password = await bcrypt.hash(password, 10);
          console.log('Password has been reset.');
        }
        await existing.save();
        console.log(`User ${email} promoted to admin.`);
      }
    } else {
      const hashed = await bcrypt.hash(password, 10);
      const created = await User.create({ name, email, password: hashed, role: 'admin' });
      console.log(`Created admin user: ${created.email}`);
    }
  } catch (err) {
    console.error('Error creating/promoting admin user:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
