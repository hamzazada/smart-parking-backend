// backend/src/services/user.service.js
import bcrypt from 'bcryptjs';
import User   from '../models/user.model.js';

export async function findAll() {
  return User.find().select('-password').sort({ createdAt: -1 }).lean();
}

export async function findById(id) {
  return User.findById(id).select('-password').lean();
}

export async function findByEmail(email, includePassword = false) {
  const q = User.findOne({ email: email.toLowerCase().trim() });
  if (includePassword) q.select('+password');
  return q.lean();
}

export async function validatePassword(user, plainPassword) {
  if (!user?.password) return false;
  return bcrypt.compare(plainPassword, user.password);
}

export async function create(data) {
  const { name, email, password, role, status } = data;
  if (!name || !email) throw new Error('Name and email are required');

  const exists = await User.findOne({ email: email.toLowerCase().trim() });
  if (exists) throw new Error('Email already in use');

  const hash = await bcrypt.hash(password || 'SmartPark@123', 12);
  const user  = await User.create({
    name:     name.trim(),
    email:    email.toLowerCase().trim(),
    password: hash,
    role:     role === 'admin' ? 'admin' : 'user',
    status:   status || 'Active',
  });

  const obj = user.toObject();
  delete obj.password;
  return obj;
}

export async function update(id, data) {
  const allowed = ['name', 'email', 'role', 'status', 'phone', 'company', 'address', 'jobTitle', 'avatar'];
  const updates = {};

  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }

  if (data.password) {
    updates.password = await bcrypt.hash(data.password, 12);
  }

  const user = await User.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
    .select('-password').lean();

  if (!user) throw new Error('User not found');
  return user;
}

export async function remove(id) {
  const user = await User.findByIdAndDelete(id);
  if (!user) throw new Error('User not found');
  return true;
}
