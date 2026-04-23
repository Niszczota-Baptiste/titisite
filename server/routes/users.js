import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { listUsers } from '../users.js';

export const usersRouter = Router();

usersRouter.get('/', requireAuth, requireRole('admin', 'member'), (_req, res) => {
  res.json(listUsers());
});
