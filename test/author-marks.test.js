import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as server from '../server/author/marks.js';
import * as client from '../src/components/author/marks.js';
import { countWords as serverWords } from '../server/author/text.js';
import { textStats } from '../src/components/author/text.js';

// Marques de travail de l'auteur ({{reprendre: …}}, {{question: …}},
// {{variante: A || B}}) : elles restent privées. Le serveur et le client
// doivent les lire et les retirer exactement pareil.

const CASES = [
  ['', ''],
  ['Sans marque, [[Lien]] et {{kr:terme}} intacts.', 'Sans marque, [[Lien]] et {{kr:terme}} intacts.'],
  ['Elle {{reprendre: marcha longtemps}} vers le phare.', 'Elle marcha longtemps vers le phare.'],
  ['Elle {{à reprendre: marcha}} vite.', 'Elle marcha vite.'],
  ['Il sait. {{question: depuis quand ?}} Elle non.', 'Il sait. Elle non.'],
  ['Avant.\n{{question: vérifier la date}}\nAprès.', 'Avant.\nAprès.'],
  ['{{question: a}} {{question: b}}\nSuite.', 'Suite.'],
  ['Fin de ligne {{question: ?}}', 'Fin de ligne '],
  ['Il {{variante: sourit || détourna les yeux}}, enfin.', 'Il sourit, enfin.'],
  ['{{variante: Une seule version}}', 'Une seule version'],
  ['{{Variante: A ||B}} et {{QUESTION: x}}fin', 'A et fin'],
  ['{{reprendre: sur\ndeux lignes}}', 'sur\ndeux lignes'],
  ['Jamais refermée {{question: oups', 'Jamais refermée {{question: oups'],
  ['{{reprendre: **gras** et [[Fiche]]}}', '**gras** et [[Fiche]]'],
];

describe('marques de l\'auteur', () => {
  it('ce qu\'un lecteur voit : le passage reste, la question disparaît, la variante se réduit à la version gardée', () => {
    for (const [src, want] of CASES) {
      assert.equal(client.cleanMarks(src), want, `client : ${JSON.stringify(src)}`);
      assert.equal(server.cleanMarks(src), want, `serveur : ${JSON.stringify(src)}`);
    }
  });

  it('serveur et client repèrent les mêmes marques aux mêmes endroits', () => {
    for (const [src] of CASES) {
      const pick = (list) => list.map((m) => [m.type, m.start, m.end, m.body, m.a ?? null, m.b ?? null]);
      assert.deepEqual(pick(server.findMarks(src)), pick(client.findMarks(src)));
    }
  });

  it('une question ou une autre version ne compte pas dans les mots', () => {
    const src = 'Un deux {{question: trois quatre cinq}} six {{variante: sept || huit neuf dix}}.';
    assert.equal(serverWords(src), 4);
    assert.equal(textStats(src).words, 4);
    assert.equal(textStats('{{reprendre: un deux}}').words, 2, 'le passage à reprendre fait partie du texte');
  });

  it('poser une marque sur une sélection', () => {
    assert.deepEqual(client.newMark('reprendre', 'ce passage'), { text: '{{reprendre: ce passage}}', caret: 23, after: false });
    assert.equal(client.newMark('question', 'ignoré').text, '{{question: }}');
    assert.equal(client.newMark('question').after, true, 'la question se pose après la sélection, sans l\'envelopper');
    const v = client.newMark('variante', 'il sourit');
    assert.equal(v.text, '{{variante: il sourit || }}');
    assert.equal(v.text.slice(0, v.caret), '{{variante: il sourit || ', 'le curseur attend la seconde version');
  });

  it('inverser les deux versions, puis n\'en garder qu\'une', () => {
    const src = 'Il {{variante: sourit || détourna les yeux}}, enfin.';
    const apply = (text, r) => text.slice(0, r.start) + r.text + text.slice(r.end);
    const [m] = client.findMarks(src);
    const swapped = apply(src, client.swapVariant(m));
    assert.equal(swapped, 'Il {{variante: détourna les yeux || sourit}}, enfin.');
    assert.equal(client.cleanMarks(swapped), 'Il détourna les yeux, enfin.');
    assert.equal(apply(src, client.resolveMark(src, m, 'b')), 'Il détourna les yeux, enfin.');
    assert.equal(apply(src, client.resolveMark(src, m, 'a')), 'Il sourit, enfin.');
  });

  it('lever une marque ne laisse ni trou ni ligne vide', () => {
    const apply = (text, r) => text.slice(0, r.start) + r.text + text.slice(r.end);
    const a = 'Avant.\n{{question: vérifier}}\nAprès.';
    assert.equal(apply(a, client.resolveMark(a, client.findMarks(a)[0])), 'Avant.\nAprès.');
    const b = 'Il sait. {{question: depuis quand ?}} Elle non.';
    assert.equal(apply(b, client.resolveMark(b, client.findMarks(b)[0])), 'Il sait. Elle non.');
    const c = 'Elle {{reprendre: marcha}} vite.';
    assert.equal(apply(c, client.resolveMark(c, client.findMarks(c)[0])), 'Elle marcha vite.');
  });

  it('un texte énorme sans fermeture se lit vite', () => {
    const big = `${'{{question: '.repeat(2000)}${'mot '.repeat(40000)}`;
    const t0 = Date.now();
    assert.equal(client.cleanMarks(big), big);
    assert.equal(server.cleanMarks(big), big);
    assert.ok(Date.now() - t0 < 2000);
  });
});
