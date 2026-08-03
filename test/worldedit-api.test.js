import test from 'node:test';
import assert from 'node:assert/strict';
import { bootServer, fetcher } from './harness.js';
import { writeRegion, encodeBlockStates, localIndex, SECTION_VOLUME } from '../server/anvil/index.js';

// Construit un .mca (région 0,0 / chunk 0,0) avec quelques blocs.
function mcaBuffer(blocks) {
  const palette = [{ Name: 'minecraft:air', Properties: null }];
  const key = (n, p) => `${n}|${p ? JSON.stringify(p) : ''}`;
  const idx = new Map([[key('minecraft:air', null), 0]]);
  const indices = new Uint16Array(SECTION_VOLUME);
  for (const b of blocks) {
    const k = key(b.Name, b.Properties || null);
    let pi = idx.get(k);
    if (pi === undefined) { pi = palette.length; palette.push({ Name: b.Name, Properties: b.Properties || null }); idx.set(k, pi); }
    indices[localIndex(b.x, b.y, b.z)] = pi;
  }
  const chunk = {
    index: 0, localX: 0, localZ: 0, chunkX: 0, chunkZ: 0, timestamp: 1, compression: 2, payload: null, dirty: true,
    root: { type: 'compound', name: '', value: {
      sections: { type: 'list', value: { type: 'compound', value: [
        { Y: { type: 'byte', value: 0 }, block_states: encodeBlockStates({ palette, indices }) },
      ] } },
    } },
  };
  return writeRegion({ regionX: 0, regionZ: 0, chunks: [chunk] });
}

async function login(api, email, password) {
  const r = await api.post('/api/auth/login', { body: { email, password } });
  assert.equal(r.status, 200, `login ${email}: ${r.text}`);
}

async function uploadBuild(api, slug) {
  const buf = mcaBuffer([
    { x: 0, y: 0, z: 0, Name: 'minecraft:oak_stairs', Properties: { facing: 'east' } },
    { x: 5, y: 0, z: 0, Name: 'minefield:quart_de_bloc', Properties: { facing: 'north' } },
  ]);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'r.0.0.mca');
  fd.append('name', 'Test build');
  for (const [k, v] of [['minX', 0], ['minY', 0], ['minZ', 0], ['maxX', 15], ['maxY', 15], ['maxZ', 15]]) fd.append(k, String(v));
  const r = await api.post(`/api/workspaces/${slug}/blueprints`, { body: fd });
  assert.equal(r.status, 201, `upload: ${r.text}`);
  return r.json.id;
}

