import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { bootServer, fetcher } from './harness.js';

// Catalogue d'items uniques : contenants ouvrables (géodes), table de butin,
// journal d'ouvertures, quêtes de craft/achat et index inversé des sources.
// Le seed de démo des quêtes est coupé (comptes déterministes) mais celui du
// catalogue est GARDÉ : les raretés et les géodes font partie du contrat.

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

before(async () => { server = await bootServer({ env: { SEED_DEMO_QUESTS: 'off' } }); });
after(async () => { await server.stop(); });

function login(creds, base = server.base) {
  const f = fetcher(base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return { f, user: r.json.user };
  });
}

describe('items uniques — catalogue', () => {
  let admin;
  let items;

  it('le seed installe l\'échelle de rareté et les contenants relevés en jeu', async () => {
    admin = await login(ADMIN);
    const rarities = await admin.f.get('/api/quests/rarities');
    assert.equal(rarities.status, 200);
    assert.deepEqual(
      rarities.json.map((r) => r.nom),
      ['Commun', 'Peu commun', 'Inhabituel', 'Rare', 'Très rare', 'Légendaire'],
      'échelle ordonnée',
    );

    const list = await admin.f.get('/api/quests/unique-items');
    assert.equal(list.status, 200);
    items = list.json;
    const geode = items.find((i) => i.slug === 'geode-tres-rare');
    assert.ok(geode, 'la géode très rare est seedée');
    assert.equal(geode.baseItemId, 'popped_chorus_fruit'); // id PLAT du codex
    assert.equal(geode.estOuvrable, true);
    assert.equal(geode.categorie, 'contenant');
    assert.equal(geode.rarete.nom, 'Très rare');
    assert.match(geode.lore, /les plus rares/);
    assert.equal(items.find((i) => i.slug === 'ecaille-du-devin').categorie, 'monnaie');
  });

  it('un item unique se crée SANS quête et reçoit un slug stable', async () => {
    const r = await admin.f.post('/api/quests/unique-items', {
      body: {
        nom: 'Botte de célérité', categorie: 'equipement',
        lore: 'Le vent vous porte.', estVendable: true, prixVente: 12, prixUnite: 'pa',
        tags: ['pvp'],
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.slug, 'botte-de-celerite');
    assert.equal(r.json.counts, undefined, 'la fiche ne porte pas les compteurs de liste');

    // Le slug est une adresse : il ne suit pas le renommage.
    const renamed = await admin.f.put(`/api/quests/unique-items/${r.json.id}`, {
      body: { ...r.json, nom: 'Bottes de célérité' },
    });
    assert.equal(renamed.json.slug, 'botte-de-celerite');
  });

  it('refuse une catégorie, une rareté ou une monnaie inconnues', async () => {
    const base = { nom: 'Test' };
    const cases = [
      [{ ...base, categorie: 'nawak' }, 'invalid_categorie'],
      [{ ...base, rareteId: 9999 }, 'unknown_rarete'],
      [{ ...base, factionId: 9999 }, 'unknown_faction'],
      [{ ...base, prixUnite: 'lingots' }, 'invalid_prix_unite'],
      [{ ...base, prixUnite: 'custom:9999' }, 'unknown_prix_unite'],
      [{ ...base, prixVente: -3 }, 'invalid_prix'],
      [{ nom: '   ' }, 'item_nom_required'],
    ];
    for (const [body, expected] of cases) {
      const r = await admin.f.post('/api/quests/unique-items', { body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.json.error, expected);
    }
  });

  it('membre : lecture avec can_view_quests, écriture du catalogue refusée', async () => {
    const member = await login(MEMBER);
    await admin.f.put(`/api/users/${member.user.id}`, { body: { canViewQuests: true } });
    assert.equal((await member.f.get('/api/quests/unique-items')).status, 200);
    assert.equal((await member.f.post('/api/quests/unique-items', { body: { nom: 'Nope' } })).status, 403);
    assert.equal((await member.f.post('/api/quests/rarities', { body: { nom: 'Nope' } })).status, 403);
    assert.equal((await member.f.get('/api/quests/sets')).status, 200);
    assert.equal((await member.f.post('/api/quests/sets', { body: { nom: 'Nope' } })).status, 403);
  });

  it('sans aucun flag : tout le catalogue est fermé (rien de public)', async () => {
    const anon = fetcher(server.base);
    for (const url of ['/api/quests/unique-items', '/api/quests/rarities', '/api/quests/sets', '/api/quests/unique-items/1/sources']) {
      assert.equal((await anon.get(url)).status, 401, url);
    }
  });
});

describe('items uniques — table de butin', () => {
  let admin;
  let geode;
  let petite;
  let ecaille;

  before(async () => {
    admin = await login(ADMIN);
    const list = (await admin.f.get('/api/quests/unique-items')).json;
    geode = list.find((i) => i.slug === 'geode-tres-rare');
    petite = list.find((i) => i.slug === 'petite-geode');
    ecaille = list.find((i) => i.slug === 'ecaille-du-devin');
  });

  it('enregistre une table de butin même incomplète (somme ≠ 100 non bloquante)', async () => {
    const r = await admin.f.put(`/api/quests/unique-items/${geode.id}`, {
      body: {
        ...geode,
        prixVente: 120, prixUnite: 'pa',
        loot: [
          { resultatType: 'unique_item', resultatUniqueId: ecaille.id, probabilite: 8, probabiliteSource: 'observee', quantiteMin: 1, quantiteMax: 3 },
          { resultatType: 'item_referentiel', resultatRef: 'diamond', probabilite: 22.5, quantiteMin: 1, quantiteMax: 1 },
          { resultatType: 'pa', probabilite: 60, labelAffiche: 'Pièces', quantiteMin: 10, quantiteMax: 50 },
        ],
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.loot.length, 3);
    const somme = r.json.loot.reduce((s, l) => s + l.probabilite, 0);
    assert.ok(somme < 100, 'table incomplète acceptée telle quelle');
    // Le libellé est résolu pour l'affichage, jamais la référence brute.
    assert.equal(r.json.loot[0].label, 'Écaille du devin');
    assert.equal(r.json.loot[1].label, 'Diamant');
    // Le prix de la cible voyage avec la ligne (calcul d'espérance côté client).
    assert.equal(r.json.loot[0].ciblePrixUnite, 'pa');
  });

  it('valide chaque ligne : probabilité, quantités, cible existante', async () => {
    const cases = [
      [[{ resultatType: 'pa', probabilite: 140 }], 'invalid_probabilite'],
      [[{ resultatType: 'pa', probabilite: -1 }], 'invalid_probabilite'],
      [[{ resultatType: 'pa', probabilite: 1, quantiteMin: 5, quantiteMax: 2 }], 'quantite_min_gt_max'],
      [[{ resultatType: 'pa', probabilite: 1, quantiteMin: 0 }], 'invalid_quantite_min'],
      [[{ resultatType: 'unique_item', resultatUniqueId: 9999, probabilite: 1 }], 'unknown_unique_item'],
      [[{ resultatType: 'chelou', probabilite: 1 }], 'invalid_resultat_type'],
      [[{ resultatType: 'pa', probabilite: 1, probabiliteSource: 'devinée' }], 'invalid_probabilite_source'],
    ];
    for (const [loot, expected] of cases) {
      const r = await admin.f.put(`/api/quests/unique-items/${geode.id}`, { body: { ...geode, loot } });
      assert.equal(r.status, 400, JSON.stringify(loot));
      assert.equal(r.json.error, expected);
    }
  });

  it('refuse qu\'un contenant se contienne, directement ou en chaîne', async () => {
    const direct = await admin.f.put(`/api/quests/unique-items/${geode.id}`, {
      body: { ...geode, loot: [{ resultatType: 'unique_item', resultatUniqueId: geode.id, probabilite: 1 }] },
    });
    assert.equal(direct.status, 400);
    assert.equal(direct.json.error, 'loot_cycle');

    // petite → géode existe déjà ; ajouter géode → petite fermerait la boucle.
    await admin.f.put(`/api/quests/unique-items/${petite.id}`, {
      body: { ...petite, loot: [{ resultatType: 'unique_item', resultatUniqueId: geode.id, probabilite: 5 }] },
    });
    const indirect = await admin.f.put(`/api/quests/unique-items/${geode.id}`, {
      body: { ...geode, loot: [{ resultatType: 'unique_item', resultatUniqueId: petite.id, probabilite: 5 }] },
    });
    assert.equal(indirect.status, 400);
    assert.equal(indirect.json.error, 'loot_cycle');

    // Même cible, désignée en référence texte sous le type « item du codex » :
    // elle est normalisée vers la FK, donc le cycle doit se voir aussi.
    const parRef = await admin.f.put(`/api/quests/unique-items/${geode.id}`, {
      body: { ...geode, loot: [{ resultatType: 'item_referentiel', resultatRef: `custom:${geode.id}`, probabilite: 5 }] },
    });
    assert.equal(parRef.status, 400);
    assert.equal(parRef.json.error, 'loot_cycle');

    await admin.f.put(`/api/quests/unique-items/${petite.id}`, { body: { ...petite, loot: [] } });
  });

  it('une cible saisie « custom:<id> » est rattachée à l\'item unique, pas affichée brute', async () => {
    // Le picker de résultat voit le catalogue AUGMENTÉ : il renvoie
    // 'custom:<id>' même quand le type resté sélectionné est « item du codex ».
    const r = await admin.f.put(`/api/quests/unique-items/${petite.id}`, {
      body: {
        ...petite,
        loot: [{ resultatType: 'item_referentiel', resultatRef: `custom:${ecaille.id}`, probabilite: 10 }],
      },
    });
    assert.equal(r.status, 200);
    const l = r.json.loot[0];
    assert.equal(l.resultatType, 'unique_item');
    assert.equal(l.resultatUniqueId, ecaille.id);
    assert.equal(l.resultatRef, null);
    assert.equal(l.label, 'Écaille du devin', 'plus jamais « custom:9 » à l\'écran');
    assert.equal(l.ciblePrixUnite, 'pa', 'la ligne récupère le prix de la cible → espérance calculable');

    // Et la ligne compte comme une vraie source dérivée de l'écaille.
    const src = await admin.f.get(`/api/quests/unique-items/${ecaille.id}/sources`);
    assert.ok(
      src.json.sources.contenants.some((c) => c.uniqueItemId === petite.id),
      '« Où l\'obtenir » suit la FK, pas la référence texte',
    );
    await admin.f.put(`/api/quests/unique-items/${petite.id}`, { body: { ...petite, loot: [] } });
  });

  it('journal d\'ouvertures : taux empirique agrégé, refusé hors contenant', async () => {
    for (let i = 0; i < 12; i += 1) {
      const r = await admin.f.post(`/api/quests/unique-items/${geode.id}/observations`, {
        body: i < 2
          ? { resultatType: 'unique_item', resultatUniqueId: ecaille.id, quantite: 1 }
          : { resultatType: 'pa', quantite: 25, labelAffiche: 'Pièces' },
      });
      assert.equal(r.status, 201);
    }
    const obs = await admin.f.get(`/api/quests/unique-items/${geode.id}/observations`);
    assert.equal(obs.json.resume.total, 12);
    const ecailleRow = obs.json.resume.parResultat.find((p) => p.resultatUniqueId === ecaille.id);
    assert.equal(ecailleRow.n, 2, '2 écailles sur 12 ouvertures');
    assert.equal(obs.json.recentes.length, 12);

    const refus = await admin.f.post(`/api/quests/unique-items/${ecaille.id}/observations`, {
      body: { resultatType: 'pa' },
    });
    assert.equal(refus.status, 400);
    assert.equal(refus.json.error, 'item_not_openable');

    const badQty = await admin.f.post(`/api/quests/unique-items/${geode.id}/observations`, {
      body: { resultatType: 'pa', quantite: 0 },
    });
    assert.equal(badQty.status, 400);
    assert.equal(badQty.json.error, 'invalid_quantite');
  });

  it('un lecteur peut loguer une ouverture, et ne supprime que les siennes', async () => {
    const member = await login(MEMBER);
    await admin.f.put(`/api/users/${member.user.id}`, { body: { canViewQuests: true } });
    const mine = await member.f.post(`/api/quests/unique-items/${geode.id}/observations`, {
      body: { resultatType: 'pa', quantite: 10 },
    });
    assert.equal(mine.status, 201, 'un simple lecteur alimente la table de butin');

    const all = await admin.f.get(`/api/quests/unique-items/${geode.id}/observations`);
    const notMine = all.json.recentes.find((o) => o.memberId !== member.user.id);
    assert.equal((await member.f.delete(`/api/quests/observations/${notMine.id}`)).status, 403);
    const own = all.json.recentes.find((o) => o.memberId === member.user.id);
    assert.equal((await member.f.delete(`/api/quests/observations/${own.id}`)).status, 200);
  });

  it('reset du journal : ses propres relevés pour un lecteur, tous pour un éditeur', async () => {
    // Sur la PETITE géode, pour ne pas toucher au journal de la très rare que
    // les compteurs du catalogue vérifient plus bas.
    const member = await login(MEMBER);
    const url = `/api/quests/unique-items/${petite.id}/observations`;
    await admin.f.put(`/api/quests/unique-items/${petite.id}`, {
      body: { ...petite, loot: [{ resultatType: 'pa', probabilite: 50, labelAffiche: 'Pièces' }] },
    });
    for (let i = 0; i < 2; i += 1) {
      assert.equal((await admin.f.post(url, { body: { resultatType: 'pa', quantite: 4 } })).status, 201);
    }
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await member.f.post(url, { body: { resultatType: 'pa', quantite: 5 } })).status, 201);
    }
    assert.equal((await admin.f.get(url)).json.resume.total, 5);

    // Un simple lecteur n'efface pas le journal des autres.
    assert.equal((await member.f.delete(url)).status, 403);
    assert.equal((await admin.f.delete(`${url}?scope=nimportequoi`)).json.error, 'invalid_scope');

    const miens = await member.f.delete(`${url}?scope=mine`);
    assert.equal(miens.status, 200);
    assert.equal(miens.json.supprimees, 3);
    assert.equal(miens.json.resume.total, 2, 'les relevés des autres restent');
    assert.ok(miens.json.recentes.every((o) => o.memberId !== member.user.id));
    // Rejouable : n'avoir plus rien à effacer n'est pas une erreur.
    assert.equal((await member.f.delete(`${url}?scope=mine`)).json.supprimees, 0);

    // Mise à jour du serveur de jeu : l'éditeur repart de zéro pour tout le monde.
    const tout = await admin.f.delete(url);
    assert.equal(tout.status, 200);
    assert.equal(tout.json.supprimees, 2);
    assert.equal(tout.json.resume.total, 0);
    assert.equal(tout.json.recentes.length, 0);

    const fiche = (await admin.f.get(`/api/quests/unique-items/${petite.id}`)).json;
    assert.equal(fiche.observations.total, 0);
    assert.equal(fiche.loot.length, 1, 'la table de butin DÉCLARÉE survit au reset');

    assert.equal((await admin.f.delete('/api/quests/unique-items/999999/observations')).status, 404);
  });

  it('une ouverture loguée en « custom:<id> » rejoint la ligne de l\'item unique', async () => {
    // (le journal de la petite géode vient d'être remis à zéro juste au-dessus)
    const url = `/api/quests/unique-items/${petite.id}/observations`;
    await admin.f.post(url, { body: { resultatType: 'unique_item', resultatUniqueId: ecaille.id } });
    await admin.f.post(url, { body: { resultatType: 'item_referentiel', resultatRef: `custom:${ecaille.id}` } });

    const { resume } = (await admin.f.get(url)).json;
    assert.equal(resume.total, 2);
    assert.equal(resume.parResultat.length, 1, 'un seul résultat, pas deux selon le chemin de saisie');
    assert.equal(resume.parResultat[0].key, `unique:${ecaille.id}`);
    assert.equal(resume.parResultat[0].label, 'Écaille du devin');
  });
});

// Un set est une COLLECTION attendue : sa taille dit ce que le jeu contient,
// ses membres sont les items qui pointent dessus. La complétude « 3/5 » se
// dérive des deux — rien de tout cela n'est ressaisi.
describe('sets d\'items uniques', () => {
  let admin;
  let sets;
  let petite;

  before(async () => {
    admin = await login(ADMIN);
    sets = (await admin.f.get('/api/quests/sets')).json;
    petite = (await admin.f.get('/api/quests/unique-items')).json.find((i) => i.slug === 'petite-geode');
  });

  it('le seed installe les 6 sets du livre, avec le nombre de pièces de chacun', () => {
    assert.deepEqual(
      sets.map((s) => [s.slug, s.taille]),
      [
        ['joyaux-verts', 2],
        ['joyaux-jaunes', 3],
        ['joyaux-violets', 4],
        ['joyaux-blancs', 5],
        ['joyaux-bleus', 5],
        ['joyaux-legendaires', 5],
      ],
    );
  });

  it('ranger un item dans un set fait suivre le compteur de membres', async () => {
    const bleus = sets.find((s) => s.slug === 'joyaux-bleus');
    const r = await admin.f.put(`/api/quests/unique-items/${petite.id}`, {
      body: { ...petite, setId: bleus.id },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.setId, bleus.id);
    assert.equal(r.json.set.nom, 'Joyaux bleus');
    assert.equal(r.json.set.taille, 5, 'la taille voyage avec l\'item → pastille « n/5 »');

    const apres = (await admin.f.get('/api/quests/sets')).json.find((s) => s.id === bleus.id);
    assert.equal(apres.membres, 1, 'la complétude est dérivée, jamais saisie');

    const carte = (await admin.f.get('/api/quests/unique-items')).json.find((i) => i.id === petite.id);
    assert.equal(carte.set.slug, 'joyaux-bleus', 'le catalogue porte le set (pastille + filtre)');
  });

  it('refuse un set inconnu, un nom vide ou une taille absurde', async () => {
    const bad = await admin.f.put(`/api/quests/unique-items/${petite.id}`, {
      body: { ...petite, setId: 99999 },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'unknown_set');
    assert.equal((await admin.f.post('/api/quests/sets', { body: { nom: '  ' } })).json.error, 'set_nom_required');
    assert.equal(
      (await admin.f.post('/api/quests/sets', { body: { nom: 'Joyaux gris', taille: -1 } })).json.error,
      'invalid_set_taille',
    );
  });

  it('créer / renommer / supprimer un set — ses membres gardent leur fiche', async () => {
    const cree = await admin.f.post('/api/quests/sets', {
      body: { nom: 'Joyaux rouges', couleur: '#ff8a9b', taille: 1 },
    });
    assert.equal(cree.status, 201);
    assert.equal(cree.json.slug, 'joyaux-rouges');
    assert.equal(cree.json.membres, 0);

    const maj = await admin.f.put(`/api/quests/sets/${cree.json.id}`, {
      body: { ...cree.json, nom: 'Joyaux écarlates', taille: 2 },
    });
    assert.equal(maj.json.nom, 'Joyaux écarlates');
    assert.equal(maj.json.taille, 2);

    await admin.f.put(`/api/quests/unique-items/${petite.id}`, { body: { ...petite, setId: cree.json.id } });
    assert.equal((await admin.f.delete(`/api/quests/sets/${cree.json.id}`)).status, 204);

    const fiche = (await admin.f.get(`/api/quests/unique-items/${petite.id}`)).json;
    assert.equal(fiche.nom, 'Petite géode');
    assert.equal(fiche.setId, null, 'supprimer un set ne supprime aucun objet');
    assert.equal(fiche.set, null);
    assert.equal((await admin.f.delete('/api/quests/sets/99999')).status, 404);
  });
});

describe('quêtes de craft et d\'achat', () => {
  let admin;
  let ecaille;
  let botte;

  before(async () => {
    admin = await login(ADMIN);
    const list = (await admin.f.get('/api/quests/unique-items')).json;
    ecaille = list.find((i) => i.slug === 'ecaille-du-devin');
    botte = list.find((i) => i.slug === 'botte-de-celerite');
  });

  it('une quête de craft porte station, grille et maîtrise ; ingrédients = entrées', async () => {
    const r = await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Forger la botte de célérité', categorie: 'craft',
        craft: { station: 'crafting_table', grid: ['leather', '', '', `custom:${ecaille.id}`, '', '', '', '', ''] },
        inputs: [
          { kind: 'item', refCode: `custom:${ecaille.id}`, quantite: 4, label: '' },
          { kind: 'item', refCode: 'leather', quantite: 6, label: '' },
        ],
        rewards: [{ kind: 'item', refCode: `custom:${botte.id}`, quantite: 1, label: '' }],
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.categorie, 'craft');
    assert.equal(r.json.craft.station, 'crafting_table');
    assert.equal(r.json.craft.grid.length, 9, 'grille toujours normalisée à 9 cases');
    assert.equal(r.json.inputs.length, 2, 'les ingrédients restent des entrées de quête');

    // Conséquence directe de la réutilisation : le suivi en coffres marche.
    const stock = await admin.f.get(`/api/quests/quests/${r.json.id}/stock`);
    assert.equal(stock.status, 200);
    assert.equal(stock.json.inputs.length, 2);
    assert.equal(stock.json.inputs[0].label, 'Écaille du devin');
  });

  it('une quête d\'achat porte plusieurs offres, payables en items', async () => {
    const r = await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Le marchand du comptoir', categorie: 'achat',
        offers: [
          {
            vendeur: 'Marchand ambulant', stock: 3, limite: '1 par semaine', x: 40, y: 64, z: -12,
            donne: [{ kind: 'item', refCode: `custom:${ecaille.id}`, quantite: 12 }],
            recoit: [{ kind: 'item', refCode: `custom:${botte.id}`, quantite: 1 }],
          },
          {
            vendeur: 'Marchand ambulant',
            donne: [{ kind: 'pa', quantite: 250, label: 'PA' }],
            recoit: [{ kind: 'item', refCode: 'diamond', quantite: 2 }],
          },
        ],
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.offers.length, 2);
    assert.equal(r.json.offers[0].donne[0].quantite, 12);
    assert.equal(r.json.offers[0].stock, 3);
    assert.equal(r.json.offers[1].donne[0].kind, 'pa');

    // Les offres sont remplacées en bloc, comme les autres sous-entités.
    const upd = await admin.f.put(`/api/quests/quests/${r.json.id}`, {
      body: { titre: 'Le marchand du comptoir', categorie: 'achat', offers: [r.json.offers[0]] },
    });
    assert.equal(upd.json.offers.length, 1);
  });

  it('valide les offres et la catégorie de quête', async () => {
    const cases = [
      [{ titre: 'x', categorie: 'nawak' }, 'invalid_quest_categorie'],
      [{ titre: 'x', offers: [{ vendeur: 'y' }] }, 'offer_needs_lines'],
      [{ titre: 'x', offers: [{ donne: [{ quantite: 0 }] }] }, 'invalid_offer_quantite'],
      [{ titre: 'x', offers: [{ donne: [{ refCode: 'custom:9999', quantite: 1 }] }] }, 'unknown_unique_item'],
      [{ titre: 'x', offers: [{ donne: [{ kind: 'zzz', quantite: 1 }] }] }, 'invalid_offer_line_kind'],
    ];
    for (const [body, expected] of cases) {
      const r = await admin.f.post('/api/quests/quests', { body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.json.error, expected);
    }
  });

  it('filtre la liste par catégorie', async () => {
    const crafts = await admin.f.get('/api/quests/quests?categorie=craft');
    assert.equal(crafts.json.length, 1);
    assert.equal(crafts.json[0].categorie, 'craft');
    const achats = await admin.f.get('/api/quests/quests?categorie=achat');
    assert.equal(achats.json.length, 1);
  });
});

describe('« Où trouver quoi » — index inversé dérivé', () => {
  let admin;
  let ecaille;
  let botte;
  let geode;

  before(async () => {
    admin = await login(ADMIN);
    const list = (await admin.f.get('/api/quests/unique-items')).json;
    ecaille = list.find((i) => i.slug === 'ecaille-du-devin');
    botte = list.find((i) => i.slug === 'botte-de-celerite');
    geode = list.find((i) => i.slug === 'geode-tres-rare');
  });

  it('agrège les sources d\'un item sans aucune ressaisie', async () => {
    const r = await admin.f.get(`/api/quests/unique-items/${botte.id}/sources`);
    assert.equal(r.status, 200);
    const { crafts, achats } = r.json.sources;
    assert.equal(crafts.length, 1, 'produite par une recette de quête');
    assert.equal(crafts[0].titre, 'Forger la botte de célérité');
    assert.deepEqual(
      crafts[0].ingredients.map((i) => `${i.quantite}× ${i.label}`),
      ['4× Écaille du devin', '6× Cuir'],
      'les ingrédients remontent avec la recette',
    );
    assert.equal(achats.length, 1, 'achetable chez un marchand');
    assert.equal(achats[0].donne[0].label, 'Écaille du devin');
    assert.equal(achats[0].donne[0].quantite, 12);
  });

  it('remonte contenants, usages et rôle de monnaie', async () => {
    const r = await admin.f.get(`/api/quests/unique-items/${ecaille.id}/sources`);
    const { contenants } = r.json.sources;
    // Deux contenants : celui dont la table le DÉCLARE, et celui d'où on l'a vu
    // sortir sans que la ligne soit écrite (le journal d'ouvertures de la
    // petite géode, plus haut). Le second est une source malgré tout — sinon un
    // objet qu'on vient de tirer s'afficherait « sans source connue ».
    const declare = contenants.find((c) => c.nom === 'Géode très rare');
    const observe = contenants.find((c) => c.nom === 'Petite géode');
    assert.equal(contenants.length, 2);
    assert.equal(declare.declaree, true);
    assert.equal(declare.probabilite, 8);
    assert.equal(declare.probabiliteSource, 'observee');
    assert.equal(observe.declaree, false, 'jamais déclaré, seulement observé');
    assert.equal(observe.probabilite, null);
    assert.equal(observe.observations.k, 2, '2 écailles sur 2 ouvertures relevées');
    assert.equal(observe.observations.n, 2);
    // Le tri suit ce qui fait foi : le taux mesuré passe devant le supposé.
    assert.equal(contenants[0].nom, 'Petite géode');

    const { craftsConsommateurs, monnaie } = r.json.usages;
    assert.equal(craftsConsommateurs.length, 1, 'consommée par un craft');
    assert.equal(craftsConsommateurs[0].resultats[0].label, 'Bottes de célérité');
    assert.equal(monnaie.length, 1, 'sert de monnaie dans une offre');
    assert.equal(monnaie[0].recoit[0].label, 'Bottes de célérité');
  });

  it('sépare récompense de quête et résultat de craft, et garde les sources manuelles', async () => {
    // Une quête de récolte ordinaire qui donne aussi la botte.
    await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Prime du capitaine', categorie: 'recolte',
        rewards: [{ kind: 'item', refCode: `custom:${botte.id}`, quantite: 1, label: '' }],
      },
    });
    const r = await admin.f.get(`/api/quests/unique-items/${botte.id}/sources`);
    assert.equal(r.json.sources.recompenses.length, 1);
    assert.equal(r.json.sources.recompenses[0].titre, 'Prime du capitaine');
    assert.equal(r.json.sources.crafts.length, 1, 'le craft ne compte pas deux fois');

    await admin.f.put(`/api/quests/unique-items/${geode.id}`, {
      body: {
        ...geode,
        sourcesManuelles: [{ kind: 'mob', label: 'Golem des grottes', note: 'rare', x: 120, y: 12, z: -40 }],
      },
    });
    const g = await admin.f.get(`/api/quests/unique-items/${geode.id}/sources`);
    assert.equal(g.json.sources.manuelles.length, 1);
    assert.equal(g.json.sources.manuelles[0].kind, 'mob');
    assert.equal(g.json.sources.manuelles[0].x, 120);
  });

  it('une source manuelle peut renvoyer à la quête où on la croise', async () => {
    const quete = (await admin.f.post('/api/quests/quests', {
      body: { titre: 'Les grottes hurlantes' },
    })).json;
    const r = await admin.f.put(`/api/quests/unique-items/${geode.id}`, {
      body: {
        ...geode,
        sourcesManuelles: [{ kind: 'mob', label: 'Golem des grottes', questId: quete.id }],
      },
    });
    assert.equal(r.status, 200);

    const src = (await admin.f.get(`/api/quests/unique-items/${geode.id}/sources`)).json.sources.manuelles[0];
    assert.equal(src.questId, quete.id);
    assert.equal(src.questTitre, 'Les grottes hurlantes', 'le titre est résolu à la lecture, jamais recopié');

    const bad = await admin.f.put(`/api/quests/unique-items/${geode.id}`, {
      body: { ...geode, sourcesManuelles: [{ kind: 'mob', label: 'X', questId: 99999 }] },
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'unknown_quest');

    // La source survit à la quête : le lien retombe à NULL, la ligne reste.
    assert.equal((await admin.f.delete(`/api/quests/quests/${quete.id}`)).status, 204);
    const apres = (await admin.f.get(`/api/quests/unique-items/${geode.id}/sources`)).json.sources.manuelles[0];
    assert.equal(apres.label, 'Golem des grottes');
    assert.equal(apres.questId, null);
    assert.equal(apres.questTitre, null);
  });

  it('les compteurs du catalogue repèrent les items sans source connue', async () => {
    const list = await admin.f.get('/api/quests/unique-items');
    const byId = new Map(list.json.map((i) => [i.id, i]));
    assert.ok(byId.get(botte.id).counts.sources >= 2, 'craft + achat + récompense');
    assert.ok(byId.get(ecaille.id).counts.usages >= 2, 'craft + monnaie');
    assert.ok(byId.get(geode.id).counts.ouvertures >= 12);
    const orphelins = list.json.filter((i) => i.counts.sources === 0).map((i) => i.slug);
    assert.ok(orphelins.includes('geode-de-taille-moyenne'), 'trou de doc repérable');
  });
});

describe('compatibilité des items custom historiques', () => {
  let admin;

  it('la route /custom-items crée toujours, et l\'item reçoit un slug', async () => {
    admin = await login(ADMIN);
    const r = await admin.f.post('/api/quests/custom-items', {
      body: { nom: 'Chair de noyé', refCode: 'rotten_flesh', enchantements: ['Tranchant V', '  '], stats: ['Dégâts +2'] },
    });
    assert.equal(r.status, 201);
    assert.deepEqual(r.json.enchantements, ['Tranchant V']);
    assert.equal(r.json.slug, 'chair-de-noye', 'invariant du catalogue respecté');

    const list = await admin.f.get('/api/quests/custom-items');
    const item = list.json.find((i) => i.id === r.json.id);
    assert.ok('refCode' in item && 'enchantements' in item && 'stats' in item, 'forme historique préservée');
  });

  it('une édition par l\'ancien formulaire n\'efface pas les champs de catalogue', async () => {
    const created = await admin.f.post('/api/quests/custom-items', { body: { nom: 'Fiole trouble' } });
    await admin.f.put(`/api/quests/unique-items/${created.json.id}`, {
      body: { ...created.json, lore: 'Elle bouge toute seule.', categorie: 'consommable' },
    });
    // L'ancien formulaire ne connaît ni lore ni catégorie : il ne doit pas les perdre.
    const legacy = await admin.f.put(`/api/quests/custom-items/${created.json.id}`, {
      body: { nom: 'Fiole trouble', refCode: 'potion', enchantements: [] },
    });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.json.lore, 'Elle bouge toute seule.');
    assert.equal(legacy.json.categorie, 'consommable');
    assert.equal(legacy.json.refCode, 'potion', 'la modification demandée est bien appliquée');
  });
});

