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

export async function api(path, { method = 'GET', body, retry = true } = {}) {
  const isForm = body instanceof FormData;
  const headers = {};
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });

  if (res.status === 401 && retry && !path.startsWith('/auth/') && (await refreshSession())) {
    return api(path, { method, body, retry: false });
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.error?.code;
    throw err;
  }
  return data;
}

export const imageUrl = (id) => `/api/v1/images/${id}`;
