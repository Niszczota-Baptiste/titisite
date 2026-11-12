// Répétition de migration de l'atelier d'auteur, sur des données de TEST.
//
// Une base est créée par une ancienne version du code (par ex. `main`), ouverte
// ensuite par la version à déployer, puis rouverte par l'ancienne (retour
// arrière). À chaque étape le contenu est comparé champ par champ.
//
//   git worktree add --detach ../titisite-avant origin/main
//   ln -s "$PWD/node_modules" ../titisite-avant/node_modules   # mêmes dépendances
//   mkdir -p /tmp/repetition/uploads
//   node test/tools/migration-rehearsal.mjs ../titisite-avant "$PWD" /tmp/repetition
//
// Ne touche à aucune base réelle : tout vit dans le dossier de travail donné
// (à vider entre deux essais). Procédure complète, sauvegarde et restauration :
// docs/atelier-mobile.md, « Migrations et sauvegarde ».
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const [OLD, NEW, WORK] = process.argv.slice(2).map((p) => path.resolve(p || ''));
if (process.argv.length < 5) { console.error('usage : node test/tools/migration-rehearsal.mjs <ancien code> <nouveau code> <dossier de travail>'); process.exit(2); }
const PORT = 4870;
const base = `http://127.0.0.1:${PORT}`;
const env = { ...process.env, PORT: String(PORT), DB_PATH: `${WORK}/data.sqlite`, UPLOADS_DIR: `${WORK}/uploads`, JWT_SECRET: 'rehearsal-secret', ADMIN_EMAIL: 'admin@test.local', ADMIN_PASSWORD: 'adminpw1-strong', MEMBER_EMAIL: 'member@test.local', MEMBER_PASSWORD: 'memberpw1-strong', NODE_ENV: 'development', ANTHROPIC_API_KEY: '' };

