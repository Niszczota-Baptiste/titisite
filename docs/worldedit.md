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

## Variables d'environnement

`WORLDEDIT_MAX_SELECTION`, `WORLDEDIT_RATE_MAX`, `WORLDEDIT_MAX_UNDO`,
`WORLD_MAX_CHUNK_BYTES` (déjà existant). Aucune n'est obligatoire.
