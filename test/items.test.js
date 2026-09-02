import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { bootServer, fetcher } from './harness.js';

let server;
const ADMIN = { email: 'admin@test.local', password: 'adminpw1-strong' };
const MEMBER = { email: 'member@test.local', password: 'memberpw1-strong' };

before(async () => { server = await bootServer(); });
after(async () => { await server.stop(); });

async function login(creds) {
  const f = fetcher(server.base);
  const r = await f.post('/api/auth/login', { body: creds });
  assert.equal(r.status, 200, `login ${creds.email} → ${r.status}`);
  return { f, user: r.json.user };
}

// ── Gardes d'accès ────────────────────────────────────────────────────────

describe('items — accès', () => {
  it('refuse un anonyme', async () => {
    const f = fetcher(server.base);
    assert.equal((await f.get('/api/items')).status, 401);
    assert.equal((await f.get('/api/items/ref')).status, 401);
  });

  it('refuse un membre sans le tag items', async () => {
    const { f } = await login(MEMBER);
    assert.equal((await f.get('/api/items')).status, 403);
    assert.equal((await f.post('/api/items', { body: { nom: 'X' } })).status, 403);
  });

  it('laisse passer un admin', async () => {
    const { f } = await login(ADMIN);
    assert.equal((await f.get('/api/items')).status, 200);
  });

  it('ouvre la lecture seule à can_view_items, sans l\'écriture', async () => {
    const { f: admin } = await login(ADMIN);
    const users = await admin.get('/api/users');
    const membre = users.json.find((u) => u.email === MEMBER.email);
    await admin.put(`/api/users/${membre.id}`, { body: { canViewItems: true } });

    const { f, user } = await login(MEMBER);
    assert.equal(user.canViewItems, true);
    assert.equal(user.canEditItems, false);
    assert.equal((await f.get('/api/items')).status, 200, 'lecture ouverte');
    assert.equal((await f.post('/api/items', { body: { nom: 'X' } })).status, 403, 'écriture fermée');
    assert.equal((await f.put('/api/items/weights/enchant:protection', { body: { poids: 99 } })).status, 403);
  });

  it('can_edit_items implique la lecture', async () => {
    const { f: admin } = await login(ADMIN);
    const users = await admin.get('/api/users');
    const membre = users.json.find((u) => u.email === MEMBER.email);
    await admin.put(`/api/users/${membre.id}`, { body: { canViewItems: false, canEditItems: true } });

    const { f, user } = await login(MEMBER);
    assert.equal(user.canViewItems, true, 'éditer implique voir');
    assert.equal(user.canEditItems, true);
    assert.equal((await f.get('/api/items')).status, 200);
  });
});

// ── Référentiel + CRUD ────────────────────────────────────────────────────

describe('items — référentiel', () => {
  it('sert tout le référentiel en un appel', async () => {
    const { f } = await login(ADMIN);
    const { status, json } = await f.get('/api/items/ref');
    assert.equal(status, 200);
    for (const cle of ['tiers', 'series', 'panoplies', 'weights', 'attributs',
      'enchantements', 'slots', 'acquisitions', 'statuts']) {
      assert.ok(Array.isArray(json[cle]) && json[cle].length > 0, `${cle} vide`);
    }
    assert.equal(json.attributs.length, 11, 'les 11 attributs vanilla');
  });

  it('amorce le barème et le remet à zéro sur demande', async () => {
    const { f } = await login(ADMIN);
    const avant = (await f.get('/api/items/weights')).json;
    const protection = avant.find((w) => w.cle === 'enchant:protection');
    assert.ok(protection && protection.poids > 0);

    const modifie = await f.put('/api/items/weights/enchant:protection', { body: { poids: 99 } });
    assert.equal(modifie.status, 200);
    assert.equal(modifie.json.poids, 99);

    const remis = await f.post('/api/items/weights/reset');
    assert.equal(remis.status, 200);
    assert.equal(remis.json.find((w) => w.cle === 'enchant:protection').poids, protection.poids);
  });

  it('404 sur un poids inconnu plutôt que de le créer', async () => {
    const { f } = await login(ADMIN);
    assert.equal((await f.put('/api/items/weights/enchant:inexistant', { body: { poids: 1 } })).status, 404);
  });
});

