/**
 * Dev-only hosted page of the mock payment provider (PRD §6.3). Mounted only outside
 * production. Clicking a button sends a signed webhook to our own endpoint, like a real provider.
 */
import { Router } from 'express';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { deliver, mockDriver } from '../services/payments/mockDriver.js';
import { config } from '../config.js';
import { notFound } from '../utils/AppError.js';

const router = Router();
const WALLET = { wave: 'Wave', orange_money: 'Orange Money', free_money: 'Free Money' };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function load(ref) {
  const payment = await Payment.findOne({ providerRef: ref, provider: 'mock' });
  if (!payment) throw notFound('Paiement');
  return { payment, booking: await Booking.findById(payment.bookingId), state: mockDriver.peek(ref) };
}

router.get('/:ref', async (req, res) => {
  const { payment, booking, state } = await load(req.params.ref);
  const amount = new Intl.NumberFormat('fr-FR').format(payment.amount).replace(/ | /g, ' ');
  const pending = state?.status === 'pending';
  // The page posts to itself, then redirects back to the app.
  res.set('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${config.clientUrl}`);
  res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Paiement test · WinPitch</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f7f5;margin:0;display:grid;place-items:center;min-height:100vh;color:#0e1b14}
main{background:#fff;border:2px solid #0e1b14;border-radius:20px;padding:28px;width:min(380px,calc(100vw - 32px))}
.badge{display:inline-block;background:#ff7a1a;color:#fff;font-weight:800;font-size:12px;letter-spacing:.08em;padding:4px 8px;border-radius:6px}
h1{font-size:28px;margin:12px 0 4px}p{color:#5d6b63;margin:4px 0}form{display:grid;gap:8px;margin-top:20px}
button{font:inherit;font-weight:700;padding:12px;border-radius:12px;border:2px solid #0e1b14;background:#fff;cursor:pointer}
.ok{background:#12a150;border-color:#12a150;color:#fff}</style></head><body><main>
<span class="badge">MODE TEST</span><h1>${amount} FCFA</h1>
<p>${esc(WALLET[payment.method])} · ${esc(payment.phone)}</p><p>Réservation ${esc(booking?.code ?? '')}</p>
${pending ? `<form method="post"><button class="ok" formaction="${esc(req.params.ref)}/success">Payer</button>
<button formaction="${esc(req.params.ref)}/fail">Échec</button><button formaction="${esc(req.params.ref)}/abandon">Abandonner</button></form>`
    : `<p><strong>Paiement déjà traité (${esc(state?.status ?? payment.status)}).</strong></p>`}
</main></body></html>`);
});

/** success | fail | abandon. JSON for the app's test panel, redirect back to the app for the page. */
router.post('/:ref/:outcome', async (req, res) => {
  const { state } = await load(req.params.ref);
  const outcome = { success: 'succeeded', fail: 'failed' }[req.params.outcome];
  const delivered = outcome ? await deliver(req.params.ref, outcome) : false;
  if (req.accepts(['html', 'json']) === 'json') return res.json({ delivered });
  res.redirect(303, state?.returnUrl ?? '/');
});

export default router;
