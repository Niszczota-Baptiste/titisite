// Catalogue des blocs de Minecraft 1.18.2 (Java Edition, Caves & Cliffs Part II).
//
// Noms en français — basés sur la traduction officielle de Minecraft Java
// Edition 1.18.2 et le wiki FR. Les variantes par bois et par couleur sont
// générées par produit cartésien pour garder la source compacte.
//
// Cette liste alimente l'autocomplete du modal "Nouvelle ressource" sur
// l'onglet Minecraft des projets en mode Minecraft. Les noms sont libres
// (l'utilisateur peut taper ce qu'il veut), c'est juste une aide à la saisie.

const COLORS = [
  'Blanc', 'Orange', 'Magenta', 'Bleu clair', 'Jaune', 'Vert clair', 'Rose',
  'Gris', 'Gris clair', 'Cyan', 'Violet', 'Bleu', 'Marron', 'Vert', 'Rouge', 'Noir',
];

const OVERWORLD_WOODS = [
  { sg: 'de chêne',         pl: 'en chêne' },
  { sg: "d'épicéa",         pl: 'en épicéa' },
  { sg: 'de bouleau',       pl: 'en bouleau' },
  { sg: "d'acajou",         pl: 'en acajou' },        // Jungle
  { sg: "d'acacia",         pl: 'en acacia' },
  { sg: 'de chêne noir',    pl: 'en chêne noir' },
];

const NETHER_WOODS = [
  { sg: 'carmin',   pl: 'carmin' },                   // Crimson
  { sg: 'biscornu', pl: 'biscornu' },                 // Warped
];

const cat = (label, blocks) => blocks.map((name) => ({ name, category: label }));

// ── 1. Blocs naturels (terrain de la surface) ────────────────────────────
const NATURAL_SURFACE = cat('Nature — surface', [
  'Herbe', 'Bloc d\'herbe', 'Terre', 'Terre stérile', 'Terre enracinée',
  'Boue', 'Boue compactée', 'Podzol', 'Mycélium',
  'Sable', 'Sable rouge', 'Gravier', 'Argile',
  'Neige (couche)', 'Bloc de neige', 'Neige poudreuse',
  'Glace', 'Glace compactée', 'Glace bleue',
  'Eau', 'Lave',
  'Bedrock',
]);

// ── 2. Blocs naturels (souterrain / 1.18 caves) ──────────────────────────
const NATURAL_CAVES = cat('Nature — grottes', [
  'Pierre', 'Granite', 'Granite poli', 'Diorite', 'Diorite polie',
  'Andésite', 'Andésite polie',
  'Tuf', 'Calcite',
  'Ardoise des abîmes', 'Ardoise des abîmes taillée', 'Ardoise des abîmes polie',
  'Bloc de stalactite', 'Stalactite',
  'Bloc d\'améthyste', 'Bourgeon d\'améthyste', 'Grappe d\'améthyste',
  'Petit bourgeon d\'améthyste', 'Moyen bourgeon d\'améthyste', 'Grand bourgeon d\'améthyste',
  'Bloc de mousse', 'Tapis de mousse',
  'Azalée', 'Azalée fleurie', 'Feuilles d\'azalée', 'Feuilles d\'azalée fleurie',
  'Grand drapeur', 'Petit drapeur', 'Racines suspendues',
  'Vignes des cavernes', 'Baies lumineuses', 'Inflorescence à spores',
  'Lichen luminescent',
  'Toile d\'araignée',
  'Obsidienne', 'Obsidienne en pleurs',
]);

// ── 3. Minerais ──────────────────────────────────────────────────────────
const ORES = cat('Minerais', [
  'Minerai de charbon', 'Minerai de charbon des abîmes',
  'Minerai de fer', 'Minerai de fer des abîmes',
  'Minerai de cuivre', 'Minerai de cuivre des abîmes',
  'Minerai d\'or', 'Minerai d\'or des abîmes',
  'Minerai de redstone', 'Minerai de redstone des abîmes',
  'Minerai de lapis-lazuli', 'Minerai de lapis-lazuli des abîmes',
  'Minerai de diamant', 'Minerai de diamant des abîmes',
  'Minerai d\'émeraude', 'Minerai d\'émeraude des abîmes',
  'Minerai de quartz du Nether', 'Minerai d\'or du Nether',
  'Débris antiques',
]);

