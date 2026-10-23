import { BASE_URL } from '../api/client';

/**
 * Petit client JSON pour les écritures (POST/PATCH) : cookie de session inclus (credentials),
 * erreurs normalisées. Les lectures existantes continuent d'utiliser apiFetch.
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* corps vide */ }
  if (!res.ok) throw new ApiError(data?.error || data?.message || 'Une erreur est survenue. Réessayez.', res.status);
  return data as T;
}
