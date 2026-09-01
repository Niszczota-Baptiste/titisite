import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  comparerRachats, monnaieKey, monnaieLabel, prixUnitaireRachat, rachatVise,
} from '../src/components/quests/items/rachat.js';

// Barèmes de rachat d'un set de joyaux : à l'unité ou en lot, payés en PA chez
// un PNJ ou en réputation chez un autre. La question tranchée ici est « garder
// pour compléter le lot, ou écouler à l'unité ? ».

const pa = (montant, lot = 0, extra = {}) => ({ paiement: 'pa', montant, lot, pnj: 'Marchand', ...extra });
const rep = (montant, lot = 0, factionId = 3) => ({
  paiement: 'reputation', montant, lot, factionId, factionNom: 'Ondiens', pnj: 'Doyen',
});

describe('monnaies de rachat', () => {
  it('ne confond pas deux monnaies, ni deux factions de réputation', () => {
    assert.equal(monnaieKey(pa(5)), 'pa');
    assert.equal(monnaieKey(rep(2, 0, 3)), 'reputation:3');
    assert.notEqual(monnaieKey(rep(2, 0, 3)), monnaieKey(rep(2, 0, 4)));
    assert.equal(monnaieKey({ paiement: 'item', refCode: 'custom:9' }), 'item:custom:9');
  });

  it('sépare les barèmes par monnaie sans jamais les additionner', () => {
    const lignes = comparerRachats([pa(5), pa(40, 1), rep(2), rep(12, 1)], 5);
    assert.equal(lignes.length, 2, 'PA et réputation restent deux comparaisons');
    const enPa = lignes.find((m) => m.paiement === 'pa');
    const enRep = lignes.find((m) => m.paiement === 'reputation');
    assert.equal(enPa.unite.montant, 5);
    assert.equal(enPa.lot.montant, 40);
    assert.equal(enRep.lot.montant, 12);
  });

  it('nomme la monnaie sans inventer de conversion', () => {
    const items = new Map([[9, { id: 9, nom: 'Écaille du devin' }]]);
    assert.equal(monnaieLabel({ paiement: 'pa' }), 'PA');
    assert.equal(monnaieLabel({ paiement: 'reputation', factionNom: 'Ondiens' }), 'réputation Ondiens');
    assert.equal(monnaieLabel({ paiement: 'item', refCode: 'custom:9' }, items), 'Écaille du devin');
  });
});

describe('lot contre unité', () => {
  it('tranche pour le lot quand il rapporte plus que la somme des pièces', () => {
    // 5 pièces à 5 PA = 25 PA, contre 40 PA le lot complet.
    const [m] = comparerRachats([pa(5), pa(40, 1)], 5);
    assert.equal(m.totalUnite, 25);
    assert.equal(m.ecart, 15);
    assert.equal(Math.round(m.pct), 60);
    assert.equal(m.verdict, 'lot');
  });

  it("tranche pour l'unité quand le lot est une mauvaise affaire", () => {
    const [m] = comparerRachats([pa(10), pa(40, 1)], 5);
    assert.equal(m.totalUnite, 50);
    assert.equal(m.ecart, -10);
    assert.equal(m.verdict, 'unite');
  });

  it('dit « équivalent » plutôt que de départager au centime', () => {
    const [m] = comparerRachats([pa(8), pa(40, 1)], 5);
    assert.equal(m.ecart, 0);
    assert.equal(m.verdict, 'equivalent');
  });

  it('ne tranche pas quand la taille du set est inconnue', () => {
    // Sans le nombre de pièces EN JEU, le total à l'unité n'existe pas : le
    // lot ne se compare à rien, et on ne l'invente pas.
    const [m] = comparerRachats([pa(5), pa(40, 1)], 0);
    assert.equal(m.totalUnite, null);
    assert.equal(m.verdict, null);
    assert.equal(m.lot.montant, 40, 'ce qu\'on sait reste affiché');
  });

  it('ne tranche pas quand un seul des deux barèmes est connu', () => {
    const [uniteSeule] = comparerRachats([pa(5)], 5);
    assert.equal(uniteSeule.verdict, null);
    assert.equal(uniteSeule.totalUnite, 25);
    const [lotSeul] = comparerRachats([pa(40, 1)], 5);
    assert.equal(lotSeul.verdict, null);
    assert.equal(lotSeul.unite, null);
  });

  it('garde la meilleure offre quand plusieurs PNJ paient la même monnaie', () => {
    const [m] = comparerRachats([
      pa(5, 0, { pnj: 'Colporteur' }),
      pa(7, 0, { pnj: 'Comptoir' }),
      pa(40, 1),
    ], 5);
    assert.equal(m.unite.montant, 7);
    assert.equal(m.unite.pnj, 'Comptoir', "c'est chez lui qu'on ira");
    assert.equal(m.totalUnite, 35);
    assert.equal(m.verdict, 'lot');
  });

  it('renvoie une liste vide sans barème', () => {
    assert.deepEqual(comparerRachats([], 5), []);
    assert.deepEqual(comparerRachats(null, 5), []);
  });
});

describe('prix de repli pour les calculs', () => {
  const rachats = [pa(5), pa(40, 1), rep(2)];

  it("prend le meilleur prix unitaire en PA, jamais celui du lot", () => {
    // Le lot vaut 8 PA la pièce, mais seulement si on a le set complet : ce
    // n'est pas la valeur d'un joyau isolé.
    assert.equal(prixUnitaireRachat(rachats, 1), 5);
  });

  it('ignore la réputation — ce n\'est pas un prix', () => {
    assert.equal(prixUnitaireRachat([rep(2), rep(12, 1)], 1), null);
  });

  it('renvoie null quand rien ne fixe de prix', () => {
    assert.equal(prixUnitaireRachat([], 1), null);
    assert.equal(prixUnitaireRachat([pa(0)], 1), null, 'un rachat à 0 ne vaut pas prix');
  });

  it('respecte un barème propre à une pièce du set', () => {
    // Une ligne visant un item précis ne vaut que pour lui ; les autres membres
    // gardent le barème du set.
    const avecSurcharge = [pa(5), { ...pa(30), uniqueItemId: 7 }];
    assert.equal(prixUnitaireRachat(avecSurcharge, 7), 30);
    assert.equal(prixUnitaireRachat(avecSurcharge, 8), 5);
    assert.equal(rachatVise({ uniqueItemId: null }, 8), true);
    assert.equal(rachatVise({ uniqueItemId: 7 }, 8), false);
  });
});
