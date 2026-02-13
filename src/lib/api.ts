const API_BASE = import.meta.env.DEV ? '/api' : '/api';

interface User {
  id: number;
  email: string;
}

interface MeResponse {
  user: User | null;
}

interface ProgressResponse {
  book_id: string;
  data: any;
  updated_at: string | null;
}

interface SaveResponse {
  book_id: string;
  updated_at: string;
}

export async function me(): Promise<MeResponse> {
  try {
    const r = await fetch(`${API_BASE}/me`, { credentials: 'include' });
    if (!r.ok) return { user: null };
    return r.json();
  } catch {
    return { user: null };
  }
}

export async function loadProgress(bookId: string): Promise<ProgressResponse> {
  const r = await fetch(`${API_BASE}/progress/${encodeURIComponent(bookId)}`, {
    credentials: 'include'
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Load failed');
  return j;
}

export async function saveProgress(bookId: string, data: any): Promise<SaveResponse> {
  const r = await fetch(`${API_BASE}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ book_id: bookId, data })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Save failed');
  return j;
}
