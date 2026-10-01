// Registre d'affichage de l'atelier d'auteur — miroir de server/author/enums.js.
// Ajouter un type, un statut ou une relation : ici ET côté serveur.
//
// Une fiche est décrite par des SECTIONS de champs : EntityPage les rend sans
// connaître le type. Types de champ : text (une ligne), area (paragraphe
// auto-extensible), markdown (corps avec aperçu), select, number, date,
// category (catégorie configurable du domaine), timeline, priority.

export const KIND_ORDER = ['character', 'place', 'lore', 'event', 'chapter', 'note'];

const STORY_ROLES = ['Protagoniste', 'Antagoniste', 'Deutéragoniste', 'Mentor', 'Allié', 'Rival', 'Personnage secondaire', 'Figurant'];

export const KINDS = {
  character: {
    label: 'Personnage', plural: 'Personnages', icon: '👤', color: '#e88cb8', route: 'personnages',
    newLabel: 'Nouveau personnage',
    sections: [
      { id: 'identite', title: 'Identité', fields: [
        { key: 'title', label: 'Nom', type: 'text', big: true },
        { key: 'firstName', label: 'Prénom', type: 'text', half: true },
        { key: 'nickname', label: 'Surnom', type: 'text', half: true },
        { key: 'titles', label: 'Titres', type: 'text' },
        { key: 'storyRole', label: 'Rôle dans l\'histoire', type: 'text', suggestions: STORY_ROLES },
        { key: 'summary', label: 'Description courte', type: 'area', rows: 2 },
      ] },
      { id: 'portrait', title: 'Portrait', fields: [
        { key: 'appearance', label: 'Apparence', type: 'area' },
        { key: 'body', label: 'Description complète', type: 'markdown' },
      ] },
      { id: 'psy', title: 'Personnalité & psychologie', fields: [
        { key: 'personality', label: 'Personnalité', type: 'area' },
        { key: 'psychology', label: 'Psychologie', type: 'area' },
        { key: 'values', label: 'Valeurs', type: 'area' },
      ] },
      { id: 'moteurs', title: 'Ce qui le fait avancer', fields: [
        { key: 'motivations', label: 'Motivations', type: 'area' },
        { key: 'goals', label: 'Objectifs', type: 'area' },
        { key: 'fears', label: 'Peurs', type: 'area' },
      ] },
      { id: 'traits', title: 'Qualités & défauts', fields: [
        { key: 'qualities', label: 'Qualités', type: 'area', half: true },
        { key: 'flaws', label: 'Défauts', type: 'area', half: true },
      ] },
      { id: 'histoire', title: 'Passé & évolution', fields: [
        { key: 'backstory', label: 'Passé', type: 'area' },
        { key: 'arc', label: 'Évolution prévue', type: 'area' },
      ] },
      { id: 'notes', title: 'Notes libres', fields: [
        { key: 'notes', label: 'Notes', type: 'area', rows: 4 },
      ] },
    ],
    listMeta: (e) => [e.storyRole, e.nickname && `« ${e.nickname} »`].filter(Boolean).join(' · '),
  },
  place: {
    label: 'Lieu', plural: 'Lieux', icon: '📍', color: '#80c8e8', route: 'lieux', newLabel: 'Nouveau lieu',
    categoryDomain: 'place',
    sections: [
      { id: 'identite', title: 'Identité', fields: [
        { key: 'title', label: 'Nom', type: 'text', big: true },
        { key: 'categoryId', label: 'Type', type: 'category', domain: 'place' },
        { key: 'summary', label: 'Description courte', type: 'area', rows: 2 },
      ] },
      { id: 'description', title: 'Description', fields: [
        { key: 'body', label: 'Description', type: 'markdown' },
      ] },
      { id: 'histoire', title: 'Histoire', fields: [
        { key: 'history', label: 'Histoire', type: 'area' },
      ] },
      { id: 'societe', title: 'Population & culture', fields: [
        { key: 'population', label: 'Population', type: 'area' },
        { key: 'culture', label: 'Culture', type: 'area' },
      ] },
      { id: 'recit', title: 'Dans le récit', fields: [
        { key: 'importance', label: 'Importance narrative', type: 'area' },
        { key: 'notes', label: 'Notes', type: 'area' },
      ] },
    ],
  },
  lore: {
    label: 'Élément de lore', plural: 'Univers', icon: '📜', color: '#e8d27c', route: 'univers', newLabel: 'Nouvel élément',
    categoryDomain: 'lore',
    sections: [
      { id: 'identite', title: 'Identité', fields: [
        { key: 'title', label: 'Nom', type: 'text', big: true },
        { key: 'categoryId', label: 'Catégorie', type: 'category', domain: 'lore' },
        { key: 'summary', label: 'En une phrase', type: 'area', rows: 2 },
      ] },
      { id: 'contenu', title: 'Contenu', fields: [
        { key: 'body', label: 'Description', type: 'markdown' },
      ] },
    ],
  },
  event: {
    label: 'Événement', plural: 'Événements', icon: '⚡', color: '#e8a87c', route: 'chronologie', newLabel: 'Nouvel événement',
    sections: [
      { id: 'identite', title: 'Événement', fields: [
        { key: 'title', label: 'Titre', type: 'text', big: true },
        { key: 'timelineId', label: 'Ligne de temps', type: 'timeline', half: true },
        { key: 'importance', label: 'Importance', type: 'select', half: true, options: [[1, 'Mineur'], [2, 'Notable'], [3, 'Majeur']] },
        { key: 'dateLabel', label: 'Date affichée', type: 'text', placeholder: 'An 312 de l\'Ère des Cendres' },
        { key: 'sortKey', label: 'Position chronologique', type: 'number', half: true, hint: 'Nombre qui ordonne la chronologie (année, jour…)' },
        { key: 'endSortKey', label: 'Fin (optionnel)', type: 'number', half: true },
        { key: 'summary', label: 'Résumé', type: 'area', rows: 2 },
      ] },
      { id: 'recit', title: 'Déroulement', fields: [
        { key: 'body', label: 'Déroulement', type: 'markdown' },
      ] },
    ],
    listMeta: (e) => e.dateLabel || (e.sortKey ?? '') + '',
  },
  chapter: {
    label: 'Chapitre', plural: 'Chapitres', icon: '📖', color: '#c9a8e8', route: 'chapitres', newLabel: 'Nouveau chapitre',
    sections: [
      { id: 'identite', title: 'Chapitre', fields: [
        { key: 'title', label: 'Titre', type: 'text', big: true },
        { key: 'status', label: 'Statut', type: 'chapterStatus', half: true },
        { key: 'targetWords', label: 'Objectif de mots', type: 'number', half: true },
        { key: 'summary', label: 'Résumé', type: 'area', rows: 3 },
      ] },
      { id: 'notes', title: 'Notes de chapitre', fields: [
        { key: 'body', label: 'Notes', type: 'markdown' },
      ] },
    ],
  },
  note: {
    label: 'Idée', plural: 'Idées', icon: '💡', color: '#9ad4ae', route: 'idees', newLabel: 'Nouvelle idée',
    sections: [
      { id: 'identite', title: 'Idée', fields: [
        { key: 'title', label: 'Titre', type: 'text', big: true },
        { key: 'status', label: 'Statut', type: 'noteStatus', half: true },
        { key: 'priority', label: 'Priorité', type: 'priority', half: true },
        { key: 'category', label: 'Catégorie', type: 'text', half: true, suggestKey: 'noteCategories' },
        { key: 'noteDate', label: 'Date', type: 'date', half: true },
      ] },
      { id: 'contenu', title: 'Contenu', fields: [
        { key: 'body', label: 'Contenu', type: 'markdown' },
      ] },
    ],
  },
};

