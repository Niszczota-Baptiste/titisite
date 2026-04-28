import { db } from './db.js';
import { isMailerConfigured, sendMail } from './mailer.js';

// Email digest scheduler.
//
// Each user has digest_frequency in {off, daily, weekly}. The scheduler ticks
// once per hour (with an immediate first run shortly after boot). For each
// non-off user, if enough time has passed since digest_last_sent_at AND there
// is real activity to report, we build and send a digest. Empty digests are
// not sent.
//
// Scope of "activity" = items created since `since` in workspaces the user
// can see (admin → all active workspaces; member → workspaces they belong to).

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const FREQ_INTERVAL = {
  daily: DAY,
  // 'weekly' = every 7 days, but only on Mondays so it's a predictable cadence
  weekly: 7 * DAY,
};

function userWorkspaces(user) {
  const isAdmin = user.role === 'admin';
  if (isAdmin) {
    return db.prepare(`SELECT id, slug, name FROM workspaces WHERE status = 'active'`).all();
  }
  return db.prepare(`
    SELECT w.id, w.slug, w.name
    FROM workspaces w
    INNER JOIN workspace_members m ON m.workspace_id = w.id
    WHERE m.user_id = ? AND w.status = 'active'
  `).all(user.id);
}

function activitySince(workspaceIds, since) {
  if (workspaceIds.length === 0) return null;
  const placeholders = workspaceIds.map(() => '?').join(',');

  const features = db.prepare(`
    SELECT f.id, f.title, f.workspace_id, f.status, f.created_at, u.name AS author
    FROM features f
    LEFT JOIN users u ON u.id = f.created_by
    WHERE f.workspace_id IN (${placeholders}) AND f.created_at >= ?
    ORDER BY f.created_at DESC
    LIMIT 25
  `).all(...workspaceIds, since);

  const meetings = db.prepare(`
    SELECT m.id, m.title, m.workspace_id, m.starts_at, m.created_at, u.name AS author
    FROM meetings m
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.workspace_id IN (${placeholders}) AND m.created_at >= ?
    ORDER BY m.created_at DESC
    LIMIT 25
  `).all(...workspaceIds, since);

  const documents = db.prepare(`
    SELECT d.id, d.title, d.workspace_id, d.created_at, u.name AS author
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.workspace_id IN (${placeholders}) AND d.created_at >= ?
    ORDER BY d.created_at DESC
    LIMIT 25
  `).all(...workspaceIds, since);

  const builds = db.prepare(`
    SELECT b.id, b.version, b.title, b.workspace_id, b.released_at, u.name AS author
    FROM builds b
    LEFT JOIN users u ON u.id = b.uploaded_by
    WHERE b.workspace_id IN (${placeholders}) AND b.released_at >= ?
    ORDER BY b.released_at DESC
    LIMIT 25
  `).all(...workspaceIds, since);

  const comments = db.prepare(`
    SELECT c.id, c.body, c.target_type, c.target_id, c.created_at, u.name AS author,
           CASE c.target_type
             WHEN 'feature' THEN (SELECT workspace_id FROM features WHERE id = c.target_id)
             WHEN 'meeting' THEN (SELECT workspace_id FROM meetings WHERE id = c.target_id)
             WHEN 'document' THEN (SELECT workspace_id FROM documents WHERE id = c.target_id)
             WHEN 'build' THEN (SELECT workspace_id FROM builds WHERE id = c.target_id)
           END AS workspace_id
    FROM comments c
    LEFT JOIN users u ON u.id = c.author_id
    WHERE c.created_at >= ?
    ORDER BY c.created_at DESC
    LIMIT 50
  `).all(since)
    .filter((c) => workspaceIds.includes(c.workspace_id));

  return { features, meetings, documents, builds, comments };
}

function workspaceMap(rows) {
  return new Map(rows.map((w) => [w.id, w]));
}

