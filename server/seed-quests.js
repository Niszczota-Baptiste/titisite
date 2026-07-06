import { db } from './db.js';
import { createChain, createFaction, createMap, createPoi, createQuest, defaultMapId, updateMap, updateQuest } from './quests/store.js';

// Demo seed for the quest tracker, exercising every view end to end: five
// factions (incl. a « maîtrise »), a branching chain, and quests of each
// cadence with inputs / rewards / prerequisites / map points. Idempotent —
// skipped once any faction exists, so real content is never touched. Everything
// here is deletable from the « ✎ Éditeur » tab of /quetes.

const FACTIONS = {
  hewyr: {
    nom: 'Hewyr', type: 'faction', couleur: '#e0526f',
    description: 'Le peuple du lac de la foi. Loyauté et serments de cendre.',
    tiers: [
      { nomPalier: 'Étranger', seuil: 0 }, { nomPalier: 'Connu', seuil: 100 },
      { nomPalier: 'Allié', seuil: 300 }, { nomPalier: 'Héros de Hewyr', seuil: 800 },
    ],
  },
  chateau: {
    nom: 'Château', type: 'faction', couleur: '#e8c86a',
    description: 'La cour et ses vassaux. Prestige, tributs et titres.',
    tiers: [
      { nomPalier: 'Roturier', seuil: 0 }, { nomPalier: 'Vassal', seuil: 150 },
      { nomPalier: 'Chevalier', seuil: 500 }, { nomPalier: 'Duc', seuil: 1200 },
    ],
  },
  tombes: {
    nom: 'Tombes', type: 'faction', couleur: '#b79bff',
    description: 'Les gardiens des sépultures. On ne dérange pas les morts sans prix.',
    tiers: [
      { nomPalier: 'Profanateur', seuil: 0 }, { nomPalier: 'Toléré', seuil: 100 },
      { nomPalier: 'Gardien des tombes', seuil: 400 },
    ],
  },
  boudumonde: {
    nom: "Bou'dumonde", type: 'faction', couleur: '#7bd3e8',
    description: 'Le comptoir du bout du monde. Marchands, contrebande et rumeurs.',
    tiers: [
      { nomPalier: 'Inconnu', seuil: 0 }, { nomPalier: 'Habitué', seuil: 120 },
      { nomPalier: 'Héros du comptoir', seuil: 600 },
    ],
  },
  forge: {
    nom: 'Maîtrise de la forge', type: 'maitrise', couleur: '#e0913a',
    description: 'Le savoir-faire du métal. Progression de maîtrise, pas de faction.',
    tiers: [
      { nomPalier: 'Néophyte maladroit', seuil: 1 }, { nomPalier: 'Apprenti', seuil: 50 },
      { nomPalier: 'Compagnon', seuil: 200 }, { nomPalier: 'Maître forgeron', seuil: 600 },
    ],
  },
};

// due date for the one-off event quest: ~2 days out so the "échéance" chip shows.
const IN_TWO_DAYS = Math.floor(Date.now() / 1000) + 2 * 86_400;