test('WorldEdit API : transform / preview / undo / export + accès par token', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');

  const ws = await admin.get('/api/workspaces');
  assert.equal(ws.status, 200);
  const slug = ws.json[0].slug;

  const id = await uploadBuild(admin, slug);
  const wePath = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  // State : éditable, bbox correcte, owner.
  const st = await admin.get(`${wePath}/state`);
  assert.equal(st.status, 200);
  assert.equal(st.json.editable, true);
  assert.equal(st.json.role, 'owner');
  assert.deepEqual(st.json.extent.min, { x: 0, y: 0, z: 0 });

  // Operations descriptor.
  const ops = await admin.get(`${wePath}/operations`);
  assert.equal(ops.status, 200);
  assert.ok(ops.json.operations.some((o) => o.id === 'mirror'));

  // Pas d'aperçu avant édition → 404 (le client retombe sur les données d'origine).
  assert.equal((await admin.get(`${wePath}/preview`)).status, 404);

  // Miroir X sur la sélection.
  const tr = await admin.post(`${wePath}/transform`, {
    body: { operation: 'mirror', params: { axis: 'x' }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 15, y: 0, z: 0 } } },
  });
  assert.equal(tr.status, 200, tr.text);
  assert.ok(tr.json.blocksChanged > 0);
  assert.equal(tr.json.undoDepth, 1);

  // Aperçu désormais présent (gzip).
  const pv = await admin.get(`${wePath}/preview`, { raw: true });
  assert.equal(pv.status, 200);
  assert.equal(pv.headers.get('content-encoding'), 'gzip');

  // Undo.
  const un = await admin.post(`${wePath}/undo`);
  assert.equal(un.status, 200, un.text);
  assert.equal(un.json.remaining, 0);

  // Export (.mca isolé → octet-stream).
  const ex = await admin.get(`${wePath}/export`, { raw: true });
  assert.equal(ex.status, 200);
  assert.match(ex.headers.get('content-disposition') || '', /\.mca/);

  // Audit non vide.
  const au = await admin.get(`${wePath}/audit`);
  assert.equal(au.status, 200);
  assert.ok(au.json.length >= 2); // mirror + undo

  // ── Partage scopé ──────────────────────────────────────────────────────────
  const sEdit = await admin.post(`/api/workspaces/${slug}/blueprints/${id}/shares`, { body: { scope: 'edit', expiresInDays: 7 } });
  assert.equal(sEdit.status, 201, sEdit.text);
  const sView = await admin.post(`/api/workspaces/${slug}/blueprints/${id}/shares`, { body: { scope: 'view' } });
  assert.equal(sView.status, 201);

  const anon = fetcher(srv.base); // pas de cookie
  // Token edit : peut transformer.
  const teState = await anon.get(`/api/worldedit/shared/${sEdit.json.token}/state`);
  assert.equal(teState.status, 200);
  assert.equal(teState.json.role, 'editor');
  const teTr = await anon.post(`/api/worldedit/shared/${sEdit.json.token}/transform`, {
    body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 0, z: 1 } } },
  });
  assert.equal(teTr.status, 200, teTr.text);

  // Token view : voit l'état + la géométrie mais NE PEUT PAS transformer (403).
  const tvState = await anon.get(`/api/worldedit/shared/${sView.json.token}/state`);
  assert.equal(tvState.json.role, 'viewer');
  const tvData = await anon.get(`/api/worldedit/shared/${sView.json.token}/data`, { raw: true });
  assert.equal(tvData.status, 200); // données d'origine servies au lecteur
  const tvTr = await anon.post(`/api/worldedit/shared/${sView.json.token}/transform`, {
    body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } },
  });
  assert.equal(tvTr.status, 403, tvTr.text);

  // Sans auth ni token : 404/401 sur la voie scoped.
  const noAuth = await anon.get(`${wePath}/state`);
  assert.ok([401, 403, 404].includes(noAuth.status));

  // Révocation du token edit → 404 ensuite.
  await admin.delete(`/api/workspaces/${slug}/blueprints/${id}/shares/${sEdit.json.id}`);
  assert.equal((await anon.get(`/api/worldedit/shared/${sEdit.json.token}/state`)).status, 404);
});

test('Import complet (full=true) : emprise détectée automatiquement', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;

  // Blocs aux extrêmes (2,1,3) → (10,6,12) : emprise attendue 9×6×10.
  const buf = mcaBuffer([
    { x: 2, y: 1, z: 3, Name: 'minecraft:stone' },
    { x: 10, y: 6, z: 12, Name: 'minecraft:gold_block' },
  ]);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'r.0.0.mca');
  fd.append('name', 'Auto');
  fd.append('full', 'true'); // aucune coordonnée
  const r = await admin.post(`/api/workspaces/${slug}/blueprints`, { body: fd });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual(r.json.min, { x: 2, y: 1, z: 3 });
  assert.deepEqual(r.json.size, { x: 9, y: 6, z: 10 });
  assert.equal(r.json.hasSource, true);
});

test('Hauteur éditable = limites du monde ; l’emprise grandit au-dessus du contenu', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug); // contenu plat à y=0
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  const st = await admin.get(`${root}/state`);
  assert.equal(st.json.bbox.min.y, -64);
  assert.equal(st.json.bbox.max.y, 319); // limites du monde, pas le contenu
  assert.equal(st.json.extent.max.y, 15); // emprise réelle du contenu (boîte importée 0..15)

  // Construire au-dessus du contenu (y=50) doit être accepté.
  const tr = await admin.post(`${root}/transform`, {
    body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection: { min: { x: 0, y: 50, z: 0 }, max: { x: 2, y: 50, z: 2 } } },
  });
  assert.equal(tr.status, 200, tr.text);
  assert.ok(tr.json.blocksChanged >= 1);

  // L'emprise du build a grandi pour inclure la nouvelle hauteur.
  const st2 = await admin.get(`${root}/state`);
  assert.ok(st2.json.extent.max.y >= 50);
});

