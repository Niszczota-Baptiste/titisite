import { db } from './db.js';
import {
  createItem, createPanoplie, createSerie, createTier, ensureWeights,
  listPanoplies, listSeries, listTiers,
} from './items/store.js';

// Seed de la base des items customs Minefield — les données réelles du
// document « BASE DE DONNÉE DES ITEMS CUSTOMS SUR MINEFIELD » (v1.0, xadrow),
// pas un jeu de démonstration.
//
// Idempotent LIGNE PAR LIGNE (tier par nom+échelle, série par code, panoplie
// par nom, item par nom) plutôt que court-circuité au premier enregistrement :
// une version ultérieure du document peut ainsi ajouter des items sans écraser
// ce que les scribes ont retouché entre-temps. SEED_ITEMS=off pour ne rien
// insérer.
//
// Deux limites assumées, notées ici parce qu'elles se voient dans les données :
//   • Le document marque « pas encore en jeu » par une COULEUR de cellule, que
//     l'export PDF ne transporte pas. Repli : un item qui porte une vraie
//     commande /give est réputé `en_jeu` (elle a bien été générée quelque part),
//     tous les autres arrivent en `a_tester`. C'est aux admins de trancher.
//   • Les CMD ne sont renseignés nulle part dans le document. Ils restent donc
//     vides — et l'onglet CMD propose le prochain numéro libre de la série.

// ── Échelles de tiers ─────────────────────────────────────────────────────
// Deux échelles coexistent dans le document : celle de la guilde
// d'explorateurs / des artefacts, et celle des Tréfonds (« NB: système
// tréfonds: Banal, correct, honorable, supérieur, légendaire »).
// Les budgets sont étalonnés sur le corpus du document lui-même : la pièce
// d'artefact la mieux documentée (Écailles princières des Grands Fonds) pèse
// 224 points, d'où un budget d'artefact à 230 plutôt qu'un chiffre rond choisi
// à l'avance. Ils s'éditent depuis l'onglet Référentiel.
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

// Le document ne nomme explicitement que les séries 01 et 02 (« Les 2 premiers
// indique la série (01 guilde explo, 02 nostra…) »). Les deux suivantes
// correspondent à des onglets bien réels mais dont le code n'est écrit nulle
// part : la note le dit, pour que personne ne prenne 03/04 pour une donnée.
const SERIES = [
  ['01', 'Guilde des explorateurs', '#e8c86a', ''],
  ['02', 'Nostra', '#c9a8e8', ''],
  ['03', 'Tréfonds', '#7be3a8', 'Code à confirmer — absent du document source.'],
  ['04', 'Ondiens', '#7bd3e8', 'Code à confirmer — absent du document source.'],
];

const PANOPLIES = [
  ['Set du cavernier', '#9aa8b8', 0, ''],
  ['Set ancestral', '#e8c86a', 0, ''],
  ['Set du Rossignol', '#e8c86a', 5, ''],
  ['Set de la Colombe', '#ede8f8', 3, ''],
  ['Set de la Louve', '#c9a8e8', 3, ''],
  ['Set du Corbeau', '#7b6bb0', 4, ''],
  ['Set du Faulcon', '#7bd3e8', 4, 'Panoplie citée quatre fois dans le document, sans aucune pièce nommée.'],
];

// Raccourcis de saisie des modificateurs : a() = valeur plate, p() = pourcentage.
const a = (attribut, valeur, slot = 'any') => ({ attribut, valeur, mode: 'flat', slot });
const p = (attribut, valeur, slot = 'any') => ({ attribut, valeur, mode: 'pourcent', slot });
const e = (enchant, niveau) => ({ enchant, niveau });

// « pls 2 cœurs » dans le document = +2 cœurs = +4 points de vie (Minecraft
// compte en demi-cœurs). La conversion est faite ici, une bonne fois.
const coeurs = (n, slot = 'any') => a('MAX_HEALTH', n * 2, slot);

const EXPLO = { serie: '01', responsable: 'Xadrow' };
const ONDIENS = { serie: '04', responsable: 'Thalkion ou Skykkou' };
const TREFONDS = { serie: '03', responsable: '' };