// ── 4. Lingots, gemmes, ressources brutes ────────────────────────────────
const RESOURCES = cat('Ressources', [
  'Charbon', 'Charbon de bois',
  'Lingot de fer', 'Lingot d\'or', 'Lingot de cuivre', 'Lingot de netherite',
  'Pépite de fer', 'Pépite d\'or',
  'Fer brut', 'Or brut', 'Cuivre brut',
  'Diamant', 'Émeraude', 'Lapis-lazuli', 'Poudre de redstone',
  'Quartz du Nether', 'Cristal de prismarine', 'Éclat de prismarine',
  'Cristal d\'améthyste', 'Tesson de poterie',
  'Débris antiques', 'Lingot de netherite', 'Fragment de netherite',
  'Bâton', 'Silex', 'Os', 'Poudre d\'os', 'Cuir', 'Plume', 'Ficelle',
  'Œuf', 'Sphère de slime', 'Larme de ghast', 'Œil d\'araignée',
  'Poudre à canon', 'Sucre', 'Papier', 'Livre',
  'Œil d\'ender', 'Perle de l\'Ender', 'Tige de blaze', 'Poudre de blaze',
  'Verrue du Nether', 'Étoile du Nether',
  'Crème de magma', 'Bâton de fouille',
]);

// ── 5. Blocs de minerai compactés (storage blocks) ───────────────────────
const MINERAL_BLOCKS = cat('Blocs de minerai', [
  'Bloc de charbon',
  'Bloc de fer', 'Bloc de fer brut',
  'Bloc d\'or', 'Bloc d\'or brut',
  'Bloc de cuivre', 'Bloc de cuivre brut',
  'Bloc de cuivre coupé',
  'Bloc de cuivre exposé', 'Bloc de cuivre coupé exposé',
  'Bloc de cuivre patiné', 'Bloc de cuivre coupé patiné',
  'Bloc de cuivre oxydé', 'Bloc de cuivre coupé oxydé',
  'Bloc de cuivre ciré',
  'Bloc de redstone',
  'Bloc de lapis-lazuli',
  'Bloc de diamant',
  'Bloc d\'émeraude',
  'Bloc de quartz', 'Quartz lisse', 'Pilier de quartz',
  'Quartz ciselé', 'Briques de quartz',
  'Bloc de netherite',
]);

// ── 6. Bois — variantes par essence (Overworld) ──────────────────────────
const OVERWORLD_WOOD_VARIANTS = OVERWORLD_WOODS.flatMap((w) => cat('Bois & dérivés', [
  `Bûche ${w.sg}`,
  `Bûche ${w.sg} écorcée`,
  `Bois ${w.sg}`,
  `Bois ${w.sg} écorcé`,
  `Planches ${w.pl}`,
  `Feuilles ${w.pl}`,
  `Pousse ${w.sg}`,
  `Porte ${w.pl}`,
  `Trappe ${w.pl}`,
  `Clôture ${w.pl}`,
  `Portillon ${w.sg}`,
  `Bouton ${w.sg}`,
  `Plaque de pression ${w.sg}`,
  `Escalier ${w.pl}`,
  `Dalle ${w.pl}`,
  `Pancarte ${w.pl}`,
]));

// ── 7. Bois du Nether (Crimson / Warped) ─────────────────────────────────
const NETHER_WOOD_VARIANTS = NETHER_WOODS.flatMap((w) => cat('Bois & dérivés', [
  `Tige ${w.sg}`,
  `Tige ${w.sg} écorcée`,
  `Hyphes ${w.sg}`,
  `Hyphes ${w.sg} écorcées`,
  `Planches ${w.pl}`,
  `Champignon ${w.sg}`,
  `Racines ${w.pl}`,
  `Porte ${w.pl}`,
  `Trappe ${w.pl}`,
  `Clôture ${w.pl}`,
  `Portillon ${w.sg}`,
  `Bouton ${w.sg}`,
  `Plaque de pression ${w.sg}`,
  `Escalier ${w.pl}`,
  `Dalle ${w.pl}`,
  `Pancarte ${w.pl}`,
]));

