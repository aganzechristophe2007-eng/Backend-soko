export const BASE_URL = 'http://localhost:5000/api';

export async function apiFetch(endpoint: string, options: RequestInit = {}) {
  const isFormData = options.body instanceof FormData;

  const headers: HeadersInit = {
    // 👇 Ne jamais forcer 'application/json' sur un FormData : le navigateur doit
    // fixer lui-même le boundary multipart, sinon l'upload d'images/vidéo casse.
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  const url = `${BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
    // 🔒 Seule source de vérité pour la session : le cookie HttpOnly envoyé par le backend.
    // (le token localStorage a été retiré : un token lisible en JS est vulnérable au XSS)
    credentials: 'include',
  });

  let data: any;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error: any = new Error(data.error || data.message || 'Erreur lors de la requête réseau');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}