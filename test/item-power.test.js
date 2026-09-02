import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ATTRIBUTS, ENCHANTEMENTS, computePower, defaultWeights, materialOf, suggestTier,
} from '../server/items/power.js';
import { buildGiveCommand, uuidFor } from '../server/items/command.js';

// Le calcul de puissance est la seule chose de ce module qu'on ne peut pas
// vérifier à l'œil sur une fiche : il est pur, il est testé ici.

const W = new Map(defaultWeights().map((r) => [r.cle, r]));
const TIERS = [
  { id: 1, nom: 'Commun', budget: 55, echelle: 'standard' },
  { id: 2, nom: 'Rare', budget: 120, echelle: 'standard' },
  { id: 5, nom: 'Artefact', budget: 230, echelle: 'standard' },
  { id: 9, nom: 'Banal', budget: 60, echelle: 'trefonds' },
];
const a = (attribut, valeur, mode = 'flat') => ({ attribut, valeur, mode });

describe('matériau et classe déduits de l\'item de base', () => {
  it('lit le matériau et la classe, namespace compris', () => {
    assert.deepEqual(materialOf('iron_sword'), { famille: 'iron', classe: 'epee' });
    assert.deepEqual(materialOf('minefield:obsidian_chestplate'), { famille: 'obsidian', classe: 'plastron' });
    assert.deepEqual(materialOf('minecraft:turtle_helmet'), { famille: 'turtle', classe: 'casque' });
  });

  it('normalise les alias de saisie', () => {
    assert.equal(materialOf('golden_boots').famille, 'golden');
    assert.equal(materialOf('gold_boots').famille, 'golden', 'gold → golden');
    assert.equal(materialOf('wood_sword').famille, 'wooden', 'wood → wooden');
  });

  it('retombe sur « autre » plutôt que d\'échouer sur un id inconnu', () => {
    assert.deepEqual(materialOf('minefield:tentacle'), { famille: 'autre', classe: 'autre' });
    assert.deepEqual(materialOf(''), { famille: 'autre', classe: 'autre' });
    assert.deepEqual(materialOf(null), { famille: 'autre', classe: 'autre' });
  });
});

describe('puissance — les trois entrées', () => {
  it('additionne base matériau, attributs et enchantements', () => {
    // fer (24) × épée (0,9) = 21,6 ; +4 dégâts × 12 = 48 ; tranchant 2 × 8 = 16.
    const r = computePower({
      baseItem: 'iron_sword',
      attributs: [a('ATTACK_DAMAGE', 4)],
      enchantementss: [],
      enchantements: [{ enchant: 'sharpness', niveau: 2 }],
    }, W);
    assert.equal(r.base, 21.6);
    assert.equal(r.attributs, 48);
    assert.equal(r.enchantements, 16);
    assert.equal(r.total, 85.6);
  });

  it('convertit un pourcentage via la référence de l\'attribut', () => {
    // MOVEMENT_SPEED −15 % → −0,15 × 0,1 = −0,015 → × 300 = −4,5.
    const r = computePower({ baseItem: '', attributs: [a('MOVEMENT_SPEED', -15, 'pourcent')] }, W);
    assert.equal(r.attributs, -4.5);
    const ligne = r.lignes.find((l) => l.genre === 'attribut');
    assert.match(ligne.detail, /-15 % × 0\.1 = -0\.015 × 300/, 'le détail montre la conversion');
  });

  it('ne confond pas une valeur plate et un pourcentage', () => {
    const plat = computePower({ baseItem: '', attributs: [a('MOVEMENT_SPEED', 20, 'flat')] }, W);
    const pct = computePower({ baseItem: '', attributs: [a('MOVEMENT_SPEED', 20, 'pourcent')] }, W);
    assert.notEqual(plat.total, pct.total);
    assert.equal(pct.attributs, 6, '+20 % de 0,1 = +0,02 → 6 pts');
  });

  it('retire de la puissance pour un malus, sans le traiter comme un bonus', () => {
    const lourd = computePower({
      baseItem: 'iron_sword',
      attributs: [a('ATTACK_DAMAGE', 4), a('ATTACK_SPEED', -15, 'pourcent')],
    }, W);
    const nu = computePower({ baseItem: 'iron_sword', attributs: [a('ATTACK_DAMAGE', 4)] }, W);
    assert.ok(lourd.total < nu.total, 'la lenteur coûte des points');
    assert.equal(Math.round((nu.total - lourd.total) * 100) / 100, 15);
  });

  it('compte les malédictions en négatif', () => {
    const r = computePower({ baseItem: '', enchantements: [{ enchant: 'curse_of_binding', niveau: 1 }] }, W);
    assert.ok(r.enchantements < 0);
  });

  it('ignore un attribut ou un enchantement inconnu au lieu de planter', () => {
    const r = computePower({
      baseItem: 'iron_sword',
      attributs: [a('NOT_A_THING', 99), a('ATTACK_DAMAGE', 1)],
      enchantements: [{ enchant: 'pas_un_enchant', niveau: 5 }],
    }, W);
    assert.equal(r.attributs, 12);
    assert.equal(r.enchantements, 0);
  });

  it('ajoute le forfait « incassable »', () => {
    const sans = computePower({ baseItem: 'trident' }, W);
    const avec = computePower({ baseItem: 'trident', unbreakable: true }, W);
    assert.equal(avec.total - sans.total, 20);
  });

  it('détaille chaque ligne du calcul', () => {
    const r = computePower({
      baseItem: 'diamond_chestplate',
      attributs: [a('ARMOR', 10)],
      enchantements: [{ enchant: 'protection', niveau: 2 }],
      unbreakable: true,
    }, W);
    // matériau + attribut + enchantement + forfait
    assert.equal(r.lignes.length, 4);
    assert.equal(r.lignes.reduce((s, l) => s + l.points, 0), r.total);
  });
});

