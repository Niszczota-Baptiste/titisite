# WorldEdit serveur — moteur de transformation de builds

Transforme des builds Minecraft importés (fichiers de région **Anvil 1.18+**)
côté serveur : miroir, rotation, translation, remplacement, remplissage,
copier/coller — avec **états de blocs** corrigés (escaliers, portes, panneaux,
rails, quart-de-bloc custom…). Tout passe par une **copie de staging** : la save
source n'est jamais modifiée tant qu'on n'exporte pas.

## Vue d'ensemble du flux

```
import .mca/.zip ──► minecraft_blueprints (sparse + source_file conservé)
                          │
        ouverture WorldEdit (membre, ou lien edit)
                          │
   uploads/worldedit/<id>/regions/  ← matérialisé depuis la source (1× )
                          │
  POST /transform ──► snapshot undo ──► RegionStore (ops) ──► commit régions
                          │                                      │
                   worldedit_audit                        preview.json.gz
                          │                                      │
   ◄────────────── aperçu 3D rechargé ◄──────────────────────────┘
                          │
                  GET /export ──► .mca (ou .zip region/)
```

## Modules serveur

| Fichier | Rôle |
|---|---|
| `server/anvil/region.js` | Lecture/écriture container .mca. Chunks **non modifiés ré-émis byte-for-byte** ; seuls les chunks `dirty` réencodés (NBT via `prismarine-nbt` + zlib). Header/secteurs régénérés. Noms `r.X.Z` / `r_X_Z`. |
| `server/anvil/section.js` | Pack/unpack d'une section paletteisée : `bits=max(4,ceil(log2(len)))`, `perLong`, **pas de chevauchement**, ordre **YZX**, section homogène sans `data`. |
| `server/worldedit/blockstates.js` | Table de transformation des `Properties` (miroir X/Y/Z, rotation Y). Liste blanche pour le miroir vertical (portes/lits/panneaux non retournés). |
| `server/worldedit/transform.js` | `Schematic` + opérations sur une interface `Volume` (mirror/rotate/translate/replace/set/copy/paste). `MemoryVolume` pour les tests. |
| `server/worldedit/regionStore.js` | `Volume` adressable en coords monde au-dessus de régions .mca (warmup paresseux, `commit()`, `deriveSparse()` pour l'aperçu). |
| `server/worldedit/staging.js` | Orchestration non destructive : matérialisation, snapshot/undo, audit, aperçu, export, reset. |
| `server/worldedit/operations.js` | Descripteur des opérations (sert `/operations` + valide les params). |
| `server/worldedit/zipWriter.js` | Écrivain ZIP minimal pour l'export multi-région. |
| `server/routes/worldedit.js` | API. Deux entrées partagent les handlers : scoped (JWT) et token de partage. |

## API

Toutes les routes existent sous **deux préfixes** :
- scoped (cookie JWT) : `/api/workspaces/:slug/blueprints/:id/worldedit/*`
- token de partage : `/api/worldedit/shared/:token/*`

| Méthode | Chemin | Rôle min | Effet |
|---|---|---|---|
| GET | `/operations` | viewer | Descripteur des opérations (génère l'UI). |
| GET | `/state` | viewer | bbox, éditable, undoDepth, modifications en cours, rôle. |
| GET | `/data` | viewer | Géométrie sparse (aperçu staging sinon import d'origine). |
| GET | `/preview` | viewer | Aperçu sparse du staging (404 si rien en cours). |
| POST | `/transform` | **editor** | Applique `{operation, params, selection}` sur le staging. |
|  |  |  | Opérations (groupées dans l'UI) — **Transformer** : mirror, rotate, translate, **stack** (répétition). **Blocs** : replace, set, **walls**, **faces**, **hollow**, **overlay**, **naturalize**, **cut**. **Formes/pinceaux (type GoBrush)** : **sphere**, **cyl**, **smooth** (lissage de terrain). **Presse-papier** : copy, paste. |
|  |  |  | **scale** (×0.5/×2/×3/×4/×6) : redimensionne le build en place (échantillonnage au plus proche), borné à 8 M de blocs. |
|  |  |  | **mix** (« Mélange % ») : remplit/remplace par un mélange aléatoire pondéré (`pattern` = liste `{name, weight}`, % relatifs), `from` optionnel pour ne viser qu'un type de bloc. Ex. 20% cobble / 30% terre / 20% andésite → terrain aléatoire. |
|  |  |  | **Formes** en plus : `line` (Bresenham 3D), `pyramid`, `cone`, `sphere`/`cyl` **creux** (`hollow`). **Terrain** : `erode`/`dilate` (seuil+passes). **Blocs** : `drain` (eau/lave). |
|  |  |  | **Masques** (`set`/`mix`) : `all`/`solid`/`air`/`exposed`/`on_surface`/`above`/`below` (évalués sur l'état d'origine). **replace** accepte plusieurs blocs source. |
| POST | `/redo` | **editor** | Rétablit la dernière opération annulée (pile redo, invalidée par toute nouvelle op). `redoDepth` dans `/state`. |
|  |  |  | Les commandes type pinceau (sphere/cyl) et hollow/overlay/smooth/walls/faces sont **bornées par la sélection** ; stack/scale peuvent déborder dans la limite du build (écritures hors chunks ignorées). |

### Build vierge, presse-papier inter-builds & placement monde

- **Build vierge** (`POST …/blueprints/blank`, `staging.blankRegions`) : crée un
  `.mca` neuf rempli d'air à une **position monde** + taille choisies. Le format
  de chunk est **repris d'un build existant** du workspace (`templateChunk` →
  compatible avec la version Minecraft de l'utilisateur) ou synthétisé à défaut.
- **Presse-papier par utilisateur** (et non par build) : on **copie dans un
  build, colle dans un autre** → on assemble un grand build à partir de petits
  morceaux sur un canevas vierge.
- **Export placé** : `GET …/export?dx&dy&dz`. Sans offset = recopie **lossless**
  des régions (coffres/biomes préservés). Avec offset = **re-chunk** à la
  position cible (perd block-entities/biomes). Le panneau affiche aussi où le
  build s'insère dans le monde. Comme le build vierge est créé aux bonnes
  coordonnées, un export sans offset l'y replace exactement.
- ⚠️ Les chunks d'un build vierge sont **synthétisés** : valider l'import en jeu
  sur ta version (le format de chunk via un build modèle réduit fortement le
  risque).

### Hauteur éditable & emprise

La **sélection** est bornée en X/Z par l'emprise du build mais en **Y par la
hauteur du monde Minecraft** (`-64..319`, configurable via `WORLD_MIN_Y`/
`WORLD_MAX_Y`) : on peut donc construire **au-dessus/en-dessous** du contenu
existant (les sections Anvil manquantes sont créées). `state.bbox` = ces limites,
`state.extent` = l'emprise réelle du contenu (sélection par défaut). Après chaque
opération l'emprise stockée **grandit** pour inclure les nouveaux blocs (l'aperçu
les couvre).
| POST | `/undo` | **editor** | Restaure le dernier snapshot. |
| POST | `/reset` | **editor** | Jette le staging (retour à la source). |
| GET | `/export` | **editor** | Télécharge le `.mca` (ou `.zip` du dossier region/). |
| GET | `/audit` | **editor** | Journal des opérations. |

Un token `view` est **rejeté (403)** sur toute opération d'écriture. Rate-limit
dédié (`WORLDEDIT_RATE_MAX`, défaut 30/min). Sélection bornée par
`WORLDEDIT_MAX_SELECTION` (défaut 2 000 000 blocs).

## Modèle d'accès

| Rôle | Source | Voir/Aperçu | Transformer/Exporter | Gérer les liens |
|---|---|---|---|---|
| **owner** | admin du workspace | ✅ | ✅ | ✅ |
| **editor** | membre, ou lien `edit` | ✅ | ✅ | ❌ |
| **viewer** | lien `view` | ✅ | ❌ | ❌ |

Liens scopés : table `blueprint_shares` (token, scope `view`/`edit`, expiration,
révocation). Création/révocation réservées au propriétaire
(`POST/DELETE /blueprints/:id/shares`). Le lien ouvre `/we/:token`.

## Table d'états (résumé)

Repère **+X=Est, +Z=Sud, +Y=Haut**. Détail testé dans `test/worldedit.test.js`.

- **facing** : rotation `north→east→south→west` ; miroir X `east↔west`, Z `north↔south`, Y `up↔down`.
- **rotation** (0–15) : `+4/quart` ; miroir X `(16−r)%16`, Z `(8−r)%16`.
- **axis** : `x↔z` en rotation ; inchangé en miroir.
- **escaliers `shape`** : chiralité `left↔right` inversée à tout miroir ; inchangée en rotation (c'est `facing` qui tourne).
- **portes `hinge`** : `left↔right` au miroir.
- **rails `shape`** : maps dédiées rotation/miroir X/miroir Z.
- **miroir Y** : `half`/`type`/`facing` vertical ; liste blanche (portes/lits/panneaux non retournés).
- **clés cardinales** (`north/east/south/west` : barreaux, redstone, vignes…) : cyclent.
- Blocs `minefield:*` : géométrie/états transformés, **namespace jamais remappé** vanilla.

## Tests

- `test/anvil.test.js` — round-trip lossless région/section, réencodage NBT, cross-check décodeur historique.
- `test/worldedit.test.js` — une assertion par propriété d'état, involution miroir, rotation 90×4=identité.
- `test/regionstore.test.js` — pont volume↔.mca.
- `test/worldedit-api.test.js` — bout-en-bout (serveur réel) : transform/undo/export, partage edit vs view, hors-bornes.

## Import & sélection (UI)

- **Import complet sans coordonnées** : à l'import, la case « Charger le fichier
  en entier » (cochée par défaut) envoie `full=true` ; le serveur détecte
  l'emprise réelle des blocs non-air (`autoBounds` dans
  `server/minecraftWorld/parse.js`, bornée par `BLUEPRINT_MAX_SPAN`/`_HEIGHT`).
  Sinon on saisit la boîte F3 comme avant.
- **Sélection à la souris** dans la vue 3D (`BlueprintScene`) : **clic droit =
  coin A**, **clic gauche = coin B** (un glissé reste une rotation). Une **boîte
  de sélection** dorée est rendue en temps réel ; les coordonnées sont éditables
  aussi à la main dans le panneau. État partagé via le hook
  `useBlueprintSelection` entre la vue 3D et le `WorldEditPanel`
  (`BlueprintViewer` / page `/we/:token`).
- **Réglage fin** : les **flèches** déplacent le coin actif d'un bloc en X/Z,
  **PgUp/PgDn** en Y ; **Shift + clic glissé vertical** dans la vue 3D règle le Y
  d'un coin (pour le placer au-dessus de la surface, hors de portée d'un clic).
  Le coin actif (A/B) se choisit en cliquant son libellé dans le panneau.
- **Navigation caméra** : **ZQSD/WASD** déplacent librement la caméra dans le
  build (translation sur le plan horizontal relative à la vue), **R/F** = monter/
  descendre ; la molette zoome et le glissé pivote (OrbitControls). La
  **sensibilité** est réglable (slider « 🎮 Vitesse », persistée en localStorage).
- **Plein écran** : bouton « ⛶ Plein écran » → la vue 3D occupe tout l'écran et le
  panneau WorldEdit **flotte par-dessus** (translucide, scrollable). Échap pour
  sortir. La scène se redimensionne via `ResizeObserver` (pas de rechargement).
- **Pose caméra conservée** : après une commande, l'aperçu rechargé reconstruit la
  scène mais **restaure la position/cible** de la caméra (`poseRef` dans
  `BlueprintScene` + key stable du canvas) — pas de retour à l'angle par défaut.
- **Autocomplétion blocs/items** : les paramètres « bloc » de *replace*/*set*/
  *fill* utilisent `CodexPicker` (recherche filtrée sur le codex vanilla +
  Minefield), avec un champ texte de repli pour un nom exact.
- **Extraire une zone** : `POST …/blueprints/:id/extract` (`staging.cropBuild`)
  crée un **nouveau build léger** à partir de la sélection — les fichiers de
  région sont réduits aux seuls chunks intersectés (lossless, coords monde
  conservées), bien plus rapide à charger/éditer que le `.mca` complet. Ouvert
  dans un nouvel onglet via `…/minecraft?view=builds&build=<id>`.

## Bibliothèque de schematics & interop (vague 3)

- **Persistance** : un presse-papier (`Schematic` dense) se sauve dans
  `worldedit_schematics` (scopé **workspace** : on copie dans un build, on colle
  dans un autre). Le contenu (palette + indices gzip) vit sur disque
  (`uploadPath(<uuid>.we.gz>)`), métadonnées + nom en base
  (`server/worldedit/library.js`).
- **Formats d'échange** (`server/worldedit/schematicFormats.js`, NBT gzip via
  `prismarine-nbt`) :
  - **Sponge `.schem` v2** : `Palette` (chaîne `name[k=v,…]` → index), `BlockData`
    varint LEB128 en ordre **YZX**, `Offset` conservé. Lecture v1/v2/v3 (le v3
    imbrique sous `Schematic.Blocks`).
  - **Litematica `.litematic` v6** : `Regions` → `BlockStatePalette` (air en index
    0) + `BlockStates` (long[] en **bit-array chevauchant** 64 bits, `bits =
    max(2, ceil(log2(palette)))`). Lecture multi-régions + tailles négatives
    (axes inversés normalisés en coin min).
  - L'ordre linéaire interne `Schematic.data` (`x + sx*(z + sz*y)`) **est** déjà
    l'ordre YZX des deux formats → pas de réindexage.
- **API** (sous `…/worldedit`, JWT ou token edit) : `GET /schematics`,
  `POST /schematics/save` (presse-papier courant), `POST /schematics/:id/load`
  (→ presse-papier, puis `paste`), `GET /schematics/:id/export?format=schem|
  litematic`, `POST /schematics/import` (`.schem`/`.litematic` multipart, option
  `save`), `DELETE /schematics/:id`. UI : `SchematicLibrary` dans le
  `WorldEditPanel`.

## Rendu visuel (UI, vague 5)

Tout est client (`BlueprintScene` + barre d'outils dans `BlueprintCanvas`), aucun
appel serveur :

- **Grille de chunks** : lignes au sol tous les 16 blocs alignées sur les
  frontières de chunk monde (`buildGrid`).
- **Ombres** : `shadowMap` (PCFSoft) + ombre portée de la lumière directionnelle,
  les `InstancedMesh` projettent/reçoivent (self-shadowing), l'ambiante baisse
  pour le contraste (`applyShadows`).
- **Mesurer** : deux clics gauche posent deux points → segment + dimensions
  `dx×dy×dz`, diagonale et nombre de blocs de la boîte (overlay). Prioritaire sur
  la sélection tant que le mode est actif.
- **Coupe** : plans de découpe globaux (`renderer.clippingPlanes`) sur X et Z,
  sliders « X ≤ » / « Z ≤ » pour révéler l'intérieur du build (`applyClip`).
- **Exporter image** : `preserveDrawingBuffer` + `toDataURL('image/png')` →
  téléchargement `build.png` (rendu à la volée).

## Variables d'environnement

`WORLDEDIT_MAX_SELECTION`, `WORLDEDIT_RATE_MAX`, `WORLDEDIT_MAX_UNDO`,
`WORLD_MAX_CHUNK_BYTES` (déjà existant). Aucune n'est obligatoire.
