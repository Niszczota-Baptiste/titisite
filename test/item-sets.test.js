import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GEM_SETS, setSlugFromLore } from '../server/quests/item-sets.js';

// Le rattachement d'un item à son set se DÉDUIT du lore déjà saisi en jeu
// (« Fait partie du set des joyaux bleus »). Cette fonction est le seul endroit
// où cette lecture a lieu : elle est pure, donc testée directement.

describe('sets de joyaux — table de référence', () => {
  it('décrit les 6 sets du livre, du plus petit au plus précieux', () => {
    assert.deepEqual(
      GEM_SETS.map((s) => [s.slug, s.taille]),
      [
        ['joyaux-verts', 2],
        ['joyaux-jaunes', 3],
        ['joyaux-violets', 4],
        ['joyaux-blancs', 5],
        ['joyaux-bleus', 5],
        ['joyaux-legendaires', 5],
      ],
    );
    assert.equal(new Set(GEM_SETS.map((s) => s.slug)).size, GEM_SETS.length, 'slugs uniques');
  });
});

describe('sets de joyaux — lecture du lore', () => {
  it('reconnaît le set, au singulier comme au pluriel, avec ou sans accent', () => {
    const cas = [
      ['Très rare ! Fait partie du set des joyaux blanc, Vendez-le', 'joyaux-blancs'],
      ['Très rare ! Fait partie du set des joyaux blancs.', 'joyaux-blancs'],
      ['Très rare ! Fait partie du set des joyaux bleus. Vendez-le', 'joyaux-bleus'],
      ['Rare ! Fait partie du set des joyaux violets, Vendez-le', 'joyaux-violets'],
      ['Peu commun Fait partie du set des joyaux verts', 'joyaux-verts'],
      ['Fait partie du set des joyaux jaunes.', 'joyaux-jaunes'],
      ['Fait partie du set des joyaux légendaires !', 'joyaux-legendaires'],
      ['FAIT PARTIE DU SET DE JOYAUX BLEU', 'joyaux-bleus'],
    ];
    for (const [lore, attendu] of cas) {
      assert.equal(setSlugFromLore(lore), attendu, lore);
    }
  });

  it('ne rattache RIEN quand le lore ne désigne aucun set', () => {
    const cas = [
      'Commun Est le seul joyau rouge, Vendez-le',       // un joyau hors set
      'Une géode contenant sans doute un trésor précieux.',
      'Fait partie du set des joyaux turquoise',          // couleur inconnue
      'Joyau ayant une certaine rareté, vendable contre une certaine somme',
      '',
      null,
      undefined,
    ];
    for (const lore of cas) {
      assert.equal(setSlugFromLore(lore), null, String(lore));
    }
  });
});
