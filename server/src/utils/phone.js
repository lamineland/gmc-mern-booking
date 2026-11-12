/**
 * Senegal phone numbers to E.164 (PRD §4.1): "77 123 45 67", "+221 77…", "00221 77…" → "+221771234567".
 * Returns null when the number isn't a valid Senegalese mobile number.
 */
export function normalizeSenegalPhone(input) {
  const digits = String(input ?? '').replace(/\D/g, '').replace(/^(00)?221/, '');
  return /^7\d{8}$/.test(digits) ? `+221${digits}` : null;
}

/** "+221771234567" → "+221 77 123 45 67" */
export const formatPhone = (e164) => e164?.replace(/^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/, '+221 $1 $2 $3 $4') ?? e164;
