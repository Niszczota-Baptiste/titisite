import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  croiserObservations, esperance, quantiteMoyenne, reliquat, sommeProbabilites,
  verdictOuvrir, wilson,
} from '../src/components/quests/items/loot.js';

// Le « vendre ou ouvrir ? » repose entièrement sur ces fonctions : elles sont
// pures et testées ici, hors React.

const pa = (probabilite, min, max) => ({ resultatType: 'pa', probabilite, quantiteMin: min, quantiteMax: max });
const unique = (probabilite, prix, unite = 'pa', qte = 1) => ({
  resultatType: 'unique_item', resultatUniqueId: 42, probabilite,
  quantiteMin: qte, quantiteMax: qte, ciblePrix: prix, ciblePrixUnite: unite,
});
const codex = (probabilite) => ({ resultatType: 'item_referentiel', resultatRef: 'diamond', probabilite, quantiteMin: 1, quantiteMax: 1 });

describe('table de butin — sommes et quantités', () => {
  it('somme les probabilités sans les corriger', () => {
    assert.equal(sommeProbabilites([pa(60, 1, 1), codex(22.5)]), 82.5);
    assert.equal(sommeProbabilites([pa(80, 1, 1), pa(45, 1, 1)]), 125, 'un dépassement reste visible');
    assert.equal(sommeProbabilites([]), 0);
  });

  it('calcule le reliquat à déclarer, jamais négatif', () => {
    assert.equal(reliquat([pa(90, 1, 1)]), 10);
    assert.equal(reliquat([pa(125, 1, 1)]), 0);
  });

  it('prend le milieu de la fourchette de quantité', () => {
    assert.equal(quantiteMoyenne(pa(1, 10, 50)), 30);
    assert.equal(quantiteMoyenne(pa(1, 4, 4)), 4);
  });
});

describe('espérance d\'une ouverture', () => {
  const contenant = { prixVente: 120, prixUnite: 'pa' };

  it('pondère quantité moyenne et probabilité', () => {
    // 60 % × 30 PA = 18 ; 8 % × 2 × 40 PA = 6,4 → 24,4
    const r = esperance(contenant, [pa(60, 10, 50), unique(8, 40, 'pa', 2)]);
    assert.equal(r.unite, 'pa');
    assert.ok(Math.abs(r.valeur - 24.4) < 1e-9, `valeur = ${r.valeur}`);
    assert.equal(r.nonValorisePct, 0);
  });

  it('EXCLUT les résultats sans prix au lieu de les compter zéro', () => {
    const r = esperance(contenant, [pa(60, 10, 50), codex(22.5)]);
    assert.ok(Math.abs(r.valeur - 18) < 1e-9, 'le diamant ne tire pas la valeur vers le bas');
    assert.equal(r.nonValorisePct, 22.5, 'sa part est remontée pour l\'affichage');
    assert.equal(r.lignes[1].valorisee, false);
  });

  it('ne convertit JAMAIS entre monnaies', () => {
    // Un résultat valorisé en écailles dans un contenant coté en PA.
    const r = esperance(contenant, [unique(50, 3, 'custom:4')]);
    assert.equal(r.valeur, 0);
    assert.equal(r.nonValorisePct, 50);

    // Même table, contenant coté dans la même monnaie → cette fois ça compte.
    const r2 = esperance({ prixVente: 2, prixUnite: 'custom:4' }, [unique(50, 3, 'custom:4')]);
    assert.ok(Math.abs(r2.valeur - 1.5) < 1e-9);
    assert.equal(r2.nonValorisePct, 0);
  });

  it('table vide → espérance nulle, pas d\'erreur', () => {
    const r = esperance(contenant, []);
    assert.equal(r.valeur, 0);
    assert.equal(r.sommeProbabilites, 0);
  });
});