describe('items — cycle de vie', () => {
  it('crée, relit par slug, modifie et supprime', async () => {
    const { f } = await login(ADMIN);
    const ref = (await f.get('/api/items/ref')).json;
    const commun = ref.tiers.find((t) => t.nom === 'Commun');

    const cree = await f.post('/api/items', {
      body: {
        nom: 'Dague d\'essai', description: 'Une lame de test.', baseItem: 'iron_sword',
        tierId: commun.id, acquisition: 'craftable', ressources: '2 lingots',
        attributs: [{ attribut: 'ATTACK_DAMAGE', valeur: 3, mode: 'flat', slot: 'mainhand' }],
        enchantements: [{ enchant: 'sharpness', niveau: 2 }],
        unbreakable: true,
      },
    });
    assert.equal(cree.status, 201);
    const item = cree.json;
    assert.equal(item.slug, 'dague-d-essai');
    assert.equal(item.statut, 'a_tester', 'statut par défaut');
    assert.equal(item.unbreakable, true);
    assert.equal(item.attributs.length, 1);
    assert.equal(item.enchantements.length, 1, 'le drapeau incassable n\'est pas un enchantement');
    assert.ok(item.puissance.total > 0);
    assert.ok(item.commandeGeneree.startsWith('give @p minecraft:iron_sword'));

    const parSlug = await f.get(`/api/items/${item.slug}`);
    assert.equal(parSlug.status, 200);
    assert.equal(parSlug.json.id, item.id);

    const modif = await f.put(`/api/items/${item.id}`, {
      body: { ...item, statut: 'en_jeu', attributs: [], enchantements: [], unbreakable: false },
    });
    assert.equal(modif.status, 200);
    assert.equal(modif.json.statut, 'en_jeu');
    assert.equal(modif.json.attributs.length, 0, 'les enfants sont remplacés en bloc');
    assert.equal(modif.json.unbreakable, false);
    assert.equal(modif.json.puissance.verdict, 'incomplet', 'plus aucune stat → fiche à documenter');

    assert.equal((await f.delete(`/api/items/${item.id}`)).status, 204);
    assert.equal((await f.get(`/api/items/${item.id}`)).status, 404);
  });

  it('écarte un attribut inconnu et borne le niveau d\'un enchantement', async () => {
    const { f } = await login(ADMIN);
    const { json } = await f.post('/api/items', {
      body: {
        nom: 'Item borné', baseItem: 'iron_sword',
        attributs: [{ attribut: 'PAS_UN_ATTRIBUT', valeur: 5 }, { attribut: 'ARMOR', valeur: 2, slot: 'nawak' }],
        enchantements: [{ enchant: 'sharpness', niveau: 9999 }, { enchant: 'inconnu', niveau: 1 }],
      },
    });
    assert.equal(json.attributs.length, 1);
    assert.equal(json.attributs[0].slot, 'any', 'un slot inconnu retombe sur « partout »');
    assert.equal(json.enchantements.length, 1);
    assert.equal(json.enchantements[0].niveau, 255, 'niveau plafonné');
    await f.delete(`/api/items/${json.id}`);
  });

  it('refuse deux items sur le même CMD, en nommant celui qui le détient', async () => {
    const { f } = await login(ADMIN);
    const premier = await f.post('/api/items', { body: { nom: 'Premier CMD', baseItem: 'iron_sword', cmd: 1777 } });
    assert.equal(premier.status, 201);

    const doublon = await f.post('/api/items', { body: { nom: 'Doublon CMD', baseItem: 'iron_axe', cmd: 1777 } });
    assert.equal(doublon.status, 409);
    assert.equal(doublon.json.error, 'cmd_taken');
    assert.equal(doublon.json.item.nom, 'Premier CMD');

    // Le même item peut garder son propre CMD à la modification.
    const maj = await f.put(`/api/items/${premier.json.id}`, { body: { ...premier.json, nom: 'Premier CMD (v2)' } });
    assert.equal(maj.status, 200);
    await f.delete(`/api/items/${premier.json.id}`);
  });
});