test('Build vierge + copier d’un build, coller dans un autre + export round-trip', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const srcId = await uploadBuild(admin, slug); // build A (sert aussi de modèle de chunk)

  // Build vierge à la position monde (100,0,100), 32³.
  const blank = await admin.post(`/api/workspaces/${slug}/blueprints/blank`, {
    body: { name: 'Vierge', origin: { x: 100, y: 0, z: 100 }, size: { x: 32, y: 32, z: 32 } },
  });
  assert.equal(blank.status, 201, blank.text);
  assert.equal(blank.json.hasSource, true);
  assert.deepEqual(blank.json.min, { x: 100, y: 0, z: 100 });
  const bid = blank.json.id;
  const rootA = `/api/workspaces/${slug}/blueprints/${srcId}/worldedit`;
  const rootB = `/api/workspaces/${slug}/blueprints/${bid}/worldedit`;

  // Copie un bloc dans A, colle dans B (presse-papier partagé entre builds).
  const copy = await admin.post(`${rootA}/transform`, { body: { operation: 'copy', params: {}, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } } });
  assert.equal(copy.status, 200, copy.text);
  const paste = await admin.post(`${rootB}/transform`, { body: { operation: 'paste', params: { mode: 'overlay' }, selection: { min: { x: 110, y: 5, z: 110 }, max: { x: 110, y: 5, z: 110 } } } });
  assert.equal(paste.status, 200, paste.text);
  assert.ok(paste.json.blocksChanged >= 1);

  // Export lossless puis avec offset.
  assert.equal((await admin.get(`${rootB}/export`, { raw: true })).status, 200);
  const exRaw = await admin.get(`${rootB}/export`, { raw: true });
  const mca = Buffer.from(await exRaw.arrayBuffer());
  assert.equal((await admin.get(`${rootB}/export?dx=50&dy=0&dz=50`, { raw: true })).status, 200);

  // Round-trip : ré-importer le .mca exporté doit redonner le bloc collé.
  const fd = new FormData();
  fd.append('file', new Blob([mca]), 'r.0.0.mca');
  fd.append('name', 'Réimport');
  fd.append('full', 'true');
  const reimp = await admin.post(`/api/workspaces/${slug}/blueprints`, { body: fd });
  assert.equal(reimp.status, 201, reimp.text);
  assert.deepEqual(reimp.json.min, { x: 110, y: 5, z: 110 }); // bloc collé retrouvé
  assert.equal(reimp.json.blockCount, 1);
});

test('Commande mix (%) : remplissage aléatoire pondéré + pattern invalide refusé', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;
  const selection = { min: { x: 0, y: 0, z: 0 }, max: { x: 7, y: 0, z: 7 } };

  const ok = await admin.post(`${root}/transform`, {
    body: { operation: 'mix', params: { pattern: [{ name: 'minecraft:dirt', weight: 30 }, { name: 'minecraft:andesite', weight: 20 }, { name: 'minecraft:stone', weight: 50 }] }, selection },
  });
  assert.equal(ok.status, 200, ok.text);
  assert.ok(ok.json.blocksChanged >= 1);

  // Pattern vide → 400 bad_pattern.
  const bad = await admin.post(`${root}/transform`, {
    body: { operation: 'mix', params: { pattern: [] }, selection },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'bad_pattern');
});

test('Sélection : forme sphère (clippée) + baguette magique (flood)', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;

  // Build : une ligne de 3 pierres connectées + un bloc isolé.
  const buf = mcaBuffer([
    { x: 0, y: 0, z: 0, Name: 'minecraft:stone' },
    { x: 1, y: 0, z: 0, Name: 'minecraft:stone' },
    { x: 2, y: 0, z: 0, Name: 'minecraft:stone' },
    { x: 8, y: 0, z: 0, Name: 'minecraft:gold_block' },
    { x: 4, y: 4, z: 4, Name: 'minecraft:dirt' }, // élargit l'emprise à 5³ pour la sphère
  ]);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'r.0.0.mca');
  fd.append('name', 'Flood'); fd.append('full', 'true');
  const id = (await admin.post(`/api/workspaces/${slug}/blueprints`, { body: fd })).json.id;
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  // Baguette depuis (0,0,0) → boîte des 3 pierres connectées.
  const w = await admin.post(`${root}/select-flood`, { body: { x: 0, y: 0, z: 0 } });
  assert.equal(w.status, 200, w.text);
  assert.deepEqual(w.json.min, { x: 0, y: 0, z: 0 });
  assert.deepEqual(w.json.max, { x: 2, y: 0, z: 0 });
  assert.equal(w.json.count, 3);

  // set avec forme sphère sur une boîte 5³ : moins de blocs que la boîte pleine.
  const sphere = await admin.post(`${root}/transform`, {
    body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 4, z: 4 }, shape: { type: 'sphere' } } },
  });
  assert.equal(sphere.status, 200, sphere.text);
  assert.ok(sphere.json.blocksChanged > 0 && sphere.json.blocksChanged < 125);

  // Baguette sur de l'air (in-bounds, entre la ligne de pierre et l'or) → refus.
  assert.equal((await admin.post(`${root}/select-flood`, { body: { x: 5, y: 0, z: 0 } })).json.error, 'empty_seed');
});

