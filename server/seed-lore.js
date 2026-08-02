import { db } from './db.js';
import {
  addEvidence, createEntry, createHypothesis, createLink, createMap,
} from './lore/store.js';

// Seed du module Lore « Nostra » — contrairement au seed de démo des quêtes,
// ce sont les VRAIES données déjà relevées sur la map (bâtiments au F3 avec une
// marge d'imprécision de 1 à 10 blocs, poèmes, hypothèses avec leur statut
// réel). Idempotent : court-circuité dès qu'une entrée existe, donc jamais
// rejoué par-dessus le travail d'enquête. SEED_LORE=off pour ne rien insérer.

// Origine de référence — KotaNostra (ville centrale).
const KOTA = { x: -353, z: -5636 };

// 21 bâtiments relevés : F = fort, S = silo, C = cimetière.
const BUILDINGS = [
  ['B1', -822, -6350, 'F'], ['B2', 719, -5770, 'S'], ['B3', -888, -4914, 'F'],
  ['B4', -3168, -4357, 'F'], ['B5', -1970, -7400, 'F'], ['B6', 206, -7940, 'S'],
  ['B7', 1832, -6083, 'S'], ['B8', -1276, -3885, 'C'], ['B9', -1217, -3315, 'C'],
  ['B10', -2882, -2621, 'C'], ['B11', -4000, -4700, 'F'], ['B12', -4065, -6180, 'F'],
  ['B13', -3762, -8600, 'F'], ['B14', -1628, -9370, 'F'], ['B15', -364, -8800, 'S'],
  ['B16', 1992, -8450, 'S'], ['B17', 2970, -7360, 'S'], ['B18', 3168, -4942, 'S'],
  ['B19', 3378, -3261, 'C'], ['B20', 926, -2062, 'C'], ['B21', -1065, -1473, 'C'],
];
const BUILDING_KINDS = new Map([
  ['F', ['Fort', 'fort']], ['S', ['Silo', 'silo']], ['C', ['Cimetière', 'cimetière']],
]);

// 9 tours aux noms de vents : 8 sur les axes cardinaux depuis KotaNostra + 1 au
// centre. Coordonnées à relever — entrées créées avec coords nulles exprès.
const TOWERS = [
  'Tour Septentrionale', 'Tour Nordet', 'Tour du Levant', 'Tour du Couchant',
  'Tour Suroît', 'Tour Tramontane', 'Tour du Sud',
  'Tour des vents (8e — nom à retrouver)', 'Tour centrale (nom à retrouver)',
];

// 5 Poèmes de Jade (Mont Piaf, tour sacrée) : [titre, initiales des vers].
const POEMS = [
  ['Notre place en ce monde', ['N', 'S', 'O', 'E']],
  ['Foi dorée', ['N', 'O', 'S', 'E']],
  ['Consigne polie', ['E', 'N', 'S']],
  ['Conseil curieux', ['E', 'O']],
  ['Recherche éternelle', ['S', 'N']],
];

