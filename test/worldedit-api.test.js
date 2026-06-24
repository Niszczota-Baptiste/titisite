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
  assert.deepEqual(st.json.bbox.min, { x: 0, y: 0, z: 0 });

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