describe('verdict vendre / ouvrir', () => {
  it('tranche au-delà de la marge, sinon déclare équivalent', () => {
    assert.equal(verdictOuvrir({ valeur: 200, prixVente: 120 }).verdict, 'ouvrir');
    assert.equal(verdictOuvrir({ valeur: 50, prixVente: 120 }).verdict, 'vendre');
    assert.equal(verdictOuvrir({ valeur: 125, prixVente: 120 }).verdict, 'equivalent');
    // Juste au bord des ±10 % : pas de tranchage abusif.
    assert.equal(verdictOuvrir({ valeur: 132, prixVente: 120 }).verdict, 'equivalent');
    assert.equal(verdictOuvrir({ valeur: 133, prixVente: 120 }).verdict, 'ouvrir');
  });

  it('reste muet quand la comparaison n\'a pas de sens', () => {
    assert.equal(verdictOuvrir({ valeur: 100, prixVente: null }), null);
    assert.equal(verdictOuvrir({ valeur: 100, prixVente: 0 }), null);
    assert.equal(verdictOuvrir({ valeur: 0, prixVente: 120 }), null, 'aucun résultat valorisé');
  });

  it('donne l\'écart relatif, pour l\'afficher', () => {
    assert.ok(Math.abs(verdictOuvrir({ valeur: 180, prixVente: 120 }).ecart - 0.5) < 1e-9);
  });
});

describe('intervalle de Wilson', () => {
  it('encadre la proportion observée', () => {
    const w = wilson(2, 12);
    assert.ok(Math.abs(w.p - 16.666) < 0.01);
    assert.ok(w.bas > 0 && w.bas < w.p, `bas = ${w.bas}`);
    assert.ok(w.haut > w.p && w.haut < 100, `haut = ${w.haut}`);
  });

  it('reste borné à [0,100] dans les cas extrêmes', () => {
    const zero = wilson(0, 5);
    assert.equal(zero.p, 0);
    assert.equal(zero.bas, 0);
    assert.ok(zero.haut > 0 && zero.haut <= 100);
    const plein = wilson(7, 7);
    assert.equal(plein.p, 100);
    assert.ok(plein.haut <= 100);
    assert.ok(plein.bas < 100);
  });

  it('se resserre quand l\'effectif grandit', () => {
    const petit = wilson(20, 100);
    const grand = wilson(200, 1000);
    assert.ok((grand.haut - grand.bas) < (petit.haut - petit.bas));
  });

  it('sans observation : tout à zéro, pas de NaN', () => {
    const w = wilson(0, 0);
    assert.deepEqual(w, { p: 0, bas: 0, haut: 0, n: 0 });
  });
});

describe('croisement déclaré ↔ observé', () => {
  const loot = [
    { resultatType: 'unique_item', resultatUniqueId: 42, probabilite: 8 },
    { resultatType: 'pa', probabilite: 60 },
  ];
  const resume = {
    total: 12,
    parResultat: [
      { key: 'unique:42', n: 2, label: 'Écaille du devin' },
      { key: 'pa:', n: 9, label: 'Pièces' },
      { key: 'item:emerald', n: 1, label: 'Émeraude' },
    ],
  };

  it('attache son taux observé à chaque ligne déclarée', () => {
    const { lignes } = croiserObservations(loot, resume);
    assert.equal(lignes[0].observations.k, 2);
    assert.ok(Math.abs(lignes[0].observations.p - 16.666) < 0.01);
    assert.equal(lignes[1].observations.k, 9);
  });

  it('signale les résultats obtenus mais jamais déclarés', () => {
    const { inattendus } = croiserObservations(loot, resume);
    assert.equal(inattendus.length, 1);
    assert.equal(inattendus[0].label, 'Émeraude');
    // `n` doit rester le NOMBRE D'OCCURRENCES (1), pas la taille d'échantillon
    // (12) que renvoie aussi wilson() — sinon on affiche « 12× sur 12 ».
    assert.equal(inattendus[0].n, 1);
    assert.equal(inattendus[0].observations.k, 1);
    assert.equal(inattendus[0].observations.n, 12);
    assert.ok(inattendus[0].observations.haut > 0);
  });

  it('sans journal : aucune observation attachée, aucun inattendu', () => {
    const { lignes, inattendus, total } = croiserObservations(loot, { total: 0, parResultat: [] });
    assert.equal(total, 0);
    assert.equal(lignes[0].observations, null);
    assert.deepEqual(inattendus, []);
  });
});
