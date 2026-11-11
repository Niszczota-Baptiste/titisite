// Mode « Explorer » : des PISTES tirées des éléments du projet, à la demande.
// Fonctions pures (testées dans test/author-explore.test.js) : elles ne lisent
// que ce qu'on leur donne, ne modifient rien et n'appellent aucun service —
// l'exploration fonctionne sans IA, sans abonnement et sans réseau (sur la
// copie hors connexion du projet). Une piste n'entre dans le projet que si
// l'auteur choisit de la garder, et alors comme une idée étiquetée « piste » :
// jamais comme une relation, un fait ou une correction du canon.

const DAY = 86_400;

const pick = (list, rng) => (list.length ? list[Math.min(list.length - 1, Math.floor(rng() * list.length))] : null);
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '…');

export const isoDay = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function addDays(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}

// ── 1. Une ancienne idée à reprendre ───────────────────────────────────────
// D'abord celles que l'auteur a lui-même remises « à revoir plus tard » et dont
// la date est arrivée ; sinon une idée encore ouverte qu'il n'a pas touchée
// depuis longtemps. Jamais une idée validée ou abandonnée, ni une idée remise à
// une date future (elle a été écartée exprès).
export function pickOldIdea(notes, { today, nowS, rng = Math.random, minAgeDays = 21, exclude = [] } = {}) {
  const open = (notes || []).filter((n) => !['validee', 'abandonnee'].includes(n.status) && !exclude.includes(n.id));
  const due = open.filter((n) => n.revisitOn && n.revisitOn <= today);
  if (due.length) {
    const idea = pick(due, rng);
    return { type: 'ancienne_idee', entity: idea, reason: `Tu l'avais remise à plus tard, à revoir à partir du ${idea.revisitOn}.` };
  }
  const old = open
    .filter((n) => !n.revisitOn && nowS - (n.updatedAt || 0) >= minAgeDays * DAY)
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  if (!old.length) return null;
  const idea = pick(old.slice(0, Math.max(3, Math.ceil(old.length / 3))), rng);
  const days = Math.floor((nowS - (idea.updatedAt || 0)) / DAY);
  const since = days >= 60 ? `${Math.floor(days / 30)} mois` : `${days} jours`;
  return { type: 'ancienne_idee', entity: idea, reason: `Pas rouverte depuis ${since}.` };
}

// ── 2. Deux éléments à mettre en relation ──────────────────────────────────
const PAIR_PROMPTS = {
  'character+character': ['Que sait {a} que {b} ignore ?', 'Qu\'est-ce que {a} et {b} n\'oseraient jamais se dire ?', 'Et si {a} devait quelque chose à {b} ?'],
  'character+place': ['Que s\'est-il passé pour {a} à {b}, dont personne ne parle ?', 'Pourquoi {a} éviterait-il {b} ?'],
  'character+lore': ['Quel lien secret entre {a} et {b} ?', 'Que coûterait à {a} de rompre avec {b} ?'],
  'character+event': ['Où était {a} pendant {b} ?', 'Qu\'est-ce que {b} a changé pour {a} ?'],
  'character+sound': ['Si {b} était le thème de {a}, que dirait-il de lui ?'],
  'place+place': ['Qu\'est-ce qui circule entre {a} et {b} ?', 'Qu\'est-ce que {a} envie à {b} ?'],
  'place+event': ['Quelle trace {b} a-t-il laissée à {a} ?'],
  'place+sound': ['Que change {b} si on l\'entend à {a} ?'],
  'chapter+sound': ['Et si {b} accompagnait « {a} » ?'],
  'lore+lore': ['{a} et {b} : alliés, rivaux, ou la même chose sous deux noms ?'],
  'event+event': ['Et si {a} avait rendu {b} inévitable ?'],
  default: ['Et si {a} et {b} avaient quelque chose à voir ?', 'Qu\'est-ce que {a} révélerait sur {b} ?'],
};

export function pickPair(elements, edges, { rng = Math.random, tries = 40 } = {}) {
  const pool = (elements || []).filter((e) => e.kind !== 'note' && e.title);
  if (pool.length < 2) return null;
  const linked = new Set((edges || []).flatMap((l) => [`${l.from}:${l.to}`, `${l.to}:${l.from}`]));
  for (let i = 0; i < tries; i += 1) {
    const a = pick(pool, rng);
    const b = pick(pool, rng);
    if (!a || !b || a.id === b.id || linked.has(`${a.id}:${b.id}`)) continue;
    // Deux chapitres entre eux n'apprennent rien : on préfère croiser les types.
    if (a.kind === 'chapter' && b.kind === 'chapter') continue;
    const [x, y] = [a, b].sort((p, q) => (p.kind < q.kind ? -1 : p.kind > q.kind ? 1 : 0));
    const list = PAIR_PROMPTS[`${x.kind}+${y.kind}`] || PAIR_PROMPTS.default;
    return { type: 'rapprochement', a: x, b: y, prompt: fill(pick(list, rng), { a: x.title, b: y.title }) };
  }
  return null;
}

