import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';

const SALT_ROUNDS = 10;

export const MIN_PASSWORD_LENGTH = 12;

// Cheap denylist of patterns we never want to see in the wild — the seed
// default, the most common leaked passwords, and trivial keyboard runs. This
// is intentionally tiny: real defense is the length requirement; this just
// catches the most embarrassing footguns (like leaving change-me-please in
// .env).
const PASSWORD_DENYLIST = new Set([
  'change-me-please',
  'change-me-too',
  'password',
  'password1',
  'passw0rd',
  '123456789012',
  'azertyuiopqs',
  'qwertyuiopas',
  'motdepasse12',
]);

export class PasswordPolicyError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
    this.name = 'PasswordPolicyError';
  }
}

// Throws PasswordPolicyError on failure so callers can surface a stable
// machine-readable code (`password_too_short`, `password_too_weak`) to the
// client. Centralised so create/update/seed all share the same rules.
export function validatePassword(pwd) {
  if (typeof pwd !== 'string' || pwd.length < MIN_PASSWORD_LENGTH) {
    throw new PasswordPolicyError('password_too_short');
  }
  if (PASSWORD_DENYLIST.has(pwd.toLowerCase())) {
    throw new PasswordPolicyError('password_too_weak');
  }
}

function newIcalToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function ensureIcalToken(userId) {
  const row = db.prepare(`SELECT ical_token FROM users WHERE id = ?`).get(userId);
  if (!row) return null;
  if (row.ical_token) return row.ical_token;
  let token = newIcalToken();
  while (db.prepare(`SELECT 1 FROM users WHERE ical_token = ?`).get(token)) {
    token = newIcalToken();
  }
  db.prepare(`UPDATE users SET ical_token = ? WHERE id = ?`).run(token, userId);
  return token;
}

export function rotateIcalToken(userId) {
  let token = newIcalToken();
  while (db.prepare(`SELECT 1 FROM users WHERE ical_token = ?`).get(token)) {
    token = newIcalToken();
  }
  db.prepare(`UPDATE users SET ical_token = ? WHERE id = ?`).run(token, userId);
  return token;
}

export function findByIcalToken(token) {
  if (!token) return null;
  return db.prepare(
    `SELECT id, email, name, role FROM users WHERE ical_token = ?`,
  ).get(token);
}

export function findByEmail(email) {
  if (!email) return null;
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase().trim());
}

export function findById(id) {
  return db.prepare(`SELECT id, email, name, role, token_version, created_at FROM users WHERE id = ?`).get(id);
}

export function bumpTokenVersion(userId) {
  db.prepare(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`).run(userId);
}

export function listUsers() {
  return db.prepare(`SELECT id, email, name, role, created_at FROM users ORDER BY id`).all();
}

export function createUser({ email, name, password, role }) {
  validatePassword(password);
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const result = db
    .prepare(`INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)`)
    .run(email.toLowerCase().trim(), name || '', hash, role);
  return findById(result.lastInsertRowid);
}

export function verifyPassword(user, password) {
  if (!user || !password) return false;
  return bcrypt.compareSync(password, user.password_hash);
}

export function ensureSeedUsers() {
  const seeds = [
    {
      email: process.env.ADMIN_EMAIL,
      name: process.env.ADMIN_NAME || 'Admin',
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
    },
    {
      email: process.env.MEMBER_EMAIL,
      name: process.env.MEMBER_NAME || 'Member',
      password: process.env.MEMBER_PASSWORD,
      role: 'member',
    },
  ];

  const created = [];
  for (const s of seeds) {
    if (!s.email || !s.password) continue;
    const existing = findByEmail(s.email);
    if (existing) continue;
    try {
      validatePassword(s.password);
    } catch (err) {
      // The seed shipped with .env.example uses placeholder values that fail
      // the policy on purpose — refuse to boot rather than silently creating
      // an account with a known weak password.
      throw new Error(
        `seed user ${s.email} has an unacceptable password (${err.code}); `
        + `set ${s.role === 'admin' ? 'ADMIN_PASSWORD' : 'MEMBER_PASSWORD'} `
        + `to a value of at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
    }
    createUser(s);
    created.push({ email: s.email, role: s.role });
  }
  return created;
}
