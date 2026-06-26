// Descripteur des opérations WorldEdit — sert GET /operations (génération de
// l'UI et de la doc côté client) et borne la validation côté serveur.
// Toutes les opérations d'écriture exigent le rôle « editor » (owner inclus) ;
// la sélection et l'aperçu sont accessibles au « viewer ».

const DIRECTIONS = ['east', 'west', 'up', 'down', 'south', 'north'];

export const OPERATIONS = [
  {
    id: 'mirror', label: 'Miroir', minRole: 'editor', group: 'Transformer',
    description: 'Réfléchit la sélection (états retournés : escaliers, portes, panneaux…).',
    params: [{ name: 'axis', type: 'enum', values: ['x', 'y', 'z'], default: 'x', label: 'Axe' }],
  },
  {
    id: 'rotate', label: 'Rotation', minRole: 'editor', group: 'Transformer',
    description: 'Tourne la sélection autour de Y (et ses états).',
    params: [{ name: 'degrees', type: 'enum', values: [90, 180, 270], default: 90, label: 'Angle' }],
  },
  {
    id: 'translate', label: 'Translation', minRole: 'editor', group: 'Transformer',
    description: 'Déplace la sélection ; l’origine est vidée.',
    params: [
      { name: 'dx', type: 'int', default: 0, label: 'ΔX (Est)' },
      { name: 'dy', type: 'int', default: 0, label: 'ΔY (Haut)' },
      { name: 'dz', type: 'int', default: 0, label: 'ΔZ (Sud)' },
    ],
  },
  {
    id: 'stack', label: 'Répéter (stack)', minRole: 'editor', group: 'Transformer',
    description: 'Répète la sélection plusieurs fois dans une direction.',
    params: [
      { name: 'count', type: 'int', default: 1, label: 'Nombre' },
      { name: 'direction', type: 'enum', values: DIRECTIONS, default: 'up', label: 'Direction' },
    ],
  },
  {
    id: 'scale', label: 'Échelle (×N)', minRole: 'editor', group: 'Transformer',
    description: 'Multiplie la taille du build (échantillonnage au plus proche). ×0.5 réduit.',
    params: [{ name: 'factor', type: 'enum', values: [0.5, 2, 3, 4, 6], default: 2, label: 'Facteur' }],
  },
  {
    id: 'replace', label: 'Remplacer', minRole: 'editor', group: 'Blocs',
    description: 'Remplace un type de bloc par un autre dans la sélection.',
    params: [
      { name: 'from', type: 'block', label: 'Bloc source' },
      { name: 'to', type: 'block', label: 'Bloc cible' },
    ],
  },
  {
    id: 'set', label: 'Remplir', minRole: 'editor', group: 'Blocs',
    description: 'Remplit toute la sélection d’un bloc.',
    params: [{ name: 'block', type: 'block', label: 'Bloc' }],
  },
  {
    id: 'mix', label: 'Mélange (%)', minRole: 'editor', group: 'Blocs',
    description: 'Remplit/remplace par un mélange aléatoire pondéré (ex. 30% terre, 20% andésite…). Laisse « bloc source » vide pour toute la sélection.',
    params: [
      { name: 'from', type: 'block', label: 'Bloc source (vide = tous)' },
      { name: 'pattern', type: 'pattern', label: 'Mélange (blocs + poids %)' },
    ],
  },
  {
    id: 'walls', label: 'Murs', minRole: 'editor', group: 'Blocs',
    description: 'Pose un bloc sur les 4 côtés verticaux de la sélection.',
    params: [{ name: 'block', type: 'block', label: 'Bloc' }],
  },
  {
    id: 'faces', label: 'Faces (boîte)', minRole: 'editor', group: 'Blocs',
    description: 'Pose un bloc sur les 6 faces (murs + sol + plafond).',
    params: [{ name: 'block', type: 'block', label: 'Bloc' }],
  },
  {
    id: 'hollow', label: 'Creuser', minRole: 'editor', group: 'Blocs',
    description: 'Vide l’intérieur plein de la sélection (garde une coque de 1).',
    params: [],
  },
  {
    id: 'overlay', label: 'Recouvrir', minRole: 'editor', group: 'Blocs',
    description: 'Pose un bloc juste au-dessus de la surface de chaque colonne.',
    params: [{ name: 'block', type: 'block', label: 'Bloc' }],
  },
  {
    id: 'naturalize', label: 'Naturaliser', minRole: 'editor', group: 'Blocs',
    description: '1 herbe / 3 terre / reste pierre sous chaque surface (terrain naturel).',
    params: [],
  },
  {
    id: 'cut', label: 'Couper (→ air)', minRole: 'editor', group: 'Blocs',
    description: 'Vide la sélection (tous les blocs → air) et la copie dans le presse-papier.',
    params: [],
  },
  {
    id: 'sphere', label: 'Sphère', minRole: 'editor', group: 'Formes',
    description: 'Remplit une boule centrée sur la sélection (pinceau).',
    params: [
      { name: 'block', type: 'block', label: 'Bloc' },
      { name: 'radius', type: 'int', default: 4, label: 'Rayon' },
    ],
  },
  {
    id: 'cyl', label: 'Cylindre', minRole: 'editor', group: 'Formes',
    description: 'Remplit un cylindre vertical centré sur la sélection (pinceau).',
    params: [
      { name: 'block', type: 'block', label: 'Bloc' },
      { name: 'radius', type: 'int', default: 4, label: 'Rayon' },
    ],
  },
  {
    id: 'smooth', label: 'Lisser (terrain)', minRole: 'editor', group: 'Formes',
    description: 'Adoucit la hauteur de la surface (type GoBrush).',
    params: [{ name: 'iterations', type: 'int', default: 2, label: 'Passes' }],
  },
  {
    id: 'copy', label: 'Copier', minRole: 'editor', group: 'Presse-papier',
    description: 'Copie la sélection dans le presse-papier serveur (lié à la session).',
    params: [],
  },
  {
    id: 'paste', label: 'Coller', minRole: 'editor', group: 'Presse-papier',
    description: 'Colle le presse-papier au coin min de la sélection.',
    params: [{ name: 'mode', type: 'enum', values: ['overlay', 'overwrite'], default: 'overlay', label: 'Mode' }],
  },
];