describe('rareté — un budget, jamais un multiplicateur', () => {
  it('laisse la puissance intacte quel que soit le tier déclaré', () => {
    const item = { baseItem: 'iron_sword', attributs: [a('ATTACK_DAMAGE', 4)] };
    const commun = computePower(item, W, { tiers: TIERS, tierId: 1 });
    const artefact = computePower(item, W, { tiers: TIERS, tierId: 5 });
    assert.equal(commun.total, artefact.total, 'le tier ne change pas la puissance…');
    assert.notEqual(commun.indice, artefact.indice, '…seulement l\'indice');
  });

  it('signale un item trop fort pour son palier', () => {
    const r = computePower({
      baseItem: 'netherite_chestplate',
      attributs: [a('ARMOR', 15), a('MAX_HEALTH', 10)],
    }, W, { tiers: TIERS, tierId: 1 });
    assert.equal(r.verdict, 'sur');
    assert.ok(r.indice > 1);
  });

  it('distingue une fiche vide d\'un item sous-évalué', () => {
    const vide = computePower({ baseItem: 'iron_helmet' }, W, { tiers: TIERS, tierId: 5 });
    assert.equal(vide.verdict, 'incomplet', 'aucun attribut ni enchantement → à documenter');
    const faible = computePower({
      baseItem: 'iron_helmet', attributs: [a('ARMOR', 1)],
    }, W, { tiers: TIERS, tierId: 5 });
    assert.equal(faible.verdict, 'sous', 'des stats, mais trop peu → à rééquilibrer');
  });

  it('reste sans verdict quand le tier n\'a pas de budget', () => {
    const r = computePower({ baseItem: 'iron_sword', attributs: [a('ATTACK_DAMAGE', 1)] }, W, { tiers: [], tierId: null });
    assert.equal(r.budget, null);
    assert.equal(r.indice, null);
    assert.equal(r.verdict, 'inconnu');
  });
});

describe('tier suggéré', () => {
  it('reste dans l\'échelle du tier déclaré', () => {
    // 60 points : « Commun » (55) sur l'échelle standard, « Banal » (60) sur
    // celle des Tréfonds — mélanger les deux n'aurait aucun sens en jeu.
    assert.equal(suggestTier(60, TIERS, 'standard').nom, 'Commun');
    assert.equal(suggestTier(60, TIERS, 'trefonds').nom, 'Banal');
  });

  it('retombe sur l\'échelle standard quand aucune n\'est connue', () => {
    // Un item sans tier n'a pas d'échelle : suggérer « Banal » (Tréfonds) pour
    // une épée de la guilde d'explorateurs serait un contresens.
    assert.equal(suggestTier(60, TIERS, null).nom, 'Commun');
    // …mais si l'échelle standard n'existe pas, mieux vaut élargir que se taire.
    const queTrefonds = TIERS.filter((t) => t.echelle === 'trefonds');
    assert.equal(suggestTier(60, queTrefonds, null).nom, 'Banal');
  });

  it('ne suggère rien quand aucun budget n\'est renseigné', () => {
    assert.equal(suggestTier(100, [{ id: 1, nom: 'X', budget: 0, echelle: 'standard' }]), null);
    assert.equal(suggestTier(100, []), null);
  });
});

