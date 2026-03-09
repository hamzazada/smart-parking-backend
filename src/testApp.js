import express from 'express';
import cors from 'cors';
import usersRouter from './routes/v1/users.routes.js';
import authRouter from './routes/v1/auth.routes.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', usersRouter);
app.use(errorHandler);

export default app;