export function seedLoreIfEmpty() {
  if (process.env.SEED_LORE === 'off') return { skipped: 'disabled' };
  if (db.prepare(`SELECT COUNT(*) AS n FROM lore_entries`).get().n > 0) {
    return { skipped: 'not_empty' };
  }

  const entries = new Map();
  const add = (key, data) => { entries.set(key, createEntry(data, null)); return entries.get(key); };

  // ── Structures géolocalisées ──
  add('kota', {
    title: 'KotaNostra (ville centrale)',
    entryType: 'structure', x: KOTA.x, z: KOTA.z, isCanon: true,
    tags: ['ville'],
    bodyMd: 'Ville centrale du monde de Nostra et **origine de référence** de tous les relevés '
      + `(x=${KOTA.x}, z=${KOTA.z}).\n\nLa maquette du Temple de l'œil la marque d'un bloc d'or.`,
  });

  for (const [id, x, z, kind] of BUILDINGS) {
    const [label, tag] = BUILDING_KINDS.get(kind);
    add(id, {
      title: `${id} · ${label}`,
      entryType: 'structure', x, z, isCanon: true, tags: [tag],
      bodyMd: `${label} relevé au F3. Marge d'imprécision connue : 1 à 10 blocs.`,
    });
  }

  // ── Tours des vents (coords à compléter) ──
  for (const title of TOWERS) {
    add(title, {
      title, entryType: 'structure', isCanon: true, tags: ['tour-des-vents'],
      bodyMd: 'Sommet en **or**, bloc de **redstone orienté nord**. '
        + 'Coordonnées à relever — entrée créée sans position exprès.',
    });
  }

  // ── Poèmes de Jade ──
  for (const [title, letters] of POEMS) {
    add(`Poème de Jade — ${title}`, {
      title: `Poème de Jade — ${title}`,
      entryType: 'texte', isCanon: true, tags: ['poème-de-jade'],
      bodyMd: `Trouvé au **Mont Piaf** (tour sacrée). ${letters.length} vers ; `
        + `initiales dans l'ordre : **${letters.join(' · ')}**.\n\n`
        + 'Chaque vers commence par N, S, E ou O — acrostiche directionnel '
        + 'systématique sur les 15 vers des cinq poèmes.',
    });
  }

  // ── Autres entités ──
  add('piaf', {
    title: 'Mont Piaf',
    entryType: 'structure', isCanon: true, tags: ['monument'],
    bodyMd: 'Au **nord-est**. Boussole géante en blocs de l\'End. '
      + 'C\'est là (tour sacrée) qu\'ont été trouvés les cinq Poèmes de Jade.',
  });
  add('oeil', {
    title: 'Temple de l\'œil',
    entryType: 'structure', isCanon: true, tags: ['temple'],
    bodyMd: 'Au **sud-ouest**. Contient une **maquette du monde** avec un bloc '
      + 'd\'or au centre = KotaNostra.',
  });
  add('flux', {
    title: 'Temple du flux',
    entryType: 'structure', isCanon: true, tags: ['temple'],
    bodyMd: 'Village **Ondien**. Ses stèles décrivent le **flux** (l\'XP des monstres) '
      + 'comme un courant qui parcourt le monde.',
  });
  add('cubos', {
    title: 'Les cinq cubos',
    entryType: 'structure', isCanon: true,
    bodyMd: '5 cubos répertoriés sur la map. Coordonnées et fonction à documenter.',
  });
  add('portails', {
    title: 'Les trois portails (un par peuple)',
    entryType: 'structure', isCanon: true,
    bodyMd: '3 portails, un par peuple. Emplacements à relever.',
  });
  add('emblemes', {
    title: 'Système d\'emblèmes à 4 couleurs',
    entryType: 'mecanisme', isCanon: true,
    bodyMd: 'Emblèmes à 4 couleurs présents sur de nombreux supports. '
      + 'Le **rouge indique le nord** partout — **sauf à la ville centrale, où il dévie**.',
  });
  add('leviers', {
    title: 'Les 8 leviers du plafond',
    entryType: 'mecanisme', isCanon: true,
    bodyMd: '8 leviers au plafond. **256 combinaisons testées, aucun effet.** '
      + 'Support décoratif d\'End rods.',
  });
  add('etoile', {
    title: 'Motif solaire doré (« étoile d\'or »)',
    entryType: 'observation', isCanon: false,
    bodyMd: 'Longtemps lu comme une rose des vents à 8 branches. **Vue de face, '
      + 'c\'est un motif solaire asymétrique** ; l\'or semble désigner un « itinéraire doré ».',
  });
  add('recensement', {
    title: 'Recensement des bâtiments : 8 forts, 7 silos, 6 cimetières',
    entryType: 'observation', isCanon: false,
    bodyMd: 'Décompte sur les 21 bâtiments relevés : **8 forts, 7 silos, 6 cimetières** '
      + '— une suite descendante 8/7/6, pas une répartition uniforme.',
  });

  // ── Liens ──
  const link = (fromKey, toKey, relationType, note = '') => createLink({
    fromEntryId: entries.get(fromKey).id, toEntryId: entries.get(toKey).id, relationType, note,
  }, null);
  for (const [title] of POEMS) link(`Poème de Jade — ${title}`, 'piaf', 'located_in', 'Trouvé dans la tour sacrée.');
  link('oeil', 'kota', 'points_to', 'Le bloc d\'or au centre de la maquette.');
  link('recensement', 'kota', 'same_system', 'Décompte des 21 bâtiments autour de la ville centrale.');

  // ── Hypothèses (statuts réels — plusieurs pistes mortes, c'est voulu) ──
  const hyp = (data) => createHypothesis(data, null);
  const proof = (h, entryKey, stance, note) => addEvidence({
    hypothesisId: h.id, entryId: entries.get(entryKey).id, stance, note,
  }, null);

  const h1 = hyp({
    title: 'Le rouge des emblèmes indique le nord',
    status: 'confirmed', confidence: 100,
    resolutionNote: 'Vérifié au F3 sur plusieurs supports.',
    bodyMd: 'Les emblèmes à 4 couleurs seraient orientés : le rouge pointerait le nord.',
  });
  proof(h1, 'emblemes', 'supports', 'Recoupé au F3 sur plusieurs supports — seule la ville centrale dévie.');

  const h2 = hyp({
    title: 'Les initiales des vers sont des directions',
    status: 'confirmed', confidence: 100,
    resolutionNote: '15/15 vers, aucune exception.',
    bodyMd: 'Chaque vers des Poèmes de Jade commencerait volontairement par N, S, E ou O.',
  });
  for (const [title, letters] of POEMS) {
    proof(h2, `Poème de Jade — ${title}`, 'supports', `${letters.length} vers, initiales ${letters.join('·')}.`);
  }

  const h3 = hyp({
    title: 'L\'étoile d\'or est une rose des vents à 8 branches',
    status: 'refuted', confidence: 0,
    resolutionNote: 'Vue de face c\'est un motif solaire asymétrique ; l\'or désigne un « itinéraire doré ».',
    bodyMd: 'Le motif doré récurrent serait une rose des vents à 8 branches.',
  });
  proof(h3, 'etoile', 'contradicts', 'Vue de face : asymétrique, motif solaire.');

  hyp({
    title: 'Les sommets de tours sont des cadrans solaires',
    status: 'refuted', confidence: 0,
    resolutionNote: 'Dans Minecraft le soleil se lève plein est et se couche plein ouest : '
      + 'les ombres ne pointent jamais nord/sud.',
    bodyMd: 'Les sommets dorés des tours des vents serviraient de cadrans solaires.',
  });

  const h5 = hyp({
    title: 'Répartition 8/8/8 des bâtiments',
    status: 'refuted', confidence: 0,
    resolutionNote: 'C\'est 8/7/6, suite descendante.',
    bodyMd: 'Les forts, silos et cimetières seraient répartis en trois groupes de 8.',
  });
  proof(h5, 'recensement', 'contradicts', '8 forts, 7 silos, 6 cimetières sur les 21 relevés.');

  const h6 = hyp({
    title: 'Les 8 leviers du plafond ouvrent un mécanisme',
    status: 'refuted', confidence: 0,
    resolutionNote: '256 combinaisons testées, aucun effet ; support décoratif d\'End rods.',
    bodyMd: 'Les 8 leviers formeraient un code binaire ouvrant un passage.',
  });
  proof(h6, 'leviers', 'contradicts', 'Test exhaustif des 256 combinaisons : rien.');

  const h7 = hyp({
    title: 'Le flux (XP des monstres) est le vrai mécanisme',
    status: 'open', confidence: 70,
    bodyMd: 'Le « flux » décrit par les stèles ondiennes — l\'XP lâchée par les '
      + 'monstres — serait le mécanisme central du monde, pas un dispositif à leviers.',
  });
  proof(h7, 'flux', 'supports', 'Confirmé par les stèles du Temple du flux.');

  // ── Fond de carte (calibration fournie, image à uploader ensuite) ──
  createMap({
    name: 'Nostra — Carte du monde', dimension: 'overworld',
    imgXLeft: -5353, imgXRight: 4646, imgZBottom: -636,
  });

  return { entries: entries.size, hypotheses: 7, maps: 1 };
}
