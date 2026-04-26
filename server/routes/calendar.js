import { Router } from 'express';
import { db } from '../db.js';
import { findByIcalToken } from '../users.js';

export const calendarRouter = Router();

// RFC 5545 recommends max 75-octet lines with continuation. Most clients accept
// longer lines, but we still fold to be safe.
function fold(line) {
  if (line.length <= 74) return line;
  const out = [];
  let i = 0;
  out.push(line.slice(0, 74));
  i = 74;
  while (i < line.length) {
    out.push(' ' + line.slice(i, i + 73));
    i += 73;
  }
  return out.join('\r\n');
}

function escapeText(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function fmtUtc(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
}

function buildEvent({ uid, dtstamp, dtstart, dtend, summary, description, url, categories }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    dtend ? `DTEND:${dtend}` : null,
    `SUMMARY:${escapeText(summary)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    url ? `URL:${escapeText(url)}` : null,
    categories && categories.length ? `CATEGORIES:${categories.map(escapeText).join(',')}` : null,
    'END:VEVENT',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n');
}

function buildCalendar({ user, meetings, features, baseUrl }) {
  const now = fmtUtc(Math.floor(Date.now() / 1000));
  const name = `Projets — ${user.name || user.email}`;

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Titisite//Projet//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-WR-TIMEZONE:Europe/Paris',
    `X-WR-CALDESC:${escapeText("Réunions et échéances des projets d'équipe")}`,
  ].map(fold).join('\r\n');

  const events = [];

  for (const m of meetings) {
    const dtstart = fmtUtc(m.starts_at);
    const dtend = m.ends_at ? fmtUtc(m.ends_at) : fmtUtc(m.starts_at + 3600);
    const desc = [
      `Projet: ${m.workspace_name}`,
      m.description ? '' : null,
      m.description,
    ].filter((x) => x !== null).join('\n');
    events.push(buildEvent({
      uid: `meeting-${m.id}@titisite`,
      dtstamp: now,
      dtstart, dtend,
      summary: `[${m.workspace_icon || '📅'} ${m.workspace_name}] ${m.title}`,
      description: desc,
      url: baseUrl ? `${baseUrl}/project/${m.workspace_slug}/meetings` : null,
      categories: ['Réunion', m.workspace_name],
    }));
  }

  for (const f of features) {
    const dtstart = fmtUtc(f.due_date);
    const dtend = fmtUtc(f.due_date + 1800); // 30 min block so it shows up
    const statusLabel = {
      backlog: 'Backlog', todo: 'À faire', doing: 'En cours', done: 'Terminé',
    }[f.status] || f.status;
    const priorityLabel = {
      low: 'Basse', medium: 'Moyenne', high: 'Haute', critical: 'Critique',
    }[f.priority] || f.priority;
    const desc = [
      `Projet: ${f.workspace_name}`,
      `Statut: ${statusLabel}`,
      `Priorité: ${priorityLabel}`,
      f.description ? '' : null,
      f.description,
    ].filter((x) => x !== null).join('\n');
    const prefix = f.status === 'done' ? '✓ ' : (f.priority === 'critical' ? '🔥 ' : '');
    events.push(buildEvent({
      uid: `feature-${f.id}@titisite`,
      dtstamp: now,
      dtstart, dtend,
      summary: `${prefix}[${f.workspace_icon || '📌'} ${f.workspace_name}] ${f.title}`,
      description: desc,
      url: baseUrl ? `${baseUrl}/project/${f.workspace_slug}/kanban` : null,
      categories: ['Tâche', priorityLabel, f.workspace_name],
    }));
  }

  return [header, ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

calendarRouter.get('/:token.ics', (req, res) => {
  const user = findByIcalToken(req.params.token);
  if (!user) return res.status(404).type('text/plain').send('Calendar not found');

  const isAdmin = user.role === 'admin';

  const wsWhere = isAdmin
    ? `w.status = 'active'`
    : `m.user_id = ? AND w.status = 'active'`;
  const wsArgs = isAdmin ? [] : [user.id];

  const wsRows = db.prepare(`
    SELECT w.id, w.slug, w.name, w.icon
    FROM workspaces w
    ${isAdmin ? '' : 'INNER JOIN workspace_members m ON m.workspace_id = w.id'}
    WHERE ${wsWhere}
  `).all(...wsArgs);

  if (wsRows.length === 0) {
    res.type('text/calendar; charset=utf-8');
    res.set('Cache-Control', 'private, max-age=300');
    return res.send(buildCalendar({ user, meetings: [], features: [], baseUrl: null }));
  }

  const wsById = new Map(wsRows.map((w) => [w.id, w]));
  const wsIds = wsRows.map((w) => w.id);
  const placeholders = wsIds.map(() => '?').join(',');

  const meetings = db.prepare(`
    SELECT id, workspace_id, title, description, starts_at, ends_at
    FROM meetings
    WHERE workspace_id IN (${placeholders})
  `).all(...wsIds).map((m) => ({
    ...m,
    workspace_name: wsById.get(m.workspace_id).name,
    workspace_slug: wsById.get(m.workspace_id).slug,
    workspace_icon: wsById.get(m.workspace_id).icon,
  }));

  const features = db.prepare(`
    SELECT id, workspace_id, title, description, due_date, status, priority
    FROM features
    WHERE due_date IS NOT NULL AND workspace_id IN (${placeholders})
  `).all(...wsIds).map((f) => ({
    ...f,
    workspace_name: wsById.get(f.workspace_id).name,
    workspace_slug: wsById.get(f.workspace_id).slug,
    workspace_icon: wsById.get(f.workspace_id).icon,
  }));

  const baseUrl = process.env.CANONICAL_ORIGIN
    || ((req.get('x-forwarded-proto') || req.protocol) + '://' + req.get('host'));
  const body = buildCalendar({ user, meetings, features, baseUrl });

  res.type('text/calendar; charset=utf-8');
  res.set('Cache-Control', 'private, max-age=300');
  if (req.query.download === '1') {
    res.set('Content-Disposition', `attachment; filename="projets-${user.id}.ics"`);
  }
  res.send(body);
});