// ── 8. Cultures, plantes & fleurs ────────────────────────────────────────
const PLANTS = cat('Plantes & cultures', [
  'Blé', 'Graines de blé',
  'Carotte', 'Carotte dorée',
  'Pomme de terre', 'Pomme de terre empoisonnée', 'Pomme de terre cuite',
  'Betterave', 'Graines de betterave', 'Soupe de betterave',
  'Citrouille', 'Citrouille sculptée', 'Citrouille-lanterne',
  'Pastèque', 'Tranche de pastèque', 'Pépin de pastèque',
  'Canne à sucre', 'Cactus', 'Bambou',
  'Cacao (fève)', 'Gousse de cacao',
  'Champignon brun', 'Champignon rouge',
  'Bloc de champignon brun', 'Bloc de champignon rouge', 'Tige de champignon',
  'Bloc de melon', 'Bloc de citrouille',
  'Buisson de baies sucrées',
  'Vigne', 'Plante de chorus', 'Fleur de chorus', 'Fruit du chorus',
  'Verrue du Nether', 'Bloc de verrue du Nether', 'Bloc de verrue déformée',
  'Pousses du Nether', 'Lianes pleureuses', 'Lianes tortueuses',
  'Champi-lumière',
  'Algue (kelp)', 'Algue séchée', 'Bloc d\'algues séchées',
  'Herbe haute', 'Touffe d\'herbe', 'Fougère', 'Grande fougère',
  'Buisson mort', 'Nénuphar',
  'Herbes marines', 'Hautes herbes marines',
]);

const FLOWERS = cat('Fleurs', [
  'Pissenlit', 'Coquelicot', 'Orchidée bleue', 'Allium', 'Houstonie bleue',
  'Tulipe rouge', 'Tulipe orange', 'Tulipe blanche', 'Tulipe rose',
  'Marguerite jaune', 'Bleuet', 'Muguet', 'Rose flétrie',
  'Tournesol', 'Lilas', 'Buisson de roses', 'Pivoine',
]);

// ── 9. Pierres taillées, briques, sables ────────────────────────────────
const STONE_VARIANTS = cat('Pierres taillées', [
  'Pavé', 'Pavé moussu', 'Mur en pavé', 'Mur en pavé moussu',
  'Briques de pierre', 'Briques de pierre moussues', 'Briques de pierre fissurées', 'Briques de pierre ciselées',
  'Pierre lisse',
  'Grès', 'Grès lisse', 'Grès coupé', 'Grès ciselé',
  'Grès rouge', 'Grès rouge lisse', 'Grès rouge coupé', 'Grès rouge ciselé',
  'Brique', 'Bloc de briques',
  'Briques des abîmes', 'Briques des abîmes fissurées',
  'Tuiles des abîmes', 'Tuiles des abîmes fissurées', 'Ardoise des abîmes ciselée',
  'Pavé en ardoise des abîmes',
  'Bloc de prismarine', 'Briques de prismarine', 'Prismarine sombre',
  'Briques de pierre des extrêmes', 'Bloc de pourpre', 'Pilier de pourpre',
]);

// ── 10. Nether & End ─────────────────────────────────────────────────────
const NETHER = cat('Nether', [
  'Netherrack', 'Sable de l\'âme', 'Terre de l\'âme', 'Bloc de magma',
  'Pierre lumineuse (glowstone)',
  'Basalte', 'Basalte poli', 'Basalte lisse', 'Colonne de basalte',
  'Pierre noire', 'Pierre noire polie', 'Pierre noire dorée',
  'Briques de pierre noire polie', 'Briques de pierre noire fissurées',
  'Pierre noire ciselée',
  'Briques du Nether', 'Briques du Nether rouges',
  'Briques du Nether fissurées', 'Briques du Nether ciselées',
  'Mycélium carmin', 'Mycélium biscornu',
  'Feu de l\'âme', 'Lanterne de l\'âme', 'Torche de l\'âme',
  'Ancre de réapparition',
]);

