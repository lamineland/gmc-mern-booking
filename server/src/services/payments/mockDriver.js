/**
 * Mock payment provider (PRD v2.2 §6.3). Behaves like a real aggregator: hosted payment page,
 * signed webhooks, status lookups and refunds. Never loaded in production.
 *
 * Deterministic test numbers (last two digits of the phone):
 *   00 → succeeds after 3 s · 01 → fails after 3 s · 02 → never answers · other → wait for the test page.
 * MOCK_PAYMENT_AUTO=success|fail|none overrides the phone rule for every payment.
 * Refunds of an amount ending in 13 FCFA fail, to test refund_failed.
 */
import crypto from 'node:crypto';
import { config } from '../../config.js';

const state = new Map(); // providerRef → { status, amount, method, phone, returnUrl }
const AUTO_DELAY_MS = 3000;

export const sign = (body) => crypto.createHmac('sha256', config.mockWebhookSecret).update(body).digest('hex');

const INSTRUCTIONS = {
  wave: 'Ouvre ton app Wave et valide le paiement.',
  orange_money: 'Valide la demande Orange Money avec ton code secret (ou compose #144#).',
  free_money: 'Valide le message Free Money reçu sur ton téléphone.',
};

/** Sends a signed webhook to our own endpoint, exactly like a provider would. */
export async function deliver(providerRef, outcome) {
  const p = state.get(providerRef);
  if (!p || p.status !== 'pending' || !['succeeded', 'failed'].includes(outcome)) return false;
  p.status = outcome;
  const body = JSON.stringify({ ref: providerRef, eventId: `evt_${crypto.randomUUID()}`, status: outcome, amount: p.amount });
  const res = await fetch(`http://127.0.0.1:${config.port}/api/v1/webhooks/payments/mock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Mock-Signature': sign(body) },
    body,
  });
  if (!res.ok) console.error('[mock-pay] webhook refused', res.status, await res.text());
  return res.ok;
}

export const mockDriver = {
  name: 'mock',

  methods: () => ['wave', 'orange_money', 'free_money'],

  async createPayment({ amount, method, customerPhone, returnUrl }) {
    const providerRef = `mock_${crypto.randomBytes(8).toString('hex')}`;
    state.set(providerRef, { status: 'pending', amount, method, phone: customerPhone, returnUrl });
    const rule = config.mockPaymentAuto || { '00': 'success', '01': 'fail', '02': 'none' }[customerPhone.slice(-2)];
    if (rule === 'success' || rule === 'fail') {
      setTimeout(() => deliver(providerRef, rule === 'success' ? 'succeeded' : 'failed').catch(console.error), AUTO_DELAY_MS);
    }
    return {
      providerRef,
      redirectUrl: `${config.apiUrl}/api/v1/mock-pay/${providerRef}`,
      instructions: INSTRUCTIONS[method],
    };
  },

  /** Verifies the signature and returns a normalised event. */
  parseWebhook(req) {
    const given = String(req.get('X-Mock-Signature') ?? '');
    const expected = sign(req.rawBody ?? '');
    if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      const err = new Error('Invalid signature');
      err.status = 401;
      throw err;
    }
    const { ref, eventId, status, amount } = req.body;
    return { providerRef: ref, eventId, status, amount, raw: req.body };
  },

  async getPaymentStatus(providerRef) {
    const p = state.get(providerRef);
    return { status: p?.status ?? 'pending', amount: p?.amount };
  },

  async refund({ providerRef, amount }) {
    const refundRef = `mockrf_${crypto.randomBytes(6).toString('hex')}`;
    return { refundRef, status: amount % 100 === 13 ? 'failed' : 'succeeded', providerRef };
  },

  /** For the dev-only test page. */
  peek: (providerRef) => state.get(providerRef),
};