async function boot(cwd) {
  const child = spawn(process.execPath, ['server/index.js'], { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (c) => { err += c; });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`boot timeout\n${err}`)), 20000);
    child.stdout.on('data', (c) => { if (String(c).includes('listening')) { clearTimeout(t); resolve(); } });
    child.on('exit', (code) => { clearTimeout(t); reject(new Error(`exit ${code}\n${err}`)); });
  });
  return { stop: () => new Promise((r) => { child.on('exit', r); child.kill('SIGTERM'); }), err: () => err };
}
let cookie = '';
async function call(method, path, body, form) {
  const headers = { 'X-Author-Request': '1', ...(cookie ? { Cookie: cookie } : {}) };
  if (body && !form) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* binaire */ }
  return { status: res.status, json, text };
}
const login = () => call('POST', '/api/auth/login', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
const sharp = createRequire(`${NEW}/package.json`)('sharp');
const PNG = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#335577' } }).png().toBuffer();

// ── 1. Base créée par l'ANCIEN code ──────────────────────────────────────────
let srv = await boot(OLD);
assert.equal((await login()).status, 200);
const pid = (await call('POST', '/api/author/projects', { title: 'Le Livre des Cendres', subtitle: 'Tome I', targetWords: 90000 })).json.id;
const B = `/api/author/projects/${pid}`;
const ch = (await call('POST', `${B}/entities`, { kind: 'chapter', title: 'Prologue', content: 'Élise relit [[Le Pacte]]. 비가 내렸다.', status: 'premier_jet' })).json;
const perso = (await call('POST', `${B}/entities`, { kind: 'character', title: 'Élise Varnier', summary: 'Cartographe.', body: 'Née à Valcendre.', tags: ['protagoniste'] })).json;
const note = (await call('POST', `${B}/entities`, { kind: 'note', title: 'Le Pacte', body: 'Idée privée.' })).json;
await call('PUT', `${B}/entities/${ch.id}`, { revision: ch.revision, content: 'Élise relit [[Le Pacte]]. 비가 내렸다. Suite.' });
await call('POST', `${B}/links`, { fromId: perso.id, toId: ch.id, kind: 'apparait_dans' });
const fd = new FormData(); fd.append('image', new Blob([PNG], { type: 'image/png' }), 'i.png'); fd.append('entityId', String(perso.id)); fd.append('purpose', 'gallery');
const img = (await call('POST', `${B}/media`, null, fd)).json;
assert.ok(img?.url, 'image envoyée avec l\'ancien code');
const before = { project: (await call('GET', B)).json, ch: (await call('GET', `${B}/entities/${ch.id}`)).json, perso: (await call('GET', `${B}/entities/${perso.id}`)).json, list: (await call('GET', `${B}/entities`)).json.total, issues: (await call('GET', `${B}/consistency`)).json.issues.length };
await srv.stop();
fs.copyFileSync(`${WORK}/data.sqlite`, `${WORK}/sauvegarde-avant-migration.sqlite`);
console.log(`1. base créée par main : ${before.list} éléments, chapitre révision ${before.ch.revision}, 1 image`);

// ── 2. Ouverte par le NOUVEAU code ───────────────────────────────────────────
srv = await boot(NEW);
cookie = ''; assert.equal((await login()).status, 200);
const after = { project: (await call('GET', B)).json, ch: (await call('GET', `${B}/entities/${ch.id}`)).json, perso: (await call('GET', `${B}/entities/${perso.id}`)).json, list: (await call('GET', `${B}/entities`)).json.total, issues: (await call('GET', `${B}/consistency`)).json };
for (const k of ['id', 'title', 'subtitle', 'description', 'targetWords', 'color', 'createdAt']) assert.deepEqual(after.project[k], before.project[k], `projet.${k}`);
assert.equal(after.project.kind, 'livre', 'nature par défaut');
assert.equal(after.project.aiAssist, false, 'assistance éteinte');
for (const k of ['title', 'content', 'revision', 'status', 'wordCount', 'summary', 'body']) assert.deepEqual(after.ch[k], before.ch[k], `chapitre.${k}`);
for (const k of ['title', 'summary', 'body', 'revision']) assert.deepEqual(after.perso[k], before.perso[k], `personnage.${k}`);
assert.equal(after.perso.media.length, 1); assert.equal(after.perso.media[0].url, before.perso.media[0].url);
assert.equal((await fetch(base + img.url, { headers: { Cookie: cookie } })).status, 200, 'image toujours servie');
assert.equal(after.list, before.list);
assert.equal(after.issues.issues.length, before.issues); assert.ok(after.issues.issues.every((i) => i.nature));
assert.deepEqual((await call('GET', `${B}/audio`)).json, []);
assert.ok((await call('GET', `${B}/search?q=elise`)).text.includes('Élise'), 'recherche sur le contenu d\'avant');
const hist = (await call('GET', `${B}/entities/${ch.id}/revisions`)).json;
// Nouveautés utilisables sur la base migrée.
const sound = (await call('POST', `${B}/entities`, { kind: 'sound', title: 'Valse', tempo: 92 })).json;
assert.equal(sound.kind, 'sound');
const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(2000)]);
const afd = new FormData(); afd.append('audio', new Blob([wav], { type: 'audio/wav' }), 'a.wav'); afd.append('entityId', String(sound.id)); afd.append('clientRef', 'repetition-migration-1');
const take = await call('POST', `${B}/audio`, null, afd);
assert.equal(take.status, 201, take.text);
assert.equal((await call('PUT', B, { kind: 'mixte' })).json.kind, 'mixte');
await srv.stop();
console.log(`2. ouverte par la branche : contenu identique (${after.list} éléments, révision ${after.ch.revision}, ${Array.isArray(hist) ? hist.length : hist.items?.length ?? '?'} version(s) d'historique), nouveautés utilisables (idée musicale + prise créées)`);

// ── 3. Retour arrière : la base migrée rouverte par l'ANCIEN code ────────────
srv = await boot(OLD);
cookie = ''; assert.equal((await login()).status, 200);
const back = { ch: await call('GET', `${B}/entities/${ch.id}`), list: await call('GET', `${B}/entities`), index: await call('GET', `${B}/index`), sound: await call('GET', `${B}/entities/${sound.id}`), overview: await call('GET', `${B}/overview`), perso: await call('GET', `${B}/entities/${perso.id}`) };
console.log('3. retour arrière (ancien code sur la base migrée) :');
console.log(`   chapitre ${back.ch.status} contenu ${back.ch.json?.content === after.ch.content ? 'identique' : 'DIFFÉRENT'} ; liste ${back.list.status} (${back.list.json?.total ?? '—'} éléments) ; index ${back.index.status} ; aperçu ${back.overview.status} ; fiche de l'idée musicale ${back.sound.status} ; personnage ${back.perso.status} (${back.perso.json?.media?.length} média)`);
const kinds = (back.list.json?.items || []).map((e) => e.kind);
console.log(`   types listés par l'ancien code : ${[...new Set(kinds)].join(', ')}`);
await srv.stop();
if (srv.err().trim()) console.log('   stderr ancien code :', srv.err().trim().split('\n').slice(0, 4).join(' | '));
