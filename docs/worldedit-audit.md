# WorldEdit serveur — Audit (Phase 0)

> Phase 0 du chantier « WorldEdit maison ». **Aucun code applicatif n'a été
> modifié** : ce document inventorie l'existant et liste les écarts à combler
> avant d'écrire le moteur. À valider avant d'attaquer la Phase 1.

Repère Minecraft utilisé partout ici : **+X = Est, +Z = Sud, +Y = Haut**.
Index d'un bloc dans une section : `i = y*256 + z*16 + x` (ordre **YZX**).

---

## 1. Parsing Anvil (.mca) aujourd'hui

| Élément | Emplacement |
|---|---|
| Lecture région + sections | `server/minecraftWorld/anvil.js` → `parseRegion(buf, regionX, regionZ, bbox, emit)` |
| Construction artefact sparse | `server/minecraftWorld/parse.js` → `parseWorld(...)` |
| Lecteur ZIP du dossier `region/` | `server/minecraftWorld/zip.js` |
| Worker de parsing (hors thread requête) | `server/minecraftWorld/parseWorker.js` |
| Façade `parseWorldFile(opts)` | `server/minecraftWorld/index.js` |

**Ce que `parseRegion` sait faire (lecture seule)** :
- Header de région 8 Kio : 1024 offsets (`loc >>> 8` = secteur, `loc & 0xff` =
  nb secteurs), secteurs de 4096 o ; timestamps ignorés.
- Décompression par chunk : `1` gzip / `2` zlib / `3` brut, avec plafond
  anti-zip-bomb (`maxOutputLength`, `WORLD_MAX_CHUNK_BYTES`, défaut 32 Mo).
- NBT via **`prismarine-nbt`** (`nbt.parse` + `nbt.simplify`) — racine 1.18
  (plus de `Level`), `sections[].block_states.{palette,data}`.
- Déballage d'une section : `bits = max(4, ceil(log2(len palette)))`,
  `perLong = floor(64 / bits)`, **pas de chevauchement** d'un index sur deux
  longs (format 1.18+), ordre YZX. Section homogène (palette = 1 / pas de
  `data`) gérée à part. Conversion des longs en `BigInt` non signé (`toBig`).
- Cull au niveau chunk (16×16) puis au niveau bloc contre la `bbox`.
- `emit(x, y, z, name, props)` n'est appelé que pour les blocs **non-air** dans
  la boîte. `props` = objet plat `{ prop: "val" }` (ou `null`).

**Sortie en mémoire** (`parseWorld`, écrite gzippée par le worker) :
```js
{
  palette: [{ name, props|null }],   // dédupliquée par (nom + état complet)
  min:  { x, y, z },                 // coin bas de la bbox
  size: { x, y, z },                 // dimensions inclusives
  count,                             // nb de blocs non-air retenus
  blocks: [x, y, z, paletteIndex, …] // interleavé, coords RELATIVES à min
}
```
plus un `bom` (liste `{ blockId, count }` triée) renvoyé en métadonnée.

**Renommage région** : `zip.js` n'accepte que la forme **pointée**
`r.X.Z.mca` (`MCA_RE = /(?:^|\/)r\.(-?\d+)\.(-?\d+)\.mca$/`) et
`regionCoordsFromName`. La forme `r_X_Z.mca` et le helper de renommage demandés
en Phase 1 n'existent pas encore.

### Écart majeur n°1 — pas d'écriture
Il **n'existe aucun chemin d'écriture** : pas de ré-emballage de section, pas de
réencodage NBT, pas de réécriture de header/secteurs. `prismarine-nbt` (déjà
dépendance, `^2.8.0`) expose `writeUncompressed(value, format)` qui servira de
base à l'encodeur. **C'est le gros du travail de la Phase 1.**

---

## 2. Stockage des builds importés

- **Table** `minecraft_blueprints` (DB `better-sqlite3`), définie dans
  `server/db.js` (~ligne 276), **scopée par `workspace_id`** :
  `id, workspace_id, name, min_{x,y,z}, size_{x,y,z}, block_count, palette,
  bom, data_file, share_token (UNIQUE), created_by, created_at, updated_at`.
- `data_file` = nom UUID `*.json.gz` dans `uploads/` (artefact sparse ci-dessus).
- CRUD : `server/routes/blueprints.js`. Upload via `uploadWorld` (multer,
  `.zip`/`.mca`, MIME zip/octet-stream, `WORLD_MAX_BYTES`).
- **`builds`** (table distincte, `server/routes/builds.js`) = archives de
  release téléchargeables ; **rien à voir** avec le WorldEdit, à ne pas confondre.

