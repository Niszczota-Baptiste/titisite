// Descripteur des opérations WorldEdit — sert GET /operations (génération de
// l'UI et de la doc côté client) et borne la validation côté serveur.
// Toutes les opérations d'écriture exigent le rôle « editor » (owner inclus) ;
// la sélection et l'aperçu sont accessibles au « viewer ».

export const OPERATIONS = [
  {
    id: 'mirror', label: 'Miroir', minRole: 'editor',
    description: 'Réfléchit la sélection (états retournés : escaliers, portes, panneaux…).',
    params: [{ name: 'axis', type: 'enum', values: ['x', 'y', 'z'], default: 'x', label: 'Axe' }],
  },
  {
    id: 'rotate', label: 'Rotation', minRole: 'editor',
    description: 'Tourne la sélection autour de Y (et ses états).',
    params: [{ name: 'degrees', type: 'enum', values: [90, 180, 270], default: 90, label: 'Angle' }],
  },
  {
    id: 'translate', label: 'Translation', minRole: 'editor',
    description: 'Déplace la sélection ; l’origine est vidée.',
    params: [
      { name: 'dx', type: 'int', default: 0, label: 'ΔX (Est)' },
      { name: 'dy', type: 'int', default: 0, label: 'ΔY (Haut)' },
      { name: 'dz', type: 'int', default: 0, label: 'ΔZ (Sud)' },
    ],
  },
  {
    id: 'replace', label: 'Remplacer', minRole: 'editor',
    description: 'Remplace un type de bloc par un autre dans la sélection.',
    params: [
      { name: 'from', type: 'block', label: 'Bloc source' },
      { name: 'to', type: 'block', label: 'Bloc cible' },
    ],
  },
  {
    id: 'set', label: 'Remplir', minRole: 'editor',
    description: 'Remplit toute la sélection d’un bloc.',
    params: [{ name: 'block', type: 'block', label: 'Bloc' }],
  },
  {
    id: 'cut', label: 'Couper (→ air)', minRole: 'editor',
    description: 'Vide la sélection (tous les blocs → air) et la copie dans le presse-papier.',
    params: [],
  },
  {
    id: 'copy', label: 'Copier', minRole: 'editor',
    description: 'Copie la sélection dans le presse-papier serveur (lié à la session).',
    params: [],
  },
  {
    id: 'paste', label: 'Coller', minRole: 'editor',
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
    case 'set': {
      const block = normBlock(raw.block);
      return block?.name ? { block } : 'bad_block';
    }
    case 'copy': return {};
    case 'cut': return {};
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
