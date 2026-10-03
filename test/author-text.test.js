import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cleanSnippet, countChars, countOccurrences, countWords, ftsQuery, nameKey, normalize, plainText, scrubWikiLinks,
} from '../server/author/text.js';
import { AUTO_INTERVAL_S, shouldSnapshot } from '../server/author/revisions.js';
import { countWords as countWordsClient, textStats as textStatsClient } from '../src/components/author/text.js';
import { indexText, mentions, namesOf, runRules } from '../server/author/consistency.js';

describe('author/text — compteurs', () => {
  it('compte les mots comme un traitement de texte (élisions, traits d\'union)', () => {
    assert.equal(countWords("L'homme est peut-être là aujourd'hui."), 5);
    assert.equal(countWords('Un — deux - trois'), 3);
    assert.equal(countWords(''), 0);
    assert.equal(countWords('   \n\n  '), 0);
  });

  it('ignore la syntaxe Markdown', () => {
    const md = '# Titre\n\n**Gras** et *italique*\n\n> citation\n\n- un\n- deux\n\n---\n\n[lien](https://x.y/z)';
    assert.equal(plainText(md).includes('#'), false);
    assert.equal(countWords(md), 8);
    assert.equal(countChars('**ab** c'), 4);
  });

  it('le client compte exactement comme le serveur', () => {
    const samples = ["L'aube", '# Chapitre 1\n\nIl était une fois — dit-elle.', '- a\n- b\n\n> c d', ''];
    for (const s of samples) assert.equal(countWordsClient(s), countWords(s), s);
    assert.deepEqual(textStatsClient('**ab** c'), { words: 2, chars: 4 });
  });

  it('normalise accents et casse, et repère des mots entiers', () => {
    assert.equal(normalize('Élise’s'), "elise's");
    assert.equal(countOccurrences('Lyra et Lyr virent Lyr.', 'Lyr'), 2);
    assert.equal(countOccurrences('Ab ab', 'ab'), 0, 'noms trop courts ignorés');
  });

  it('neutralise la syntaxe FTS de l\'utilisateur', () => {
    assert.equal(ftsQuery('élise OR "x'), '"élise"* "OR"* """x"*');
    assert.equal(ftsQuery('  '), null);
  });
});

describe('author/revisions — politique des snapshots automatiques', () => {
  const long = 'mot '.repeat(300);
  it('garde l\'original à la première retouche', () => {
    assert.equal(shouldSnapshot('texte initial', 'texte modifié', null, 1000), true);
  });
  it('ne fige ni un texte vide ni un texte inchangé', () => {
    assert.equal(shouldSnapshot('', 'nouveau', null, 1000), false);
    assert.equal(shouldSnapshot('pareil', 'pareil', null, 1000), false);
  });
  it('un point toutes les 10 minutes pendant l\'écriture', () => {
    assert.equal(shouldSnapshot('a b c', 'a b c d', 1000, 1000 + AUTO_INTERVAL_S - 1), false);
    assert.equal(shouldSnapshot('a b c', 'a b c d', 1000, 1000 + AUTO_INTERVAL_S), true);
  });
  it('fige immédiatement avant une grosse suppression', () => {
    assert.equal(shouldSnapshot(long, 'mot', 1000, 1001), true);
    assert.equal(shouldSnapshot('mot '.repeat(100), 'mot '.repeat(60), 1000, 1001), true);
    assert.equal(shouldSnapshot('mot '.repeat(100), 'mot '.repeat(90), 1000, 1001), false);
  });
});

