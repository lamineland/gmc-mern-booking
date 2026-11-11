import { Router } from 'express';
import { storage } from '../services/storage.js';
import { notFound } from '../utils/AppError.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const image = await storage.get(req.params.id);
  if (!image) throw notFound('Image');
  res.set({
    'Content-Type': image.contentType,
    'Content-Length': image.size,
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  res.send(image.data);
});

export default router;
