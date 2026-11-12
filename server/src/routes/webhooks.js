/** Payment provider webhooks (PRD §6). No auth: each driver verifies the provider's signature. */
import { Router } from 'express';
import { driver, handleEvent } from '../services/payments/index.js';
import { AppError } from '../utils/AppError.js';

const router = Router();

router.post('/payments/:provider', async (req, res) => {
  const d = driver(req.params.provider);
  let event;
  try {
    event = d.parseWebhook(req);
  } catch (err) {
    throw new AppError(err.status ?? 400, 'INVALID_WEBHOOK', err.message);
  }
  res.json(await handleEvent(event));
});

export default router;
