const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const BASE_URL = API_URL;

export async function apiFetch(
  endpoint: string,
  options: RequestInit = {}
) {
  const isFormData = options.body instanceof FormData;

  const headers: HeadersInit = {
    ...(isFormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  const url = `${BASE_URL}${
    endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  }`;

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  let data: any = {};

  try {
    data = await response.json();
  } catch {
    // Réponse sans JSON
  }

  if (!response.ok) {
    const error: any = new Error(
      data.error ||
      data.message ||
      'Erreur lors de la requête réseau'
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}