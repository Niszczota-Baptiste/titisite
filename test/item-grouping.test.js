import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AXES_ORDRE, SANS, axeLabel, axeMultiple, grouper,
} from '../src/components/quests/items/grouping.js';

// Les axes de rangement du catalogue d'items. Fonctions pures : testées ici,
// hors React, comme les maths de butin.

const CATEGORIES = {
  contenant: { label: 'Contenant', icon: '🎁' },
  ressource: { label: 'Ressource', icon: '⛏️' },
  equipement: { label: 'Équipement', icon: '⚔️' },
};
const ORDRE = ['contenant', 'ressource', 'equipement'];
const ctx = {
  categories: CATEGORIES,
  categorieOrdre: ORDRE,
  rarities: [
    { id: 1, nom: 'Commun', couleur: '#999', ordre: 1 },
    { id: 2, nom: 'Légendaire', couleur: '#e8c86a', ordre: 5 },
  ],
  sets: [{ id: 7, nom: 'Joyaux bleus', couleur: '#7bd3e8' }],
  factions: [{ id: 3, nom: 'Ondiens', couleur: '#7be3a8' }],
};

const items = [
  { id: 1, nom: 'Géode', categorie: 'contenant', rareteId: 2, setId: null, factionId: 3, contenants: [] },
  { id: 2, nom: 'Spinelle', categorie: 'ressource', rareteId: 1, setId: 7, factionId: null, contenants: [{ id: 1, nom: 'Géode' }] },
  { id: 3, nom: 'Trident', categorie: 'equipement', rareteId: null, setId: null, factionId: null, contenants: [{ id: 1, nom: 'Géode' }, { id: 9, nom: 'Écaille' }] },
];

describe('axes de rangement du catalogue', () => {
  it("« sans sections » ne range rien (la grille reste à plat)", () => {
    assert.equal(grouper(items, 'aucun', ctx), null);
    assert.equal(grouper(items, 'axe-inconnu', ctx), null);
  });

  it('range par catégorie, dans l\'ordre de référence', () => {
    const sections = grouper(items, 'categorie', ctx);
    assert.deepEqual(sections.map((s) => s.label), ['Contenant', 'Ressource', 'Équipement']);
    assert.deepEqual(sections.map((s) => s.items.length), [1, 1, 1]);
    assert.equal(sections[0].icon, '🎁');
  });

  it("n'invente pas de section vide", () => {
    const sections = grouper([items[0]], 'categorie', ctx);
    assert.equal(sections.length, 1, 'seule la catégorie présente sort');
    assert.equal(sections[0].label, 'Contenant');
  });

  it('range par rareté, la plus remarquable en tête, et isole les non renseignées', () => {
    const sections = grouper(items, 'rarete', ctx);
    assert.deepEqual(sections.map((s) => s.label), ['Légendaire', 'Commun', 'Rareté non renseignée']);
    assert.equal(sections[0].color, '#e8c86a', 'la section porte la couleur du palier');
    // Le fourre-tout est toujours la DERNIÈRE section, jamais intercalé.
    assert.equal(sections.at(-1).key, SANS);
    assert.equal(sections.at(-1).items[0].nom, 'Trident');
  });

  it('range par set et par peuple, avec leur fourre-tout respectif', () => {
    const parSet = grouper(items, 'set', ctx);
    assert.deepEqual(parSet.map((s) => s.label), ['Joyaux bleus', 'Hors set']);
    assert.equal(parSet[1].items.length, 2);

    const parPeuple = grouper(items, 'faction', ctx);
    assert.deepEqual(parPeuple.map((s) => s.label), ['Ondiens', 'Sans peuple connu']);
    assert.equal(parPeuple[0].color, '#7be3a8');
  });

  it('range par contenant : un objet qui sort de deux géodes est sous les deux', () => {
    const sections = grouper(items, 'contenant', ctx);
    // Trié par taille de section : la géode (2 objets) devant l'écaille (1).
    assert.deepEqual(sections.map((s) => s.label), ['Géode', 'Écaille', "Ne sort d'aucun contenant connu"]);
    assert.deepEqual(sections[0].items.map((i) => i.nom), ['Spinelle', 'Trident']);
    assert.deepEqual(sections[1].items.map((i) => i.nom), ['Trident']);
    // La géode elle-même ne sort de rien : elle atterrit dans le fourre-tout.
    assert.deepEqual(sections[2].items.map((i) => i.nom), ['Géode']);
    // Ranger n'est pas partitionner : la somme des sections dépasse le nombre
    // d'objets, et l'axe le déclare pour que l'écran puisse le dire.
    assert.equal(sections.reduce((n, s) => n + s.items.length, 0), 4);
    assert.equal(axeMultiple('contenant'), true);
    assert.equal(axeMultiple('categorie'), false);
  });

  it('chaque axe du sélecteur porte un libellé', () => {
    for (const k of AXES_ORDRE) {
      assert.ok(axeLabel(k).length > 0, k);
      // Et sait répondre sur un catalogue vide sans casser.
      assert.doesNotThrow(() => grouper([], k, ctx));
    }
  });
});
