import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { getOne, insert, listAll, remove, reorder, update } from '../db.js';

export function collectionRouter(name) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json(listAll(name));
  });

  router.get('/:id', (req, res) => {
    const item = getOne(name, Number(req.params.id));
    if (!item) return res.status(404).json({ error: 'not_found' });
    res.json(item);
  });

  router.post('/', requireAuth, (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'invalid_body' });
    }
    const created = insert(name, req.body);
    res.status(201).json(created);
  });

  router.put('/:id', requireAuth, (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'invalid_body' });
    }
    const updated = update(name, Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'not_found' });
    res.json(updated);
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const ok = remove(name, Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.status(204).end();
  });

  router.post('/reorder', requireAuth, (req, res) => {
    const { order } = req.body || {};
    if (!Array.isArray(order)) return res.status(400).json({ error: 'invalid_order' });
    res.json(reorder(name, order.map(Number)));
  });

  return router;
}
