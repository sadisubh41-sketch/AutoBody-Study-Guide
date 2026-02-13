import express from 'express';
import session from 'express-session';
import cors from 'cors';
import dotenv from 'dotenv';
import connectPgSimple from 'connect-pg-simple';
import pool from './db/pool';
import authRoutes from './routes/auth';
import progressRoutes from './routes/progress';
import autoLocalUser from './middleware/autoLocalUser';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

const PgSession = connectPgSimple(session);

app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

app.use(express.json());

app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}));

// Auto-assign a default local user so all browsers share the same progress
app.use('/api', autoLocalUser);

app.use('/api', authRoutes);
app.use('/api', progressRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
