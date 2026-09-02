import { db } from './db.js';
import {
  createItem, createPanoplie, createSerie, createTier, ensureWeights,
  listPanoplies, listSeries, listTiers,
} from './items/store.js';

// Seed de la base des items customs Minefield — les données RÉELLES du
// classeur « BASE DE DONNÉE DES ITEMS CUSTOMS SUR MINEFIELD » (v1.0, xadrow),
// pas un jeu de démonstration.
//
// Extrait du .xlsx et non du PDF : le PDF perdait trois informations que le
// classeur porte et dont ce module a besoin.
//   • La COULEUR DE POLICE. « Les items en rouges ne sont pas encore introduits
//     en jeu et doivent être testés/équilibrés » — c'est la seule marque de
//     statut du document, et elle ne survit pas à l'export texte. D'où
//     `statut` ci-dessous : rouge → `a_tester`, noir → `en_jeu`.
//   • Le FORMAT DE CELLULE. « 0.05 » affiché « 5 % » est un modificateur
//     Operation 1 (multiply_base) ; « 4.0 » sans format est un ajout brut
//     (Operation 0). Le PDF ne montrait que le rendu, jamais la valeur — d'où
//     `p()` contre `a()` ici.
//   • Le NOM DES ONGLETS, qui porte le code de série : 01 guilde explo,
//     02 Nostra, 03 St. Philippe, 04 Tréfonds, 05 Rafvenwout, 06 Ondiens,
//     07 Nous, 08 peuple piaf, 99 autres.
//
// Idempotent LIGNE PAR LIGNE, clé = (série, nom) — et pas le nom seul, parce
// que l'onglet Nostra reprend les neuf pièces de la guilde d'explorateurs sous
// les mêmes noms. Ce choix (plutôt qu'un court-circuit au premier
// enregistrement) permet à une version ultérieure du classeur d'ajouter ses
// items sans écraser ce que les scribes ont retouché en ligne.
// SEED_ITEMS=off pour ne rien insérer.
//
// Deux informations restent absentes du classeur, et le module les traite comme
// telles plutôt que de les inventer : aucun CMD n'y est renseigné (l'onglet CMD
// propose donc le prochain numéro libre), et cinq pièces des sets Colombe et
// Louve n'ont pas de nom (déduit de la panoplie, avec une note qui le dit).
//
// LA COMMANDE /give FAIT FOI. Huit lignes en portent une ; quand elle contredit
// les colonnes, c'est elle qui est reprise — c'est elle qui tourne en jeu. Les
// écarts constatés sont notés sur les fiches concernées (la Jupette annonce 20
// d'armure en colonne et 8 dans sa commande ; le « 10 » du Trident est dans la
// colonne *Infinity* alors que sa commande dit `impaling`).

// ── Échelles de tiers ─────────────────────────────────────────────────────
// Deux échelles coexistent dans le classeur : celle des raretés (guilde
// d'explorateurs, Rafvenwout, Ondiens) et celle des Tréfonds, annoncée dans son
// propre onglet — « NB: système tréfonds: Banal, correct, honorable, supérieur,
// légendaire ». `Supérieur` et `Légendaire` n'ont encore aucun item : ce sont
// des paliers déclarés, pas des paliers morts.
//
// Les budgets sont étalonnés sur le corpus lui-même : la pièce d'artefact la
// mieux documentée (Écailles princières des Grands Fonds) pèse 224 points,
// d'où un budget d'artefact à 230 plutôt qu'un chiffre rond choisi d'avance.
// Ils s'éditent depuis l'onglet Référentiel.
const TIERS = [
  ['Commun',      'standard', 55,  '#9aa8b8'],
  ['Peu Commun',  'standard', 85,  '#7be3a8'],
  ['Rare',        'standard', 120, '#7bd3e8'],
  ['Très Rare',   'standard', 170, '#b79bff'],
  ['Artefact',    'standard', 230, '#e8c86a'],
  ['Banal',       'trefonds', 60,  '#9aa8b8'],
  ['Correct',     'trefonds', 110, '#7be3a8'],
  ['Honorable',   'trefonds', 180, '#7bd3e8'],
  ['Supérieur',   'trefonds', 260, '#b79bff'],
  ['Légendaire',  'trefonds', 360, '#e8c86a'],
];

// Les neuf onglets du classeur. Trois n'ont encore aucun item (St. Philippe,
// Nous, Autres) et sont créés quand même : une série vide est une plage de CMD
// réservée, pas une ligne à cacher.
const SERIES = [
  ['01', 'Guilde des explorateurs', '#e8c86a', ''],
  ['02', 'Nostra', '#c9a8e8', ''],
  ['03', 'St. Philippe', '#7bd3e8', ''],
  ['04', 'Tréfonds', '#7be3a8', ''],
  ['05', 'Rafvenwout', '#b79bff', ''],
  ['06', 'Ondiens', '#5fd8d0', ''],
  ['07', 'Nous', '#e0526f', ''],
  ['08', 'Peuple piaf', '#8fd67a', ''],
  ['99', 'Autres', '#9aa8b8', ''],
];