describe('items — CMD et séries', () => {
  it('propose le prochain CMD libre dans la plage de la série', async () => {
    const { f } = await login(ADMIN);
    // Code libre : le classeur occupe déjà 01–08 et 99.
    const cree = await f.post('/api/items/series', { body: { code: '7x7', nom: 'Série test' } });
    assert.equal(cree.status, 201);
    const serie = cree.json;
    assert.equal(serie.code, '77', 'le code est normalisé sur deux chiffres');

    const vide = await f.get(`/api/items/series/${serie.id}/next-cmd`);
    assert.equal(vide.json.cmd, 77001, 'première place de la plage');
    assert.deepEqual(vide.json.plage, [77001, 77999]);

    await f.post('/api/items', { body: { nom: 'CMD 77001', baseItem: 'iron_sword', serieId: serie.id, cmd: 77001 } });
    const suivant = await f.get(`/api/items/series/${serie.id}/next-cmd`);
    assert.equal(suivant.json.cmd, 77002, 'reprend après le plus grand CMD de la série');
  });

  it('refuse deux séries sur le même code, en nommant celle qui le détient', async () => {
    const { f } = await login(ADMIN);
    const doublon = await f.post('/api/items/series', { body: { code: '01', nom: 'Doublon' } });
    assert.equal(doublon.status, 409);
    assert.equal(doublon.json.error, 'code_taken');
    assert.equal(doublon.json.serie.nom, 'Guilde des explorateurs');
  });

  it('404 sur le prochain CMD d\'une série inexistante', async () => {
    const { f } = await login(ADMIN);
    assert.equal((await f.get('/api/items/series/99999/next-cmd')).status, 404);
  });
});

describe('items — aperçu de puissance', () => {
  it('calcule un brouillon jamais enregistré', async () => {
    const { f } = await login(ADMIN);
    const ref = (await f.get('/api/items/ref')).json;
    const artefact = ref.tiers.find((t) => t.nom === 'Artefact');
    const { status, json } = await f.post('/api/items/power', {
      body: {
        nom: 'Brouillon', baseItem: 'netherite_chestplate', tierId: artefact.id,
        attributs: [{ attribut: 'ARMOR', valeur: 10, mode: 'flat' }],
        enchantements: [{ enchant: 'protection', niveau: 4 }],
        unbreakable: true,
      },
    });
    assert.equal(status, 200);
    assert.ok(json.puissance.total > 0);
    assert.equal(json.puissance.budget, artefact.budget);
    assert.ok(json.puissance.lignes.length >= 3);
    assert.ok(json.commandeGeneree.includes('netherite_chestplate'));
    assert.equal((await f.get('/api/items')).json.some((i) => i.nom === 'Brouillon'), false, 'rien n\'a été créé');
  });

  it('donne le même résultat que l\'item une fois enregistré', async () => {
    const { f } = await login(ADMIN);
    const ref = (await f.get('/api/items/ref')).json;
    const body = {
      nom: 'Cohérence aperçu', baseItem: 'diamond_chestplate',
      tierId: ref.tiers.find((t) => t.nom === 'Rare').id,
      attributs: [{ attribut: 'ARMOR', valeur: 8, mode: 'flat', slot: 'chest' }],
      enchantements: [{ enchant: 'thorns', niveau: 2 }],
      unbreakable: true,
    };
    const apercu = (await f.post('/api/items/power', { body })).json;
    const cree = (await f.post('/api/items', { body })).json;
    assert.equal(apercu.puissance.total, cree.puissance.total);
    assert.equal(apercu.puissance.verdict, cree.puissance.verdict);
    await f.delete(`/api/items/${cree.id}`);
  });
});

