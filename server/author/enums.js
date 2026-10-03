// Listes extensibles de l'atelier d'auteur. Volontairement AUCUN CHECK SQL sur
// ces colonnes (même raison que lore/quêtes : un CHECK SQLite ne s'étend pas
// sans reconstruire la table) — ajouter une valeur = l'ajouter ici ; la
// validation des routes et l'affichage (src/components/author/kinds.js) suivent.

// ── Types d'éléments ────────────────────────────────────────────────────────
// Chaque élément vit dans author_entities (titre, résumé, corps, tags,
// favoris, liens…) et ses champs propres dans la table de son type
// (« class table inheritance ») : les liens entre éléments sont ainsi de vraies
// clés étrangères, quel que soit leur type.
export const KINDS = ['character', 'place', 'lore', 'event', 'chapter', 'note'];

// ── Partage ─────────────────────────────────────────────────────────────────
// Types jamais servis à un invité, quel que soit son rôle : la boîte à idées
// reste l'espace personnel du propriétaire. Toute lecture invitée filtre sur
// GUEST_KINDS (liste blanche) plutôt que d'exclure PRIVATE_KINDS : un futur
// type est privé tant qu'on ne l'a pas explicitement ouvert.
export const PRIVATE_KINDS = ['note'];
export const GUEST_KINDS = ['character', 'place', 'lore', 'event', 'chapter'];
export const SHARE_ROLES = ['omniscient', 'lecteur'];
export const VALIDATED_STATUS = 'termine';

export const KIND_TABLE = {
  character: 'author_characters',
  place: 'author_places',
  lore: 'author_lore',
  event: 'author_events',
  chapter: 'author_chapters',
  note: 'author_notes',
};

// Champs communs à tous les types (colonnes de author_entities).
// `max` borne la longueur ; `fts` = indexé par la recherche plein-texte.
export const COMMON_FIELDS = [
  { key: 'title', col: 'title', type: 'text', max: 200, required: true, fts: true },
  { key: 'summary', col: 'summary', type: 'text', max: 4000, fts: true },
  { key: 'body', col: 'body', type: 'text', max: 200_000, fts: true },
  { key: 'icon', col: 'icon', type: 'text', max: 16 },
  { key: 'color', col: 'color', type: 'color' },
];

// Champs propres à chaque type. `layout: true` = champ de rangement (position,
// acte) jamais envoyé par un formulaire : il ne fait pas bouger la révision.
export const KIND_FIELDS = {
  character: [
    { key: 'firstName', col: 'first_name', type: 'text', max: 200, fts: true },
    { key: 'nickname', col: 'nickname', type: 'text', max: 200, fts: true },
    { key: 'titles', col: 'titles', type: 'text', max: 500, fts: true },
    { key: 'storyRole', col: 'story_role', type: 'text', max: 200, fts: true },
    { key: 'appearance', col: 'appearance', type: 'text', max: 20_000, fts: true },
    { key: 'personality', col: 'personality', type: 'text', max: 20_000, fts: true },
    { key: 'psychology', col: 'psychology', type: 'text', max: 20_000, fts: true },
    { key: 'motivations', col: 'motivations', type: 'text', max: 20_000, fts: true },
    { key: 'goals', col: 'goals', type: 'text', max: 20_000, fts: true },
    { key: 'fears', col: 'fears', type: 'text', max: 20_000, fts: true },
    { key: 'qualities', col: 'qualities', type: 'text', max: 20_000, fts: true },
    { key: 'flaws', col: 'flaws', type: 'text', max: 20_000, fts: true },
    { key: 'values', col: 'values_text', type: 'text', max: 20_000, fts: true },
    { key: 'backstory', col: 'backstory', type: 'text', max: 50_000, fts: true },
    { key: 'arc', col: 'arc', type: 'text', max: 50_000, fts: true },
    { key: 'notes', col: 'notes', type: 'text', max: 50_000, fts: true },
  ],
  place: [
    { key: 'categoryId', col: 'category_id', type: 'category', domain: 'place' },
    { key: 'history', col: 'history', type: 'text', max: 50_000, fts: true },
    { key: 'population', col: 'population', type: 'text', max: 20_000, fts: true },
    { key: 'culture', col: 'culture', type: 'text', max: 50_000, fts: true },
    { key: 'importance', col: 'importance', type: 'text', max: 20_000, fts: true },
    { key: 'notes', col: 'notes', type: 'text', max: 50_000, fts: true },
  ],
  lore: [
    { key: 'categoryId', col: 'category_id', type: 'category', domain: 'lore' },
  ],
  event: [
    { key: 'timelineId', col: 'timeline_id', type: 'timeline' },
    { key: 'sortKey', col: 'sort_key', type: 'number' },
    { key: 'endSortKey', col: 'end_sort_key', type: 'number' },
    { key: 'dateLabel', col: 'date_label', type: 'text', max: 200, fts: true },
    { key: 'importance', col: 'importance', type: 'int', min: 1, max: 3 },
  ],
  chapter: [
    { key: 'status', col: 'status', type: 'enum', values: () => CHAPTER_STATUSES },
    { key: 'content', col: 'content', type: 'text', max: 900_000, fts: true },
    { key: 'targetWords', col: 'target_words', type: 'int', min: 0, max: 1_000_000, nullable: true },
  ],
  note: [
    { key: 'status', col: 'status', type: 'enum', values: () => NOTE_STATUSES },
    { key: 'priority', col: 'priority', type: 'int', min: 0, max: 3 },
    { key: 'category', col: 'category', type: 'text', max: 80, fts: true },
    { key: 'noteDate', col: 'note_date', type: 'date' },
    { key: 'inbox', col: 'inbox', type: 'bool' },
  ],
};

