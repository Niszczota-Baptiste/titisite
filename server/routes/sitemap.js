import { Router } from 'express';
import { canonicalBase } from '../canonicalUrl.js';
import { db, listAll } from '../db.js';

export const sitemapRouter = Router();

const xmlEscape = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

// Dynamic sitemap: static public pages + portfolio projects + the published
// writing universes and their works, straight from the DB. Replaces the old
// hand-maintained public/sitemap.xml (referenced by robots.txt).
sitemapRouter.get('/sitemap.xml', (req, res) => {
  const base = canonicalBase(req).replace(/\/$/, '');

  const urls = [
    { loc: '/', priority: '1.0', changefreq: 'weekly' },
    { loc: '/photos', priority: '0.6', changefreq: 'weekly' },
    { loc: '/projets/ecriture', priority: '0.7', changefreq: 'weekly' },
  ];

  for (const p of listAll('projects')) {
    urls.push({ loc: `/projects/${p.id}`, priority: '0.8', changefreq: 'monthly' });
  }

  // Published universes + their published works (any nesting level — the
  // reader URL is always /projets/ecriture/:project/:work).
  const writingProjects = db.prepare(
    `SELECT id, slug FROM writing_projects WHERE is_published = 1 ORDER BY sort_order, id`,
  ).all();
  const worksStmt = db.prepare(
    `SELECT slug FROM writing_works WHERE project_id = ? AND is_published = 1 ORDER BY sort_order, id`,
  );
  for (const proj of writingProjects) {
    urls.push({ loc: `/projets/ecriture/${proj.slug}`, priority: '0.7', changefreq: 'weekly' });
    for (const w of worksStmt.all(proj.id)) {
      urls.push({ loc: `/projets/ecriture/${proj.slug}/${w.slug}`, priority: '0.6', changefreq: 'weekly' });
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`
    + urls.map((u) => `  <url>\n    <loc>${xmlEscape(base + u.loc)}</loc>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n')
    + `\n</urlset>\n`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(body);
});
