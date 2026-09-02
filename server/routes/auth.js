import bcrypt from 'bcryptjs';
import { Router } from 'express';
import {
  clearSessionCookie,
  requireAuth,
  revokeRequestToken,
  setSessionCookie,
} from '../auth.js';
import { findByEmail } from '../users.js';

// Dummy hash used when the email doesn't exist, so the bcrypt work factor is
// always paid regardless of whether the account exists. This prevents
// user-enumeration via response-time differences.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = findByEmail(email);
  const hash = user?.password_hash ?? DUMMY_HASH;
  // Async bcrypt: the hash comparison is ~80-100 ms of CPU. The sync variant
  // would block the event loop for that whole time, stalling every other
  // request (including public audio streaming). We always compare against a
  // dummy hash when the user is missing so the timing stays constant either way.
  const valid = typeof password === 'string' && password.length > 0
    && await bcrypt.compare(password, hash);
  if (!user || !valid) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  setSessionCookie(res, user);
  // No token in body — the cookie is the source of truth. We still return the
  // public user info so the SPA can populate its UI without a follow-up GET.
  const isAdmin = user.role === 'admin';
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      canViewStairs: isAdmin || user.can_view_stairs === 1,
      canViewQuests: isAdmin || user.can_view_quests === 1 || user.can_edit_quests === 1,
      canEditQuests: isAdmin || user.can_edit_quests === 1,
      canViewVault: isAdmin || user.can_view_vault === 1,
      canViewLore: isAdmin || user.can_view_lore === 1,
      canViewItems: isAdmin || user.can_view_items === 1 || user.can_edit_items === 1,
      canEditItems: isAdmin || user.can_edit_items === 1,
    },
    expiresIn: '7d',
  });
});

authRouter.post('/logout', (req, res) => {
  // Best-effort revocation: blocklist the current token so even if it leaked
  // before the logout, it can't be replayed for the rest of its TTL.
  revokeRequestToken(req);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  const { id, email, name, role } = req.user;
  const isAdmin = role === 'admin';
  res.json({
    id,
    email,
    name,
    role,
    canViewStairs: isAdmin || req.user.can_view_stairs === 1,
    canViewQuests: isAdmin || req.user.can_view_quests === 1 || req.user.can_edit_quests === 1,
    canEditQuests: isAdmin || req.user.can_edit_quests === 1,
    canViewVault: isAdmin || req.user.can_view_vault === 1,
    canViewLore: isAdmin || req.user.can_view_lore === 1,
    canViewItems: isAdmin || req.user.can_view_items === 1 || req.user.can_edit_items === 1,
    canEditItems: isAdmin || req.user.can_edit_items === 1,
  });
});
