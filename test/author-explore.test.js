import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays, isoDay, pickOldIdea, pickPair, pickQuestion, pickVariation, trailAsNote,
} from '../src/components/author/explore.js';

// Mode Explorer : pistes locales, tirées des éléments du projet. Tirages
// rendus reproductibles par un générateur injecté.

function seq(...values) {
  let i = 0;
  return () => values[i++ % values.length];
}
const NOW = 1_800_000_000;
const DAY = 86_400;
const TODAY = '2027-01-15';

describe('explorer — une ancienne idée à reprendre', () => {
  const notes = [
    { id: 1, title: 'Le phare', status: 'brute', updatedAt: NOW - 90 * DAY },
    { id: 2, title: 'La lettre', status: 'a_developper', updatedAt: NOW - 2 * DAY },
    { id: 3, title: 'Finie', status: 'validee', updatedAt: NOW - 400 * DAY },
    { id: 4, title: 'Écartée', status: 'abandonnee', updatedAt: NOW - 400 * DAY },
    { id: 5, title: 'Plus tard', status: 'brute', updatedAt: NOW - 200 * DAY, revisitOn: '2027-06-01' },
  ];

  it('propose une idée ouverte et ancienne — jamais validée, abandonnée, récente ou remise à plus tard', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const t = pickOldIdea(notes, { today: TODAY, nowS: NOW, rng: () => r });
      assert.equal(t.entity.id, 1);
      assert.match(t.reason, /Pas rouverte depuis 3 mois/);
    }
    assert.equal(pickOldIdea(notes.filter((n) => n.id !== 1), { today: TODAY, nowS: NOW }), null, 'rien à proposer : on ne force pas');
  });

  it('une idée remise « à revoir plus tard » revient le jour dit, en priorité', () => {
    const due = [...notes, { id: 6, title: 'Le serment', status: 'brute', updatedAt: NOW - DAY, revisitOn: '2027-01-10' }];
    const t = pickOldIdea(due, { today: TODAY, nowS: NOW, rng: () => 0 });
    assert.equal(t.entity.id, 6);
    assert.match(t.reason, /remise à plus tard/);
    assert.equal(pickOldIdea(due, { today: '2027-01-09', nowS: NOW, rng: () => 0 }).entity.id, 1, 'la veille, elle n\'est pas proposée');
    assert.equal(pickOldIdea(due, { today: TODAY, nowS: NOW, rng: () => 0, exclude: [6] }).entity.id, 1, '« autre piste » passe à la suivante');
  });

  it('calcule les dates de report', () => {
    assert.equal(addDays('2027-01-15', 30), '2027-02-14');
    assert.equal(addDays('2027-12-20', 30), '2028-01-19');
    assert.equal(isoDay(new Date(2027, 0, 5)), '2027-01-05');
  });
});

describe('explorer — deux éléments à mettre en relation', () => {
  const elements = [
    { id: 1, kind: 'character', title: 'Élise' },
    { id: 2, kind: 'place', title: 'Valcendre' },
    { id: 3, kind: 'note', title: 'Idée privée' },
    { id: 4, kind: 'character', title: 'Maël' },
  ];

  it('ne propose que des éléments pas encore reliés, jamais une idée, jamais un élément avec lui-même', () => {
    const edges = [{ from: 1, to: 2 }];
    for (let i = 0; i < 200; i += 1) {
      const t = pickPair(elements, edges);
      assert.ok(t, 'une paire existe');
      const ids = [t.a.id, t.b.id].sort();
      assert.notDeepEqual(ids, [1, 2], 'déjà reliés');
      assert.ok(!ids.includes(3), 'pas la boîte à idées');
      assert.notEqual(t.a.id, t.b.id);
      assert.ok(t.prompt.includes(t.a.title) && t.prompt.includes(t.b.title));
    }
  });

  it('rend null quand tout est déjà relié ou qu\'il n\'y a pas deux éléments', () => {
    assert.equal(pickPair([elements[0]], []), null);
    assert.equal(pickPair(elements.slice(0, 2), [{ from: 2, to: 1 }]), null);
    assert.equal(pickPair([{ id: 1, kind: 'chapter', title: 'Un' }, { id: 2, kind: 'chapter', title: 'Deux' }], []), null);
  });
});

describe('explorer — question ouverte et variation', () => {
  const scenes = [{ id: 10, kind: 'chapter', title: 'L\'orage' }];
  const chars = [{ id: 1, kind: 'character', title: 'Élise' }];

  it('pose une question sur une scène, parfois à travers un personnage', () => {
    const plain = pickQuestion(scenes, chars, { rng: seq(0, 0, 0.9, 0) });
    assert.equal(plain.entity.id, 10);
    assert.equal(plain.about, null);
    assert.ok(plain.prompt.includes('L\'orage') && plain.prompt.endsWith('?'));
    const withChar = pickQuestion(scenes, chars, { rng: seq(0, 0, 0.1, 0) });
    assert.equal(withChar.about.id, 1);
    assert.ok(withChar.prompt.includes('Élise'));
    assert.equal(pickQuestion([], chars), null);
  });

  it('propose une variation de point de vue, de contrainte ou d\'ambiance, sans nommer un personnage absent', () => {
    for (const axis of ['point de vue', 'contrainte', 'ambiance']) {
      const t = pickVariation(scenes, chars, { axis, rng: () => 0 });
      assert.equal(t.axis, axis);
      assert.ok(t.prompt.includes('L\'orage'));
      assert.ok(!t.prompt.includes('{'), 'gabarit entièrement rempli');
    }
    for (let i = 0; i < 50; i += 1) {
      const alone = pickVariation(scenes, [], { axis: 'point de vue' });
      assert.ok(!alone.prompt.includes('…') && !alone.prompt.includes('{autre}'), alone.prompt);
    }
    const music = pickVariation([{ id: 20, kind: 'sound', title: 'Valse du port' }], [], { rng: () => 0 });
    assert.ok(['contrainte', 'ambiance'].includes(music.axis));
    assert.equal(pickVariation([], chars), null);
  });

  it('une piste gardée se présente comme une piste, pas comme un fait', () => {
    const text = trailAsNote({ type: 'rapprochement', a: { title: 'Élise' }, b: { title: 'Valcendre' }, prompt: 'Pourquoi Élise éviterait-elle Valcendre ?' });
    assert.match(text, /^Piste — Pourquoi Élise/);
    assert.match(text, /\[\[Élise\]\], \[\[Valcendre\]\]/);
    assert.match(text, /Ce n'est pas un fait du récit/);
  });
});