const END = cat('End', [
  'Pierre des extrêmes', 'Briques des extrêmes',
  'Bloc de pourpre', 'Pilier de pourpre',
  'Escalier de pourpre', 'Dalle de pourpre',
  'Bâton de l\'Ender (end rod)',
  'Œuf de dragon',
  'Cristal de l\'Ender',
]);

// ── 11. Blocs colorés (laines, bétons, etc.) ─────────────────────────────
const COLORED = COLORS.flatMap((c) => cat('Blocs colorés', [
  `Laine ${c.toLowerCase()}`,
  `Tapis ${c.toLowerCase()}`,
  `Béton ${c.toLowerCase()}`,
  `Poudre de béton ${c.toLowerCase()}`,
  `Verre teinté ${c.toLowerCase()}`,
  `Vitre teintée ${c.toLowerCase()}`,
  `Terre cuite ${c.toLowerCase()}`,
  `Terre cuite émaillée ${c.toLowerCase()}`,
  `Bougie ${c.toLowerCase()}`,
]));

// ── 12. Verre & lumière ──────────────────────────────────────────────────
const GLASS_LIGHT = cat('Verre & lumière', [
  'Verre', 'Vitre',
  'Lampe à redstone',
  'Torche', 'Lanterne',
  'Feu de camp', 'Feu de camp d\'âme',
  'Bougie',
  'Lanterne de mer',
  'Bloc de glowstone',
  'Champi-lumière',
  'Bloc d\'améthyste',
  'Tige de l\'Ender',
  'Citrouille-lanterne',
]);

// ── 13. Mécanismes & redstone ────────────────────────────────────────────
const REDSTONE = cat('Redstone & mécanismes', [
  'Poudre de redstone', 'Bloc de redstone', 'Torche de redstone',
  'Répéteur', 'Comparateur',
  'Levier', 'Bouton (pierre)', 'Bouton (pierre noire polie)',
  'Plaque de pression (pierre)', 'Plaque de pression (pierre noire polie)',
  'Plaque de pression légère', 'Plaque de pression lourde',
  'Crochet de fil de détente', 'Fil de détente',
  'Détecteur de lumière du jour',
  'Distributeur', 'Dropper', 'Entonnoir',
  'Observateur', 'Piston', 'Piston collant',
  'Bloc de note', 'Juke-box',
  'Cible', 'Cloche', 'Pierre des Lodestones',
  'Paratonnerre', 'Capteur sculk',
  'TNT',
  'Rail', 'Rail propulseur', 'Rail détecteur', 'Rail activateur',
  'Wagonnet', 'Wagonnet à coffre', 'Wagonnet à entonnoir',
  'Wagonnet à TNT', 'Wagonnet à fournaise', 'Wagonnet à distributeur',
]);

// ── 14. Mobilier & utilitaire ────────────────────────────────────────────
const FUNCTIONAL = cat('Utilitaires', [
  'Établi', 'Fournaise', 'Haut fourneau', 'Fumoir',
  'Enclume', 'Enclume ébréchée', 'Enclume endommagée',
  'Alambic', 'Chaudron',
  'Phare (beacon)', 'Conduit',
  'Table d\'enchantement', 'Bibliothèque',
  'Métier à tisser', 'Table de forgeron', 'Tailleuse de pierre',
  'Table de cartographie', 'Table d\'empennage', 'Meule',
  'Composteur', 'Tonneau',
  'Coffre', 'Coffre piégé', 'Coffre de l\'Ender',
  'Boîte de Shulker',
  'Générateur de monstres',
  'Lit', 'Pupitre', 'Ruche', 'Nid d\'abeilles',
  'Bloc de miel', 'Bloc en rayon de miel',
]);

// ── 15. Décoration & blocs divers ────────────────────────────────────────
const DECO = cat('Décoration', [
  'Tête de squelette', 'Tête de squelette wither',
  'Tête de zombie', 'Tête de joueur', 'Tête de creeper', 'Tête de dragon',
  'Échelle', 'Échafaudage',
  'Bannière',
  'Cadre', 'Cadre lumineux',
  'Tableau',
  'Pot de fleurs',
  'Fleur de coquelicot dans un pot',
  'Os fossilisé', 'Bloc d\'os',
  'Éponge', 'Éponge mouillée',
  'Bloc de slime', 'Bloc de miel',
  'Barreaux de fer',
  'Porte en fer', 'Trappe en fer',
  'Coraux (tube)', 'Coraux (cervelle)', 'Coraux (bulle)',
  'Coraux (feu)', 'Coraux (corne)',
  'Coraux morts',
  'Pickle (cornichon de mer)',
]);

