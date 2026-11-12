// Thin fetch wrapper. The access token lives in memory; the refresh token is an httpOnly
// cookie the browser sends to /api/v1/auth/* automatically.
let accessToken = null;

export const setAccessToken = (token) => {
  accessToken = token;
};

export async function refreshSession() {
  const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
  if (!res.ok) {
    accessToken = null;
    return null;
  }
  const data = await res.json();
  accessToken = data.accessToken;
  return data.user;
}

export async function api(path, { method = 'GET', body, headers: extra = {}, retry = true } = {}) {
  const isForm = body instanceof FormData;
  const headers = { ...extra };
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    // fetch only rejects when the server can't be reached; its own message is the browser's, in English.
    const err = new Error('Connexion impossible. Vérifie ta connexion internet et réessaie.');
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  if (res.status === 401 && retry && !path.startsWith('/auth/') && (await refreshSession())) {
    return api(path, { method, body, headers: extra, retry: false });
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Le serveur ne répond pas correctement (erreur ${res.status}). Réessaie dans un instant.`);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export const imageUrl = (id) => `/api/v1/images/${id}`;