test('Annuler / Rétablir (undo/redo)', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;
  const selection = { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 0, z: 3 } };

  await admin.post(`${root}/transform`, { body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection } });
  assert.equal((await admin.get(`${root}/state`)).json.undoDepth, 1);

  const un = await admin.post(`${root}/undo`);
  assert.equal(un.status, 200, un.text);
  let st = (await admin.get(`${root}/state`)).json;
  assert.equal(st.undoDepth, 0);
  assert.equal(st.redoDepth, 1);

  const re = await admin.post(`${root}/redo`);
  assert.equal(re.status, 200, re.text);
  st = (await admin.get(`${root}/state`)).json;
  assert.equal(st.undoDepth, 1);
  assert.equal(st.redoDepth, 0);

  // Une nouvelle opération invalide la pile de rétablissement.
  await admin.post(`${root}/undo`);
  await admin.post(`${root}/transform`, { body: { operation: 'set', params: { block: { name: 'minecraft:dirt' } }, selection } });
  assert.equal((await admin.get(`${root}/state`)).json.redoDepth, 0);
  assert.equal((await admin.post(`${root}/redo`)).status, 409); // rien à rétablir
});

test('Commande cut : vide la sélection (→ air) et remplit le presse-papier', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug); // oak_stairs@(0,0,0), minefield@(5,0,0)
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;
  const sel = { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 0, z: 5 } };

  const cut = await admin.post(`${root}/transform`, { body: { operation: 'cut', params: {}, selection: sel } });
  assert.equal(cut.status, 200, cut.text);
  assert.ok(cut.json.blocksChanged >= 1);

  // La zone est vidée : plus aucun oak_stairs à remplacer.
  const rep = await admin.post(`${root}/transform`, {
    body: { operation: 'replace', params: { from: { name: 'minecraft:oak_stairs' }, to: { name: 'minecraft:gold_block' } }, selection: sel },
  });
  assert.equal(rep.json.blocksChanged, 0);

  // Le presse-papier a été rempli par le cut : on peut coller ailleurs.
  const paste = await admin.post(`${root}/transform`, {
    body: { operation: 'paste', params: { mode: 'overlay' }, selection: { min: { x: 8, y: 0, z: 8 }, max: { x: 8, y: 0, z: 8 } } },
  });
  assert.equal(paste.status, 200, paste.text);
  assert.ok(paste.json.blocksChanged >= 1);
});

test('Extraction de zone → nouveau build léger et éditable', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug); // emprise 0..15

  // Extrait une petite zone autour de (0,0,0)..(5,0,5).
  const r = await admin.post(`/api/workspaces/${slug}/blueprints/${id}/extract`, {
    body: { selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 0, z: 5 } }, name: 'Zone test' },
  });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.name, 'Zone test');
  assert.deepEqual(r.json.min, { x: 0, y: 0, z: 0 });
  assert.deepEqual(r.json.size, { x: 6, y: 1, z: 6 });
  assert.equal(r.json.hasSource, true); // le nouveau build est éditable

  // Le nouveau build expose bien WorldEdit (emprise réduite).
  const st = await admin.get(`/api/workspaces/${slug}/blueprints/${r.json.id}/worldedit/state`);
  assert.equal(st.status, 200);
  assert.equal(st.json.editable, true);
  assert.deepEqual(st.json.extent.max, { x: 5, y: 0, z: 5 });

  // Une sélection hors de la zone extraite est refusée.
  const bad = await admin.post(`/api/workspaces/${slug}/blueprints/${r.json.id}/worldedit/transform`, {
    body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 0, z: 0 } } },
  });
  assert.equal(bad.json.error, 'out_of_bounds');
});