// ── 16. Outils, armes, armures (utiles à inventorier dans un projet) ─────
const TOOLS = cat('Outils & équipement', [
  // Outils par matériau (5 matériaux × 5 outils + special)
  'Pioche en bois', 'Pioche en pierre', 'Pioche en fer', 'Pioche en or', 'Pioche en diamant', 'Pioche en netherite',
  'Pelle en bois', 'Pelle en pierre', 'Pelle en fer', 'Pelle en or', 'Pelle en diamant', 'Pelle en netherite',
  'Hache en bois', 'Hache en pierre', 'Hache en fer', 'Hache en or', 'Hache en diamant', 'Hache en netherite',
  'Houe en bois', 'Houe en pierre', 'Houe en fer', 'Houe en or', 'Houe en diamant', 'Houe en netherite',
  'Épée en bois', 'Épée en pierre', 'Épée en fer', 'Épée en or', 'Épée en diamant', 'Épée en netherite',
  'Cisailles', 'Briquet', 'Hameçon', 'Canne à pêche', 'Carotte sur un bâton', 'Champignon déformé sur un bâton',
  'Boussole', 'Horloge', 'Spyglass (longue-vue)',
  'Seau', 'Seau d\'eau', 'Seau de lave', 'Seau de lait', 'Seau de poudre de neige',
  'Seau d\'axolotl', 'Seau de morue', 'Seau de saumon', 'Seau de poisson tropical',
  'Arc', 'Arbalète', 'Flèche', 'Flèche spectrale', 'Flèche de pointe',
  'Trident',
  'Casque en cuir', 'Plastron en cuir', 'Pantalon en cuir', 'Bottes en cuir',
  'Casque en fer', 'Plastron en fer', 'Pantalon en fer', 'Bottes en fer',
  'Casque en or', 'Plastron en or', 'Pantalon en or', 'Bottes en or',
  'Casque en diamant', 'Plastron en diamant', 'Pantalon en diamant', 'Bottes en diamant',
  'Casque en netherite', 'Plastron en netherite', 'Pantalon en netherite', 'Bottes en netherite',
  'Bouclier', 'Élytres',
]);

// ── 17. Nourriture ───────────────────────────────────────────────────────
const FOOD = cat('Nourriture', [
  'Pomme', 'Pomme dorée', 'Pomme dorée enchantée',
  'Pain', 'Cookie', 'Gâteau',
  'Steak', 'Bœuf cru',
  'Poulet rôti', 'Poulet cru',
  'Côtelette de porc', 'Porc cuit',
  'Mouton cru', 'Mouton cuit',
  'Lapin cru', 'Lapin cuit', 'Ragoût de lapin',
  'Morue crue', 'Morue cuite',
  'Saumon cru', 'Saumon cuit',
  'Poisson tropical', 'Poisson-globe',
  'Soupe de champignons', 'Soupe de champignons suspecte',
  'Soupe de betterave',
  'Ragoût de lapin',
  'Pomme de terre cuite', 'Carotte', 'Pastèque', 'Citrouille',
  'Pâté en croûte à la citrouille',
  'Biscuit', 'Pain au chocolat',
  'Baies sucrées', 'Baies lumineuses',
  'Chair putréfiée',
  'Verrue du Nether (item)',
  'Œil d\'araignée', 'Œil d\'araignée fermenté',
]);

// ── 18. Potions, livres, projectiles ─────────────────────────────────────
const POTIONS = cat('Potions & enchantements', [
  'Bouteille en verre', 'Eau (bouteille)',
  'Potion', 'Potion persistante', 'Potion lançable',
  'Flèche de pointe',
  'Livre', 'Livre et plume', 'Livre écrit',
  'Livre enchanté',
  'Lapis-lazuli (poudre d\'enchantement)',
]);