describe('récompenses aléatoires de quête', () => {
  let admin;
  let geode;

  before(async () => {
    admin = await login(ADMIN);
    geode = (await admin.f.get('/api/quests/unique-items')).json.find((i) => i.slug === 'petite-geode');
  });

  it('une quête de récolte peut ne rien donner, ou n objets', async () => {
    const r = await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Récolte de géodes', categorie: 'recolte', occurrenceType: 'journaliere',
        rewards: [
          // Garantie : pas de probabilité (comportement historique).
          { kind: 'pa', quantite: 20, label: 'Prime de sortie' },
          // Tirage : « rien », ou 1 à 3 géodes.
          { kind: 'autre', label: 'Rien', probabilite: 55, probabiliteSource: 'observee' },
          { kind: 'item', refCode: `custom:${geode.id}`, probabilite: 45,
            quantiteMin: 1, quantiteMax: 3, probabiliteSource: 'estimee' },
        ],
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const garanties = r.json.rewards.filter((l) => l.probabilite == null);
    const tirage = r.json.rewards.filter((l) => l.probabilite != null);
    assert.equal(garanties.length, 1);
    assert.equal(garanties[0].quantite, 20);
    assert.equal(tirage.length, 2);
    assert.equal(tirage[1].quantiteMin, 1);
    assert.equal(tirage[1].quantiteMax, 3);
    assert.equal(tirage[1].probabiliteSource, 'estimee');
    assert.equal(tirage.reduce((s, l) => s + l.probabilite, 0), 100);
  });

  it('valide les bornes comme une table de butin', async () => {
    const cases = [
      [[{ kind: 'pa', probabilite: 140 }], 'invalid_probabilite'],
      [[{ kind: 'pa', probabilite: -2 }], 'invalid_probabilite'],
      [[{ kind: 'pa', probabilite: 10, probabiliteSource: 'au pif' }], 'invalid_probabilite_source'],
      [[{ kind: 'pa', probabilite: 10, quantiteMin: 5, quantiteMax: 2 }], 'quantite_min_gt_max'],
      [[{ kind: 'pa', probabilite: 10, quantiteMin: -1 }], 'invalid_quantite_min'],
    ];
    for (const [rewards, expected] of cases) {
      const res = await admin.f.post('/api/quests/quests', { body: { titre: 'x', rewards } });
      assert.equal(res.status, 400, JSON.stringify(rewards));
      assert.equal(res.json.error, expected);
    }
  });

  it('les gains potentiels sont PONDÉRÉS par la probabilité', async () => {
    const q = await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Prime incertaine', categorie: 'recolte', occurrenceType: 'mensuelle',
        rewards: [
          { kind: 'pa', quantite: 100 },                                   // garanti → 100
          { kind: 'pa', probabilite: 50, quantiteMin: 10, quantiteMax: 30 }, // 50 % × 20 → 10
        ],
      },
    });
    assert.equal(q.status, 201);
    const gains = await admin.f.get('/api/quests/gains');
    assert.equal(gains.json.mensuelle.pa, 110, 'et non 130 : la ligne aléatoire compte pour son espérance');
  });

  it('la probabilité remonte dans « où trouver quoi »', async () => {
    const src = await admin.f.get(`/api/quests/unique-items/${geode.id}/sources`);
    const recolte = src.json.sources.recompenses.find((r) => r.titre === 'Récolte de géodes');
    assert.ok(recolte, 'la quête apparaît comme source');
    assert.equal(recolte.probabilite, 45);
    assert.equal(recolte.quantiteMin, 1);
    assert.equal(recolte.quantiteMax, 3);
  });

  it('une récompense garantie reste sans probabilité après édition', async () => {
    const liste = await admin.f.get('/api/quests/quests?categorie=recolte');
    const cible = liste.json.find((x) => x.titre === 'Prime incertaine');
    const full = (await admin.f.get(`/api/quests/quests/${cible.id}`)).json;
    const maj = await admin.f.put(`/api/quests/quests/${cible.id}`, {
      body: { titre: full.titre, rewards: full.rewards.map((l) => ({ ...l })) },
    });
    assert.equal(maj.status, 200);
    assert.equal(maj.json.rewards[0].probabilite, null, 'aller-retour sans effet de bord');
    assert.equal(maj.json.rewards[1].probabilite, 50);
  });
});

