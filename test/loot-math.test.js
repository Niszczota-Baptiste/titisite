import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  croiserObservations, esperance, fiabilite, lignesRetenues, probaDe, quantiteMoyenne,
  reliquat, sommeProbabilites, verdictOuvrir, wilson,
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

// ── L'observé fait foi ─────────────────────────────────────────────────────
// Le serveur ne publie pas ses tables : la colonne « probabilité » est saisie à
// la main, souvent à 0 ou à 100 %. Dès qu'une ouverture est relevée, c'est la
// mesure qui pilote le calcul — c'est la règle 3 de loot.js.

describe("la mesure prime sur la probabilité saisie", () => {
  // Le cas réel qui a motivé la bascule : tout est déclaré à 0 % sauf un
  // « Rien / commun » à 100 %, alors que 114 ouvertures disent tout autre chose.
  const loot = [
    { id: 1, resultatType: 'autre', resultatRef: 'rien', label: 'Rien / commun', probabilite: 100, quantiteMin: 1, quantiteMax: 1 },
    { id: 2, resultatType: 'unique_item', resultatUniqueId: 7, label: 'Spinelle', probabilite: 0, quantiteMin: 1, quantiteMax: 1, ciblePrix: 1, ciblePrixUnite: 'pa' },
  ];
  const resume = {
    total: 100,
    parResultat: [
      { key: 'autre:rien', n: 22, label: 'Rien / commun', quantiteTotale: 22, resultatType: 'autre', resultatRef: 'rien' },
      { key: 'unique:7', n: 21, label: 'Spinelle', quantiteTotale: 21, resultatType: 'unique_item', resultatUniqueId: 7 },
      { key: 'unique:9', n: 57, label: 'Alexandrite', quantiteTotale: 114, resultatType: 'unique_item', resultatUniqueId: 9 },
    ],
  };

  it('bascule en base observée dès la première ouverture relevée', () => {
    assert.equal(croiserObservations(loot, resume).base, 'observee');
    assert.equal(croiserObservations(loot, { total: 0, parResultat: [] }).base, 'declaree');
    // …et on peut revenir à la table saisie pour comparer.
    assert.equal(croiserObservations(loot, resume, { mode: 'declare' }).base, 'declaree');
  });

  it('remplace le % déclaré par le % mesuré, en gardant le déclaré sous la main', () => {
    const { lignes } = croiserObservations(loot, resume);
    assert.equal(lignes[0].probabiliteDeclaree, 100);
    assert.equal(probaDe(lignes[0]), 22, '22 sur 100, pas les 100 % supposés');
    assert.equal(probaDe(lignes[1]), 21, '0 % déclaré mais 21 tirages : la mesure gagne');
  });

  it('compte les résultats sortis mais jamais déclarés', () => {
    const croisement = croiserObservations(loot, resume);
    const retenues = lignesRetenues(croisement);
    assert.equal(retenues.length, 3, 'les 2 lignes déclarées + le résultat hors table');
    // Une répartition mesurée somme à 100 % par construction — c'est justement
    // ce qu'une table devinée ne fait jamais.
    assert.equal(Math.round(sommeProbabilites(retenues)), 100);
    // Faute de fourchette déclarée, sa quantité moyenne est celle relevée.
    assert.equal(quantiteMoyenne(retenues[2]), 2);
  });

  it('en mode déclaré, les lignes hors table ne comptent pas', () => {
    const croisement = croiserObservations(loot, resume, { mode: 'declare' });
    assert.deepEqual(lignesRetenues(croisement), croisement.lignes);
    assert.equal(sommeProbabilites(lignesRetenues(croisement)), 100);
  });

  it("retrouve le prix d'un résultat hors table via le catalogue", () => {
    const itemsById = new Map([[9, { id: 9, nom: 'Alexandrite', prixVente: 5, prixUnite: 'pa' }]]);
    const croisement = croiserObservations(loot, resume, { itemsById });
    const hors = croisement.inattendus[0];
    assert.equal(hors.ciblePrix, 5);
    // 57 % × 2 exemplaires × 5 PA = 5,7 ; + 21 % × 1 × 1 PA = 0,21.
    const calc = esperance({ prixUnite: 'pa' }, lignesRetenues(croisement));
    assert.ok(Math.abs(calc.valeur - 5.91) < 0.001);
    // Sans catalogue, il reste compté comme non valorisé plutôt que comme zéro.
    const sansPrix = esperance({ prixUnite: 'pa' }, lignesRetenues(croiserObservations(loot, resume)));
    assert.equal(Math.round(sansPrix.nonValorisePct), 79);
  });

  it('compte 0 % — et non « inconnu » — une ligne déclarée jamais tirée', () => {
    const resumeSansSpinelle = {
      total: 40,
      parResultat: [{ key: 'autre:rien', n: 40, label: 'Rien / commun', quantiteTotale: 40 }],
    };
    const { lignes, jamaisVues } = croiserObservations(loot, resumeSansSpinelle);
    assert.equal(probaDe(lignes[1]), 0, '0 sur 40 est un résultat de mesure, pas une absence');
    assert.equal(lignes[1].observations, null);
    assert.equal(jamaisVues, 1);
  });

  it("qualifie la taille de l'échantillon", () => {
    assert.equal(fiabilite(0), 'aucune');
    assert.equal(fiabilite(9), 'faible');
    assert.equal(fiabilite(10), 'moyenne');
    assert.equal(fiabilite(29), 'moyenne');
    assert.equal(fiabilite(30), 'bonne');
  });
});