test('Extraction ignore le plafond de volume (borne = nb de blocs réels)', async (t) => {
  // Plafond de sélection minuscule : la transformation est bloquée, mais
  // l'extraction d'une zone plus grande passe quand même (peu de blocs réels).
  const srv = await bootServer({ env: { WORLDEDIT_MAX_SELECTION: '10' } });
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const selection = { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 0, z: 5 } }; // 36 cases > 10

  const tr = await admin.post(`/api/workspaces/${slug}/blueprints/${id}/worldedit/transform`, {
    body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection },
  });
  assert.equal(tr.json.error, 'selection_too_large'); // le plafond s'applique aux transformations

  const ex = await admin.post(`/api/workspaces/${slug}/blueprints/${id}/extract`, { body: { selection } });
  assert.equal(ex.status, 201, ex.text); // mais pas à l'extraction
});

test('WorldEdit API : sélection hors bornes refusée', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const r = await admin.post(`/api/workspaces/${slug}/blueprints/${id}/worldedit/transform`, {
    body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 999, y: 0, z: 0 } } },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, 'out_of_bounds');
});

test('Bibliothèque de schematics : copy → save → list → export .schem → import → delete', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;
  const selection = { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 0, z: 0 } };

  // Sauver sans presse-papier → refus.
  assert.equal((await admin.post(`${root}/schematics/save`, { body: { name: 'x' } })).json.error, 'empty_clipboard');

  // Copie la sélection puis sauvegarde dans la bibliothèque.
  const cp = await admin.post(`${root}/transform`, { body: { operation: 'copy', selection } });
  assert.equal(cp.status, 200, cp.text);
  const saved = await admin.post(`${root}/schematics/save`, { body: { name: 'Ma cabane' } });
  assert.equal(saved.status, 200, saved.text);
  assert.equal(saved.json.sx, 6);

  const list = await admin.get(`${root}/schematics`);
  assert.equal(list.json.length, 1);
  assert.equal(list.json[0].name, 'Ma cabane');
  const sid = list.json[0].id;

  // Export Sponge .schem → gzip (magic 1f 8b).
  const ex = await admin.get(`${root}/schematics/${sid}/export?format=schem`, { raw: true });
  assert.equal(ex.status, 200);
  const buf = Buffer.from(await ex.arrayBuffer());
  assert.equal(buf[0], 0x1f); assert.equal(buf[1], 0x8b);

  // Export Litematica.
  const exL = await admin.get(`${root}/schematics/${sid}/export?format=litematic`, { raw: true });
  assert.equal(exL.status, 200);

  // Réimporte le .schem → presse-papier (sans re-sauver).
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'cabane.schem');
  fd.append('save', 'false');
  const imp = await admin.post(`${root}/schematics/import`, { body: fd });
  assert.equal(imp.status, 200, imp.text);
  assert.deepEqual(imp.json.clipboard, { sx: 6, sy: 1, sz: 1 });

  // Suppression.
  assert.equal((await admin.delete(`${root}/schematics/${sid}`)).status, 200);
  assert.equal((await admin.get(`${root}/schematics`)).json.length, 0);
});

