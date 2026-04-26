import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import {
  bumpTokenVersion,
  findByEmail,
  listUsers,
  PasswordPolicyError,
  validatePassword,
} from '../users.js';

export const usersRouter = Router();

const BOTH  = requireRole('admin', 'member');
const ADMIN = requireRole('admin');

usersRouter.get('/', requireAuth, BOTH, (_req, res) => {
  res.json(listUsers());
});

usersRouter.post('/', requireAuth, ADMIN, (req, res) => {
  const { email, name, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_fields' });
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'invalid_role' });
  try {
    validatePassword(password);
  } catch (err) {
    if (err instanceof PasswordPolicyError) return res.status(400).json({ error: err.code });
    throw err;
  }
  if (findByEmail(email)) return res.status(409).json({ error: 'email_taken' });
  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)`)
    .run(email.toLowerCase().trim(), (name || '').trim(), hash, role);
  const row = db.prepare(`SELECT id, email, name, role, created_at FROM users WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(row);
});

usersRouter.put('/:id', requireAuth, ADMIN, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const { name, role, password } = req.body || {};

  if (role && role !== existing.role) {
    if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'invalid_role' });
    if (existing.role === 'admin' && role !== 'admin') {
      const adminCount = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get().n;
      if (adminCount <= 1) return res.status(400).json({ error: 'last_admin' });
    }
  }

  if (password !== undefined && password !== null && password !== '') {
    try {
      validatePassword(password);
    } catch (err) {
      if (err instanceof PasswordPolicyError) return res.status(400).json({ error: err.code });
      throw err;
    }
  }

  const newHash = password ? bcrypt.hashSync(password, 10) : existing.password_hash;

  db.prepare(`
    UPDATE users SET
      name          = COALESCE(?, name),
      role          = COALESCE(?, role),
      password_hash = ?
    WHERE id = ?
  `).run(name ?? null, role ?? null, newHash, id);

  if (password) bumpTokenVersion(id);

  const row = db.prepare(`SELECT id, email, name, role, created_at FROM users WHERE id = ?`).get(id);
  res.json(row);
});

usersRouter.delete('/:id', requireAuth, ADMIN, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'cannot_delete_self' });

  const row = db.prepare(`SELECT role FROM users WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'not_found' });
  if (row.role === 'admin') {
    const adminCount = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin'`).get().n;
    if (adminCount <= 1) return res.status(400).json({ error: 'last_admin' });
  }

  db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
  res.status(204).end();
});