describe('author/consistency — règles pures', () => {
  const chapter = (id, number, text, extra = {}) => ({ id, number, title: `Ch ${number}`, status: 'premier_jet', wordCount: 1, index: indexText(text), ...extra });

  it('mentions : mots entiers, noms composés, insensible aux accents', () => {
    const idx = indexText("Élise et Jean-Luc rejoignirent Port Brume. Lysandre n'est pas Lys.");
    assert.equal(mentions(idx, 'elise'), true);
    assert.equal(mentions(idx, 'Jean-Luc'), true);
    assert.equal(mentions(idx, 'Port Brume'), true);
    assert.equal(mentions(idx, 'Lysa'), false);
    assert.equal(mentions(idx, 'Brum'), false);
  });

  it('namesOf : titre, prénom, surnom et alias (pas les anciens noms)', () => {
    const names = namesOf({ title: 'Élise Varnier', firstName: 'Élise', nickname: 'Li', aliases: [{ alias: 'la Cendrée', kind: 'alias' }, { alias: 'Valdor', kind: 'ancien_nom' }] });
    assert.deepEqual(names, ['Élise Varnier', 'Élise', 'la Cendrée']);
  });

  it('apparition anticipée et mention non reliée', () => {
    const world = {
      entities: [
        { id: 1, kind: 'character', title: 'Marek', aliases: [] },
        { id: 10, kind: 'chapter', title: 'Ch 1' }, { id: 11, kind: 'chapter', title: 'Ch 2' },
        { id: 12, kind: 'chapter', title: 'Ch 3' },
      ],
      chapters: [chapter(10, 1, 'Personne.'), chapter(11, 2, 'On parlait de Marek.'), chapter(12, 3, 'Marek entra.')],
      events: [],
      links: [{ id: 1, from: 1, to: 12, kind: 'apparait_dans' }],
    };
    const issues = runRules(world);
    const early = issues.find((i) => i.rule === 'apparition_anticipee');
    assert.ok(early);
    assert.deepEqual(early.entityIds, [1, 11]);
    const unlinked = issues.find((i) => i.rule === 'mention_non_liee');
    assert.deepEqual(unlinked.suggestion.chapterIds, [11]);
  });

  it('ubiquité : deux lieux distincts au même moment, sauf lieux emboîtés', () => {
    const base = {
      entities: [
        { id: 1, kind: 'character', title: 'Élise', aliases: [] },
        { id: 2, kind: 'event', title: 'Bal' }, { id: 3, kind: 'event', title: 'Siège' },
        { id: 4, kind: 'place', title: 'Port-Brume' }, { id: 5, kind: 'place', title: 'Royaume' },
        { id: 6, kind: 'place', title: 'Désert' },
      ],
      chapters: [],
      events: [
        { id: 2, title: 'Bal', sortKey: 100, endSortKey: 110, timelineId: 1 },
        { id: 3, title: 'Siège', sortKey: 105, endSortKey: null, timelineId: 1 },
      ],
      links: [
        { id: 1, from: 1, to: 2, kind: 'participe_a' }, { id: 2, from: 3, to: 1, kind: 'participe_a' },
        { id: 3, from: 2, to: 4, kind: 'se_deroule_a' },
      ],
    };
    const conflict = { ...base, links: [...base.links, { id: 4, from: 3, to: 6, kind: 'se_deroule_a' }] };
    assert.ok(runRules(conflict).some((i) => i.rule === 'ubiquite'));
    const nested = {
      ...base,
      links: [...base.links, { id: 4, from: 3, to: 5, kind: 'se_deroule_a' }, { id: 5, from: 4, to: 5, kind: 'situe_dans' }],
    };
    assert.ok(!runRules(nested).some((i) => i.rule === 'ubiquite'));
  });

  it('chronologie : cause postérieure, fin avant début ; tri par gravité', () => {
    const world = {
      entities: [{ id: 1, kind: 'event', title: 'A' }, { id: 2, kind: 'event', title: 'B' }],
      chapters: [chapter(9, 1, '', { status: 'termine', wordCount: 0 })],
      events: [
        { id: 1, title: 'A', sortKey: 50, endSortKey: 40, dateLabel: '' },
        { id: 2, title: 'B', sortKey: 10, endSortKey: null, dateLabel: '' },
      ],
      links: [{ id: 7, from: 1, to: 2, kind: 'cause' }],
    };
    const issues = runRules(world);
    assert.deepEqual(issues.map((i) => i.rule), ['chronologie', 'chronologie', 'chapitre_vide']);
    assert.equal(issues[0].severity, 'error');
  });
});

describe('author/text — lecture invitée', () => {
  it('neutralise les liens vers un nom caché, garde les autres', () => {
    const hidden = new Set([nameKey('Le Pacte Secret')]);
    assert.equal(
      scrubWikiLinks('Elle a signé [[Le pacte secret|un pacte]] à [[Valcendre]].', hidden),
      'Elle a signé un pacte à [[Valcendre]].',
    );
    assert.equal(scrubWikiLinks('Voir [[Le Pacte Secret]].', hidden), 'Voir Le Pacte Secret.');
    // hidden = null (liseuse) : tous les liens deviennent du texte.
    assert.equal(scrubWikiLinks('[[Élise Varnier|Élise]] et [[Marek]]', null), 'Élise et Marek');
    assert.equal(scrubWikiLinks('rien [à] voir', hidden), 'rien [à] voir');
  });

  it('rend un extrait de recherche lisible, liens coupés compris', () => {
    assert.equal(cleanSnippet('…pensa à [[Mira Varnier|Mira]], à [[Marek Dorn]], au'), '…pensa à Mira, à Marek Dorn, au');
    assert.equal(cleanSnippet('Varnier|Mira]], à [[Marek'), 'Mira, à Marek');
    assert.equal(cleanSnippet('Mira]], à'), 'Mira, à');
    assert.equal(cleanSnippet('signé [[Le Pacte Secret|un pa'), 'signé un pa');
    // En lecture invitée, une cible coupée en fin d'extrait disparaît.
    assert.equal(cleanSnippet('au [[Le Pacte Se', { dropCutTarget: true }), 'au ');
    assert.equal(cleanSnippet('relit [[Le \u0002Pacte\u0003|le \u0002pacte\u0003]].'), 'relit le \u0002pacte\u0003.');
  });

  it('reste linéaire sur une entrée hostile', () => {
    const evil = `${'[['.repeat(20000)}${'a|'.repeat(20000)}`;
    const t0 = Date.now();
    scrubWikiLinks(evil, null);
    cleanSnippet(evil, { dropCutTarget: true });
    assert.ok(Date.now() - t0 < 1500);
  });
});