export const kindMeta = (k) => KINDS[k] || { label: k, plural: k, icon: '•', color: '#c9a8e8', sections: [] };

export const CHAPTER_STATUSES = [
  { key: 'idee', label: 'Idée', color: '#8a80a0' },
  { key: 'plan', label: 'Plan', color: '#80c8e8' },
  { key: 'premier_jet', label: 'Premier jet', color: '#e8d27c' },
  { key: 'reecriture', label: 'Réécriture', color: '#e8a87c' },
  { key: 'correction', label: 'Correction', color: '#e88cb8' },
  { key: 'termine', label: 'Terminé', color: '#9ad4ae' },
];
export const chapterStatus = (k) => CHAPTER_STATUSES.find((s) => s.key === k) || CHAPTER_STATUSES[0];

export const NOTE_STATUSES = [
  { key: 'brute', label: 'Idée brute', color: '#c9a8e8' },
  { key: 'a_developper', label: 'À développer', color: '#e8d27c' },
  { key: 'a_integrer', label: 'À intégrer', color: '#80c8e8' },
  { key: 'validee', label: 'Validée', color: '#9ad4ae' },
  { key: 'abandonnee', label: 'Abandonnée', color: '#8a80a0' },
];
export const noteStatus = (k) => NOTE_STATUSES.find((s) => s.key === k) || NOTE_STATUSES[0];

export const PRIORITIES = [
  { key: 0, label: 'Aucune', short: '', color: 'transparent' },
  { key: 1, label: 'Basse', short: '!', color: '#80c8e8' },
  { key: 2, label: 'Moyenne', short: '!!', color: '#e8d27c' },
  { key: 3, label: 'Haute', short: '!!!', color: '#ff8a9b' },
];