const PANOPLIES = [
  ['Set du cavernier', '#9aa8b8', 0, ''],
  ['Set ancestral', '#e8c86a', 0, ''],
  ['Set du Rossignol', '#e8c86a', 5, ''],
  ['Set de la Colombe', '#ede8f8', 3, ''],
  ['Set de la Louve', '#c9a8e8', 3, ''],
  ['Set du Corbeau', '#7b6bb0', 4, ''],
  ['Set du Faulcon', '#7bd3e8', 4, 'Panoplie citée quatre fois dans le classeur, sans aucune pièce nommée.'],
];

// Raccourcis de saisie : a() = valeur plate (Operation 0), p() = pourcentage
// (Operation 1), e() = enchantement. Le `slot` est DÉDUIT de l'item de base
// (un casque agit sur la tête) : le classeur n'a pas de colonne pour ça, et
// sans slot un bonus d'armure s'appliquerait dans tous les emplacements à la
// fois. Les huit lignes qui portent une commande /give, elles, tiennent leur
// slot de la commande.
const a = (attribut, valeur, slot = 'any') => ({ attribut, valeur, mode: 'flat', slot });
const p = (attribut, valeur, slot = 'any') => ({ attribut, valeur, mode: 'pourcent', slot });
const e = (enchant, niveau) => ({ enchant, niveau });