// ── 3. Une question ouverte pour développer une scène ──────────────────────
const SCENE_QUESTIONS = [
  'Dans « {scene} », que veut chacun, et qui repart sans l\'avoir obtenu ?',
  'Qu\'est-ce qui pourrait mal tourner dans « {scene} » — et que se passe-t-il si ça tourne mal ?',
  'Quel détail de « {scene} » le lecteur ne comprendra que plus tard ?',
  'Qu\'est-ce que « {scene} » fait perdre à quelqu\'un ?',
  'Si « {scene} » commençait une minute plus tard, que manquerait-il vraiment ?',
  'Qui ment dans « {scene} », même par omission ?',
  'Que ressent-on physiquement dans « {scene} » : froid, bruit, odeur, fatigue ?',
];
const SCENE_WITH_CHARACTER = [
  'Que cache {perso} dans « {scene} » ?',
  'Comment « {scene} » change-t-elle ce que {perso} croit savoir ?',
  'Qu\'est-ce que {perso} ne dirait jamais à voix haute dans « {scene} » ?',
];

export function pickQuestion(scenes, characters, { rng = Math.random } = {}) {
  const scene = pick((scenes || []).filter((s) => s.title), rng);
  if (!scene) return null;
  const perso = pick((characters || []).filter((c) => c.title), rng);
  const useChar = perso && rng() < 0.45;
  const tpl = pick(useChar ? SCENE_WITH_CHARACTER : SCENE_QUESTIONS, rng);
  return { type: 'question', entity: scene, about: useChar ? perso : null, prompt: fill(tpl, { scene: scene.title, perso: perso?.title }) };
}

// ── 4. Une variation : point de vue, contrainte ou ambiance ────────────────
const VARIATIONS = {
  'point de vue': [
    'Raconte « {cible} » du point de vue de {autre}.',
    'Raconte « {cible} » par quelqu\'un qui n\'a rien compris à ce qui se joue.',
    'Raconte « {cible} » des années plus tard, de mémoire.',
    'Raconte « {cible} » à la deuxième personne.',
  ],
  contrainte: [
    'Réécris « {cible} » sans dialogue.',
    'Réécris « {cible} » en une seule phrase, puis en dix.',
    'Dans « {cible} », personne ne nomme ce dont il est question.',
    'Réécris « {cible} » en n\'utilisant que le présent.',
    'Coupe le premier tiers de « {cible} » : que faut-il rattraper ?',
  ],
  ambiance: [
    '« {cible} » sous la pluie, de nuit, dans le bruit : qu\'est-ce qui change ?',
    'Et si « {cible} » était drôle ?',
    'Et si « {cible} » se passait dans le silence complet ?',
    'Donne à « {cible} » la lenteur d\'un dimanche.',
  ],
};
const SOUND_VARIATIONS = {
  contrainte: ['Joue « {cible} » deux fois plus lentement.', 'Garde seulement le rythme de « {cible} » : que reste-t-il ?', 'Rejoue « {cible} » avec un seul instrument.'],
  ambiance: ['« {cible} » en mineur (ou en majeur) : est-ce encore la même idée ?', 'Chuchote « {cible} ».', '« {cible} » pour une scène de départ, puis pour une scène de retour.'],
};

export const VARIATION_AXES = Object.keys(VARIATIONS);

export function pickVariation(targets, others, { rng = Math.random, axis = null } = {}) {
  const target = pick((targets || []).filter((t) => t.title), rng);
  if (!target) return null;
  const table = target.kind === 'sound' ? SOUND_VARIATIONS : VARIATIONS;
  const axes = Object.keys(table);
  const chosen = axis && table[axis] ? axis : pick(axes, rng);
  const other = pick((others || []).filter((o) => o.title && o.id !== target.id), rng);
  // Un point de vue demande quelqu'un : sans autre personnage, on change d'axe.
  const list = table[chosen].filter((tpl) => other || !tpl.includes('{autre}'));
  return { type: 'variation', entity: target, axis: chosen, prompt: fill(pick(list.length ? list : table[axes[0]], rng), { cible: target.title, autre: other?.title }) };
}

// Texte d'une piste gardée comme idée : dit clairement d'où elle vient.
export function trailAsNote(trail) {
  const head = `Piste — ${trail.prompt || trail.entity?.title || ''}`.trim();
  const refs = [trail.entity, trail.a, trail.b, trail.about].filter(Boolean).map((e) => `[[${e.title}]]`);
  return `${head}\n\n(Piste proposée par le mode Explorer${refs.length ? ` à partir de ${[...new Set(refs)].join(', ')}` : ''}. Ce n'est pas un fait du récit.)`;
}