// Quest definitions use *keys* for cross-references (faction, unlock target,
// prerequisite quest, tier), resolved to ids in a second pass.
const QUESTS = [
  // ── Chain « Le Serment de Hewyr » (branching) ──
  {
    key: 'q_appel', titre: "L'appel du lac", chain: true, rank: 1, faction: 'hewyr',
    occ: 'simple', description: "Rejoins Nielas sur les rives du lac de la foi. Il t'attend à l'aube.",
    inputs: [{ kind: 'pnj', label: 'Parler à Nielas' }],
    rewards: [
      { kind: 'pa', quantite: 20, label: '20 PA' },
      { kind: 'reputation', faction: 'hewyr', quantite: 15, label: '+15 Hewyr' },
      { kind: 'deblocage', unlockKey: 'q_offrande', label: "Débloque « L'offrande de cendres »" },
    ],
    points: [{ label: 'Rives du lac', role: 'pnj', x: 214, y: 63, z: -88 }],
  },
  {
    key: 'q_offrande', titre: "L'offrande de cendres", chain: true, rank: 2, faction: 'hewyr',
    occ: 'simple', description: 'Brûle dix gerbes de blé sur l’autel estival, puis porte les cendres au gardien.',
    inputs: [{ kind: 'item', refCode: 'minecraft:wheat', quantite: 10, label: 'Blé' }],
    prereqs: [{ kind: 'quete_terminee', refKey: 'q_appel', label: "L'appel du lac terminée" }],
    rewards: [
      { kind: 'reputation', faction: 'hewyr', quantite: 40, label: '+40 Hewyr' },
      { kind: 'deblocage', unlockKey: 'q_gardien', label: 'Débloque « Le gardien scellé »' },
      { kind: 'deblocage', unlockKey: 'q_pacte', label: 'Débloque « Le pacte oublié »' },
    ],
    points: [
      { label: 'Autel estival', role: 'recuperation', x: 240, y: 70, z: -120 },
      { label: 'Gardien', role: 'rendu', x: 268, y: 64, z: -140 },
    ],
  },
  {
    key: 'q_gardien', titre: 'Le gardien scellé', chain: true, rank: 3, faction: 'hewyr',
    occ: 'simple', description: 'Descends dans la crypte et brise le sceau. Ce que tu y trouveras t’appartient.',
    prereqs: [
      { kind: 'quete_terminee', refKey: 'q_offrande', label: "L'offrande de cendres terminée" },
      { kind: 'reputation_min', faction: 'hewyr', tierName: 'Allié', label: 'Être Allié de Hewyr' },
    ],
    rewards: [
      { kind: 'item', refCode: 'minecraft:diamond', quantite: 3, label: '3 diamants' },
      { kind: 'reputation', faction: 'hewyr', quantite: 120, label: '+120 Hewyr' },
    ],
    points: [{ label: 'Crypte scellée', role: 'recuperation', x: 301, y: 40, z: -175 }],
  },
  {
    key: 'q_pacte', titre: 'Le pacte oublié', chain: true, rank: 2, faction: 'tombes',
    occ: 'simple', description: 'Une autre voie s’ouvre : les Tombes réclament leur dû avant de parler.',
    prereqs: [{ kind: 'quete_terminee', refKey: 'q_offrande', label: "L'offrande de cendres terminée" }],
    rewards: [
      { kind: 'reputation', faction: 'tombes', quantite: 60, label: '+60 Tombes' },
      { kind: 'item', refCode: 'minecraft:emerald', quantite: 5, label: '5 émeraudes' },
    ],
    points: [{ label: 'Vieille sépulture', role: 'pnj', x: 190, y: 55, z: -210 }],
  },

  // ── Récurrentes ──
  {
    key: 'q_ravito', titre: 'Ravitaillement du Château', faction: 'chateau', occ: 'journaliere',
    description: 'Livre du pain frais aux cuisines du Château. Chaque jour, la cour a faim.',
    inputs: [{ kind: 'item', refCode: 'minecraft:bread', quantite: 16, label: 'Pain' }],
    rewards: [
      { kind: 'pa', quantite: 50, label: '50 PA' },
      { kind: 'reputation', faction: 'chateau', quantite: 25, label: '+25 Château' },
    ],
    points: [{ label: 'Cuisines du Château', role: 'rendu', x: 40, y: 72, z: 12 }],
  },
  {
    key: 'q_ronde', titre: 'Ronde des Tombes', faction: 'tombes', occ: 'hebdomadaire',
    description: 'Patrouille les allées funéraires et chasse les pilleurs. Chaque vendredi.',
    rewards: [
      { kind: 'pa', quantite: 200, label: '200 PA' },
      { kind: 'reputation', faction: 'tombes', quantite: 60, label: '+60 Tombes' },
    ],
    points: [{ label: 'Grande nécropole', role: 'autre', x: 160, y: 58, z: -230 }],
  },
  {
    key: 'q_tribut', titre: "Tribut mensuel de Bou'dumonde", faction: 'boudumonde', occ: 'mensuelle',
    description: 'Réunis la cargaison du mois pour le comptoir. Le bout du monde paie bien.',
    inputs: [{ kind: 'item', refCode: 'minecraft:gold_ingot', quantite: 8, label: "Lingots d'or" }],
    rewards: [
      { kind: 'pa', quantite: 800, label: '800 PA' },
      { kind: 'reputation', faction: 'boudumonde', quantite: 100, label: "+100 Bou'dumonde" },
      { kind: 'item', refCode: 'minecraft:netherite_scrap', quantite: 1, label: 'Débris ancien' },
    ],
    points: [{ label: 'Comptoir du bout du monde', role: 'rendu', x: -420, y: 68, z: 510 }],
  },
  {
    key: 'q_commande', titre: 'Commande de forge', faction: 'forge', occ: 'journaliere',
    description: 'Forge une pièce commandée. La maîtrise vient en forgeant.',
    inputs: [{ kind: 'item', refCode: 'minecraft:iron_ingot', quantite: 6, label: 'Lingots de fer' }],
    prereqs: [{ kind: 'maitrise_min', faction: 'forge', tierName: 'Apprenti', label: 'Être Apprenti forgeron' }],
    rewards: [
      { kind: 'pa', quantite: 40, label: '40 PA' },
      { kind: 'reputation', faction: 'forge', quantite: 30, label: '+30 maîtrise Forge' },
    ],
    points: [{ label: 'Grande forge', role: 'recuperation', x: 12, y: 66, z: 60 }],
  },

  // ── One-off event with a deadline ──
  {
    key: 'q_festival', titre: 'Festival des cendres', faction: 'hewyr', occ: 'simple',
    dueDate: IN_TWO_DAYS,
    description: 'L’évènement annuel touche à sa fin. Dépose une offrande avant l’extinction du grand brasier.',
    inputs: [{ kind: 'item', refCode: 'minecraft:blaze_powder', quantite: 4, label: 'Poudre de Blaze' }],
    rewards: [
      { kind: 'pa', quantite: 300, label: '300 PA' },
      { kind: 'reputation', faction: 'hewyr', quantite: 50, label: '+50 Hewyr' },
    ],
    points: [{ label: 'Grand brasier', role: 'rendu', x: 220, y: 64, z: -100 }],
  },
];