### Écart majeur n°2 — le `.mca` d'origine n'est pas conservé
À l'import, `blueprints.post('/')` fait `safeUnlink(req.file.filename)` : **seul
l'artefact sparse survit**. Or cet artefact est **lossy** :
- les blocs **air** sont supprimés,
- tout ce qui est **hors bbox** est supprimé,
- les **block-entities** (contenu des coffres, texte des panneaux, têtes…),
  **biomes**, **lumière**, **entités**, tags de chunk → **jamais lus**.

Conséquence : on **ne peut pas** régénérer un `.mca` lossless depuis ce qui est
stocké. Le critère « round-trip Anvil lossless » et l'« Exporter `.mca` » exigent
de **travailler sur les fichiers de région réels**. Il faut donc **retenir la
source** (zip `region/` ou `.mca`) à l'import. → voir décisions § 7.

---

## 3. Middleware d'auth

- `server/auth.js` :
  - `requireAuth` — lit le **cookie HttpOnly `titisite_session`** d'abord, puis
    `Authorization: Bearer` en repli ; vérifie JWT, liste de révocation
    (`revoked_tokens`), `token_version`. Pose `req.user` + `req.token`.
  - `requireRole(...roles)` — composable, 403 sinon. Rôles : `admin`, `member`.
  - `setSessionCookie` / `clearSessionCookie` (`SameSite=Strict`, `Secure` en
    prod). **Jamais de JWT en localStorage.**
- `server/middleware/scope.js` → `resolveWorkspace` : résout `:slug`, pose
  `req.workspace`. Admin = accès à tout ; member = doit être dans
  `workspace_members`.
- **Montage** (`server/index.js`) :
  ```js
  const scoped = express.Router({ mergeParams: true });
  scoped.use(requireAuth, requireRole('admin','member'), resolveWorkspace);
  scoped.use('/blueprints', blueprintsRouter);          // protégé
  app.use('/api/workspaces/:slug', scoped);
  app.use('/api/blueprints', blueprintsPublicRouter);   // PUBLIC, lecture seule
  ```
- **Rate-limiting** existant : `apiLimiter` global (600/min sur `/api/`), plus
  des limiteurs dédiés (login, audio, calendar, analytics). `express-rate-limit`
  + `SqliteStore` (`server/rateLimitStore.js`) disponibles pour en ajouter un.

→ Toute route WorldEdit d'**écriture** se branchera derrière le routeur `scoped`
(donc JWT obligatoire). Pas de route d'édition sous le routeur public.

---

## 4. Lien de partage en lecture seule

- **Modèle actuel** : une seule colonne nullable `share_token` (hex 16 o) sur la
  ligne blueprint. Endpoints scoped `POST /:id/share` (crée/renvoie le token) et
  `DELETE /:id/share` (le met à `NULL`).
- **Lecture publique** : `blueprintsPublicRouter` → `GET /shared/:token` (détail
  + palette + bom) et `GET /shared/:token/data` (artefact sparse). **GET
  uniquement** : structurellement read-only.
- **Front** : `ShareControls.jsx` (bouton créer/copier/arrêter),
  page publique `/build/:token` → `src/pages/BuildShare.jsx`.