// ── 19. Œufs d'apparition (les plus utilisés) ─────────────────────────────
const SPAWN_EGGS = cat('Œufs d\'apparition', [
  'Œuf d\'apparition de zombie', 'Œuf d\'apparition de squelette',
  'Œuf d\'apparition de creeper', 'Œuf d\'apparition d\'enderman',
  'Œuf d\'apparition de slime', 'Œuf d\'apparition de magma cube',
  'Œuf d\'apparition de blaze', 'Œuf d\'apparition de ghast',
  'Œuf d\'apparition de wither squelette',
  'Œuf d\'apparition de cochon', 'Œuf d\'apparition de vache',
  'Œuf d\'apparition de poulet', 'Œuf d\'apparition de mouton',
  'Œuf d\'apparition de lapin', 'Œuf d\'apparition de loup',
  'Œuf d\'apparition de chat', 'Œuf d\'apparition de cheval',
  'Œuf d\'apparition de villageois',
]);

// ── 20. Murs, dalles, escaliers (essentiels) ─────────────────────────────
const WALLS_STAIRS_SLABS = cat('Murs / dalles / escaliers', [
  'Mur en pierre', 'Mur en pierre noire', 'Mur en pierre noire polie',
  'Mur en briques de pierre noire polie', 'Mur en briques',
  'Mur en granite', 'Mur en diorite', 'Mur en andésite',
  'Mur en briques du Nether', 'Mur en briques du Nether rouges',
  'Mur en grès', 'Mur en grès rouge',
  'Mur en briques des abîmes', 'Mur en pavé d\'ardoise des abîmes',
  'Mur en briques de pierre', 'Mur en pavé moussu',
  'Mur en prismarine', 'Mur en briques des extrêmes',
  'Escalier en pierre', 'Escalier en pavé',
  'Escalier en briques', 'Escalier en briques de pierre',
  'Escalier en grès', 'Escalier en grès rouge',
  'Escalier en pourpre', 'Escalier en quartz',
  'Escalier en pierre noire', 'Escalier en briques du Nether',
  'Dalle en pierre', 'Dalle en pavé', 'Dalle en briques',
  'Dalle en grès', 'Dalle en quartz', 'Dalle en pourpre',
]);

// ── Concaténation finale ─────────────────────────────────────────────────
export const MINECRAFT_BLOCKS = [
  ...NATURAL_SURFACE,
  ...NATURAL_CAVES,
  ...ORES,
  ...RESOURCES,
  ...MINERAL_BLOCKS,
  ...OVERWORLD_WOOD_VARIANTS,
  ...NETHER_WOOD_VARIANTS,
  ...PLANTS,
  ...FLOWERS,
  ...STONE_VARIANTS,
  ...NETHER,
  ...END,
  ...COLORED,
  ...GLASS_LIGHT,
  ...REDSTONE,
  ...FUNCTIONAL,
  ...DECO,
  ...TOOLS,
  ...FOOD,
  ...POTIONS,
  ...SPAWN_EGGS,
  ...WALLS_STAIRS_SLABS,
];

// Liste unique des catégories, dans l'ordre d'apparition.
export const MINECRAFT_CATEGORIES = [...new Set(MINECRAFT_BLOCKS.map((b) => b.category))];

// Index pré-normalisé pour la recherche (sans accents, en minuscule).
const stripDiacritics = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => stripDiacritics(String(s).toLowerCase());

const SEARCH_INDEX = MINECRAFT_BLOCKS.map((b) => ({ ...b, _key: norm(b.name) }));

/**
 * Filtre la liste avec une requête utilisateur. Tolère les accents et la casse.
 * `limit` borne le nombre de résultats (par défaut 30) pour garder le menu utile.
 */
export function searchBlocks(query, limit = 30) {
  const q = norm(query || '').trim();
  if (!q) return SEARCH_INDEX.slice(0, limit);
  const tokens = q.split(/\s+/).filter(Boolean);
  const out = [];
  for (const b of SEARCH_INDEX) {
    if (tokens.every((t) => b._key.includes(t))) {
      out.push(b);
      if (out.length >= limit) break;
    }
  }
  return out;
}