// Régression : un lien de partage est scopé à UN build, la bibliothèque de
// schematics est scopée au WORKSPACE. Un token « edit » remis pour dépanner sur
// un seul build ne doit pas donner accès — encore moins en suppression — aux
// schematics issues de builds jamais partagés.
test('Partage scopé : un token « edit » n’atteint pas la bibliothèque du workspace', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;

  // Deux builds distincts : on ne partagera QUE le second.
  const secretId = await uploadBuild(admin, slug);
  const sharedId = await uploadBuild(admin, slug);
  const secretRoot = `/api/workspaces/${slug}/blueprints/${secretId}/worldedit`;

  // L'admin range une schematic issue du build NON partagé.
  await admin.post(`${secretRoot}/transform`, {
    body: { operation: 'copy', selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 5, y: 0, z: 0 } } },
  });
  assert.equal((await admin.post(`${secretRoot}/schematics/save`, { body: { name: 'Plan confidentiel' } })).status, 200);
  const sid = (await admin.get(`${secretRoot}/schematics`)).json[0].id;

  // Lien « edit » sur l'AUTRE build.
  const share = await admin.post(`/api/workspaces/${slug}/blueprints/${sharedId}/shares`, { body: { scope: 'edit' } });
  assert.equal(share.status, 201, share.text);
  const tokenRoot = `/api/worldedit/shared/${share.json.token}`;
  const anon = fetcher(srv.base); // aucun cookie

  // Le lien édite bien le build partagé (la fonctionnalité reste entière)…
  const st = await anon.get(`${tokenRoot}/state`);
  assert.equal(st.status, 200);
  assert.equal(st.json.canEdit, true);
  assert.equal(st.json.library, false, 'le client doit masquer la bibliothèque sur un partage');

  // …mais toute la bibliothèque du workspace lui est fermée.
  for (const [method, path] of [
    ['get', `${tokenRoot}/schematics`],
    ['post', `${tokenRoot}/schematics/save`],
    ['post', `${tokenRoot}/schematics/${sid}/load`],
    ['get', `${tokenRoot}/schematics/${sid}/export?format=schem`],
    ['delete', `${tokenRoot}/schematics/${sid}`],
  ]) {
    const r = await anon[method](path, { body: method === 'post' ? { name: 'x' } : undefined });
    assert.equal(r.status, 403, `${method.toUpperCase()} ${path} → ${r.status} (attendu 403)`);
    assert.equal(r.json.detail, 'session_required');
  }

  // Importer dans SON presse-papier reste permis (coller dans le build partagé),
  // mais `save=true` ne doit rien écrire dans la bibliothèque du workspace.
  const buf = Buffer.from(await (await admin.get(`${secretRoot}/schematics/${sid}/export?format=schem`, { raw: true })).arrayBuffer());
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'x.schem');
  fd.append('save', 'true');
  const imp = await anon.post(`${tokenRoot}/schematics/import`, { body: fd });
  assert.equal(imp.status, 200, imp.text);
  assert.equal(imp.json.saved, null, 'un partage ne doit pas pouvoir écrire dans la bibliothèque');

  // La schematic confidentielle est toujours là, intacte, et la bibliothèque
  // n'a pas grossi.
  const after = await admin.get(`${secretRoot}/schematics`);
  assert.equal(after.json.length, 1);
  assert.equal(after.json[0].name, 'Plan confidentiel');

  // Le membre authentifié, lui, garde l'accès complet.
  assert.equal((await admin.get(`${secretRoot}/schematics`)).status, 200);
});

test('Peindre biome : op biome via API + undo', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;
  const selection = { min: { x: 0, y: 0, z: 0 }, max: { x: 7, y: 0, z: 7 } };

  // Biome invalide → 400.
  const bad = await admin.post(`${root}/transform`, { body: { operation: 'biome', params: { biome: 'pas valide !' }, selection } });
  assert.equal(bad.json.error, 'bad_biome');

  const r = await admin.post(`${root}/transform`, { body: { operation: 'biome', params: { biome: 'minecraft:desert' }, selection } });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.blocksChanged > 0);
  assert.equal((await admin.get(`${root}/state`)).json.undoDepth, 1);

  const un = await admin.post(`${root}/undo`);
  assert.equal(un.status, 200, un.text);
});

test('Robustesse : build vierge valide + durée d’opération dans l’audit', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;

  // Build vierge : doit passer la validation des chunks vierges.
  const blank = await admin.post(`/api/workspaces/${slug}/blueprints/blank`, {
    body: { name: 'Vierge', origin: { x: 0, y: 0, z: 0 }, size: { x: 32, y: 16, z: 32 } },
  });
  assert.equal(blank.status, 201, blank.text);
  const id = blank.json.id;
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  // Une opération renvoie sa durée et l’audit la consigne.
  const r = await admin.post(`${root}/transform`, {
    body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 4, z: 4 } } },
  });
  assert.equal(r.status, 200, r.text);
  assert.ok(typeof r.json.ms === 'number' && r.json.ms >= 0);

  const audit = await admin.get(`${root}/audit`);
  assert.equal(audit.status, 200);
  assert.ok(audit.json.length >= 1);
  assert.ok('durationMs' in audit.json[0]);
});

test('Transform asynchrone : jobId + suivi de progression jusqu’au résultat', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  const start = await admin.post(`${root}/transform`, {
    body: { operation: 'set', params: { block: { name: 'minecraft:stone' } }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 8, y: 0, z: 8 } }, async: true },
  });
  assert.equal(start.status, 200, start.text);
  assert.ok(start.json.jobId, 'jobId renvoyé');

  // Poll jusqu’à done (ou error).
  let job, tries = 0;
  do {
    await new Promise((r) => setTimeout(r, 80));
    job = (await admin.get(`${root}/jobs/${start.json.jobId}`)).json;
  } while (job.status === 'running' && ++tries < 50);
  assert.equal(job.status, 'done', JSON.stringify(job));
  assert.equal(job.pct, 100);
  assert.ok(job.result.blocksChanged > 0);
  assert.equal((await admin.get(`${root}/state`)).json.undoDepth, 1);

  // Job inconnu → 404.
  assert.equal((await admin.get(`${root}/jobs/nope`)).status, 404);
});