### Écart n°3 — pas de scope ni d'expiration
Le partage est binaire (existe / n'existe pas), **un seul token**, **sans
expiration**, **sans scope** (pas de notion `view` vs `edit`), **sans journal
d'usage**. La Phase 4 doit ajouter scope + expiration + révocation, et un token
`view` doit être **rejeté** sur toute opération d'écriture.

---

## 5. Vue voxel — structures exposées

- **Format consommé côté client** = l'artefact sparse du § 1 :
  `{ palette:[{name,props}], min, size, count, blocks:[x,y,z,pi,…] }`, coords
  **relatives à `min`**, **air absent**.
- **Rendu** : `src/components/project/builds/BlueprintScene.jsx` (lazy,
  three.js hors bundle) — un `InstancedMesh` par index de palette, modèles
  custom fusionnés par texture, slider de couche Y (cumulatif / couche seule).
  L'orientation/blockstate est résolue **côté client** depuis `props`
  (`src/data/blockstates.js`, `blockCodex.js`, `blockTint.js`).
- **Hôtes UI** : `BuildsView.jsx` → `BlueprintViewer` → `BlueprintCanvas.jsx`
  (+ `BlueprintBom`, `ShareControls`). `useIsMobile(720)` déjà utilisé
  (hauteur canvas 320 mobile / 480 desktop). **C'est ici qu'atterriront** la
  boîte de sélection, le panneau d'opérations et les boutons Aperçu/Appliquer.
- **API front** : `src/api/client.js` → `api.ws(slug).blueprints.*`
  (`list/get/dataUrl/upload/duplicate/share/unshare/remove`) et
  `api.blueprintShared.{get,dataUrl}`. **Ne jamais hand-build d'URL.**
- **Codex** : `public/codex/…` chargé à l'exécution (`minefieldCatalog.js`),
  blocs custom `minefield:*` à **préserver tels quels** (jamais remappés vanilla).

> Précédent réutilisable : `blueprints.post('/:id/duplicate')` fait déjà une
> transformation **palette-only** (renommage de noms, indices inchangés) en
> relisant l'artefact sparse, recalculant le BOM et réécrivant un `.json.gz`.
> C'est le patron exact pour la **prévisualisation** d'une opération WorldEdit
> (transformer l'artefact sparse pour l'aperçu), mais **pas** pour l'export
> `.mca` (qui exige les fichiers de région réels — § 2).

---

## 6. Conventions à respecter (rappel)

- Migrations via `ensureColumn(table, column, ddl)` ; **pas de drop de table**.
- Primitives UI existantes (`admin/ui.jsx`, `project/shared.jsx`), pas de
  nouvelle lib de composants ; appels API via `client.js`.
- Fichiers sur disque = UUID + extension assainie ; nom d'origine en DB
  seulement pour `Content-Disposition`.
- Opérations destructives → **toujours sur copie de staging**, jamais sur la
  source ; journal d'audit + undo.
- `npm run build` avant de déclarer un changement UI OK ; smoke test curl avec
  `data.sqlite` supprimé pour les changements d'endpoint.

---

## 7. Écarts à combler & décisions à trancher

| # | Écart | Phase | Décision attendue |
|---|---|---|---|
| 1 | Aucun **encodeur Anvil** (repack section + NBT write + zlib + header) | 1 | — (réutiliser `prismarine-nbt.writeUncompressed`) |
| 2 | **Source `.mca`/zip non conservée** → round-trip & export impossibles | 1 | **A**. Conserver la source à l'import (nouvelle colonne `source_file` via `ensureColumn`) — recommandé. **B**. Reconstruire un `.mca` partiel depuis le sparse (lossy, exclu par le critère « lossless »). |
| 3 | Sparse **lossy** (air / biomes / block-entities / entités / hors-bbox perdus) | 1–2 | WorldEdit opère sur les **régions réelles** (staging), puis re-dérive le sparse pour l'aperçu. À confirmer. |
| 4 | Regex région **`r.X.Z`** seulement ; pas de helper `r_X_Z` ⇄ `r.X.Z` | 1 | Ajouter la regex `r[._](-?\d+)[._](-?\d+)\.mca` + renommage. |
| 5 | Partage **mono-token, sans scope/expiration** | 4 | Étendre la ligne (`share_scope`, `share_expires_at` via `ensureColumn`) si **un** lien suffit, **ou** table `blueprint_shares` si plusieurs liens/personne. À trancher. |
| 6 | Pas de table **audit**, pas de pile **undo** | 4 | `worldedit_audit(...)` + snapshot des chunks touchés (ou de la copie staging) avant chaque op. |
| 7 | Pas de **rate-limiter** dédié aux opérations | 3 | Nouveau limiteur (ex. 30/min/session) sur `/api/worldedit/*`. |
| 8 | Rôles seulement `admin`/`member` ; spec veut **owner/editor/viewer** par build | 4 | Mapper : workspace admin/owner = `owner`, member = `editor` ; token `view` = `viewer`, token `edit` = `editor`. À confirmer. |

### Stockage de staging proposé (à valider)
- À l'import : conserver le fichier source uploadé (`source_file` UUID dans
  `uploads/`) en plus de l'artefact sparse.
- À l'ouverture d'une session WorldEdit : copier la/les régions sources dans un
  dossier de staging par build (ex. `uploads/worldedit/<buildId>/`), n'y écrire
  que les chunks touchés, préserver byte-for-byte le reste.
- Aperçu : re-dériver l'artefact sparse depuis le staging (réutilise
  `parseWorld`), renvoyé au front comme aujourd'hui.
- Export : zipper / renvoyer le(s) `.mca` du staging.

---

## 8. Plan de validation Phase 1 (rappel du critère)

Round-trip **lossless** : `lire un .mca → réécrire sans transformation → fichier
équivalent` (mêmes blocs partout, block-entities et NBT préservés). Test à
ajouter sous `test/` (le repo a déjà un dossier `test/`). Un miroir X puis Z sur
une sélection doit donner une asymétrie mesurée = 0, et les blocs `minefield:*`
doivent rester intacts.

---

**Fin de Phase 0. Stop — j'attends ta validation (et tes réponses aux décisions
§ 7) avant d'attaquer la Phase 1.**