describe('barème par défaut', () => {
  it('couvre tous les attributs et tous les enchantements', () => {
    const cles = new Set(defaultWeights().map((w) => w.cle));
    for (const at of ATTRIBUTS) assert.ok(cles.has(`attribut:${at.cle}`), `poids manquant : ${at.cle}`);
    for (const en of ENCHANTEMENTS) assert.ok(cles.has(`enchant:${en.cle}`), `poids manquant : ${en.cle}`);
  });

  it('ne donne jamais une référence nulle (division par zéro à la conversion %)', () => {
    for (const w of defaultWeights()) assert.notEqual(w.reference, 0, w.cle);
  });
});

// ── Commande /give ────────────────────────────────────────────────────────

describe('génération de la commande /give', () => {
  const item = {
    nom: 'Épée test', slug: 'epee-test', baseItem: 'iron_sword', cmd: 1042,
    description: 'Ligne une\nLigne deux',
    attributs: [{ attribut: 'ATTACK_DAMAGE', valeur: 4, mode: 'flat', slot: 'mainhand' }],
    enchantements: [{ enchant: 'sharpness', niveau: 3 }],
    unbreakable: true,
  };

  it('produit une commande complète et namespacée', () => {
    const cmd = buildGiveCommand(item);
    assert.match(cmd, /^give @p minecraft:iron_sword\{/);
    assert.match(cmd, /CustomModelData:1042/);
    assert.match(cmd, /Enchantments:\[\{id:"minecraft:sharpness",lvl:3\}\]/);
    assert.match(cmd, /Unbreakable:1/);
    assert.match(cmd, /AttributeName:"generic\.attack_damage"/);
    assert.match(cmd, /Slot:"mainhand"/);
  });

  it('garde le namespace d\'un item Minefield', () => {
    assert.match(buildGiveCommand({ ...item, baseItem: 'minefield:harpoon' }), /^give @p minefield:harpoon/);
  });

  it('écrit un pourcentage en Operation 1 et en fraction', () => {
    const cmd = buildGiveCommand({
      ...item, attributs: [{ attribut: 'MOVEMENT_SPEED', valeur: -20, mode: 'pourcent', slot: 'mainhand' }],
    });
    assert.match(cmd, /Amount:-0\.2,Operation:1/);
  });

  it('omet le Slot quand le modificateur s\'applique partout', () => {
    const cmd = buildGiveCommand({
      ...item, attributs: [{ attribut: 'ARMOR', valeur: 2, mode: 'flat', slot: 'any' }],
    });
    assert.ok(!cmd.includes('Slot:'), 'aucun Slot pour « partout »');
  });

  it('échappe l\'apostrophe — sinon la commande casse au milieu d\'un mot', () => {
    const cmd = buildGiveCommand({ ...item, nom: "Harpon d'élite", description: "sous l'eau" });
    assert.ok(cmd.includes("d\\'élite"), 'apostrophe échappée dans le nom');
    assert.ok(cmd.includes("l\\'eau"), 'apostrophe échappée dans le lore');
    // Chaque littéral SNBT doit se relire comme du JSON valide.
    for (const [, brut] of cmd.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
      const json = brut.replace(/\\(.)/g, '$1');
      assert.doesNotThrow(() => JSON.parse(json), `littéral illisible : ${brut}`);
    }
  });

  it('survit aux guillemets et antislashs du texte', () => {
    const cmd = buildGiveCommand({ ...item, nom: 'Le "vrai" \\ test' });
    const [, brut] = /Name:'((?:[^'\\]|\\.)*)'/.exec(cmd);
    assert.equal(JSON.parse(brut.replace(/\\(.)/g, '$1'))[0].text, 'Le "vrai" \\ test');
  });

  it('donne des UUID stables et distincts', () => {
    assert.deepEqual(uuidFor('a'), uuidFor('a'), 'même graine → même UUID');
    assert.notDeepEqual(uuidFor('a'), uuidFor('b'));
    assert.equal(buildGiveCommand(item), buildGiveCommand(item), 'la commande ne bouge pas d\'un appel à l\'autre');
  });

  it('ne rend rien sans item de base', () => {
    assert.equal(buildGiveCommand({ ...item, baseItem: '' }), '');
  });
});