import sharp from 'sharp';

test('Tracé / route : op path via API', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  const r = await admin.post(`${root}/transform`, {
    body: { operation: 'path', params: { preset: 'cobblestone', width: 3, bow: 0 }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 0, z: 0 } } },
  });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.blocksChanged > 0);
});

test('Image → relief : heightmap via API + undo', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  // Image grise uniforme → moitié de la hauteur partout.
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer();
  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'h.png');
  fd.append('selection', JSON.stringify({ min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 8, z: 3 } }));
  fd.append('block', JSON.stringify({ name: 'minecraft:grass_block', states: null }));
  fd.append('under', JSON.stringify({ name: 'minecraft:dirt' }));
  fd.append('mode', 'solid');
  const r = await admin.post(`${root}/heightmap`, { body: fd });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.blocksChanged > 0);
  assert.equal((await admin.get(`${root}/state`)).json.undoDepth, 1);
  assert.equal((await admin.post(`${root}/undo`)).status, 200);
});

test('Zone → heightmap : export PNG depuis le relief de la sélection', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;

  // Build avec des hauteurs variées : colonne (0,0) basse, (3,0) haute.
  const buf = mcaBuffer([
    { x: 0, y: 0, z: 0, Name: 'minecraft:stone' },
    { x: 3, y: 6, z: 0, Name: 'minecraft:stone' },
  ]);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'r.0.0.mca');
  fd.append('name', 'Relief'); fd.append('full', 'true');
  const id = (await admin.post(`/api/workspaces/${slug}/blueprints`, { body: fd })).json.id;
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  const r = await admin.post(`${root}/heightmap-export`, {
    body: { selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 6, z: 0 } } }, raw: true,
  });
  assert.equal(r.status, 200);
  const png = Buffer.from(await r.arrayBuffer());
  // Signature PNG.
  assert.equal(png[0], 0x89); assert.equal(png[1], 0x50); assert.equal(png[2], 0x4e); assert.equal(png[3], 0x47);
  // Décode : 4×1 px, la dernière colonne (haute) plus claire que la première.
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 4); assert.equal(info.height, 1);
  const ch = info.channels;
  assert.ok(data[3 * ch] > data[0], 'colonne haute plus claire que la basse');
});

test('Générer terrain : op terrain (dénivelés) via API', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;

  // Plateforme plate 16×16 (un chunk) à sculpter.
  const blocks = [];
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) blocks.push({ x, y: 0, z, Name: 'minecraft:stone' });
  const buf = mcaBuffer(blocks);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'r.0.0.mca');
  fd.append('name', 'Plat'); fd.append('full', 'true');
  const id = (await admin.post(`/api/workspaces/${slug}/blueprints`, { body: fd })).json.id;
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  const r = await admin.post(`${root}/transform`, {
    body: { operation: 'terrain', params: { style: 'montagne', seed: 1, palette: 'mountain' }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 15, y: 28, z: 15 } } },
  });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.blocksChanged > 0);
  assert.equal((await admin.get(`${root}/state`)).json.undoDepth, 1);
});

test('Miroir (copie) : duplique en miroir, original intact', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;

  // Plateforme 16×16 (un chunk) pour avoir de la place à droite.
  const blocks = [];
  for (let x = 0; x < 4; x++) blocks.push({ x, y: 0, z: 0, Name: 'minecraft:stone' });
  const buf = mcaBuffer(blocks);
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'r.0.0.mca');
  fd.append('name', 'Sym'); fd.append('full', 'true');
  for (const [k, v] of [['minX', 0], ['minY', 0], ['minZ', 0], ['maxX', 15], ['maxY', 0], ['maxZ', 0]]) fd.append(k, String(v));
  const id = (await admin.post(`/api/workspaces/${slug}/blueprints`, { body: fd })).json.id;
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  const r = await admin.post(`${root}/transform`, {
    body: { operation: 'mirrorcopy', params: { axis: 'x', side: 'positive', gap: 0, mode: 'overwrite' }, selection: { min: { x: 0, y: 0, z: 0 }, max: { x: 3, y: 0, z: 0 } } },
  });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.blocksChanged > 0);
  assert.deepEqual(r.json.bounds.min, { x: 4, y: 0, z: 0 }); // copie posée à droite
});

