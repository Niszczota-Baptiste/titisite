import { db } from './db.js';

// Minimal demo seed for the writing space, so a fresh install shows the feature
// working end-to-end (library card → reading mode → character tooltip → glossary).
// Idempotent: skipped entirely once any work exists, so the owner's real content
// is never touched on re-runs. Everything here is deletable from the back-office.

const DEMO_CHAPTERS = [
  {
    number: 'Livre I',
    title: 'Le lac de la foi',
    title_kr: '호수 신념',
    content: [
      '╔══════════════════════════════════════╗',
      '║   N O S T R A  ·  Livre I             ║',
      '╚══════════════════════════════════════╝',
      '',
      'Au matin, [[perso:nielas|Nielas]] descendit vers les rives de',
      '{{kr:호수 신념}}. La brume tenait encore aux roseaux.',
      '',
      'On raconte que celui qui boit cette eau ne ment plus jamais —',
      'ni aux autres, ni à lui-même.',
    ].join('\n'),
  },
  {
    number: 'Livre II',
    title: 'La cendre et le serment',
    title_kr: '',
    content: [
      'Le feu n’avait pas pris par hasard.',
      '',
      '[[perso:nielas|Nielas]] le savait : un serment scellé dans la',
      'cendre lie plus fort qu’un serment scellé dans l’or.',
    ].join('\n'),
  },
];

const DEMO_CHARACTER = {
  slug: 'nielas',
  name: 'Nielas',
  name_kr: '니엘라스',
  role: 'Gardien du lac',
  bio: [
    'Premier gardien de {{kr:호수 신념}}, Nielas porte le poids des',
    'serments rompus avant lui. Taciturne, loyal, hanté.',
  ].join('\n'),
};

const DEMO_GLOSSARY = [
  { term_kr: '호수 신념', romanization: 'Hosu Sinnyeom', meaning: 'le lac de la foi' },
  { term_kr: '니엘라스', romanization: 'Nielaseu', meaning: 'Nielas (translittération)' },
];

export function seedWritingIfEmpty() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM writing_works').get().n;
  if (existing > 0) return { skipped: true, existing };

  const tx = db.transaction(() => {
    const work = db.prepare(`
      INSERT INTO writing_works
        (slug, title, title_kr, subtitle, description, status, accent_color, is_published, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'nostra',
      'Nostra',
      '노스트라',
      'Chroniques d’un monde de foi et de cendre',
      'Un récit de jeu de rôle en cours d’écriture — univers fantasy original.',
      'wip',
      '#c9a8e8',
      1,
      0,
    );
    const workId = work.lastInsertRowid;

    DEMO_CHAPTERS.forEach((c, i) => {
      db.prepare(`
        INSERT INTO writing_chapters (work_id, number, title, title_kr, content, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(workId, c.number, c.title, c.title_kr, c.content, i);
    });

    const char = db.prepare(`
      INSERT INTO characters (slug, name, name_kr, role, bio, sort_order)
      VALUES (?, ?, ?, ?, ?, 0)
    `).run(
      DEMO_CHARACTER.slug, DEMO_CHARACTER.name, DEMO_CHARACTER.name_kr,
      DEMO_CHARACTER.role, DEMO_CHARACTER.bio,
    );
    db.prepare('INSERT INTO work_characters (work_id, character_id) VALUES (?, ?)')
      .run(workId, char.lastInsertRowid);

    DEMO_GLOSSARY.forEach((g, i) => {
      db.prepare(`
        INSERT INTO glossary_terms (term_kr, romanization, meaning, sort_order)
        VALUES (?, ?, ?, ?)
      `).run(g.term_kr, g.romanization, g.meaning, i);
    });
  });
  tx();

  return { inserted: { works: 1, chapters: DEMO_CHAPTERS.length, characters: 1, glossary: DEMO_GLOSSARY.length } };
}
