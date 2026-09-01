import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootServer, fetcher } from './harness.js';
import { currentPeriodKey } from '../server/quests/period.js';

// Les deux journaux de RELEVÉS du module quêtes (server/quests/releves.js) :
//   • le tirage des récompenses d'une quête — la mesure remplace le % saisi ;
//   • le tirage d'une rotation — quelle quête le PNJ propose aujourd'hui.
// Seed de démo coupé : les comptes de gains doivent être déterministes.

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

before(async () => {
  server = await bootServer({ env: { SEED_DEMO_QUESTS: 'off', SEED_UNIQUE_ITEMS: 'off' } });
});
after(async () => { await server.stop(); });

function login(creds) {
  const f = fetcher(server.base);
  return f.post('/api/auth/login', { body: creds }).then((r) => {
    assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
    return { f, user: r.json.user };
  });
}

describe('journal de tirage des récompenses', () => {
  let admin;
  let member;
  let quest;

  before(async () => {
    admin = await login(ADMIN);
    member = await login(MEMBER);
    await admin.f.put(`/api/users/${member.user.id}`, { body: { canViewQuests: true } });
    // Une récolte : 50 PA garantis + un tirage dont on a DEVINÉ les taux.
    quest = (await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Récolte de géodes', occurrenceType: 'journaliere',
        rewards: [
          { kind: 'pa', quantite: 50, label: 'Paye' },
          { kind: 'item', label: 'Géode', probabilite: 50, quantiteMin: 1, quantiteMax: 3 },
          { kind: 'autre', label: 'Rien', probabilite: 50, quantiteMin: 1, quantiteMax: 1 },
        ],
      },
    })).json;
  });

  it('la fiche part des % saisis tant que rien n\'est relevé', async () => {
    const r = await admin.f.get(`/api/quests/quests/${quest.id}`);
    assert.equal(r.json.tirages.total, 0);
    assert.deepEqual(r.json.tirages.parResultat, []);
    // Gains potentiels : 50 PA garantis, le tirage ne donne pas de PA.
    const gains = await admin.f.get('/api/quests/gains');
    assert.equal(gains.json.journaliere.pa, 50);
  });

  it('un simple lecteur peut relever un tirage (c\'est tout l\'intérêt)', async () => {
    const rewards = (await admin.f.get(`/api/quests/quests/${quest.id}`)).json.rewards;
    const geode = rewards.find((l) => l.label === 'Géode');
    const rien = rewards.find((l) => l.label === 'Rien');

    // 1 géode pour le membre, 3 « rien » pour l'admin : 25 % observés contre
    // les 50 % supposés.
    const r = await member.f.post(`/api/quests/quests/${quest.id}/draws`, {
      body: { rewardId: geode.id, quantite: 2 },
    });
    assert.equal(r.status, 201);
    for (let i = 0; i < 3; i += 1) {
      await admin.f.post(`/api/quests/quests/${quest.id}/draws`, { body: { rewardId: rien.id } });
    }

    const fiche = (await admin.f.get(`/api/quests/quests/${quest.id}`)).json;
    assert.equal(fiche.tirages.total, 4);
    const parCle = new Map(fiche.tirages.parResultat.map((p) => [p.key, p]));
    assert.equal(parCle.get(`reward:${geode.id}`).n, 1);
    assert.equal(parCle.get(`reward:${geode.id}`).quantiteTotale, 2);
    assert.equal(parCle.get(`reward:${rien.id}`).n, 3);
  });

  it('un résultat hors liste est relevable et porte son libellé', async () => {
    const r = await member.f.post(`/api/quests/quests/${quest.id}/draws`, {
      body: { label: 'Écaille inattendue' },
    });
    assert.equal(r.status, 201);
    const hors = r.json.resume.parResultat.find((p) => p.key.startsWith('libre:'));
    assert.equal(hors.label, 'Écaille inattendue');
    assert.equal(hors.rewardId, null);

    // « Rien » et « rien » sont le même résultat : la casse ne crée pas deux
    // lignes, sinon la répartition observée serait fausse.
    await member.f.post(`/api/quests/quests/${quest.id}/draws`, { body: { label: 'écaille inattendue' } });
    const resume = (await admin.f.get(`/api/quests/quests/${quest.id}/draws`)).json.resume;
    const libres = resume.parResultat.filter((p) => p.key.startsWith('libre:'));
    assert.equal(libres.length, 1, 'une seule ligne pour le même libellé');
    assert.equal(libres[0].n, 2);
  });

  it('refuse un tirage sans résultat, ou avec une quantité aberrante', async () => {
    const vide = await member.f.post(`/api/quests/quests/${quest.id}/draws`, { body: {} });
    assert.equal(vide.status, 400);
    assert.equal(vide.json.error, 'draw_result_required');
    const qte = await member.f.post(`/api/quests/quests/${quest.id}/draws`, {
      body: { label: 'x', quantite: 0 },
    });
    assert.equal(qte.json.error, 'invalid_quantite');
    assert.equal((await member.f.post('/api/quests/quests/999999/draws', { body: { label: 'x' } })).status, 404);
  });

  it('une ligne de récompense d\'une AUTRE quête retombe sur un résultat libre', async () => {
    const autre = (await admin.f.post('/api/quests/quests', {
      body: { titre: 'Ailleurs', rewards: [{ kind: 'pa', quantite: 1, probabilite: 10 }] },
    })).json;
    const ligneAilleurs = (await admin.f.get(`/api/quests/quests/${autre.id}`)).json.rewards[0];
    const r = await member.f.post(`/api/quests/quests/${quest.id}/draws`, {
      body: { rewardId: ligneAilleurs.id, label: 'rattachement douteux' },
    });
    assert.equal(r.status, 201);
    const ligne = r.json.recentes[0];
    assert.equal(ligne.rewardId, null, 'jamais rattaché à la récompense d\'une autre quête');
    assert.equal(ligne.label, 'rattachement douteux');
    await member.f.delete(`/api/quests/draws/${ligne.id}`);
  });

  it('les gains potentiels suivent la mesure, pas la supposition', async () => {
    // Une quête à part : 100 PA déclarés à 50 %, mais jamais tirés sur 3 relevés.
    const q = (await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Jackpot supposé', occurrenceType: 'mensuelle',
        rewards: [
          { kind: 'pa', quantite: 100, probabilite: 50, quantiteMin: 100, quantiteMax: 100 },
          { kind: 'autre', label: 'Rien', probabilite: 50, quantiteMin: 1, quantiteMax: 1 },
        ],
      },
    })).json;
    const avant = (await admin.f.get('/api/quests/gains')).json.mensuelle.pa;
    assert.equal(avant, 50, '100 PA × 50 % supposés');

    const rien = (await admin.f.get(`/api/quests/quests/${q.id}`)).json.rewards
      .find((l) => l.label === 'Rien');
    for (let i = 0; i < 3; i += 1) {
      await admin.f.post(`/api/quests/quests/${q.id}/draws`, { body: { rewardId: rien.id } });
    }
    const apres = (await admin.f.get('/api/quests/gains')).json.mensuelle.pa;
    assert.equal(apres, 0, '0 sur 3 est une mesure, pas une donnée manquante');

    // Une seule sortie sur quatre → 25 % mesurés → 25 PA espérés.
    const pa = (await admin.f.get(`/api/quests/quests/${q.id}`)).json.rewards
      .find((l) => l.kind === 'pa');
    await admin.f.post(`/api/quests/quests/${q.id}/draws`, { body: { rewardId: pa.id } });
    assert.equal((await admin.f.get('/api/quests/gains')).json.mensuelle.pa, 25);

    // Une ligne GARANTIE n'est pas concernée : elle vaut toujours sa quantité.
    assert.equal((await admin.f.get('/api/quests/gains')).json.journaliere.pa, 50);
  });

  it('« Où l\'obtenir » annonce le taux mesuré à côté du taux saisi', async () => {
    const item = (await admin.f.post('/api/quests/unique-items', {
      body: { nom: 'Perle du large', categorie: 'ressource' },
    })).json;
    const q = (await admin.f.post('/api/quests/quests', {
      body: {
        titre: 'Pêche aux perles',
        rewards: [
          { kind: 'item', refCode: `custom:${item.id}`, label: 'Perle du large', probabilite: 80, quantiteMin: 1, quantiteMax: 1 },
          { kind: 'autre', label: 'Rien', probabilite: 20, quantiteMin: 1, quantiteMax: 1 },
        ],
      },
    })).json;
    const perle = (await admin.f.get(`/api/quests/quests/${q.id}`)).json.rewards[0];
    await admin.f.post(`/api/quests/quests/${q.id}/draws`, { body: { rewardId: perle.id } });
    await admin.f.post(`/api/quests/quests/${q.id}/draws`, { body: { label: 'Rien' } });

    const src = (await admin.f.get(`/api/quests/unique-items/${item.id}/sources`)).json;
    const ligne = src.sources.recompenses.find((x) => x.questId === q.id);
    assert.equal(ligne.probabilite, 80, 'le déclaré reste lisible');
    assert.equal(ligne.observations.k, 1);
    assert.equal(ligne.observations.n, 2);
    assert.equal(ligne.observations.p, 50, '1 sortie sur 2 relevés');
  });

  it('chacun efface les siens ; le reset complet est réservé aux éditeurs', async () => {
    const mien = (await member.f.post(`/api/quests/quests/${quest.id}/draws`, {
      body: { label: 'à effacer' },
    })).json.recentes[0];
    // Le membre ne peut pas supprimer le relevé d'un autre…
    const dAutrui = (await admin.f.get(`/api/quests/quests/${quest.id}/draws`)).json.recentes
      .find((d) => d.memberId !== member.user.id);
    assert.equal((await member.f.delete(`/api/quests/draws/${dAutrui.id}`)).status, 403);
    // …mais bien le sien.
    assert.equal((await member.f.delete(`/api/quests/draws/${mien.id}`)).status, 200);

    assert.equal((await member.f.delete(`/api/quests/quests/${quest.id}/draws`)).status, 403);
    const mine = await member.f.delete(`/api/quests/quests/${quest.id}/draws?scope=mine`);
    assert.equal(mine.status, 200);
    assert.ok(mine.json.supprimees > 0);
    // Rejouable : ne plus rien avoir à effacer n'est pas une erreur.
    assert.equal((await member.f.delete(`/api/quests/quests/${quest.id}/draws?scope=mine`)).json.supprimees, 0);

    const tout = await admin.f.delete(`/api/quests/quests/${quest.id}/draws`);
    assert.equal(tout.json.resume.total, 0);
    // Les récompenses DÉCLARÉES survivent au reset.
    assert.equal((await admin.f.get(`/api/quests/quests/${quest.id}`)).json.rewards.length, 3);
    assert.equal((await admin.f.delete(`/api/quests/quests/${quest.id}/draws?scope=zzz`)).status, 400);
  });

  it('rien du journal n\'est public', async () => {
    const anon = fetcher(server.base);
    assert.equal((await anon.get(`/api/quests/quests/${quest.id}/draws`)).status, 401);
    assert.equal((await anon.post(`/api/quests/quests/${quest.id}/draws`, { body: { label: 'x' } })).status, 401);
  });
});

