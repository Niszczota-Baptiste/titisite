import bcrypt from 'bcryptjs';
import { db } from './db.js';

const SALT_ROUNDS = 10;

export function findByEmail(email) {
  if (!email) return null;
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase().trim());
}

export function findById(id) {
  return db.prepare(`SELECT id, email, name, role, created_at FROM users WHERE id = ?`).get(id);
}

export function listUsers() {
  return db.prepare(`SELECT id, email, name, role, created_at FROM users ORDER BY id`).all();
}

export function createUser({ email, name, password, role }) {
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
    createUser(s);
    created.push({ email: s.email, role: s.role });
  }
  return created;
}