function fmtDate(unix) {
  return new Date(unix * 1000).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(s, n = 120) {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim();
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
}

export function formatDigest({ user, since, workspaces, activity, frequency }) {
  const wMap = workspaceMap(workspaces);
  const wsName = (id) => (wMap.get(id)?.name || 'Projet');
  const period = frequency === 'weekly' ? 'cette semaine' : 'aujourd\'hui';
  const total =
    activity.features.length + activity.meetings.length +
    activity.documents.length + activity.builds.length + activity.comments.length;

  if (total === 0) return null;

  const subject = `[Titisite] ${total} activité${total > 1 ? 's' : ''} sur tes projets ${period}`;

  // Plain-text body
  const lines = [];
  lines.push(`Salut ${user.name || ''}`.trim() + ',');
  lines.push('');
  lines.push(`Récap des activités ${period} (depuis ${fmtDate(since)}) :`);
  lines.push('');

  const sect = (title, items, render) => {
    if (!items.length) return;
    lines.push(`# ${title} (${items.length})`);
    for (const it of items.slice(0, 10)) lines.push(`  - ${render(it)}`);
    if (items.length > 10) lines.push(`  … et ${items.length - 10} de plus`);
    lines.push('');
  };

  sect('Cartes créées', activity.features, (f) =>
    `${f.title} — ${wsName(f.workspace_id)} · ${f.author || '—'}`);
  sect('Commentaires', activity.comments, (c) =>
    `${c.author || '—'} sur ${wsName(c.workspace_id)} : « ${truncate(c.body, 80)} »`);
  sect('Réunions', activity.meetings, (m) =>
    `${m.title} (${fmtDate(m.starts_at)}) — ${wsName(m.workspace_id)}`);
  sect('Documents', activity.documents, (d) =>
    `${d.title} — ${wsName(d.workspace_id)} · ${d.author || '—'}`);
  sect('Builds', activity.builds, (b) =>
    `v${b.version} ${b.title || ''} — ${wsName(b.workspace_id)} · ${b.author || '—'}`);

  lines.push('—');
  lines.push('Pour ne plus recevoir ce digest, désactive-le depuis tes préférences sur ton espace projet.');

  const text = lines.join('\n');

  // Minimal HTML
  const renderList = (title, items, render) => {
    if (!items.length) return '';
    const more = items.length > 10 ? `<li style="color:#888">… et ${items.length - 10} de plus</li>` : '';
    return `
      <h3 style="font-family:sans-serif;font-size:14px;color:#3a2860;margin:18px 0 6px">${escapeHtml(title)} (${items.length})</h3>
      <ul style="font-family:sans-serif;font-size:13px;color:#222;padding-left:18px;margin:0">
        ${items.slice(0, 10).map((it) => `<li>${render(it)}</li>`).join('')}
        ${more}
      </ul>`;
  };

  const html = `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#fafaff;color:#222">
      <p style="margin:0 0 16px">Salut ${escapeHtml(user.name || '')},</p>
      <p style="margin:0 0 12px">Récap des activités ${period} (depuis ${escapeHtml(fmtDate(since))}) :</p>

      ${renderList('Cartes créées', activity.features, (f) =>
        `<strong>${escapeHtml(f.title)}</strong> — ${escapeHtml(wsName(f.workspace_id))} · ${escapeHtml(f.author || '—')}`)}
      ${renderList('Commentaires', activity.comments, (c) =>
        `<em>${escapeHtml(c.author || '—')}</em> sur ${escapeHtml(wsName(c.workspace_id))} : « ${escapeHtml(truncate(c.body, 80))} »`)}
      ${renderList('Réunions', activity.meetings, (m) =>
        `<strong>${escapeHtml(m.title)}</strong> (${escapeHtml(fmtDate(m.starts_at))}) — ${escapeHtml(wsName(m.workspace_id))}`)}
      ${renderList('Documents', activity.documents, (d) =>
        `<strong>${escapeHtml(d.title)}</strong> — ${escapeHtml(wsName(d.workspace_id))} · ${escapeHtml(d.author || '—')}`)}
      ${renderList('Builds', activity.builds, (b) =>
        `<strong>v${escapeHtml(b.version)}</strong> ${escapeHtml(b.title || '')} — ${escapeHtml(wsName(b.workspace_id))} · ${escapeHtml(b.author || '—')}`)}

      <p style="font-size:11px;color:#888;margin-top:24px;padding-top:12px;border-top:1px solid #eee">
        Pour ne plus recevoir ce digest, désactive-le depuis tes préférences.
      </p>
    </div>`;

  return { subject, text, html };
}

// Pulls every user with digest enabled, computes how long since their last
// send, and sends if (a) interval elapsed and (b) at least one activity row
// exists since their last send.
export async function runDigestTick({ now = Math.floor(Date.now() / 1000) } = {}) {
  if (!isMailerConfigured()) return { skipped: 'mailer_not_configured' };

  const candidates = db.prepare(`
    SELECT id, email, name, role, digest_frequency, digest_last_sent_at
    FROM users
    WHERE digest_frequency IN ('daily', 'weekly')
  `).all();

  const sent = [];
  for (const user of candidates) {
    const interval = FREQ_INTERVAL[user.digest_frequency];
    if (!interval) continue;
    const last = user.digest_last_sent_at || 0;
    if (now - last < interval) continue;

    const since = last || (now - interval);
    const workspaces = userWorkspaces(user);
    const activity = activitySince(workspaces.map((w) => w.id), since);
    if (!activity) {
      db.prepare(`UPDATE users SET digest_last_sent_at = ? WHERE id = ?`).run(now, user.id);
      continue;
    }

    const content = formatDigest({
      user, since, workspaces, activity, frequency: user.digest_frequency,
    });
    if (!content) {
      // No activity worth sending — bump timestamp anyway so we don't
      // re-check the same window every tick.
      db.prepare(`UPDATE users SET digest_last_sent_at = ? WHERE id = ?`).run(now, user.id);
      continue;
    }

    try {
      await sendMail({ to: user.email, ...content });
      db.prepare(`UPDATE users SET digest_last_sent_at = ? WHERE id = ?`).run(now, user.id);
      sent.push({ userId: user.id, email: user.email, frequency: user.digest_frequency });
    } catch (e) {
      console.error(`[digest] send to ${user.email} failed:`, e.message);
    }
  }
  return { sent };
}

let intervalId = null;

export function startDigestScheduler({ intervalMs = HOUR * 1000 } = {}) {
  if (intervalId) return;
  if (!isMailerConfigured()) {
    console.log('[digest] scheduler disabled (no SMTP).');
    return;
  }

  // Run a first tick ~30 s after boot, then every interval.
  setTimeout(() => runDigestTick().catch((e) => console.error('[digest]', e)), 30_000);
  intervalId = setInterval(() => {
    runDigestTick().catch((e) => console.error('[digest]', e));
  }, intervalMs);
  console.log(`[digest] scheduler running every ${Math.round(intervalMs / 60000)} min.`);
}

export function stopDigestScheduler() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}