test('Panneau texte : écrit du texte (coréen) sur marbre, mur plat', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;

  // Mur plat 12 (X) × 6 (Y), épaisseur 1 en Z.
  const blocks = [];
  for (let x = 0; x < 12; x++) for (let y = 0; y < 6; y++) blocks.push({ x, y, z: 0, Name: 'minecraft:stone' });
  const buf = mcaBuffer(blocks);
  const fd0 = new FormData();
  fd0.append('file', new Blob([buf]), 'r.0.0.mca');
  fd0.append('name', 'Mur'); fd0.append('full', 'true');
  const id = (await admin.post(`/api/workspaces/${slug}/blueprints`, { body: fd0 })).json.id;
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  const fd = new FormData();
  fd.append('selection', JSON.stringify({ min: { x: 0, y: 0, z: 0 }, max: { x: 11, y: 5, z: 0 } }));
  fd.append('text', '한A');
  fd.append('preset', 'black_marble');
  const r = await admin.post(`${root}/panel`, { body: fd });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.blocksChanged > 0);
  assert.deepEqual(r.json.plane, { w: 12, h: 6 });
  assert.equal((await admin.get(`${root}/state`)).json.undoDepth, 1);

  // Ni texte ni image → refus.
  const fd2 = new FormData();
  fd2.append('selection', JSON.stringify({ min: { x: 0, y: 0, z: 0 }, max: { x: 11, y: 5, z: 0 } }));
  assert.equal((await admin.post(`${root}/panel`, { body: fd2 })).json.error, 'no_content');
});

import nbt from 'prismarine-nbt';

test('Carte Minecraft : texte → map_0.dat (128×128, palette de carte)', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;
  const id = await uploadBuild(admin, slug);
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  const fd = new FormData();
  fd.append('text', '한국');
  fd.append('preset', 'black_marble');
  const r = await admin.post(`${root}/mapart`, { body: fd, raw: true });
  assert.equal(r.status, 200);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf[0], 0x1f); assert.equal(buf[1], 0x8b); // gzip
  const { parsed } = await nbt.parse(buf);
  const s = nbt.simplify(parsed);
  assert.equal(s.data.colors.length, 16384); // 128×128
  assert.equal(s.data.scale, 0);

  // Sans contenu → refus.
  const r2 = await admin.post(`${root}/mapart`, { body: new FormData() });
  assert.equal(r2.json.error, 'no_content');
});

test('Carte en blocs : image → zone plate de blocs-couleurs + aperçu PNG', async (t) => {
  const srv = await bootServer();
  t.after(() => srv.stop());
  const admin = fetcher(srv.base);
  await login(admin, 'admin@test.local', 'adminpw1-strong');
  const slug = (await admin.get('/api/workspaces')).json[0].slug;

  // Sol plat 12×12 (épaisseur 1 en Y).
  const blocks = [];
  for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) blocks.push({ x, y: 0, z, Name: 'minecraft:stone' });
  const buf = mcaBuffer(blocks);
  const fd0 = new FormData();
  fd0.append('file', new Blob([buf]), 'r.0.0.mca');
  fd0.append('name', 'Sol'); fd0.append('full', 'true');
  const id = (await admin.post(`/api/workspaces/${slug}/blueprints`, { body: fd0 })).json.id;
  const root = `/api/workspaces/${slug}/blueprints/${id}/worldedit`;

  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'a.png');
  fd.append('selection', JSON.stringify({ min: { x: 0, y: 0, z: 0 }, max: { x: 11, y: 0, z: 11 } }));
  const r = await admin.post(`${root}/mapblocks`, { body: fd });
  assert.equal(r.status, 200, r.text);
  assert.ok(r.json.blocksChanged > 0);
  assert.deepEqual(r.json.plane, { w: 12, h: 12 });

  // Aperçu PNG du texte.
  const fdP = new FormData();
  fdP.append('text', '한A'); fdP.append('preset', 'black_marble');
  const rp = await admin.post(`${root}/render-preview`, { body: fdP, raw: true });
  assert.equal(rp.status, 200);
  const pbuf = Buffer.from(await rp.arrayBuffer());
  assert.equal(pbuf[0], 0x89); assert.equal(pbuf[1], 0x50); // PNG
});
