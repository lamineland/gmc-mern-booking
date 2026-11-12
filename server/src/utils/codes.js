import crypto from 'node:crypto';

// No 0/O, 1/I: codes are read out over the phone.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Short booking code, e.g. "WP-7K3D". Uniqueness is enforced by the database index. */
export function bookingCode() {
  const bytes = crypto.randomBytes(4);
  return `WP-${[...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}
