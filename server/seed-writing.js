import { db } from './db.js';

// Minimal demo seed for the writing space, showing the full hierarchy end to
// end: a *project* (Nostra) with several *books*, project-scoped characters and
// glossary. Idempotent — skipped once any project exists, so real content is
// never touched on re-runs. Everything here is deletable from the back-office.

const BOOK_ASCII = [
  '╔══════════════════════════════════════╗',
  '║   N O S T R A                         ║',
  '╚══════════════════════════════════════╝',
  '',
].join('\n');

const BOOKS = [
  {
    slug: 'le-cycle-des-cendres',
    title: 'Le Cycle des cendres',
    subtitle: 'Premier livre du cycle',
    ambient_effect: 'embers',
    tags: ['Roman', 'Fantasy'],
    chapters: [
      {
        number: 'Livre I', title: 'Le lac de la foi', title_kr: '호수 신념',
        content: `${BOOK_ASCII}Au matin, [[perso:nielas|Nielas]] descendit vers les rives de\n{{kr:호수 신념}}. La brume tenait encore aux roseaux.\n\nOn raconte que celui qui boit cette eau ne ment plus jamais —\nni aux autres, ni à lui-même.`,
      },
      {
        number: 'Livre II', title: 'La cendre et le serment', title_kr: '',
        content: 'Le feu n’avait pas pris par hasard.\n\n[[perso:nielas|Nielas]] le savait : un serment scellé dans la\ncendre lie plus fort qu’un serment scellé dans l’or.',
      },
    ],
  },
  {
    slug: 'fragments-de-nostra',
    title: 'Fragments de Nostra',
    subtitle: 'Notes et récits épars',
    ambient_effect: 'none',
    tags: ['Recueil'],
    chapters: [
      {
        number: 'Fragment', title: 'L’oracle aveugle', title_kr: '',
        content: 'On dit qu’[[perso:nielas|elle]] lit l’avenir dans les braises de {{kr:호수 신념}}.',
      },
    ],
  },
];

const CHARACTER = {
  slug: 'nielas', name: 'Nielas', name_kr: '니엘라스', role: 'Gardien du lac',
  bio: 'Premier gardien de {{kr:호수 신념}}, Nielas porte le poids des\nserments rompus avant lui. Taciturne, loyal, hanté.',
};

const GLOSSARY = [
  { term_kr: '호수 신념', romanization: 'Hosu Sinnyeom', meaning: 'le lac de la foi' },
  { term_kr: '니엘라스', romanization: 'Nielaseu', meaning: 'Nielas (translittération)' },
];

export function seedWritingIfEmpty() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM writing_projects').get().n;
  if (existing > 0) return { skipped: true, existing };

  const tx = db.transaction(() => {
    const proj = db.prepare(`
      INSERT INTO writing_projects
        (slug, title, title_kr, subtitle, description, status, accent_color, tags, ambient_effect, is_published, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'nostra', 'Nostra', '노스트라', 'Chroniques d’un monde de foi et de cendre',
      'Univers de jeu de rôle fantasy — récits, personnages et lexique d’un monde de foi et de cendre.',
      'wip', '#c9a8e8', JSON.stringify(['Fantasy', 'Récit']), 'embers', 1, 0,
    );
    const projectId = proj.lastInsertRowid;

    BOOKS.forEach((b, bi) => {
      const w = db.prepare(`
        INSERT INTO writing_works
          (project_id, slug, title, subtitle, status, accent_color, tags, ambient_effect, is_published, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(projectId, b.slug, b.title, b.subtitle, 'wip', '#c9a8e8', JSON.stringify(b.tags), b.ambient_effect, bi);
      b.chapters.forEach((c, ci) => {
        db.prepare(`
          INSERT INTO writing_chapters (work_id, number, title, title_kr, content, sort_order)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(w.lastInsertRowid, c.number, c.title, c.title_kr, c.content, ci);
      });
    });

    db.prepare(`
      INSERT INTO characters (project_id, slug, name, name_kr, role, bio, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `).run(projectId, CHARACTER.slug, CHARACTER.name, CHARACTER.name_kr, CHARACTER.role, CHARACTER.bio);

    GLOSSARY.forEach((g, i) => {
      db.prepare(`
        INSERT INTO glossary_terms (project_id, term_kr, romanization, meaning, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `).run(projectId, g.term_kr, g.romanization, g.meaning, i);
    });
  });
  tx();

  return { inserted: { projects: 1, books: BOOKS.length, characters: 1, glossary: GLOSSARY.length } };
}
