// Listes extensibles de l'atelier d'auteur. Volontairement AUCUN CHECK SQL sur
// ces colonnes (même raison que lore/quêtes : un CHECK SQLite ne s'étend pas
// sans reconstruire la table) — ajouter une valeur = l'ajouter ici ; la
// validation des routes et l'affichage (src/components/author/kinds.js) suivent.

// ── Types d'éléments ────────────────────────────────────────────────────────
// Chaque élément vit dans author_entities (titre, résumé, corps, tags,
// favoris, liens…) et ses champs propres dans la table de son type
// (« class table inheritance ») : les liens entre éléments sont ainsi de vraies
// clés étrangères, quel que soit leur type.
// 'sound' = idée musicale (mélodie, rythme, chanson en cours) : ses paroles,
// ses repères (tempo, tonalité, accords…) et ses PRISES audio privées.
export const KINDS = ['character', 'place', 'lore', 'event', 'chapter', 'note', 'sound'];

// ── Partage ─────────────────────────────────────────────────────────────────
// Types jamais servis à un invité, quel que soit son rôle : la boîte à idées
// reste l'espace personnel du propriétaire. Toute lecture invitée filtre sur
// GUEST_KINDS (liste blanche) plutôt que d'exclure PRIVATE_KINDS : un futur
// type est privé tant qu'on ne l'a pas explicitement ouvert.
// Les idées musicales et leurs prises audio sont privées elles aussi : aucune
// règle de partage n'a été définie pour elles.
export const PRIVATE_KINDS = ['note', 'sound'];
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
  sound: 'author_sounds',
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
    // Incubation : « à revoir plus tard » — une date, rien d'autre (ni rappel
    // répété ni série à tenir). Le mode Explorer la repropose le moment venu.
    { key: 'revisitOn', col: 'revisit_on', type: 'date' },
    // Provenance d'une capture (« saisie », « partage : Chrome », « import »…)
    // et moment où elle a été saisie sur l'appareil (secondes Unix).
    { key: 'origin', col: 'origin', type: 'text', max: 120 },
    { key: 'capturedAt', col: 'captured_at', type: 'int', min: 0, max: 99_999_999_999, nullable: true },
  ],
  sound: [
    { key: 'lyrics', col: 'lyrics', type: 'text', max: 200_000, fts: true },
    { key: 'tempo', col: 'tempo', type: 'number', min: 20, max: 400 },
    { key: 'timeSignature', col: 'time_signature', type: 'text', max: 12 },
    { key: 'keySignature', col: 'key_signature', type: 'text', max: 40, fts: true },
    { key: 'chords', col: 'chords', type: 'text', max: 4000, fts: true },
    { key: 'instruments', col: 'instruments', type: 'text', max: 1000, fts: true },
    { key: 'structure', col: 'structure', type: 'text', max: 8000, fts: true },
    { key: 'mood', col: 'mood', type: 'text', max: 400, fts: true },
  ],
};

// Champs dont l'historique est conservé (snapshots automatiques + manuels).
export const REVISION_FIELDS = { content: 'chapter', lyrics: 'sound', body: '*' };

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
  // Musique ↔ récit : une idée musicale accompagne une scène, sert de thème à
  // un personnage ou à un lieu, s'inspire d'un élément.
  accompagne:    { label: 'Accompagne', reverse: 'Accompagné par' },
  theme_de:      { label: 'Thème de', reverse: 'A pour thème' },
  inspire:       { label: 'Inspire', reverse: 'Inspiré par' },
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

// ── Projets ─────────────────────────────────────────────────────────────────
// Nature d'un projet : elle oriente l'interface (ce qui est mis en avant, le
// vocabulaire) sans jamais retirer un outil ni imposer une structure. Les
// projets créés avant ce champ sont des livres.
export const PROJECT_KINDS = ['livre', 'nouvelle', 'poesie', 'scene', 'univers', 'musique', 'mixte', 'libre'];
export const DEFAULT_PROJECT_KIND = 'livre';

// ── Médias privés ───────────────────────────────────────────────────────────
// 'image' : réencodée en WebP (media.js). 'audio' : prise conservée telle
// quelle, jamais retouchée (audio.js). Les deux ne sortent que par
// /api/author/media/:filename, derrière la garde.
export const MEDIA_KINDS = ['image', 'audio'];
export const AUDIO_SOURCES = ['recorded', 'imported', 'shared'];
// État de la prise tel que l'appareil l'a constaté : 'ok' (terminée
// normalement) ou 'recovered' (enregistrement interrompu, récupéré après
// vérification — peut être plus court que prévu).
export const AUDIO_INTEGRITY = ['ok', 'recovered'];
// Repères posés sur une prise. 'loop' et 'extract' sont des plages (début +
// fin) : une extraction est un repère, l'original n'est jamais découpé.
export const MARKER_KINDS = ['marker', 'loop', 'extract', 'interruption'];
export const MARKERS_MAX_PER_MEDIA = 500;

// ── Cohérence ───────────────────────────────────────────────────────────────
// Nature d'une alerte : 'calculee' (déduite des données), 'declaree' (une
// contradiction que l'auteur a lui-même posée), 'suggestion' (piste, jamais un
// défaut). Aucune ne corrige quoi que ce soit.
export const ISSUE_NATURES = ['calculee', 'declaree', 'suggestion'];
