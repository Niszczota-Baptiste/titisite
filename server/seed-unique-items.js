import { db } from './db.js';

// Seed du catalogue d'items uniques : l'échelle de rareté puis les objets
// relevés en jeu (les géodes + la monnaie du devin).
//
// Idempotence PAR LIGNE (rareté → par nom, item → par slug), et pas « si la
// table est vide » : sur une base déjà remplie — le cas de la prod, où des
// items custom existent depuis l'onglet « Items » — un garde « table vide »
// ne poserait jamais les géodes. Rejouer ce seed n'écrase jamais une ligne
// existante : ce que tu édites en ligne reste tel quel.

const RARITIES = [
  { nom: 'Commun', couleur: '#9aa4b2' },
  { nom: 'Peu commun', couleur: '#7be3a8' },
  { nom: 'Rare', couleur: '#7bd3e8' },
  { nom: 'Très rare', couleur: '#b79bff' },
  { nom: 'Légendaire', couleur: '#e8c86a' },
];

// `base` = id PLAT du codex (public/codex/codex.json pour Minefield,
// src/data/codex_vanilla.json pour vanilla) — vérifiés un par un :
//   prismarine_crystals  → « Cristaux de prismarine » (vanilla)
//   leather_ball         → « Carreau de cuir rembouré de paille » (Minefield)
//   popped_chorus_fruit  → « Chorus éclaté » (vanilla)
// L'Écaille du devin n'a PAS d'item support : son id n'a pas été communiqué et
// on ne devine pas un id de codex. Elle s'affiche donc avec l'icône de repli
// jusqu'à ce que l'item de base soit renseigné dans l'éditeur.
const ITEMS = [
  {
    slug: 'petite-geode',
    nom: 'Petite géode',
    base: 'prismarine_crystals',
    lore: 'Une géode contenant sans doute un trésor précieux.',
    rarete: 'Peu commun',
    categorie: 'contenant',
    ouvrable: true,
    vendable: true,
  },
  {
    slug: 'geode-de-taille-moyenne',
    nom: 'Géode de taille moyenne',
    base: 'leather_ball',
    lore: 'Une belle géode assez rare à trouver. Son contenu doit être intéressant !',
    rarete: 'Rare',
    categorie: 'contenant',
    ouvrable: true,
    vendable: true,
  },
  {
    slug: 'geode-tres-rare',
    nom: 'Géode très rare',
    base: 'popped_chorus_fruit',
    lore: 'Une des géodes les plus rares à trouver ! La fortune vous tend les bras !',
    rarete: 'Très rare',
    categorie: 'contenant',
    ouvrable: true,
    vendable: true,
  },
  {
    slug: 'ecaille-du-devin',
    nom: 'Écaille du devin',
    base: null,
    lore: 'Écaille brillante donnant certaines facultés à son porteur, des facultés de survie incroyables.',
    rarete: 'Rare',
    categorie: 'monnaie',
    ouvrable: false,
    vendable: true,
    note: "Item de base à renseigner : l'id de codex n'a pas encore été communiqué.",
  },
];

/** Insère les paliers de rareté manquants (match par nom). */
export function seedRarities(userId = null) {
  const found = db.prepare('SELECT nom FROM unique_item_rarities');
  const existing = new Set(found.all().map((r) => r.nom.toLowerCase()));
  const ins = db.prepare(`
    INSERT INTO unique_item_rarities (nom, couleur, ordre, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  RARITIES.forEach((r, i) => {
    if (existing.has(r.nom.toLowerCase())) return;
    ins.run(r.nom, r.couleur, i + 1, userId, userId);
    inserted += 1;
  });
  return inserted;
}

/** Insère les items uniques manquants (match par slug). */
export function seedUniqueItems(userId = null) {
  const rarityId = (nom) => db.prepare(
    'SELECT id FROM unique_item_rarities WHERE lower(nom) = lower(?) LIMIT 1',
  ).get(nom)?.id ?? null;
  const bySlug = db.prepare('SELECT id FROM quest_custom_items WHERE slug = ?');
  const nextOrder = db.prepare('SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM quest_custom_items');
  const ins = db.prepare(`
    INSERT INTO quest_custom_items
      (nom, slug, ref_code, lore, rarete_id, categorie, est_ouvrable, est_vendable,
       note, sort_order, created_by, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0;
  for (const it of ITEMS) {
    if (bySlug.get(it.slug)) continue;
    ins.run(
      it.nom, it.slug, it.base, it.lore, rarityId(it.rarete), it.categorie,
      it.ouvrable ? 1 : 0, it.vendable ? 1 : 0, it.note || '',
      nextOrder.get().n, userId, userId,
    );
    inserted += 1;
  }
  return inserted;
}

/**
 * Point d'entrée appelé au boot (server/seed.js). Les tables de butin restent
 * VIDES à dessein : elles se remplissent au fil des ouvertures, depuis la fiche
 * de l'item. Mettre SEED_UNIQUE_ITEMS=off pour ne rien insérer du tout.
 */
export function seedUniqueItemsCatalogue() {
  if (process.env.SEED_UNIQUE_ITEMS === 'off') return { skipped: 'disabled' };
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const uid = admin?.id ?? null;
  const tx = db.transaction(() => ({
    rarities: seedRarities(uid),
    items: seedUniqueItems(uid),
  }));
  const out = tx();
  return (out.rarities || out.items) ? out : { skipped: true };
}