const ITEMS = [

  // ── 01-GUILDE EXPLO ─────────────────────────────────────────────
  {
    serie: '01',
    nom: 'Epée batarde',
    tier: 'Commun',
    baseItem: 'iron_sword',
    description: 'Une arme simple mais digne d\'un explorateur.',
    acquisition: 'craftable',
    ressources: '2 lingots d\'acier + 1 bâton (MC)',
    statut: 'a_tester',
    attributs: [a('ATTACK_DAMAGE', 1, 'mainhand')],
  },
  {
    serie: '01',
    nom: 'Zweihander',
    tier: 'Commun',
    baseItem: 'iron_sword',
    description: 'Une arme lourde mais digne d\'un explorateur.',
    acquisition: 'craftable',
    ressources: '3 lingots d\'acier + 1 bâton (MC)',
    statut: 'a_tester',
    attributs: [p('KNOCKBACK_RESISTANCE', 5, 'mainhand'), p('MOVEMENT_SPEED', -10, 'mainhand'), a('ATTACK_DAMAGE', 4, 'mainhand'), p('ATTACK_SPEED', -15, 'mainhand')],
  },
  {
    serie: '01',
    nom: 'Hache de combat',
    tier: 'Commun',
    baseItem: 'iron_axe',
    description: 'Une arme rustre mais digne d\'un explorateur.',
    acquisition: 'craftable',
    ressources: '3 lingots d\'acier + 1 bâton (MC)',
    statut: 'a_tester',
    attributs: [a('ATTACK_DAMAGE', 2, 'mainhand'), p('ATTACK_SPEED', -5, 'mainhand')],
  },
  {
    serie: '01',
    nom: 'Hallebarde',
    tier: 'Commun',
    baseItem: 'iron_axe',
    description: 'Une arme peu commode mais digne d\'un explorateur.',
    acquisition: 'craftable',
    ressources: '3 lingots d\'acier + 2 bâtons (MC)',
    statut: 'a_tester',
    attributs: [p('KNOCKBACK_RESISTANCE', 5, 'mainhand'), p('MOVEMENT_SPEED', -5, 'mainhand'), a('ATTACK_DAMAGE', 3, 'mainhand'), p('ATTACK_SPEED', -15, 'mainhand')],
  },
  {
    serie: '01',
    nom: 'Lance',
    tier: 'Commun',
    baseItem: 'minefield:harpoon',
    description: 'Une arme non conventionelle mais digne d\'un explorateur.',
    acquisition: 'craftable',
    ressources: '1 lingot d\'acier + 3 bâtons (MC)',
    statut: 'a_tester',
    attributs: [a('ATTACK_DAMAGE', 2, 'mainhand'), p('ATTACK_SPEED', -5, 'mainhand')],
  },
  {
    serie: '01',
    nom: 'Casque de l\'explorateur',
    tier: 'Commun',
    baseItem: 'leather_helmet',
    acquisition: 'craftable',
    ressources: '5 cuirs tannés (MF)*',
    statut: 'a_tester',
    attributs: [a('ARMOR', 2, 'head'), a('ARMOR_TOUGHNESS', 1, 'head')],
  },
  {
    serie: '01',
    nom: 'Gambison de l\'explorateur',
    tier: 'Commun',
    baseItem: 'leather_chestplate',
    acquisition: 'craftable',
    ressources: '6 cuirs tannés (MF)*',
    statut: 'a_tester',
    attributs: [a('ARMOR', 2, 'chest'), a('ARMOR_TOUGHNESS', 1, 'chest')],
  },
  {
    serie: '01',
    nom: 'Tassettes de l\'explorateur',
    tier: 'Commun',
    baseItem: 'leather_leggings',
    acquisition: 'craftable',
    ressources: '7 cuirs tannés (MF)*',
    statut: 'a_tester',
    attributs: [a('ARMOR', 2, 'legs'), a('ARMOR_TOUGHNESS', 1, 'legs')],
  },
  {
    serie: '01',
    nom: 'Bottes de l\'explorateur',
    tier: 'Commun',
    baseItem: 'leather_boots',
    acquisition: 'craftable',
    ressources: '8 cuirs tannés (MF)*',
    statut: 'a_tester',
    attributs: [a('ARMOR', 2, 'feet'), a('ARMOR_TOUGHNESS', 1, 'feet')],
  },
  {
    serie: '01',
    nom: 'Totem Illager',
    tier: 'Artefact',
    baseItem: 'totem_of_undying',
    description: 'Un drôle d\'artéfact tombé des mains d\'une brute illager',
    acquisition: 'quest_event',
    statut: 'en_jeu',
    responsable: 'Xadrow',
    attributs: [p('KNOCKBACK_RESISTANCE', 10, 'offhand'), a('ARMOR', 5, 'offhand'), a('ARMOR_TOUGHNESS', 5, 'offhand')],
    enchantements: [e('thorns', 3)],
    commande: '/give @p minecraft:totem_of_undying 1 0 {display:{Name:"Totem Illager",Lore:["Un drôle d\'artéfact tombé des mains d\'une brute illager"]},ench:[{id:7,lvl:3}],AttributeModifiers:[{AttributeName:"generic.knockbackResistance",Name:"generic.knockbackResistance",Amount:0.10,Operation:1,UUIDLeast:502258,UUIDMost:873781,Slot:"offhand"},{AttributeName:"generic.armor",Name:"generic.armor",Amount:5,Operation:0,UUIDLeast:567846,UUIDMost:697716,Slot:"offhand"},{AttributeName:"generic.armorToughness",Name:"generic.armorToughness",Amount:5,Operation:0,UUIDLeast:658192,UUIDMost:533620,Slot:"offhand"}]}',
  },

  // ── 02-NOSTRA ───────────────────────────────────────────────────
  {
    serie: '02',
    nom: 'Epée batarde',
    tier: 'Commun',
    baseItem: 'iron_sword',
    description: 'Une arme simple mais digne d\'un explorateur.',
    acquisition: 'craft_achat',
    ressources: '2 lingots d\'acier + 1 bâton (MC)',
    statut: 'a_tester',
    attributs: [a('ATTACK_DAMAGE', 1, 'mainhand')],
  },
  {
    serie: '02',
    nom: 'Zweihander',
    tier: 'Commun',
    baseItem: 'iron_sword',
    description: 'Une arme lourde mais digne d\'un explorateur.',
    acquisition: 'craft_achat',
    ressources: '3 lingots d\'acier + 1 bâton (MC)',
    statut: 'a_tester',
    attributs: [p('KNOCKBACK_RESISTANCE', 5, 'mainhand'), p('MOVEMENT_SPEED', -10, 'mainhand'), a('ATTACK_DAMAGE', 4, 'mainhand'), p('ATTACK_SPEED', -15, 'mainhand')],
  },
  {
    serie: '02',
    nom: 'Hache de combat',
    tier: 'Commun',
    baseItem: 'iron_axe',
    description: 'Une arme rustre mais digne d\'un explorateur.',
    acquisition: 'craft_achat',
    ressources: '3 lingots d\'acier + 1 bâton (MC)',
    statut: 'a_tester',
    attributs: [a('ATTACK_DAMAGE', 2, 'mainhand'), p('ATTACK_SPEED', -5, 'mainhand')],
  },
  {
    serie: '02',
    nom: 'Hallebarde',
    tier: 'Commun',
    baseItem: 'iron_axe',
    description: 'Une arme peu commode mais digne d\'un explorateur.',
    acquisition: 'craft_achat',
    ressources: '3 lingots d\'acier + 2 bâtons (MC)',
    statut: 'a_tester',
    attributs: [p('KNOCKBACK_RESISTANCE', 5, 'mainhand'), p('MOVEMENT_SPEED', -5, 'mainhand'), a('ATTACK_DAMAGE', 3, 'mainhand'), p('ATTACK_SPEED', -15, 'mainhand')],
  },
  {
    serie: '02',
    nom: 'Lance',
    tier: 'Commun',
    baseItem: 'minefield:harpoon',
    description: 'Une arme non conventionelle mais digne d\'un explorateur.',
    acquisition: 'craft_achat',
    ressources: '1 lingot d\'acier + 3 bâtons (MC)',
    statut: 'a_tester',
    attributs: [a('ATTACK_DAMAGE', 2, 'mainhand'), p('ATTACK_SPEED', -5, 'mainhand')],
  },
  {
    serie: '02',
    nom: 'Casque de l\'explorateur',
    tier: 'Commun',
    baseItem: 'leather_helmet',
    acquisition: 'craft_achat',
    ressources: '5 cuirs tannés (MF)*',
    statut: 'a_tester',
  },
  {
    serie: '02',
    nom: 'Gambison de l\'explorateur',
    tier: 'Commun',
    baseItem: 'leather_chestplate',
    acquisition: 'craft_achat',
    ressources: '5 cuirs tannés (MF)*',
    statut: 'a_tester',
  },
  {
    serie: '02',
    nom: 'Tassettes de l\'explorateur',
    tier: 'Commun',
    baseItem: 'leather_leggings',
    acquisition: 'craft_achat',
    ressources: '5 cuirs tannés (MF)*',
    statut: 'a_tester',
  },
  {
    serie: '02',
    nom: 'Bottes de l\'explorateur',
    tier: 'Commun',
    baseItem: 'leather_boots',
    acquisition: 'craft_achat',
    ressources: '5 cuirs tannés (MF)*',
    statut: 'a_tester',
  },

  // ── 04-TREFONDS ─────────────────────────────────────────────────
  {
    serie: '04',
    nom: 'Poignard de cavernier',
    tier: 'Banal',
    baseItem: 'minefield:iron_chisel',
    description: 'Ce poignard banal est relativement efficace contre les araignées et permet de se déplacer légèrement plus rapidement. Permet de se défendre si tenu dans la main secondaire.',
    panoplie: 'Set du cavernier',
    acquisition: 'craftable',
    ressources: 'Fibre végétale x2, aventurine x2, rhyolite x1, bâton (MC) x1',
    statut: 'en_jeu',
  },
  {
    serie: '04',
    nom: 'Rempart des Tréfonds',
    tier: 'Honorable',
    baseItem: 'minecraft:shield',
    description: 'Rare et vieux bouclier datant de l\'ère des Bâtisseurs.',
    panoplie: 'Set ancestral',
    acquisition: 'quest_event',
    statut: 'en_jeu',
    attributs: [a('MAX_HEALTH', 4, 'offhand'), p('MOVEMENT_SPEED', -10, 'offhand'), a('ARMOR', 2, 'offhand')],
  },
  {
    serie: '04',
    nom: 'Cuirasse bâtarde',
    tier: 'Banal',
    baseItem: 'minecraft:iron_chestplate',
    description: 'Cette cuirasse banale augmente la protection, au détriment d\'une perte de vitesse due à son poids.',
    acquisition: 'craftable',
    ressources: 'Fibre végétale x3, orthose rose x8, aventurine x1',
    statut: 'en_jeu',
    attributs: [a('MAX_HEALTH', 2, 'chest'), p('MOVEMENT_SPEED', -10, 'chest'), a('ARMOR', 7, 'chest')],
  },
  {
    serie: '04',
    nom: 'Plastron de bretteur',
    tier: 'Banal',
    baseItem: 'minecraft:chainmail_chestplate',
    description: 'Ce plastron banal procure une aisance de mouvement, utile pour frapper plus rapidement.',
    acquisition: 'craftable',
    ressources: 'Fibre végétale x3; rhyolite x6; orthose rose x2',
    statut: 'en_jeu',
    attributs: [a('ARMOR', 6, 'chest'), a('ATTACK_SPEED', 0.4, 'chest')],
  },
  {
    serie: '04',
    nom: 'Gambison renforcé d\'aventurine',
    tier: 'Banal',
    baseItem: 'minecraft:leather_chestplate',
    description: 'Ce gambison banal offre une meilleure mobilité, au dépit d\'une protection minime',
    acquisition: 'craftable',
    ressources: 'Fibre végétale x4, aventurine x2',
    statut: 'en_jeu',
    attributs: [p('MOVEMENT_SPEED', 5, 'chest'), a('ARMOR', 5, 'chest')],
  },
  {
    serie: '04',
    nom: 'Broigne épaisse',
    tier: 'Correct',
    baseItem: 'minecraft:leather_chestplate',
    description: 'Cette broigne correcte offre une meilleure mobilité,au dépit d\'une protection légère.',
    acquisition: 'craftable',
    ressources: 'Fibre végétale forte x3, soie d\'arachnide x2, crystal pourpre x2',
    statut: 'en_jeu',
  },
  {
    serie: '04',
    nom: 'Cotte de mailles de jaspe',
    tier: 'Correct',
    baseItem: 'minecraft:chainmail_chestplate',
    description: 'Cette cotte de maille procure une bonne aisance de mouvement, permettant des attaques plus rapides.',
    acquisition: 'craftable',
    ressources: 'Fibre végétale forte x2, jaspe jaune x4, os de putréfié x2',
    statut: 'en_jeu',
    attributs: [a('ARMOR', 7, 'chest'), a('ATTACK_SPEED', 0.8, 'chest')],
  },
  {
    serie: '04',
    nom: 'Cuirasse robuste',
    tier: 'Correct',
    baseItem: 'minecraft:diamond_chestplate',
    description: 'Cette cuirasse correcte procure une bonne protection au dépit d\'une perte de vitesse.',
    acquisition: 'craftable',
    ressources: 'Fibre végétale forte x2, dioptase des tréfonds x8, crystal pourpre x2',
    statut: 'en_jeu',
    attributs: [a('MAX_HEALTH', 4, 'chest'), p('MOVEMENT_SPEED', -15, 'chest'), a('ARMOR', 9, 'chest')],
  },
  {
    serie: '04',
    nom: 'Cuirasse ancestrale',
    tier: 'Honorable',
    baseItem: 'minefield:plate_obsidian',
    description: 'Résistante cuirasse forgée grâce à des plans de l\'ère des Bâtisseurs.',
    panoplie: 'Set ancestral',
    acquisition: 'craft_schema',
    ressources: 'Fibre végétale forte x4, dioptase des Tréfonds x8, jaspe jaune x6, crystal pourpre x2, essence de gardien x8',
    statut: 'en_jeu',
    attributs: [a('MAX_HEALTH', 4, 'any'), a('KNOCKBACK_RESISTANCE', 0.25, 'any'), p('MOVEMENT_SPEED', -20, 'any'), a('ARMOR', 10, 'any'), a('ARMOR_TOUGHNESS', 3, 'any')],
  },
  {
    serie: '04',
    nom: 'Plastron d\'arachnide',
    tier: 'Honorable',
    baseItem: 'minecraft:iron_chestplate',
    description: 'Ce plastron correct augmente la robustesse, et offre de la protection, au dépit d\'une légère perte de vitesse.',
    acquisition: 'craftable',
    ressources: 'Fibre végétale forte x2, carapace d\'arachnide x8, venin d\'arachnide x2',
    statut: 'en_jeu',
    attributs: [a('MAX_HEALTH', 2, 'chest'), p('MOVEMENT_SPEED', -5, 'chest'), a('ARMOR', 7, 'chest'), a('ARMOR_TOUGHNESS', 2, 'chest')],
  },

  // ── 05-RAFVENWOUT ───────────────────────────────────────────────
  {
    serie: '05',
    nom: 'Hallebarde du Rossignol',
    tier: 'Artefact',
    baseItem: 'iron_axe',
    panoplie: 'Set du Rossignol',
    acquisition: 'quest_event',
    statut: 'en_jeu',
    enchantements: [e('mending', 1)],
  },
  {
    serie: '05',
    nom: 'Sallet du Rossignol',
    tier: 'Artefact',
    baseItem: 'iron_helmet',
    panoplie: 'Set du Rossignol',
    acquisition: 'autre',
    statut: 'a_tester',
  },
  {
    serie: '05',
    nom: 'Cuirasse du Rossignol',
    tier: 'Artefact',
    baseItem: 'iron_chestplate',
    panoplie: 'Set du Rossignol',
    acquisition: 'autre',
    statut: 'a_tester',
  },
  {
    serie: '05',
    nom: 'Jambières du Rossignol',
    tier: 'Artefact',
    baseItem: 'chain_leggings',
    panoplie: 'Set du Rossignol',
    acquisition: 'autre',
    statut: 'a_tester',
  },
  {
    serie: '05',
    nom: 'Sabatons du Rossignol',
    tier: 'Artefact',
    baseItem: 'iron_boots',
    panoplie: 'Set du Rossignol',
    acquisition: 'autre',
    statut: 'a_tester',
  },
  {
    serie: '05',
    nom: 'Casque de la Colombe',
    tier: 'Commun',
    baseItem: 'leather_helmet',
    panoplie: 'Set de la Colombe',
    acquisition: 'autre',
    statut: 'a_tester',
    note: 'Nom absent du tableur — déduit de la panoplie et de l\'item de base.',
  },
  {
    serie: '05',
    nom: 'Plastron de la Colombe',
    tier: 'Commun',
    baseItem: 'leather_chestplate',
    panoplie: 'Set de la Colombe',
    acquisition: 'autre',
    statut: 'a_tester',
    note: 'Nom absent du tableur — déduit de la panoplie et de l\'item de base.',
  },
  {
    serie: '05',
    nom: 'Bottes de la Colombe',
    tier: 'Commun',
    baseItem: 'leather_boots',
    panoplie: 'Set de la Colombe',
    acquisition: 'autre',
    statut: 'a_tester',
    note: 'Nom absent du tableur — déduit de la panoplie et de l\'item de base.',
  },
  {
    serie: '05',
    nom: 'Casque de la Louve',
    tier: 'Rare',
    baseItem: 'leather_helmet',
    panoplie: 'Set de la Louve',
    acquisition: 'autre',
    statut: 'a_tester',
    note: 'Nom absent du tableur — déduit de la panoplie et de l\'item de base.',
  },
  {
    serie: '05',
    nom: 'Plastron de la Louve',
    tier: 'Rare',
    baseItem: 'chain_chestplate',
    panoplie: 'Set de la Louve',
    acquisition: 'autre',
    statut: 'a_tester',
    note: 'Nom absent du tableur — déduit de la panoplie et de l\'item de base.',
  },
  {
    serie: '05',
    nom: 'Bottes de la Louve',
    tier: 'Rare',
    baseItem: 'iron_boots',
    panoplie: 'Set de la Louve',
    acquisition: 'autre',
    statut: 'a_tester',
  },
  {
    serie: '05',
    nom: 'Haume du Corbeau',
    tier: 'Très Rare',
    baseItem: 'minefield:obsidian_helmet',
    panoplie: 'Set du Corbeau',
    acquisition: 'autre',
    statut: 'a_tester',
  },
  {
    serie: '05',
    nom: 'Cuirasse du Corbeau',
    tier: 'Très Rare',
    baseItem: 'minefield:obsidian_chestplate',
    panoplie: 'Set du Corbeau',
    acquisition: 'autre',
    statut: 'a_tester',
  },
  {
    serie: '05',
    nom: 'Jambières du Corbeau',
    tier: 'Très Rare',
    baseItem: 'minefield:obsidian_leggings',
    panoplie: 'Set du Corbeau',
    acquisition: 'autre',
    statut: 'a_tester',
  },
  {
    serie: '05',
    nom: 'Sabatons du Corbeau',
    tier: 'Très Rare',
    baseItem: 'minefield:obsidian_boots',
    panoplie: 'Set du Corbeau',
    acquisition: 'autre',
    statut: 'a_tester',
  },

  // ── 06-ONDIENS ──────────────────────────────────────────────────
  {
    serie: '06',
    nom: 'Couronne du Grand Coeur',
    tier: 'Artefact',
    baseItem: 'turtle_helmet',
    description: 'Couronne antique imbu du pouvoir du saumon.\nElle confère au porteur une respiration très importante sous l\'eau',
    acquisition: 'quest_event',
    prix: 'achat 550 écailles sans unbreakable',
    statut: 'en_jeu',
    responsable: 'Thalkion ou Skykkou',
    attributs: [a('ARMOR', 4, 'head'), p('MOVEMENT_SPEED', 10, 'head'), a('MAX_HEALTH', 2, 'head')],
    enchantements: [e('aqua_affinity', 1), e('protection', 1), e('respiration', 6)],
    unbreakable: true,
    commande: 'give @p turtle_helmet{display:{Name:\'[{"text":"Couronne du Grand Coeur","italic":false}]\',Lore:[\'[{"text":"Couronne antique imbu du pouvoir du saumon.","italic":false}]\',\'[{"text":"Elle confère au porteur une respiration très importante sous l\'eau","italic":false}]\']},Enchantments:[{lvl:1,id:aqua_affinity},{lvl:1,id:protection},{lvl:6,id:respiration}],AttributeModifiers:[{AttributeName:"generic.armor",Amount:4,Slot:head,UUID:[I;-126217,35749,1424,-71498],Name:1773752566495},{AttributeName:"generic.movement_speed",Amount:0.1,Slot:head,Operation:1,UUID:[I;-126217,36049,1424,-72098],Name:1773752566495},{AttributeName:"generic.max_health",Amount:2,Slot:head,UUID:[I;-126217,36349,1424,-72698],Name:1773752566495}],Unbreakable:1}',
  },
  {
    serie: '06',
    nom: 'Ecailles princières des Grands Fonds',
    tier: 'Artefact',
    baseItem: 'diamond_chestplate',
    description: 'Cuirasse légendaire ayant appartenu à un ondien haut placé',
    acquisition: 'quest_event',
    prix: 'achat 500 écailles sans unbreakable',
    statut: 'en_jeu',
    responsable: 'Thalkion ou Skykkou',
    attributs: [a('ARMOR', 10, 'chest'), a('MAX_HEALTH', 4, 'chest'), p('MOVEMENT_SPEED', 20, 'chest')],
    enchantements: [e('projectile_protection', 2), e('protection', 2), e('thorns', 1)],
    unbreakable: true,
    commande: 'give @a diamond_chestplate{display:{Name:\'[{"text":"Ecailles princières des Grands Fonds","italic":false}]\',Lore:[\'[{"text":"Cuirasse légendaire ayant appartenu à un ondien haut placé","italic":false}]\']},Enchantments:[{lvl:2,id:projectile_protection},{lvl:2,id:protection},{lvl:1,id:thorns}],AttributeModifiers:[{AttributeName:"generic.armor",Amount:10,Slot:chest,UUID:[I;-126215,76719,182719,-153438],Name:1773596101784},{AttributeName:"generic.max_health",Amount:4,Slot:chest,UUID:[I;-126215,77019,182719,-154038],Name:1773596101784},{AttributeName:"generic.movement_speed",Amount:0.2,Slot:chest,Operation:1,UUID:[I;-126215,77319,182719,-154638],Name:1773596101784}],Unbreakable:1}',
  },
  {
    serie: '06',
    nom: 'Jupette des Chants éternels',
    tier: 'Artefact',
    baseItem: 'netherite_leggings',
    description: 'Jupette antique conférant au porteur vitesse et protection',
    acquisition: 'quest_event',
    prix: 'achat 500 écailles sans unbreakable',
    statut: 'en_jeu',
    responsable: 'Thalkion ou Skykkou',
    attributs: [a('ARMOR', 8, 'legs'), p('MOVEMENT_SPEED', 20, 'legs'), a('MAX_HEALTH', 2, 'legs')],
    enchantements: [e('protection', 3)],
    unbreakable: true,
    commande: 'give @p netherite_leggings{display:{Name:\'[{"text":"Jupette des Chants éternels","italic":false}]\',Lore:[\'[{"text":"Jupette antique conférant au porteur vitesse et protection","italic":false}]\']},Enchantments:[{lvl:3,id:protection}],AttributeModifiers:[{AttributeName:"generic.armor",Amount:8,Slot:legs,UUID:[I;-126215,191519,182719,-383038],Name:1773596559703},{AttributeName:"generic.movement_speed",Amount:0.2,Slot:legs,Operation:1,UUID:[I;-126215,191819,182719,-383638],Name:1773596559703},{AttributeName:"generic.max_health",Amount:2,Slot:legs,UUID:[I;-126215,192419,182719,-384838],Name:1773596559703}],Unbreakable:1}',
    note: 'Les colonnes du tableur divergent de la commande /give ; la commande fait foi (c\'est elle qui tourne en jeu).',
  },
  {
    serie: '06',
    nom: 'Harpon de soldat antique',
    tier: 'Artefact',
    baseItem: 'minefield:harpoon',
    description: 'Un ancien harpon d\'un tranchant incroyable,\nenchanté par le devin des anciens temps',
    acquisition: 'quest_event',
    prix: 'achat 500 écailles sans unbreakable',
    statut: 'en_jeu',
    responsable: 'Thalkion ou Skykkou',
    attributs: [a('ARMOR', 2, 'mainhand'), a('ATTACK_DAMAGE', 10, 'mainhand'), p('MOVEMENT_SPEED', -20, 'mainhand'), p('ATTACK_SPEED', -70, 'mainhand')],
    unbreakable: true,
    commande: 'give @p minefield:harpoon{display:{Name:\'[{"text":"Harpon de soldat antique","italic":false}]\',Lore:[\'[{"text":"Un ancien harpon d\'un tranchant incroyable,","italic":false}]\',\'[{"text":"enchanté par le devin des anciens temps","italic":false}]\']},AttributeModifiers:[{AttributeName:"generic.armor",Amount:2,Slot:mainhand,UUID:[I;-126217,125649,1424,-251298],Name:1773753055405},{AttributeName:"generic.attack_damage",Amount:10,Slot:mainhand,UUID:[I;-126217,125949,1424,-251898],Name:1773753055405},{AttributeName:"generic.movement_speed",Amount:-0.2,Slot:mainhand,Operation:1,UUID:[I;-126217,126249,1424,-252498],Name:1773753055405},{AttributeName:"generic.attack_speed",Amount:-0.7,Slot:mainhand,Operation:1,UUID:[I;-126217,126549,1424,-253098],Name:1773753055405}],Unbreakable:1}',
  },
  {
    serie: '06',
    nom: 'Trident des fonds marins',
    tier: 'Artefact',
    baseItem: 'trident',
    description: 'Un trident permettant de se déplacer aussi vite\nque les poissons et d\'attaquer tel un requin',
    acquisition: 'quest_event',
    prix: 'achat 600 écailles sans unbreakable',
    statut: 'en_jeu',
    responsable: 'Thalkion ou Skykkou',
    attributs: [p('MOVEMENT_SPEED', 20, 'mainhand'), p('MOVEMENT_SPEED', 40, 'offhand')],
    enchantements: [e('impaling', 10), e('riptide', 5)],
    unbreakable: true,
    commande: 'give @p trident{display:{Name:\'[{"text":"Trident des fonds marins","italic":false}]\',Lore:[\'[{"text":"Un trident permettant de se déplacer aussi vite","italic":false}]\',\'[{"text":"que les poissons et d\'attaquer tel un requin","italic":false}]\']},Enchantments:[{lvl:10,id:impaling},{lvl:5,id:riptide}],AttributeModifiers:[{AttributeName:"generic.movement_speed",Amount:0.2,Slot:mainhand,Operation:1,UUID:[I;-126431,30574,134425,-61148],Name:1780228046290},{AttributeName:"generic.movement_speed",Amount:0.4,Slot:offhand,Operation:1,UUID:[I;-126431,30874,134425,-61748],Name:1780228046290}],Unbreakable:1}',
    note: 'Enchantement placé dans une autre colonne que celle de la commande.',
  },
  {
    serie: '06',
    nom: 'Tentacule d\'honneur',
    tier: 'Peu Commun',
    baseItem: 'minefield:tentacle',
    description: 'Tentacule qui sert de trophée pour les ondiens,\nvous reconsidérez l\'aide que vous leur offrez',
    acquisition: 'quest_event',
    statut: 'en_jeu',
    responsable: 'Thalkion ou Skykkou',
    commande: 'give @p minefield:tentacle{display:{Name:\'[{"text":"Tentacule d\'honneur","italic":false}]\',Lore:[\'[{"text":"Tentacule qui sert de trophée pour les ondiens,","italic":false}]\',\'[{"text":"vous reconsidérez l\'aide que vous leur offrez","italic":false}]\']}}',
  },

  // ── 08-PEUPLE PIAF ──────────────────────────────────────────────
  {
    serie: '08',
    nom: 'Boussole piaf',
    tier: 'Commun',
    baseItem: 'compass',
    description: 'pointe vers le vilalge piaf',
    acquisition: 'autre',
    statut: 'en_jeu',
    commande: '/give @p compass{display:{Name:\'{"text":"Boussole Piaf","color":"green","bold":true,"italic":true}\'},LodestoneDimension:"minecraft:overworld",LodestoneTracked:0b,LodestonePos:{X:2548,Y:83,Z:-9396}} 1',
  },];

