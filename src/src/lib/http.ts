import { BASE_URL } from '../api/client';

/** Erreur API avec le statut HTTP (401 = non connecté). */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Appel JSON authentifié par cookie de session (credentials: 'include'), comme le reste de l'app.
 * `path` est relatif à BASE_URL (ex. '/notifications').
 */
export async function api<T = any>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`${BASE_URL.replace(/\/+$/, '')}${path}`, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    /* réponse sans corps JSON */
  }
  if (!response.ok) {
    throw new ApiError(data?.error || data?.message || 'Une erreur est survenue. Réessayez.', response.status);
  }
  return data as T;
}
