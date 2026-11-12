import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findAll, hitFrom, wikiTargetAt, wikiTargets } from '../src/components/author/editorOps.js';

// Outils purs de l'éditeur d'écriture : recherche dans le texte et liens.

describe('éditeur — recherche dans le texte', () => {
  const text = 'Élise relit le pacte. ÉLISE hésite ; elise part.\n민지는 편지를 읽는다. 민지가 웃는다.';

  it('ignore la casse et les accents, sans décaler les positions', () => {
    const hits = findAll(text, 'elise');
    assert.equal(hits.length, 3);
    assert.deepEqual(hits.map(([s, e]) => text.slice(s, e)), ['Élise', 'ÉLISE', 'elise']);
    assert.deepEqual(findAll(text, 'ÉLISE').length, 3);
  });

  it('cherche le coréen tel quel', () => {
    const hits = findAll(text, '민지');
    assert.deepEqual(hits.map(([s, e]) => text.slice(s, e)), ['민지', '민지']);
    assert.equal(findAll(text, '편지를')[0][0], text.indexOf('편지를'));
  });

  it('les positions restent justes après un caractère décomposé ou un émoji', () => {
    const tricky = 'Café 🙂 œuvre — fin, Fin.';
    const hits = findAll(tricky, 'fin');
    assert.deepEqual(hits.map(([s, e]) => tricky.slice(s, e)), ['fin', 'Fin']);
    assert.deepEqual(findAll(tricky, 'œuvre').map(([s, e]) => tricky.slice(s, e)), ['œuvre']);
  });

  it('une recherche vide ne trouve rien, et les occurrences ne se chevauchent pas', () => {
    assert.deepEqual(findAll(text, '   '), []);
    assert.equal(findAll('aaaa', 'aa').length, 2);
  });

  it('part du curseur et reboucle', () => {
    const hits = findAll(text, 'elise');
    assert.equal(hitFrom(hits, 0), 0);
    assert.equal(hitFrom(hits, 10), 1);
    assert.equal(hitFrom(hits, text.length), 0);
    assert.equal(hitFrom([], 3), -1);
  });
});

describe('éditeur — fiches liées', () => {
  const text = 'Elle revoit [[Élise Varnier|Élise]] à [[Valcendre]], puis [[élise varnier]] encore.';

  it('reconnaît le lien sous le curseur', () => {
    assert.equal(wikiTargetAt(text, text.indexOf('Varnier')), 'Élise Varnier');
    assert.equal(wikiTargetAt(text, text.indexOf('|Élise') + 3), 'Élise Varnier');
    assert.equal(wikiTargetAt(text, text.indexOf('Valcendre') + 2), 'Valcendre');
    assert.equal(wikiTargetAt(text, 3), null);
    assert.equal(wikiTargetAt(text, text.indexOf(' à ') + 1), null, 'entre deux liens');
  });

  it('liste les fiches citées une seule fois, dans l\'ordre', () => {
    assert.deepEqual(wikiTargets(text), ['Élise Varnier', 'Valcendre']);
    assert.deepEqual(wikiTargets('rien ici'), []);
  });
});