/**
 * Corrige EN UNE FOIS une base amorcée par la version précédente de ce seed,
 * qui lisait le PDF : elle attribuait de mauvais codes de série (Tréfonds en
 * 03, Ondiens en 04), déduisait le statut de la présence d'une commande faute
 * de couleurs, et manquait l'onglet Rafvenwout.
 *
 * Ne supprime QUE les items encore intacts — insérés par le seed
 * (`created_by IS NULL`) et jamais réenregistrés depuis (`updated_by IS NULL`).
 * La passe d'insertion qui suit les recrée depuis le classeur. Un item créé ou
 * retouché en ligne n'est jamais touché.
 *
 * Passe unique marquée en base, comme `item_sets_backfilled` : sans ce garde,
 * supprimer volontairement un item du classeur le rendrait au boot suivant.
 */
function resyncDepuisClasseur() {
  const cle = 'mf_items_source_xlsx';
  if (db.prepare(`SELECT value FROM site_settings WHERE key = ?`).get(cle)) return 0;
  const n = db.prepare(`
    DELETE FROM mf_items
     WHERE created_by IS NULL AND updated_by IS NULL AND updated_at = created_at
  `).run().changes;
  // Les séries avaient de mauvais noms : on les remet d'aplomb tant qu'aucun
  // admin ne les a éditées.
  const majSerie = db.prepare(`
    UPDATE mf_item_series SET nom = ?, couleur = ?, note = ''
     WHERE code = ? AND updated_by IS NULL
  `);
  for (const [code, nom, couleur] of SERIES) majSerie.run(nom, couleur, code);
  db.prepare(`INSERT OR REPLACE INTO site_settings (key, value) VALUES (?, ?)`)
    .run(cle, new Date().toISOString());
  return n;
}

