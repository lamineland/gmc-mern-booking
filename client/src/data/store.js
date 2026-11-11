/**
 * Tiny sessionStorage-backed store shared by the mock data modules, so player bookings,
 * owner manual bookings and time blocks all see each other (the server's job later).
 */
export const KEYS = {
  payments: 'winpitch-mock-payments',
  owner: 'winpitch-mock-owner',
};

export function readJSON(key, fallback) {
  try {
    return JSON.parse(sessionStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: data lives until reload */
  }
}