// Champs dont l'historique est conservé (snapshots automatiques + manuels).
export const REVISION_FIELDS = { content: 'chapter', body: '*' };

// ── Chapitres ───────────────────────────────────────────────────────────────
// `weight` = part du travail considérée faite à ce statut ; la progression
// globale du livre en est la moyenne (un chapitre « Plan » ne vaut pas zéro).
export const CHAPTER_STATUSES = ['idee', 'plan', 'premier_jet', 'reecriture', 'correction', 'termine'];
export const CHAPTER_STATUS_WEIGHT = {
  idee: 0, plan: 0.1, premier_jet: 0.4, reecriture: 0.65, correction: 0.85, termine: 1,
};

// ── Brainstorming ───────────────────────────────────────────────────────────
export const NOTE_STATUSES = ['brute', 'a_developper', 'a_integrer', 'validee', 'abandonnee'];
// Idées « en attente » sur le tableau de bord : ni validées ni abandonnées.
export const NOTE_PENDING = ['brute', 'a_developper', 'a_integrer'];

// ── Relations ───────────────────────────────────────────────────────────────
// `symmetric` : une seule ligne en base, même libellé des deux côtés.
// Sinon `label` se lit depuis la source, `reverse` depuis la cible.
export const RELATION_KINDS = {
  // Entre personnages
  ami:        { label: 'Ami', symmetric: true },
  famille:    { label: 'Famille', symmetric: true },
  amour:      { label: 'Amour', symmetric: true },
  allie:      { label: 'Allié', symmetric: true },
  rival:      { label: 'Rival', symmetric: true },
  ennemi:     { label: 'Ennemi', symmetric: true },
  mentor:     { label: 'Mentor de', reverse: 'Élève de' },
  parent:     { label: 'Parent de', reverse: 'Enfant de' },
  // Structure du monde et du récit
  apparait_dans: { label: 'Apparaît dans', reverse: 'Fait apparaître' },
  membre_de:     { label: 'Membre de', reverse: 'A pour membre' },
  situe_dans:    { label: 'Situé dans', reverse: 'Contient' },
  se_trouve_a:   { label: 'Se trouve à', reverse: 'Accueille' },
  participe_a:   { label: 'Participe à', reverse: 'Implique' },
  se_deroule_a:  { label: 'Se déroule à', reverse: 'Théâtre de' },
  possede:       { label: 'Possède', reverse: 'Appartient à' },
  gouverne:      { label: 'Gouverne', reverse: 'Gouverné par' },
  mentionne:     { label: 'Mentionne', reverse: 'Mentionné dans' },
  cause:         { label: 'Cause', reverse: 'Causé par' },
  precede:       { label: 'Précède', reverse: 'Suit' },
  contredit:     { label: 'Contredit', symmetric: true },
  lie_a:         { label: 'Lié à', symmetric: true },
};
export const RELATION_KEYS = Object.keys(RELATION_KINDS);

// Recherche par clé venue de l'utilisateur : uniquement les clés PROPRES de
// l'objet (« __proto__ », « constructor »… ne doivent jamais valider).
export const own = (obj, key) => (typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined);
export const relationMeta = (kind) => own(RELATION_KINDS, kind);

// ── Alias ───────────────────────────────────────────────────────────────────
// `ancien_nom` alimente la règle de cohérence « lieu renommé mais ancien nom
// encore utilisé » ; `alias` sert seulement la recherche.
export const ALIAS_KINDS = ['alias', 'ancien_nom'];

// ── Catégories configurables (seed à la création d'un projet) ──────────────
export const CATEGORY_DOMAINS = ['lore', 'place'];
export const DEFAULT_CATEGORIES = {
  place: [
    ['Lieu', '📍'], ['Ville', '🏙️'], ['Pays', '🗺️'], ['Royaume', '👑'],
    ['Région', '⛰️'], ['Bâtiment', '🏛️'],
  ],
  lore: [
    ['Faction', '⚔️'], ['Organisation', '🏢'], ['Religion', '🕯️'], ['Culture', '🎭'],
    ['Espèce', '🧬'], ['Créature', '🐉'], ['Magie', '✨'], ['Technologie', '⚙️'],
    ['Objet important', '🗝️'], ['Artefact', '💎'], ['Événement historique', '📜'],
    ['Concept', '💡'],
  ],
};

export const DEFAULT_TIMELINES = [
  ['Histoire ancienne', '#b79bff'],
  ['Événements récents', '#e8a87c'],
  ['Timeline du récit', '#7be3a8'],
];

// ── Tableau blanc ───────────────────────────────────────────────────────────
export const BOARD_NODE_KINDS = ['text', 'card', 'entity', 'image', 'shape', 'group', 'comment'];
export const BOARD_SHAPES = ['rect', 'ellipse', 'diamond'];
export const BOARD_EDGE_STYLES = ['solid', 'dashed'];
export const BOARD_ARROWS = ['end', 'both', 'none'];
export const BOARD_MAX_NODES = 5000;
export const BOARD_MAX_OPS = 2000;