export const OPERATION_IDS = new Set(OPERATIONS.map((o) => o.id));

// Normalise/valide les params d'une opération. Renvoie l'objet params nettoyé
// ou une chaîne d'erreur.
export function normalizeParams(operation, raw = {}) {
  const num = (v) => Math.round(Number(v));
  switch (operation) {
    case 'mirror': {
      const axis = String(raw.axis || '').toLowerCase();
      return ['x', 'y', 'z'].includes(axis) ? { axis } : 'bad_axis';
    }
    case 'rotate': {
      const degrees = num(raw.degrees);
      return [90, 180, 270].includes(degrees) ? { degrees } : 'bad_degrees';
    }
    case 'translate': {
      const [dx, dy, dz] = [raw.dx, raw.dy, raw.dz].map(num);
      if ([dx, dy, dz].some((v) => !Number.isFinite(v))) return 'bad_offset';
      return { dx, dy, dz };
    }
    case 'replace': {
      const from = normBlock(raw.from);
      const to = normBlock(raw.to);
      if (!from?.name || !to?.name) return 'bad_block';
      return { from, to };
    }
    case 'set': case 'walls': case 'faces': case 'overlay': {
      const block = normBlock(raw.block);
      return block?.name ? { block } : 'bad_block';
    }
    case 'sphere': case 'cyl': {
      const block = normBlock(raw.block);
      if (!block?.name) return 'bad_block';
      const radius = Math.max(1, Math.min(256, num(raw.radius) || 1));
      return { block, radius };
    }
    case 'stack': {
      const direction = String(raw.direction || '').toLowerCase();
      if (!['east', 'west', 'up', 'down', 'south', 'north'].includes(direction)) return 'bad_direction';
      const count = Math.max(1, Math.min(64, num(raw.count) || 1));
      return { count, direction };
    }
    case 'smooth': return { iterations: Math.max(1, Math.min(8, num(raw.iterations) || 2)) };
    case 'mix': {
      const from = normBlock(raw.from); // null → toute la sélection
      const pattern = normPattern(raw.pattern);
      if (!pattern) return 'bad_pattern';
      return { from: from?.name ? from : null, pattern };
    }
    case 'scale': {
      const factor = Number(raw.factor);
      return [0.5, 2, 3, 4, 6].includes(factor) ? { factor } : 'bad_factor';
    }
    case 'hollow': case 'naturalize': case 'copy': case 'cut': return {};
    case 'paste': return { mode: raw.mode === 'overwrite' ? 'overwrite' : 'overlay' };
    default: return 'unknown_operation';
  }
}

// { name, states? } — name doit ressembler à « namespace:id » (vanilla ou
// minefield), states est un dictionnaire de chaînes optionnel.
function normBlock(b) {
  if (!b) return null;
  const name = String(b.name || '').trim().toLowerCase();
  if (!/^[a-z0-9_]+:[a-z0-9_/.]+$/.test(name)) return null;
  let states = null;
  if (b.states && typeof b.states === 'object') {
    states = {};
    for (const [k, v] of Object.entries(b.states)) {
      if (/^[a-z0-9_]+$/.test(k)) states[k] = String(v).slice(0, 32);
    }
    if (!Object.keys(states).length) states = null;
  }
  return { name, states };
}

// Liste pondérée [{ name, states?, weight>0 }] pour le mélange aléatoire (max 32).
function normPattern(arr) {
  if (!Array.isArray(arr)) return null;
  const out = [];
  for (const e of arr) {
    const b = normBlock(e);
    const w = Number(e?.weight);
    if (b?.name && Number.isFinite(w) && w > 0) out.push({ name: b.name, states: b.states, weight: w });
    if (out.length >= 32) break;
  }
  return out.length ? out : null;
}
