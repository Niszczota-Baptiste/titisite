import { Router } from 'express';
import { requireAuth, requireRole } from '../auth.js';
import {
  createWorkspace,
  deleteWorkspace,
  findById,
  findBySlug,
  isMember,
  listAll,
  listForUser,
  listMemberIds,
  setMembers,
  updateWorkspace,
} from '../workspaces.js';

export const workspacesRouter = Router();

/**
 * GET /api/workspaces
 *   - admin → all workspaces (includes archived)
 *   - member → only workspaces they belong to (active only by default)
 */
workspacesRouter.get('/', requireAuth, requireRole('admin', 'member'), (req, res) => {
  const all = req.user.role === 'admin' ? listAll() : listForUser(req.user.id);
  // annotate with memberIds so admin UI can show membership
  const enriched = all.map((w) => ({
    ...w,
    memberIds: listMemberIds(w.id),
  }));
  res.json(enriched);
});

workspacesRouter.get('/:slug', requireAuth, requireRole('admin', 'member'), (req, res) => {
  const ws = findBySlug(req.params.slug);
  if (!ws) return res.status(404).json({ error: 'workspace_not_found' });
  if (req.user.role !== 'admin' && !isMember(ws.id, req.user.id)) {
    return res.status(403).json({ error: 'not_a_member' });
  }
  res.json({ ...ws, memberIds: listMemberIds(ws.id) });
});

workspacesRouter.post('/', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const ws = createWorkspace(req.body || {}, req.user.id);
    res.status(201).json({ ...ws, memberIds: listMemberIds(ws.id) });
  } catch (e) {
    if (e.message === 'missing_name') return res.status(400).json({ error: 'missing_name' });
    throw e;
  }
});

workspacesRouter.put('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const existing = findById(id);
  if (!existing) return res.status(404).json({ error: 'not_found' });
  const updated = updateWorkspace(id, req.body || {});
  res.json({ ...updated, memberIds: listMemberIds(updated.id) });
});

workspacesRouter.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const ok = deleteWorkspace(Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

workspacesRouter.put('/:id/members', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const ws = findById(id);
  if (!ws) return res.status(404).json({ error: 'not_found' });
  const { memberIds } = req.body || {};
  if (!Array.isArray(memberIds)) return res.status(400).json({ error: 'invalid_body' });
  setMembers(id, memberIds);
  res.json({ ...ws, memberIds: listMemberIds(id) });
});
