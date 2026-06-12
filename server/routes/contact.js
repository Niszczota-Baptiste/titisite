import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth, requireRole } from '../auth.js';
import { db } from '../db.js';
import { isMailerConfigured, sendMail } from '../mailer.js';

export const contactRouter = Router();

const ADMIN = requireRole('admin');

// Anti-spam cap on the public endpoint, in addition to the honeypot.
// 5/min/IP is enough for a human retyping after a validation error.
const contactLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MIN_MESSAGE = 10;
const MAX_MESSAGE = 5000;
// Pragmatic email shape check — the real validation is the reply bouncing.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public: store a message from the contact form. The hidden `website` field
// is a honeypot — bots fill every field, humans never see it. When tripped we
// answer 200 with the same body as a success so the bot learns nothing.
let _insertMessage;
contactRouter.post('/', contactLimiter, (req, res) => {
  const { name, email, message, website } = req.body || {};

  if (typeof website === 'string' && website.trim() !== '') {
    return res.json({ ok: true });
  }

  if (typeof email !== 'string' || email.length > MAX_EMAIL || !EMAIL_RE.test(email.trim())) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  const msg = typeof message === 'string' ? message.trim() : '';
  if (msg.length < MIN_MESSAGE || msg.length > MAX_MESSAGE) {
    return res.status(400).json({ error: 'invalid_message' });
  }
  const cleanName = (typeof name === 'string' ? name : '').trim().slice(0, MAX_NAME);
  const cleanEmail = email.trim();

  if (!_insertMessage) {
    _insertMessage = db.prepare(
      `INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)`,
    );
  }
  _insertMessage.run(cleanName, cleanEmail, msg);

  // Email notification is best-effort: the message is already stored, a mail
  // failure must not turn the visitor's submission into an error.
  if (isMailerConfigured()) {
    const to = process.env.CONTACT_EMAIL || process.env.ADMIN_EMAIL;
    if (to) {
      sendMail({
        to,
        subject: `[Portfolio] Message de ${cleanName || cleanEmail}`,
        text: `De : ${cleanName || '(anonyme)'} <${cleanEmail}>\n\n${msg}`,
      }).catch((err) => console.error('[contact] mail notification failed:', err?.message));
    }
  }

  res.json({ ok: true });
});

// ── Admin : liste / lu / suppression ────────────────────────────────────────

contactRouter.get('/', requireAuth, ADMIN, (_req, res) => {
  const rows = db.prepare(
    `SELECT id, name, email, message, read, created_at
     FROM contact_messages ORDER BY created_at DESC, id DESC`,
  ).all();
  res.json(rows);
});

contactRouter.patch('/:id/read', requireAuth, ADMIN, (req, res) => {
  const read = req.body?.read === false ? 0 : 1;
  const r = db.prepare(`UPDATE contact_messages SET read = ? WHERE id = ?`).run(read, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true, read: !!read });
});

contactRouter.delete('/:id', requireAuth, ADMIN, (req, res) => {
  const r = db.prepare(`DELETE FROM contact_messages WHERE id = ?`).run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});
