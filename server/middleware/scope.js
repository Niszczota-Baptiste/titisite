import { findBySlug, isMember } from '../workspaces.js';

/**
 * Resolves the workspace from :slug in the URL and attaches it as req.workspace.
 * Must run after requireAuth. Admins get access to any workspace; members must
 * be in the workspace_members list.
 */
export function resolveWorkspace(req, res, next) {
  const slug = req.params.slug;
  if (!slug) return res.status(400).json({ error: 'missing_slug' });
  const ws = findBySlug(slug);
  if (!ws) return res.status(404).json({ error: 'workspace_not_found' });
  if (req.user.role !== 'admin' && !isMember(ws.id, req.user.id)) {
    return res.status(403).json({ error: 'not_a_member' });
  }
  req.workspace = ws;
  next();
}