// Les bases d'avant la normalisation portent des lignes « item du codex » dont
// la référence est en fait un item unique (« custom:9 ») : elles s'affichaient
// brutes. La migration du boot les rattache — sur les DEUX tables, sinon le
// journal ne se rapprocherait plus de sa ligne déclarée.
describe('migration : résultats de butin hérités « custom:<id> »', () => {
  it('les rattache à leur item unique au boot suivant', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'titisite-migration-'));
    const dbPath = path.join(dir, 'data.sqlite');
    let s1;
    let s2;
    try {
      s1 = await bootServer({ env: { DB_PATH: dbPath } });
      const a1 = await login(ADMIN, s1.base);
      const list = (await a1.f.get('/api/quests/unique-items')).json;
      const petite = list.find((i) => i.slug === 'petite-geode');
      const ecaille = list.find((i) => i.slug === 'ecaille-du-devin');
      await s1.stop();          // ne supprime que SON workdir, pas `dir`
      s1 = null;

      // Écriture directe : le serveur normalise désormais, on ne peut plus
      // produire ces lignes par l'API — c'est bien le sujet du test.
      const raw = new Database(dbPath);
      const ref = `custom:${ecaille.id}`;
      raw.prepare(`INSERT INTO loot_entries (unique_item_id, resultat_type, resultat_ref, probabilite)
                   VALUES (?, 'item_referentiel', ?, 12)`).run(petite.id, ref);
      raw.prepare(`INSERT INTO loot_entries (unique_item_id, resultat_type, resultat_ref, probabilite)
                   VALUES (?, 'item_referentiel', 'diamond', 8)`).run(petite.id);
      raw.prepare(`INSERT INTO loot_observations (unique_item_id, resultat_type, resultat_ref)
                   VALUES (?, 'item_referentiel', ?)`).run(petite.id, ref);
      raw.close();

      s2 = await bootServer({ env: { DB_PATH: dbPath } });
      const a2 = await login(ADMIN, s2.base);
      const fiche = (await a2.f.get(`/api/quests/unique-items/${petite.id}`)).json;

      const migree = fiche.loot.find((l) => l.probabilite === 12);
      assert.equal(migree.resultatType, 'unique_item');
      assert.equal(migree.resultatUniqueId, ecaille.id);
      assert.equal(migree.resultatRef, null);
      assert.equal(migree.label, 'Écaille du devin');

      const temoin = fiche.loot.find((l) => l.probabilite === 8);
      assert.equal(temoin.resultatType, 'item_referentiel', 'une vraie ref codex ne bouge pas');
      assert.equal(temoin.resultatRef, 'diamond');

      assert.equal(fiche.observations.total, 1);
      assert.equal(fiche.observations.parResultat[0].key, `unique:${ecaille.id}`);
      assert.equal(fiche.observations.parResultat[0].label, 'Écaille du devin');
    } finally {
      await s1?.stop();
      await s2?.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Le classement des joyaux est déjà écrit noir sur blanc dans leur lore : le
// rattachement au set se fait donc tout seul, une seule fois, au boot.
describe('seed : rattachement des items à leur set', () => {
  it('lit le lore une fois, puis ne défait plus jamais une édition', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'titisite-sets-'));
    const dbPath = path.join(dir, 'data.sqlite');
    let s1;
    let s2;
    try {
      s1 = await bootServer({ env: { DB_PATH: dbPath } });
      const a1 = await login(ADMIN, s1.base);
      // Créé APRÈS le passage de rattachement : il n'a pas encore de set.
      const gem = (await a1.f.post('/api/quests/unique-items', {
        body: {
          nom: 'Aigue-marine',
          lore: 'Très rare ! Fait partie du set des joyaux bleus. Vendez-le ou donnez-le.',
        },
      })).json;
      assert.equal(gem.setId, null);
      await s1.stop();
      s1 = null;

      // État d'une base d'avant la fonctionnalité : le drapeau n'existe pas.
      const raw = new Database(dbPath);
      raw.prepare(`DELETE FROM site_settings WHERE key = 'item_sets_backfilled'`).run();
      raw.close();

      s2 = await bootServer({ env: { DB_PATH: dbPath } });
      const a2 = await login(ADMIN, s2.base);
      const fiche = (await a2.f.get(`/api/quests/unique-items/${gem.id}`)).json;
      assert.equal(fiche.set.slug, 'joyaux-bleus', 'rattaché d\'après son lore, sans ressaisie');
      assert.equal(fiche.set.taille, 5);

      // Le seed ne rejoue pas : le drapeau est reposé.
      await s2.stop();
      s2 = null;
      const relu = new Database(dbPath);
      const flag = relu.prepare(`SELECT value FROM site_settings WHERE key = 'item_sets_backfilled'`).get();
      relu.close();
      assert.ok(flag, 'le passage est marqué : retirer un set à la main tiendra');
    } finally {
      await s1?.stop();
      await s2?.stop();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── Barèmes de rachat des sets ─────────────────────────────────────────────
// Un joyau se revend à l'unité ou en lot (le set complet), chez un PNJ contre
// des PA ou chez un autre contre de la réputation. Le serveur stocke les
// barèmes ; la comparaison « lot ou unité ? » est pure et testée à part
// (test/rachat.test.js) — ici on vérifie l'aller-retour et ses gardes.

describe('rachat des joyaux : à l\'unité ou en lot', () => {
  let admin;
  let set;
  let agate;
  let perle;
  let faction;

  before(async () => {
    admin = await login(ADMIN);
    faction = (await admin.f.post('/api/quests/factions', { body: { nom: 'Ondiens' } })).json;
    set = (await admin.f.post('/api/quests/sets', {
      body: { nom: 'Joyaux blancs', couleur: '#dddddd', taille: 5 },
    })).json;
    agate = (await admin.f.post('/api/quests/unique-items', {
      body: { nom: 'Agate', categorie: 'ressource', setId: set.id },
    })).json;
    perle = (await admin.f.post('/api/quests/unique-items', {
      body: { nom: 'Perle', categorie: 'ressource', setId: set.id },
    })).json;
  });

  it('enregistre les quatre combinaisons (unité|lot) × (PA|réputation)', async () => {
    const r = await admin.f.put(`/api/quests/sets/${set.id}`, {
      body: {
        ...set,
        rachats: [
          { lot: false, paiement: 'pa', montant: 5, pnj: 'Comptoir' },
          { lot: true, paiement: 'pa', montant: 40, pnj: 'Comptoir' },
          { lot: false, paiement: 'reputation', montant: 2, factionId: faction.id, pnj: 'Doyen' },
          { lot: true, paiement: 'reputation', montant: 15, factionId: faction.id, pnj: 'Doyen' },
        ],
      },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.rachats.length, 4);
    const lotPa = r.json.rachats.find((x) => x.lot && x.paiement === 'pa');
    assert.equal(lotPa.montant, 40);
    assert.equal(lotPa.pnj, 'Comptoir');
    // La faction n'a de sens que sur un paiement en réputation.
    assert.equal(lotPa.factionId, null);
    const rep = r.json.rachats.find((x) => x.paiement === 'reputation' && !x.lot);
    assert.equal(rep.factionNom, 'Ondiens', 'le nom est résolu pour l\'affichage');
  });

  it('les barèmes remontent sur la fiche de chaque pièce du set', async () => {
    const fiche = (await admin.f.get(`/api/quests/unique-items/${agate.id}`)).json;
    assert.equal(fiche.rachats.length, 4);
    assert.equal(fiche.set.taille, 5, 'la taille du set sert au total à l\'unité');
  });

  it('un barème propre à une pièce ne vaut que pour elle', async () => {
    await admin.f.put(`/api/quests/sets/${set.id}`, {
      body: {
        ...set,
        rachats: [
          { lot: false, paiement: 'pa', montant: 5, pnj: 'Comptoir' },
          { lot: false, paiement: 'pa', montant: 30, pnj: 'Comptoir', uniqueItemId: perle.id },
        ],
      },
    });
    const surPerle = (await admin.f.get(`/api/quests/unique-items/${perle.id}`)).json.rachats;
    const surAgate = (await admin.f.get(`/api/quests/unique-items/${agate.id}`)).json.rachats;
    assert.equal(surPerle.length, 2, 'le barème du set + le sien');
    assert.equal(surAgate.length, 1, 'la surcharge d\'une autre pièce ne la concerne pas');
  });

  it('un prix de rachat vaut prix quand la fiche n\'en donne pas', async () => {
    // Sans ça, une géode pleine de joyaux affiche « 100 % de la table n'est
    // pas valorisée » alors que le PNJ affiche un prix en jeu.
    const geode = (await admin.f.get('/api/quests/unique-items')).json
      .find((i) => i.slug === 'geode-tres-rare');
    await admin.f.put(`/api/quests/unique-items/${geode.id}`, {
      body: {
        ...geode,
        loot: [{ resultatType: 'unique_item', resultatUniqueId: agate.id, probabilite: 20, quantiteMin: 1, quantiteMax: 1 }],
      },
    });
    const ligne = (await admin.f.get(`/api/quests/unique-items/${geode.id}`)).json.loot[0];
    assert.equal(ligne.ciblePrix, 5, 'le rachat à l\'unité fait office de prix');
    assert.equal(ligne.ciblePrixUnite, 'pa');
    assert.equal(ligne.ciblePrixSource, 'rachat', 'la provenance est dite, jamais devinée');

    // Un prix saisi sur la fiche reprend la main.
    await admin.f.put(`/api/quests/unique-items/${agate.id}`, {
      body: { ...agate, estVendable: true, prixVente: 12, prixUnite: 'pa' },
    });
    const apres = (await admin.f.get(`/api/quests/unique-items/${geode.id}`)).json.loot[0];
    assert.equal(apres.ciblePrix, 12);
    assert.equal(apres.ciblePrixSource, 'fiche');
  });

  it('le prix du LOT ne sert jamais de prix unitaire', async () => {
    // Un set complet à 40 PA ne fait pas un joyau isolé à 8 PA : le lot
    // suppose de posséder toutes les pièces.
    const seul = (await admin.f.post('/api/quests/sets', {
      body: {
        nom: 'Joyaux muets', taille: 4,
        rachats: [{ lot: true, paiement: 'pa', montant: 40, pnj: 'Comptoir' }],
      },
    })).json;
    const item = (await admin.f.post('/api/quests/unique-items', {
      body: { nom: 'Muet', categorie: 'ressource', setId: seul.id },
    })).json;
    const geode = (await admin.f.get('/api/quests/unique-items')).json
      .find((i) => i.slug === 'petite-geode');
    await admin.f.put(`/api/quests/unique-items/${geode.id}`, {
      body: {
        ...geode,
        loot: [{ resultatType: 'unique_item', resultatUniqueId: item.id, probabilite: 10, quantiteMin: 1, quantiteMax: 1 }],
      },
    });
    const ligne = (await admin.f.get(`/api/quests/unique-items/${geode.id}`)).json.loot[0];
    assert.equal(ligne.ciblePrix, null);
    assert.equal(ligne.ciblePrixSource, null);
  });

  it('refuse un barème incohérent', async () => {
    const cases = [
      [[{ paiement: 'troc' }], 'invalid_buyout_paiement'],
      [[{ paiement: 'pa', montant: -3 }], 'invalid_buyout_montant'],
      [[{ paiement: 'reputation', montant: 2 }], 'buyout_faction_required'],
      [[{ paiement: 'reputation', montant: 2, factionId: 99999 }], 'unknown_faction'],
      [[{ paiement: 'item', montant: 1 }], 'buyout_ref_required'],
      [[{ paiement: 'pa', montant: 1, uniqueItemId: 99999 }], 'unknown_unique_item'],
      [[{ paiement: 'pa', montant: 1, questId: 99999 }], 'unknown_quest'],
      ['pas-un-tableau', 'invalid_rachats'],
    ];
    for (const [rachats, expected] of cases) {
      const r = await admin.f.put(`/api/quests/sets/${set.id}`, { body: { ...set, rachats } });
      assert.equal(r.status, 400, JSON.stringify(rachats));
      assert.equal(r.json.error, expected);
    }
  });

  it('éditer un set sans parler des barèmes ne les efface pas', async () => {
    const avant = (await admin.f.get('/api/quests/sets')).json.find((x) => x.id === set.id);
    assert.equal(avant.rachats.length, 2, 'l\'échec de validation n\'a rien écrasé');
    const r = await admin.f.put(`/api/quests/sets/${set.id}`, {
      body: { nom: 'Joyaux blancs', couleur: '#eeeeee', taille: 5 },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.rachats.length, 2, 'absent du payload = inchangé');
    // Un tableau vide, lui, efface bien.
    const vide = await admin.f.put(`/api/quests/sets/${set.id}`, {
      body: { nom: 'Joyaux blancs', taille: 5, rachats: [] },
    });
    assert.deepEqual(vide.json.rachats, []);
  });

  it('supprimer le set emporte ses barèmes, pas ses pièces', async () => {
    await admin.f.put(`/api/quests/sets/${set.id}`, {
      body: { ...set, rachats: [{ lot: false, paiement: 'pa', montant: 5, pnj: 'Comptoir' }] },
    });
    assert.equal((await admin.f.delete(`/api/quests/sets/${set.id}`)).status, 204);
    const fiche = (await admin.f.get(`/api/quests/unique-items/${agate.id}`)).json;
    assert.equal(fiche.nom, 'Agate', 'la pièce survit');
    assert.equal(fiche.setId, null);
    assert.deepEqual(fiche.rachats, [], 'plus de set, plus de barème');
  });
});
