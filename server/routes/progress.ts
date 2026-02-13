import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import requireAuth from '../middleware/requireAuth';

const router = Router();

router.get('/progress/:bookId', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    const { bookId } = req.params;

    const result = await pool.query(
      'SELECT book_id, data, updated_at FROM progress WHERE user_id = $1 AND book_id = $2',
      [userId, bookId]
    );

    if (result.rows.length === 0) {
      return res.json({ book_id: bookId, data: null, updated_at: null });
    }

    const row = result.rows[0];
    res.json({ book_id: row.book_id, data: row.data, updated_at: row.updated_at });
  } catch (err) {
    console.error('Load progress error:', err);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

router.post('/progress', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    const { book_id, data } = req.body;

    if (!book_id) {
      return res.status(400).json({ error: 'book_id is required' });
    }

    const result = await pool.query(
      `INSERT INTO progress (user_id, book_id, data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, book_id)
       DO UPDATE SET data = $3, updated_at = NOW()
       RETURNING book_id, updated_at`,
      [userId, book_id, JSON.stringify(data)]
    );

    res.json({ book_id: result.rows[0].book_id, updated_at: result.rows[0].updated_at });
  } catch (err) {
    console.error('Save progress error:', err);
    res.status(500).json({ error: 'Failed to save progress' });
  }
});

export default router;