// Standalone points of interest (not tied to a quest) for the « Carte » tab.
const POIS = [
  { label: 'Ferme à blé communautaire', category: 'farm', x: 250, y: 66, z: -95, note: 'Pour l\'offrande de cendres — récolte auto.' },
  { label: 'Mine de fer du Château', category: 'ressource', x: 55, y: 32, z: 40, note: 'Filon riche, proche des cuisines.' },
  { label: 'Grande bibliothèque', category: 'batiment', x: 5, y: 70, z: -20, note: 'Bâtiment notable de la cour.' },
  { label: 'Farm de Blaze', category: 'farm', x: 40, y: 48, z: 20, note: 'Poudre de Blaze pour le Festival des cendres.', map: 'nether' },
];

export function seedQuestsIfEmpty() {
  // Operators (and the test harness) can suppress the demo data.
  if (process.env.SEED_DEMO_QUESTS === 'off') return { skipped: 'disabled' };
  const existing = db.prepare('SELECT COUNT(*) AS n FROM factions').get().n;
  if (existing > 0) return { skipped: true, existing };

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1").get();
  const uid = admin?.id ?? null;

  // Maps (not plain objects) so computed-key lookups don't trip the
  // object-injection lint rule and stay clearly keyed by our own literals.
  const F = new Map(); // faction key → id
  for (const [key, def] of Object.entries(FACTIONS)) F.set(key, createFaction(def, uid).id);

  const chain = createChain({
    nom: 'Le Serment de Hewyr', factionId: F.get('hewyr'),
    description: 'Du premier appel au sceau brisé — avec une bifurcation vers les Tombes.',
  }, uid);

  const tierId = (fKey, palier) => db.prepare(
    `SELECT id FROM faction_tiers WHERE faction_id = ? AND nom_palier = ?`,
  ).get(F.get(fKey), palier)?.id ?? null;

  // Pass 1 — create skeletons so every id exists for cross-references.
  const Q = new Map(); // quest key → id
  for (const d of QUESTS) {
    Q.set(d.key, createQuest({
      titre: d.titre, description: d.description, occurrenceType: d.occ,
      factionId: F.get(d.faction) ?? null,
      chainId: d.chain ? chain.id : null, chainRank: d.rank || 0, dueDate: d.dueDate ?? null,
    }, uid).id);
  }

  // Pass 2 — full payload with resolved unlock/prereq/tier ids.
  for (const d of QUESTS) {
    const rewards = (d.rewards || []).map((r) => {
      const out = { ...r };
      if (r.faction) out.factionId = F.get(r.faction);
      if (r.unlockKey) out.unlockQuestId = Q.get(r.unlockKey);
      return out;
    });
    const prerequisites = (d.prereqs || []).map((p) => {
      const out = { ...p };
      if (p.refKey) out.refQuestId = Q.get(p.refKey);
      if (p.faction) out.factionId = F.get(p.faction);
      if (p.tierName) out.tierId = tierId(p.faction, p.tierName);
      return out;
    });
    updateQuest(Q.get(d.key), {
      titre: d.titre, description: d.description, occurrenceType: d.occ,
      factionId: F.get(d.faction) ?? null,
      chainId: d.chain ? chain.id : null, chainRank: d.rank || 0, dueDate: d.dueDate ?? null,
      inputs: d.inputs || [], rewards, prerequisites, mapPoints: d.points || [],
    }, uid);
  }

  // A second example map (the default « Monde principal » is created in migrate).
  const nether = createMap({ nom: 'Nether', description: 'Dimension du Nether', couleur: '#e0526f', centerX: 0, centerZ: 0, defaultSpan: 256 }, uid);
  const mainMapId = defaultMapId();
  // Frame the default map on the seeded overworld points (world isn't at 0,0).
  updateMap(mainMapId, { nom: 'Monde principal', description: 'Carte par défaut', centerX: -50, centerZ: 100, defaultSpan: 1200 }, uid);
  for (const p of POIS) createPoi({ ...p, mapId: p.map === 'nether' ? nether.id : mainMapId }, uid);

  return { inserted: { factions: Object.keys(FACTIONS).length, chains: 1, quests: QUESTS.length, pois: POIS.length, maps: 2 } };
}