export function seedItemsIfEmpty() {
  if (process.env.SEED_ITEMS === 'off') return { skipped: 'disabled' };
  ensureWeights();

  const out = { tiers: 0, series: 0, panoplies: 0, items: 0, resync: 0 };

  const tierByKey = new Map(listTiers().map((t) => [`${t.echelle}/${t.nom}`, t]));
  TIERS.forEach(([nom, echelle, budget, couleur], i) => {
    if (tierByKey.has(`${echelle}/${nom}`)) return;
    tierByKey.set(`${echelle}/${nom}`, createTier({ nom, echelle, budget, couleur, ordre: i + 1 }, null));
    out.tiers += 1;
  });

  const serieByCode = new Map(listSeries().map((s) => [s.code, s]));
  for (const [code, nom, couleur, note] of SERIES) {
    if (serieByCode.has(code)) continue;
    serieByCode.set(code, createSerie({ code, nom, couleur, note }, null));
    out.series += 1;
  }

  const panoByNom = new Map(listPanoplies().map((x) => [x.nom, x]));
  for (const [nom, couleur, taille, note] of PANOPLIES) {
    if (panoByNom.has(nom)) continue;
    panoByNom.set(nom, createPanoplie({ nom, couleur, taille, note }, null));
    out.panoplies += 1;
  }

  out.resync = resyncDepuisClasseur();

  // Clé (série, nom) : l'onglet Nostra reprend les neuf pièces de la guilde
  // d'explorateurs sous les mêmes noms, dans une autre série — donc d'autres
  // CMD, donc d'autres modèles. Ce sont bien deux lignes.
  const existants = new Set(
    db.prepare(`SELECT s.code, i.nom FROM mf_items i LEFT JOIN mf_item_series s ON s.id = i.serie_id`)
      .all().map((r) => `${r.code || ''}/${r.nom}`),
  );
  for (const it of ITEMS) {
    if (existants.has(`${it.serie}/${it.nom}`)) continue;
    const echelle = TIERS.find(([n]) => n === it.tier)?.[1];
    createItem({
      nom: it.nom,
      description: it.description || '',
      baseItem: it.baseItem,
      tierId: tierByKey.get(`${echelle}/${it.tier}`)?.id ?? null,
      serieId: serieByCode.get(it.serie)?.id ?? null,
      panoplieId: it.panoplie ? (panoByNom.get(it.panoplie)?.id ?? null) : null,
      acquisition: it.acquisition || 'craftable',
      ressources: it.ressources || '',
      prix: it.prix || '',
      commande: it.commande || '',
      statut: it.statut,
      responsable: it.responsable || '',
      note: it.note || '',
      attributs: it.attributs || [],
      enchantements: it.enchantements || [],
      unbreakable: !!it.unbreakable,
    }, null);
    existants.add(`${it.serie}/${it.nom}`);
    out.items += 1;
  }

  return out;
}