const ITEMS = [
  // ── Guilde des explorateurs ──────────────────────────────────────────────
  {
    ...EXPLO, nom: 'Épée bâtarde', tier: 'Commun', baseItem: 'iron_sword',
    description: "Une arme simple mais digne d'un explorateur.",
    acquisition: 'craft_achat', ressources: "2 lingots d'acier + 1 bâton (MC)",
    attributs: [a('ATTACK_DAMAGE', 1, 'mainhand')],
  },
  {
    ...EXPLO, nom: 'Zweihander', tier: 'Commun', baseItem: 'iron_sword',
    description: "Une arme lourde mais digne d'un explorateur.",
    acquisition: 'craft_achat', ressources: "3 lingots d'acier + 1 bâton (MC)",
    attributs: [
      p('KNOCKBACK_RESISTANCE', 5, 'mainhand'), p('MOVEMENT_SPEED', -10, 'mainhand'),
      a('ATTACK_DAMAGE', 4, 'mainhand'), p('ATTACK_SPEED', -15, 'mainhand'),
    ],
  },
  {
    ...EXPLO, nom: 'Hache de combat', tier: 'Commun', baseItem: 'iron_axe',
    description: "Une arme rustre mais digne d'un explorateur.",
    acquisition: 'craft_achat', ressources: "3 lingots d'acier + 1 bâton (MC)",
    attributs: [a('ATTACK_DAMAGE', 2, 'mainhand'), p('ATTACK_SPEED', -5, 'mainhand')],
  },
  {
    ...EXPLO, nom: 'Hallebarde', tier: 'Commun', baseItem: 'iron_axe',
    description: "Une arme peu commode mais digne d'un explorateur.",
    acquisition: 'craft_achat', ressources: "3 lingots d'acier + 2 bâtons (MC)",
    attributs: [
      p('KNOCKBACK_RESISTANCE', 5, 'mainhand'), p('MOVEMENT_SPEED', -5, 'mainhand'),
      a('ATTACK_DAMAGE', 3, 'mainhand'), p('ATTACK_SPEED', -15, 'mainhand'),
    ],
  },
  {
    ...EXPLO, nom: 'Lance', tier: 'Commun', baseItem: 'minefield:harpoon',
    description: "Une arme non conventionnelle mais digne d'un explorateur.",
    acquisition: 'craft_achat', ressources: "1 lingot d'acier + 3 bâtons (MC)",
    attributs: [a('ATTACK_DAMAGE', 2, 'mainhand'), p('ATTACK_SPEED', -5, 'mainhand')],
  },
  {
    ...EXPLO, nom: "Casque de l'explorateur", tier: 'Commun', baseItem: 'leather_helmet',
    acquisition: 'craft_achat', ressources: '5 cuirs tannés (MF)*',
    attributs: [a('ARMOR', 2, 'head'), a('ARMOR_TOUGHNESS', 1, 'head')],
  },
  {
    ...EXPLO, nom: "Gambison de l'explorateur", tier: 'Commun', baseItem: 'leather_chestplate',
    acquisition: 'craft_achat', ressources: '6 cuirs tannés (MF)*',
    attributs: [a('ARMOR', 2, 'chest'), a('ARMOR_TOUGHNESS', 1, 'chest')],
  },
  {
    ...EXPLO, nom: "Tassettes de l'explorateur", tier: 'Commun', baseItem: 'leather_leggings',
    acquisition: 'craft_achat', ressources: '7 cuirs tannés (MF)*',
    attributs: [a('ARMOR', 2, 'legs'), a('ARMOR_TOUGHNESS', 1, 'legs')],
  },
  {
    ...EXPLO, nom: "Bottes de l'explorateur", tier: 'Commun', baseItem: 'leather_boots',
    acquisition: 'craft_achat', ressources: '8 cuirs tannés (MF)*',
    attributs: [a('ARMOR', 2, 'feet'), a('ARMOR_TOUGHNESS', 1, 'feet')],
  },
  {
    ...EXPLO, nom: 'Totem Illager', tier: 'Artefact', baseItem: 'totem_of_undying',
    description: "Un drôle d'artéfact tombé des mains d'une brute illager",
    acquisition: 'quest_event',
    attributs: [
      p('KNOCKBACK_RESISTANCE', 10, 'offhand'), a('ARMOR', 5, 'offhand'),
      a('ARMOR_TOUGHNESS', 5, 'offhand'),
    ],
    enchantements: [e('thorns', 3)],
    commande: '/give @p minecraft:totem_of_undying 1 0 {display:{Name:"Totem Illager",Lore:["Un drôle d\'artéfact tombé des mains d\'une brute illager"]},ench:[{id:7,lvl:3}],AttributeModifiers:[{AttributeName:"generic.knockbackResistance",Name:"generic.knockbackResistance",Amount:0.10,Operation:1,UUIDLeast:502258,UUIDMost:873781,Slot:"offhand"},{AttributeName:"generic.armor",Name:"generic.armor",Amount:5,Operation:0,UUIDLeast:567846,UUIDMost:697716,Slot:"offhand"},{AttributeName:"generic.armorToughness",Name:"generic.armorToughness",Amount:5,Operation:0,UUIDLeast:658192,UUIDMost:533620,Slot:"offhand"}]}',
  },

  // ── Panoplies d'artefacts ───────────────────────────────────────────────
  // Le document ne donne ni description, ni stats, ni acquisition détaillée
  // pour ces pièces : seules la panoplie et l'item de base y figurent. Les
  // lignes sont créées telles quelles — un item sans stats est une fiche à
  // compléter, pas une fiche à inventer.
  { ...EXPLO, nom: 'Hallebarde du Rossignol', tier: 'Artefact', baseItem: 'iron_axe', panoplie: 'Set du Rossignol', acquisition: 'quest_event' },
  { ...EXPLO, nom: 'Sallet du Rossignol', tier: 'Artefact', baseItem: 'iron_helmet', panoplie: 'Set du Rossignol', acquisition: 'quest_event' },
  { ...EXPLO, nom: 'Cuirasse du Rossignol', tier: 'Artefact', baseItem: 'iron_chestplate', panoplie: 'Set du Rossignol', acquisition: 'quest_event' },
  { ...EXPLO, nom: 'Jambières du Rossignol', tier: 'Artefact', baseItem: 'chainmail_leggings', panoplie: 'Set du Rossignol', acquisition: 'quest_event' },
  { ...EXPLO, nom: 'Sabatons du Rossignol', tier: 'Artefact', baseItem: 'iron_boots', panoplie: 'Set du Rossignol', acquisition: 'quest_event' },

  { ...EXPLO, nom: 'Casque de la Colombe', tier: 'Commun', baseItem: 'leather_helmet', panoplie: 'Set de la Colombe', note: 'Nom absent du document source — déduit de la panoplie et de l’item de base.' },
  { ...EXPLO, nom: 'Plastron de la Colombe', tier: 'Commun', baseItem: 'leather_chestplate', panoplie: 'Set de la Colombe', note: 'Nom absent du document source — déduit de la panoplie et de l’item de base.' },
  { ...EXPLO, nom: 'Bottes de la Colombe', tier: 'Commun', baseItem: 'leather_boots', panoplie: 'Set de la Colombe', note: 'Nom absent du document source — déduit de la panoplie et de l’item de base.' },

  { ...EXPLO, nom: 'Casque de la Louve', tier: 'Rare', baseItem: 'leather_helmet', panoplie: 'Set de la Louve', note: 'Nom absent du document source — déduit de la panoplie et de l’item de base.' },
  { ...EXPLO, nom: 'Plastron de la Louve', tier: 'Rare', baseItem: 'chainmail_chestplate', panoplie: 'Set de la Louve', note: 'Nom absent du document source — déduit de la panoplie et de l’item de base.' },
  { ...EXPLO, nom: 'Bottes de la Louve', tier: 'Rare', baseItem: 'iron_boots', panoplie: 'Set de la Louve' },

  { ...EXPLO, nom: 'Heaume du Corbeau', tier: 'Très Rare', baseItem: 'minefield:obsidian_helmet', panoplie: 'Set du Corbeau' },
  { ...EXPLO, nom: 'Cuirasse du Corbeau', tier: 'Très Rare', baseItem: 'minefield:obsidian_chestplate', panoplie: 'Set du Corbeau' },
  { ...EXPLO, nom: 'Jambières du Corbeau', tier: 'Très Rare', baseItem: 'minefield:obsidian_leggings', panoplie: 'Set du Corbeau' },
  { ...EXPLO, nom: 'Sabatons du Corbeau', tier: 'Très Rare', baseItem: 'minefield:obsidian_boots', panoplie: 'Set du Corbeau' },

  // ── Tréfonds ────────────────────────────────────────────────────────────
  {
    ...TREFONDS, nom: 'Poignard de cavernier', tier: 'Banal', baseItem: 'minefield:iron_chisel',
    panoplie: 'Set du cavernier',
    description: "Ce poignard banal est relativement efficace contre les araignées et permet de se déplacer légèrement plus rapidement. Permet de se défendre si tenu dans la main secondaire.",
    acquisition: 'craftable', ressources: 'Fibre végétale x2, aventurine x2, rhyolite x1, bâton (MC) x1',
  },
  {
    ...TREFONDS, nom: 'Rempart des Tréfonds', tier: 'Honorable', baseItem: 'minecraft:shield',
    panoplie: 'Set ancestral',
    description: "Rare et vieux bouclier datant de l'ère des Bâtisseurs.",
    acquisition: 'quest_event',
    attributs: [coeurs(2, 'offhand'), p('MOVEMENT_SPEED', -10, 'offhand'), a('ARMOR', 2, 'offhand')],
  },
  {
    ...TREFONDS, nom: 'Cuirasse bâtarde', tier: 'Banal', baseItem: 'minecraft:iron_chestplate',
    description: "Cette cuirasse banale augmente la protection, au détriment d'une perte de vitesse due à son poids.",
    acquisition: 'craftable', ressources: 'Fibre végétale x3, orthose rose x8, aventurine x1',
    attributs: [coeurs(1, 'chest'), p('MOVEMENT_SPEED', -10, 'chest'), a('ARMOR', 7, 'chest')],
  },
  {
    ...TREFONDS, nom: 'Plastron de bretteur', tier: 'Banal', baseItem: 'minecraft:chainmail_chestplate',
    description: "Ce plastron banal procure une aisance de mouvement, utile pour frapper plus rapidement.",
    acquisition: 'craftable', ressources: 'Fibre végétale x3, rhyolite x6, orthose rose x2',
    attributs: [a('ARMOR', 6, 'chest'), a('ATTACK_SPEED', 0.4, 'chest')],
  },
  {
    ...TREFONDS, nom: "Gambison renforcé d'aventurine", tier: 'Banal', baseItem: 'minecraft:leather_chestplate',
    description: "Ce gambison banal offre une meilleure mobilité, au dépit d'une protection minime.",
    acquisition: 'craftable', ressources: 'Fibre végétale x4, aventurine x2',
    attributs: [p('MOVEMENT_SPEED', 5, 'chest'), a('ARMOR', 5, 'chest')],
  },
  {
    ...TREFONDS, nom: 'Broigne épaisse', tier: 'Correct', baseItem: 'minecraft:leather_chestplate',
    description: "Cette broigne correcte offre une meilleure mobilité, au dépit d'une protection légère.",
    acquisition: 'craftable', ressources: "Fibre végétale forte x3, soie d'arachnide x2, crystal pourpre x2",
    note: "Le document ne renseigne aucun attribut pour cette pièce.",
  },
  {
    ...TREFONDS, nom: 'Cotte de mailles de jaspe', tier: 'Correct', baseItem: 'minecraft:chainmail_chestplate',
    description: "Cette cotte de maille procure une bonne aisance de mouvement, permettant des attaques plus rapides.",
    acquisition: 'craftable', ressources: 'Fibre végétale forte x2, jaspe jaune x4, os de putréfié x2',
    attributs: [a('ARMOR', 7, 'chest'), a('ATTACK_SPEED', 0.8, 'chest')],
  },
  {
    ...TREFONDS, nom: 'Cuirasse robuste', tier: 'Correct', baseItem: 'minecraft:diamond_chestplate',
    description: "Cette cuirasse correcte procure une bonne protection au dépit d'une perte de vitesse.",
    acquisition: 'craftable', ressources: 'Fibre végétale forte x2, dioptase des Tréfonds x8, crystal pourpre x2',
    attributs: [coeurs(2, 'chest'), p('MOVEMENT_SPEED', -15, 'chest'), a('ARMOR', 9, 'chest')],
  },
  {
    ...TREFONDS, nom: 'Cuirasse ancestrale', tier: 'Honorable', baseItem: 'minefield:plate_obsidian',
    panoplie: 'Set ancestral',
    description: "Résistante cuirasse forgée grâce à des plans de l'ère des Bâtisseurs.",
    acquisition: 'craft_schema',
    ressources: 'Fibre végétale forte x4, dioptase des Tréfonds x8, jaspe jaune x6, crystal pourpre x2, essence de gardien x8',
    attributs: [
      coeurs(2, 'chest'), a('KNOCKBACK_RESISTANCE', 0.25, 'chest'),
      p('MOVEMENT_SPEED', -20, 'chest'), a('ARMOR', 10, 'chest'), a('ARMOR_TOUGHNESS', 3, 'chest'),
    ],
  },
  {
    ...TREFONDS, nom: "Plastron d'arachnide", tier: 'Honorable', baseItem: 'minecraft:iron_chestplate',
    description: "Ce plastron correct augmente la robustesse, et offre de la protection, au dépit d'une légère perte de vitesse.",
    acquisition: 'craftable', ressources: "Fibre végétale forte x2, carapace d'arachnide x8, venin d'arachnide x2",
    attributs: [coeurs(1, 'chest'), p('MOVEMENT_SPEED', -5, 'chest'), a('ARMOR', 7, 'chest'), a('ARMOR_TOUGHNESS', 2, 'chest')],
  },

  // ── Ondiens ─────────────────────────────────────────────────────────────
  // Ces cinq-là portent leur commande /give complète dans le document : les
  // attributs ci-dessous sont relevés DANS la commande, pas dans les colonnes
  // (elles divergent parfois — la Jupette annonce 20 d'armure en colonne et 8
  // dans la commande ; la commande fait foi, c'est elle qui tourne en jeu).
  {
    ...ONDIENS, nom: 'Couronne du Grand Cœur', tier: 'Artefact', baseItem: 'turtle_helmet',
    description: "Couronne antique imbue du pouvoir du saumon.\nElle confère au porteur une respiration très importante sous l'eau",
    acquisition: 'quest_event', prix: '550 écailles (sans Unbreakable)',
    attributs: [a('ARMOR', 4, 'head'), p('MOVEMENT_SPEED', 10, 'head'), a('MAX_HEALTH', 2, 'head')],
    enchantements: [e('aqua_affinity', 1), e('protection', 1), e('respiration', 6)],
    unbreakable: true,
    commande: `give @p turtle_helmet{display:{Name:'[{"text":"Couronne du Grand Coeur","italic":false}]',Lore:['[{"text":"Couronne antique imbu du pouvoir du saumon.","italic":false}]']},Enchantments:[{lvl:1,id:aqua_affinity},{lvl:1,id:protection},{lvl:6,id:respiration}],AttributeModifiers:[{AttributeName:"generic.armor",Amount:4,Slot:head,UUID:[I;-126217,35749,1424,-71498],Name:1773752566495},{AttributeName:"generic.movement_speed",Amount:0.1,Slot:head,Operation:1,UUID:[I;-126217,36049,1424,-72098],Name:1773752566495},{AttributeName:"generic.max_health",Amount:2,Slot:head,UUID:[I;-126217,36349,1424,-72698],Name:1773752566495}],Unbreakable:1}`,
  },
  {
    ...ONDIENS, nom: 'Écailles princières des Grands Fonds', tier: 'Artefact', baseItem: 'diamond_chestplate',
    description: "Cuirasse légendaire ayant appartenu à un ondien haut placé",
    acquisition: 'quest_event', prix: '500 écailles (sans Unbreakable)',
    attributs: [a('ARMOR', 10, 'chest'), a('MAX_HEALTH', 4, 'chest'), p('MOVEMENT_SPEED', 20, 'chest')],
    enchantements: [e('projectile_protection', 2), e('protection', 2), e('thorns', 1)],
    unbreakable: true,
    commande: `give @a diamond_chestplate{display:{Name:'[{"text":"Ecailles princieres des Grands Fonds","italic":false}]'},Enchantments:[{lvl:2,id:projectile_protection},{lvl:2,id:protection},{lvl:1,id:thorns}],AttributeModifiers:[{AttributeName:"generic.armor",Amount:10,Slot:chest,UUID:[I;-126215,76719,182719,-153438],Name:1773596101784},{AttributeName:"generic.max_health",Amount:4,Slot:chest,UUID:[I;-126215,77019,182719,-154038],Name:1773596101784},{AttributeName:"generic.movement_speed",Amount:0.2,Slot:chest,Operation:1,UUID:[I;-126215,77319,182719,-154638],Name:1773596101784}],Unbreakable:1}`,
  },
  {
    ...ONDIENS, nom: 'Jupette des Chants éternels', tier: 'Artefact', baseItem: 'netherite_leggings',
    description: "Jupette antique conférant au porteur vitesse et protection",
    acquisition: 'quest_event', prix: '500 écailles (sans Unbreakable)',
    attributs: [a('ARMOR', 8, 'legs'), p('MOVEMENT_SPEED', 20, 'legs'), a('MAX_HEALTH', 2, 'legs')],
    enchantements: [e('protection', 3)],
    unbreakable: true,
    note: "La colonne ARMOR du document indique 20 ; la commande /give en donne 8. Valeur de la commande retenue.",
    commande: `give @p netherite_leggings{display:{Name:'[{"text":"Jupette des Chants eternels","italic":false}]'},Enchantments:[{lvl:3,id:protection}],AttributeModifiers:[{AttributeName:"generic.armor",Amount:8,Slot:legs,UUID:[I;-126215,191519,182719,-383038],Name:1773596559703},{AttributeName:"generic.movement_speed",Amount:0.2,Slot:legs,Operation:1,UUID:[I;-126215,191819,182719,-383638],Name:1773596559703},{AttributeName:"generic.max_health",Amount:2,Slot:legs,UUID:[I;-126215,192419,182719,-384838],Name:1773596559703}],Unbreakable:1}`,
  },
  {
    ...ONDIENS, nom: 'Harpon de soldat antique', tier: 'Artefact', baseItem: 'minefield:harpoon',
    description: "Un ancien harpon d'un tranchant incroyable,\nenchanté par le devin des anciens temps",
    acquisition: 'quest_event', prix: '500 écailles (sans Unbreakable)',
    attributs: [
      a('ARMOR', 2, 'mainhand'), a('ATTACK_DAMAGE', 10, 'mainhand'),
      p('MOVEMENT_SPEED', -20, 'mainhand'), p('ATTACK_SPEED', -70, 'mainhand'),
    ],
    unbreakable: true,
    commande: `give @p minefield:harpoon{display:{Name:'[{"text":"Harpon de soldat antique","italic":false}]'},AttributeModifiers:[{AttributeName:"generic.armor",Amount:2,Slot:mainhand,UUID:[I;-126217,125649,1424,-251298],Name:1773753055405},{AttributeName:"generic.attack_damage",Amount:10,Slot:mainhand,UUID:[I;-126217,125949,1424,-251898],Name:1773753055405},{AttributeName:"generic.movement_speed",Amount:-0.2,Slot:mainhand,Operation:1,UUID:[I;-126217,126249,1424,-252498],Name:1773753055405},{AttributeName:"generic.attack_speed",Amount:-0.7,Slot:mainhand,Operation:1,UUID:[I;-126217,126549,1424,-253098],Name:1773753055405}],Unbreakable:1}`,
  },
  {
    ...ONDIENS, nom: 'Trident des fonds marins', tier: 'Artefact', baseItem: 'trident',
    description: "Un trident permettant de se déplacer aussi vite\nque les poissons et d'attaquer tel un requin",
    acquisition: 'quest_event', prix: '600 écailles (sans Unbreakable)',
    attributs: [p('MOVEMENT_SPEED', 20, 'mainhand'), p('MOVEMENT_SPEED', 40, 'offhand')],
    enchantements: [e('impaling', 10), e('riptide', 5)],
    unbreakable: true,
    commande: `give @p trident{display:{Name:'[{"text":"Trident des fonds marins","italic":false}]'},Enchantments:[{lvl:10,id:impaling},{lvl:5,id:riptide}],AttributeModifiers:[{AttributeName:"generic.movement_speed",Amount:0.2,Slot:mainhand,Operation:1,UUID:[I;-126431,30574,134425,-61148],Name:1780228046290},{AttributeName:"generic.movement_speed",Amount:0.4,Slot:offhand,Operation:1,UUID:[I;-126431,30874,134425,-61748],Name:1780228046290}],Unbreakable:1}`,
  },
  {
    ...ONDIENS, nom: "Tentacule d'honneur", tier: 'Peu Commun', baseItem: 'minefield:tentacle',
    description: "Tentacule qui sert de trophée pour les ondiens,\nvous reconsidérez l'aide que vous leur offrez",
    acquisition: 'quest_event',
    commande: `give @p minefield:tentacle{display:{Name:'[{"text":"Tentacule d honneur","italic":false}]'}}`,
  },

  // ── Divers ──────────────────────────────────────────────────────────────
  {
    serie: '02', responsable: '', nom: 'Boussole piaf', tier: 'Commun', baseItem: 'compass',
    description: 'Pointe vers le village piaf',
    acquisition: 'autre',
    commande: '/give @p compass{display:{Name:\'{"text":"Boussole Piaf","color":"green","bold":true,"italic":true}\'},LodestoneDimension:"minecraft:overworld",LodestoneTracked:0b,LodestonePos:{X:2548,Y:83,Z:-9396}} 1',
  },
];

