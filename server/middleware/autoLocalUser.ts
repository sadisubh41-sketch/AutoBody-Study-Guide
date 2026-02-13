import { Request, Response, NextFunction } from 'express';
import pool from '../db/pool';

const LOCAL_EMAIL = 'local@autobody.local';
let cachedUserId: number | null = null;

/**
 * Auto-login middleware for local/dev mode.
 * Creates a default local user on first request and automatically
 * assigns all requests to that user. This ensures all browsers on
 * the same machine share the same progress data via the database.
 */
export default async function autoLocalUser(req: Request, _res: Response, next: NextFunction) {
  // Already has a session user — skip
  if ((req.session as any)?.userId) {
    return next();
  }

  try {
    // Use cached ID if available
    if (cachedUserId) {
      (req.session as any).userId = cachedUserId;
      return next();
    }

    // Find or create the default local user
    let result = await pool.query('SELECT id FROM users WHERE email = $1', [LOCAL_EMAIL]);

    if (result.rows.length === 0) {
      // Create the default user (password is irrelevant for local mode)
      result = await pool.query(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
        [LOCAL_EMAIL, 'local-no-password']
      );
      console.log('Created default local user for shared progress');
    }

    cachedUserId = result.rows[0].id;
    (req.session as any).userId = cachedUserId;
    next();
  } catch (err) {
    console.error('Auto local user error:', err);
    next();
  }
}
