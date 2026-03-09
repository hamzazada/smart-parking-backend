import request from 'supertest';
import mongoose from 'mongoose';
import app from '../testApp.js';

// Basic smoke tests for signup/signin
describe('Auth endpoints', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST || process.env.MONGODB_URI || 'mongodb://localhost:27017/test-db');
  });

  afterAll(async () => {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  });

  test('signup then signin', async () => {
    const user = { name: 'Test User', email: 'test@example.com', password: 'secret' };
    const signupRes = await request(app).post('/api/v1/auth/signup').send(user);
    expect(signupRes.status).toBe(201);
    expect(signupRes.body.data.token).toBeDefined();

    const signinRes = await request(app).post('/api/v1/auth/signin').send({ email: user.email, password: user.password });
    expect(signinRes.status).toBe(200);
    expect(signinRes.body.data.token).toBeDefined();
  }, 20000);
});