// Relations : `label` lu depuis la source, `reverse` depuis la cible.
export const RELATIONS = {
  ami:        { label: 'Ami', symmetric: true, group: 'Relations' },
  famille:    { label: 'Famille', symmetric: true, group: 'Relations' },
  amour:      { label: 'Amour', symmetric: true, group: 'Relations' },
  allie:      { label: 'Allié', symmetric: true, group: 'Relations' },
  rival:      { label: 'Rival', symmetric: true, group: 'Relations' },
  ennemi:     { label: 'Ennemi', symmetric: true, group: 'Relations' },
  mentor:     { label: 'Mentor de', reverse: 'Élève de', group: 'Relations' },
  parent:     { label: 'Parent de', reverse: 'Enfant de', group: 'Relations' },
  apparait_dans: { label: 'Apparaît dans', reverse: 'Fait apparaître', group: 'Récit' },
  membre_de:  { label: 'Membre de', reverse: 'A pour membre', group: 'Monde' },
  situe_dans: { label: 'Situé dans', reverse: 'Contient', group: 'Monde' },
  se_trouve_a: { label: 'Se trouve à', reverse: 'Accueille', group: 'Monde' },
  participe_a: { label: 'Participe à', reverse: 'Implique', group: 'Récit' },
  se_deroule_a: { label: 'Se déroule à', reverse: 'Théâtre de', group: 'Monde' },
  possede:    { label: 'Possède', reverse: 'Appartient à', group: 'Monde' },
  gouverne:   { label: 'Gouverne', reverse: 'Gouverné par', group: 'Monde' },
  mentionne:  { label: 'Mentionne', reverse: 'Mentionné dans', group: 'Récit' },
  cause:      { label: 'Cause', reverse: 'Causé par', group: 'Temps' },
  precede:    { label: 'Précède', reverse: 'Suit', group: 'Temps' },
  contredit:  { label: 'Contredit', symmetric: true, group: 'Cohérence' },
  lie_a:      { label: 'Lié à', symmetric: true, group: 'Divers' },
};
export const RELATION_GROUPS = ['Relations', 'Monde', 'Récit', 'Temps', 'Cohérence', 'Divers'];

export const CHARACTER_RELATIONS = ['ami', 'famille', 'amour', 'allie', 'rival', 'ennemi', 'mentor', 'parent'];

// Relation proposée par défaut selon les types reliés (modifiable dans le
// formulaire) : « un personnage + une faction » → « membre de », etc. Valeur au
// format du sélecteur : `~clé` = relation lue dans l'autre sens.
export function defaultRelation(fromKind, toKind) {
  const key = `${fromKind}>${toKind}`;
  const map = {
    'character>character': 'ami',
    'character>lore': 'membre_de',
    'character>place': 'se_trouve_a',
    'character>event': 'participe_a',
    'character>chapter': 'apparait_dans',
    'place>place': 'situe_dans',
    'lore>place': 'situe_dans',
    'event>place': 'se_deroule_a',
    'event>event': 'precede',
    'event>character': '~participe_a',
    'chapter>place': 'se_deroule_a',
    'chapter>event': 'mentionne',
    'chapter>lore': 'mentionne',
    'chapter>character': '~apparait_dans',
    'lore>lore': 'lie_a',
  };
  return map[key] || 'lie_a';
}

// Libellé d'une relation vue depuis un côté donné.
export function relationText(kind, direction) {
  const r = RELATIONS[kind];
  if (!r) return kind;
  if (r.symmetric || direction !== 'in') return r.label;
  return r.reverse || r.label;
}

// Options du sélecteur de relation : chaque relation orientée apparaît dans
// les deux sens (« Mentor de » / « Élève de »), le sens choisi décide qui est
// la source.
export function relationOptions() {
  const out = [];
  for (const [key, r] of Object.entries(RELATIONS)) {
    out.push({ value: key, dir: 'out', label: r.label, group: r.group });
    if (!r.symmetric && r.reverse) out.push({ value: `~${key}`, dir: 'in', label: r.reverse, group: r.group });
  }
  return out;
}

// Valeur du sélecteur → { kind, reversed } (reversed = l'élément choisi est
// la source de la relation).
export function resolveRelationChoice(choice) {
  const c = String(choice || 'lie_a');
  return c.startsWith('~') ? { kind: c.slice(1), reversed: true } : { kind: c, reversed: false };
}

// Regroupement des relations sur une fiche, par type de l'élément relié.
export const LINK_SECTIONS = [
  { kind: 'character', title: 'Personnages' },
  { kind: 'lore', title: 'Factions, groupes & lore' },
  { kind: 'place', title: 'Lieux' },
  { kind: 'event', title: 'Événements' },
  { kind: 'chapter', title: 'Chapitres' },
  { kind: 'note', title: 'Idées' },
];