describe('rotations — une quête par période chez le même PNJ', () => {
  let admin;
  let member;
  let groupe;
  let livraisons;

  before(async () => {
    admin = await login(ADMIN);
    member = await login(MEMBER);
    await admin.f.put(`/api/users/${member.user.id}`, { body: { canViewQuests: true } });
    groupe = (await admin.f.post('/api/quests/groups', {
      body: {
        nom: 'Livraisons FM', couleur: '#e8c86a',
        rotation: true, rotationOccurrence: 'journaliere',
        rotationPnj: 'Fédération des Marchands',
      },
    })).json;
    livraisons = [];
    for (const ville of ['Andelòr', 'Ape Atoll', 'Espoir']) {
      livraisons.push((await admin.f.post('/api/quests/quests', {
        body: {
          titre: `[FM-J] Livraison pour ${ville}`, occurrenceType: 'journaliere',
          groupIds: [groupe.id],
        },
      })).json);
    }
  });

  it('le groupe porte sa cadence, son PNJ et sa portée', async () => {
    assert.equal(groupe.rotation, true);
    assert.equal(groupe.rotationPnj, 'Fédération des Marchands');
    assert.equal(groupe.rotationPartagee, true, 'partagé par défaut');

    const rotations = (await admin.f.get('/api/quests/rotations')).json;
    assert.equal(rotations.length, 1);
    assert.equal(rotations[0].quetes.length, 3);
    assert.equal(rotations[0].tirage, null, 'rien de relevé au départ');
    assert.equal(rotations[0].periodKey, currentPeriodKey('journaliere'));
    assert.ok(rotations[0].nextResetAt > Math.floor(Date.now() / 1000));
  });

  it('les quêtes du groupe se choisissent en bloc', async () => {
    // Monter une rotation de dix livraisons en éditant les dix quêtes serait
    // absurde : le contenu d'un groupe partagé se remplace d'un coup.
    const avant = await admin.f.get(`/api/quests/groups/${groupe.id}/quests`);
    assert.equal(avant.json.questIds.length, 3);

    const deux = livraisons.slice(0, 2).map((q) => q.id);
    const r = await admin.f.put(`/api/quests/groups/${groupe.id}/quests`, { body: { questIds: deux } });
    assert.equal(r.status, 200);
    assert.deepEqual([...r.json.questIds].sort(), [...deux].sort());
    assert.equal((await admin.f.get(`/api/quests/rotations/${groupe.id}`)).json.quetes.length, 2);

    // Remise en état pour la suite du fichier.
    await admin.f.put(`/api/quests/groups/${groupe.id}/quests`, {
      body: { questIds: livraisons.map((q) => q.id) },
    });
    assert.equal((await admin.f.put(`/api/quests/groups/${groupe.id}/quests`, { body: {} })).status, 400);
    assert.equal((await admin.f.get('/api/quests/groups/999999/quests')).status, 404);
    // Un simple lecteur ne redéfinit pas le contenu d'un groupe partagé.
    assert.equal((await member.f.put(`/api/quests/groups/${groupe.id}/quests`, { body: { questIds: [] } })).status, 403);
  });

  it('refuse une cadence non récurrente : « une quête unique par jour » n\'a pas de sens', async () => {
    const r = await admin.f.post('/api/quests/groups', {
      body: { nom: 'Bancal', rotation: true, rotationOccurrence: 'simple' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'invalid_rotation_occurrence');
  });

  it('un lecteur relève le tirage de la période', async () => {
    const r = await member.f.post(`/api/quests/rotations/${groupe.id}/draw`, {
      body: { questId: livraisons[1].id },
    });
    assert.equal(r.status, 200);
    assert.equal(r.json.tirage.questId, livraisons[1].id);
    assert.equal(r.json.tirage.desaccord, false);

    // …et la liste de quêtes sait alors ce qui est proposé ou non.
    const quests = (await admin.f.get('/api/quests/quests')).json;
    const proposee = quests.find((q) => q.id === livraisons[1].id);
    const ecartee = quests.find((q) => q.id === livraisons[0].id);
    assert.equal(proposee.rotations[0].duJour, true);
    assert.equal(ecartee.rotations[0].duJour, false);
    assert.equal(proposee.rotations[0].pnj, 'Fédération des Marchands');
    // Une quête hors rotation n'est jamais marquée.
    assert.deepEqual(quests.find((q) => q.titre === 'Récolte de géodes').rotations, []);
  });

  it('relever à nouveau corrige son tirage au lieu d\'en ajouter un', async () => {
    await member.f.post(`/api/quests/rotations/${groupe.id}/draw`, {
      body: { questId: livraisons[2].id },
    });
    const vue = (await member.f.get(`/api/quests/rotations/${groupe.id}`)).json;
    assert.equal(vue.tirage.questId, livraisons[2].id);
    assert.equal(vue.stats.total, 1, 'une période = une observation, pas deux');
  });

  it('en rotation partagée, deux membres sur la même période ne comptent qu\'une fois', async () => {
    await admin.f.post(`/api/quests/rotations/${groupe.id}/draw`, {
      body: { questId: livraisons[2].id },
    });
    const vue = (await admin.f.get(`/api/quests/rotations/${groupe.id}`)).json;
    assert.equal(vue.stats.total, 1, 'la journée pèse un tirage, pas deux');
    const gagnante = vue.stats.parQuete.find((q) => q.questId === livraisons[2].id);
    assert.equal(gagnante.n, 1);
    assert.equal(gagnante.p, 100);
    // Les quêtes jamais tirées restent listées à 0 — « 0 sur 1 » est une
    // information, pas une absence de ligne.
    assert.equal(vue.stats.parQuete.length, 3);
    assert.equal(vue.stats.parQuete.find((q) => q.questId === livraisons[0].id).n, 0);
  });

  it('signale un désaccord entre membres au lieu de le lisser', async () => {
    await admin.f.post(`/api/quests/rotations/${groupe.id}/draw`, {
      body: { questId: livraisons[0].id },
    });
    const vue = (await admin.f.get(`/api/quests/rotations/${groupe.id}`)).json;
    assert.equal(vue.tirage.desaccord, true);
    assert.equal(vue.stats.conflits.length, 1);
    assert.equal(vue.stats.conflits[0].periodKey, currentPeriodKey('journaliere'));
    // On remet les deux membres d'accord pour la suite.
    await admin.f.post(`/api/quests/rotations/${groupe.id}/draw`, {
      body: { questId: livraisons[2].id },
    });
  });

  it('refuse un tirage qui n\'appartient pas à la rotation', async () => {
    const dehors = (await admin.f.post('/api/quests/quests', { body: { titre: 'Hors rotation' } })).json;
    const r = await member.f.post(`/api/quests/rotations/${groupe.id}/draw`, {
      body: { questId: dehors.id },
    });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'quest_not_in_rotation');
    assert.equal((await member.f.post(`/api/quests/rotations/${groupe.id}/draw`, { body: {} })).status, 400);
    assert.equal((await member.f.get('/api/quests/rotations/999999')).status, 404);
  });

  it('un groupe ordinaire n\'est pas une rotation', async () => {
    const simple = (await admin.f.post('/api/quests/groups', { body: { nom: 'Prioritaire' } })).json;
    assert.equal(simple.rotation, false);
    assert.equal((await admin.f.get(`/api/quests/rotations/${simple.id}`)).status, 404);
    assert.equal((await admin.f.get('/api/quests/rotations')).json.length, 1);
  });

  it('on peut annuler son relevé (on se trompe de ligne)', async () => {
    const r = await member.f.delete(`/api/quests/rotations/${groupe.id}/draw`);
    assert.equal(r.status, 200);
    // L'admin avait relevé la même chose : le tirage de la période tient.
    assert.equal(r.json.tirage.questId, livraisons[2].id);
    await admin.f.delete(`/api/quests/rotations/${groupe.id}/draw`);
    assert.equal((await admin.f.get(`/api/quests/rotations/${groupe.id}`)).json.tirage, null);
  });

  it('la rotation se coupe sans perdre le groupe ni ses relevés', async () => {
    await admin.f.post(`/api/quests/rotations/${groupe.id}/draw`, {
      body: { questId: livraisons[2].id },
    });
    await admin.f.put(`/api/quests/groups/${groupe.id}`, {
      body: { nom: 'Livraisons FM', rotation: false },
    });
    assert.equal((await admin.f.get('/api/quests/rotations')).json.length, 0);
    const quests = (await admin.f.get('/api/quests/quests')).json;
    assert.deepEqual(quests.find((q) => q.id === livraisons[0].id).rotations, []);
    // Rallumée, elle retrouve son historique — rien n'a été effacé.
    await admin.f.put(`/api/quests/groups/${groupe.id}`, {
      body: { nom: 'Livraisons FM', rotation: true, rotationOccurrence: 'journaliere' },
    });
    assert.equal((await admin.f.get(`/api/quests/rotations/${groupe.id}`)).json.stats.total, 1);
  });
});