describe('items — le seed du classeur', () => {
  it('a chargé le catalogue des scribes', async () => {
    const { f } = await login(ADMIN);
    const items = (await f.get('/api/items')).json;
    assert.ok(items.length >= 50, `catalogue trop court : ${items.length}`);

    const trident = items.find((i) => i.nom === 'Trident des fonds marins');
    assert.ok(trident, 'le trident des Ondiens est là');
    assert.equal(trident.tierNom, 'Artefact');
    assert.equal(trident.unbreakable, true);
    assert.ok(trident.commande.includes('impaling'), 'la commande du classeur est conservée telle quelle');
    // Le classeur met ce « 10 » dans la colonne Infinity ; la commande dit
    // impaling, et c'est elle qui tourne en jeu.
    assert.ok(trident.enchantements.some((e) => e.enchant === 'impaling' && e.niveau === 10));
    assert.ok(!trident.enchantements.some((e) => e.enchant === 'infinity'));
    // Les deux vitesses du trident (main principale ET secondaire) ne tiennent
    // pas dans une cellule : elles viennent de la commande.
    assert.equal(trident.attributs.filter((a) => a.attribut === 'MOVEMENT_SPEED').length, 2);

    // Les neuf séries du classeur, y compris celles encore vides : une série
    // sans item est une plage de CMD réservée.
    const codes = new Set((await f.get('/api/items/series')).json.map((s) => s.code));
    for (const c of ['01', '02', '03', '04', '05', '06', '07', '08', '99']) {
      assert.ok(codes.has(c), `série ${c} manquante`);
    }
    const series = (await f.get('/api/items/series')).json;
    assert.equal(series.find((s) => s.code === '04').nom, 'Tréfonds');
    assert.equal(series.find((s) => s.code === '06').nom, 'Ondiens');

    // Les deux échelles de tiers du classeur coexistent.
    const echelles = new Set((await f.get('/api/items/tiers')).json.map((t) => t.echelle));
    assert.deepEqual([...echelles].sort(), ['standard', 'trefonds']);
  });

  it('reprend la couleur de police comme statut', async () => {
    const { f } = await login(ADMIN);
    const items = (await f.get('/api/items')).json;
    // Les pièces de la guilde d'explorateurs sont en rouge dans le classeur
    // (« pas encore introduits en jeu ») ; le Totem Illager est en noir.
    assert.equal(items.find((i) => i.nom === 'Zweihander').statut, 'a_tester');
    assert.equal(items.find((i) => i.nom === 'Totem Illager').statut, 'en_jeu');
    assert.equal(items.find((i) => i.nom === 'Trident des fonds marins').statut, 'en_jeu');
  });

  it('distingue un ajout brut d\'un modificateur en pourcentage', async () => {
    const { f } = await login(ADMIN);
    const zwei = (await f.get('/api/items')).json.find((i) => i.nom === 'Zweihander');
    // Le classeur note « 4.0 » sans format et « -0.15 » au format 0 % : deux
    // opérations vanilla différentes que seul le format de cellule sépare.
    const deg = zwei.attributs.find((a) => a.attribut === 'ATTACK_DAMAGE');
    const vit = zwei.attributs.find((a) => a.attribut === 'ATTACK_SPEED');
    assert.deepEqual([deg.valeur, deg.mode], [4, 'flat']);
    assert.deepEqual([vit.valeur, vit.mode], [-15, 'pourcent']);
    assert.ok(zwei.commandeGeneree.includes('Amount:-0.15,Operation:1'));
  });

  it('garde les deux copies d\'une pièce présente dans deux séries', async () => {
    const { f } = await login(ADMIN);
    const zwei = (await f.get('/api/items')).json.filter((i) => i.nom === 'Zweihander');
    // L'onglet Nostra reprend la panoplie d'explorateur : deux séries, donc
    // deux plages de CMD, donc deux modèles — pas un doublon à fusionner.
    assert.equal(zwei.length, 2);
    assert.deepEqual(zwei.map((i) => i.serieCode).sort(), ['01', '02']);
    assert.notEqual(zwei[0].slug, zwei[1].slug);
  });

  it('filtre par tier, statut et texte libre', async () => {
    const { f } = await login(ADMIN);
    const tiers = (await f.get('/api/items/tiers')).json;
    const artefact = tiers.find((t) => t.nom === 'Artefact');

    const parTier = (await f.get(`/api/items?tier=${artefact.id}`)).json;
    assert.ok(parTier.length > 0);
    assert.ok(parTier.every((i) => i.tierId === artefact.id));

    const enJeu = (await f.get('/api/items?statut=en_jeu')).json;
    assert.ok(enJeu.every((i) => i.statut === 'en_jeu'));

    const recherche = (await f.get('/api/items?q=explorateur')).json;
    assert.ok(recherche.length >= 5, 'les pièces de la guilde d\'explorateurs');
  });
});