export function seedItemsIfEmpty() {
  if (process.env.SEED_ITEMS === 'off') return { skipped: 'disabled' };
  ensureWeights();

  const out = { tiers: 0, series: 0, panoplies: 0, items: 0 };

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

  const panoByNom = new Map(listPanoplies().map((p2) => [p2.nom, p2]));
  for (const [nom, couleur, taille, note] of PANOPLIES) {
    if (panoByNom.has(nom)) continue;
    panoByNom.set(nom, createPanoplie({ nom, couleur, taille, note }, null));
    out.panoplies += 1;
  }

  const existants = new Set(db.prepare(`SELECT nom FROM mf_items`).all().map((r) => r.nom));
  for (const it of ITEMS) {
    if (existants.has(it.nom)) continue;
    createItem({
      nom: it.nom,
      description: it.description || '',
      baseItem: it.baseItem,
      tierId: tierByKey.get(`${TIERS.find(([n]) => n === it.tier)?.[1]}/${it.tier}`)?.id ?? null,
      serieId: serieByCode.get(it.serie)?.id ?? null,
      panoplieId: it.panoplie ? (panoByNom.get(it.panoplie)?.id ?? null) : null,
      acquisition: it.acquisition || 'craftable',
      ressources: it.ressources || '',
      prix: it.prix || '',
      commande: it.commande || '',
      // Cf. l'entête : une commande /give présente vaut présomption de mise en jeu.
      statut: it.commande ? 'en_jeu' : 'a_tester',
      responsable: it.responsable || '',
      note: it.note || '',
      attributs: it.attributs || [],
      enchantements: it.enchantements || [],
      unbreakable: !!it.unbreakable,
    }, null);
    existants.add(it.nom);
    out.items += 1;
  }

  return out;
}
