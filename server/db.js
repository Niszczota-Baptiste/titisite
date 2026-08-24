import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Exporté : la page « Serveur » du dashboard mesure la taille du fichier (et
// de ses -wal/-shm) — une seule source de vérité pour le chemin.
export const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');

// eslint-disable-next-line security/detect-non-literal-fs-filename -- DB_PATH comes from env/default, not user input
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Public-site collections (kept as JSON-blob tables — schema-flexible)
const PUBLIC_COLLECTIONS = ['projects', 'photos', 'tracks', 'education', 'experience', 'currently'];

export function migrate() {
  // ── Public collections ──
  for (const name of PUBLIC_COLLECTIONS) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ${name} (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        position   INTEGER NOT NULL DEFAULT 0,
        data       TEXT    NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
      );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${name}_position ON ${name}(position);`);
  }

  // ── Users ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('admin','member')),
      ical_token    TEXT,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('users', 'ical_token', 'TEXT');
  ensureColumn('users', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
  // Email digest opt-in. Defaults to 'off' so existing installs send nothing
  // until the user explicitly enables it.
  ensureColumn('users', 'digest_frequency', `TEXT NOT NULL DEFAULT 'off' CHECK (digest_frequency IN ('off','daily','weekly'))`);
  ensureColumn('users', 'digest_last_sent_at', 'INTEGER');
  // Per-member access flag for the /stairs section. Admins always have access
  // regardless of this column; for members it must be explicitly enabled.
  ensureColumn('users', 'can_view_stairs', 'INTEGER NOT NULL DEFAULT 0');
  // Quest tracker (« Quêtes ») access flags — same pattern as can_view_stairs.
  // Admins bypass both. can_edit_quests implies read access.
  ensureColumn('users', 'can_view_quests', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('users', 'can_edit_quests', 'INTEGER NOT NULL DEFAULT 0');
  // Atelier « Salle des coffres » (plans de rangement) — même patron que
  // can_view_quests : le flag ouvre la section, la propriété du plan décide
  // ensuite de ce que le compte voit. Les admins passent outre.
  ensureColumn('users', 'can_view_vault', 'INTEGER NOT NULL DEFAULT 0');
  // Lore « Nostra » — le « tag lore » : ouvre le module d'enquête, en lecture
  // ET en écriture (l'outil est collaboratif, un seul flag). Admins outre.
  ensureColumn('users', 'can_view_lore', 'INTEGER NOT NULL DEFAULT 0');
  // Secret token for the Minefield cockpit pull feed (no cookie, like ical_token).
  ensureColumn('users', 'cockpit_token', 'TEXT');
  // Per-member opt-in: include quest reminders in that member's cockpit feed.
  ensureColumn('users', 'wants_quest_reminders', 'INTEGER NOT NULL DEFAULT 1');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ical_token ON users(ical_token) WHERE ical_token IS NOT NULL;`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cockpit_token ON users(cockpit_token) WHERE cockpit_token IS NOT NULL;`);

  // ── Workspaces (team projects) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '#c9a8e8',
      icon        TEXT NOT NULL DEFAULT '🎮',
      start_date  INTEGER,
      end_date    INTEGER,
      tags        TEXT NOT NULL DEFAULT '[]',
      status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);`);
  ensureColumn('workspaces', 'is_minecraft', 'INTEGER NOT NULL DEFAULT 0');
  // Projet « 100 % Minecraft » : masque les onglets classiques (Vue d'ensemble
  // → Réunions) et fait de la page ⛏️ Minecraft l'unique entrée du projet.
  // Implique is_minecraft à la lecture (rowToWorkspace).
  ensureColumn('workspaces', 'minecraft_only', 'INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_members (
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (workspace_id, user_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);`);
  // Last visit of each member per workspace — powers the "nouveautés" badges
  // (features/comments/documents created or modified since this timestamp).
  ensureColumn('workspace_members', 'last_seen_at', 'INTEGER');

  // ── Per-project workspace data ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id  INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      title         TEXT NOT NULL,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT,
      size          INTEGER NOT NULL,
      notes         TEXT DEFAULT '',
      uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('documents', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_documents_workspace ON documents(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS builds (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id  INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      version       TEXT NOT NULL,
      title         TEXT NOT NULL DEFAULT '',
      status        TEXT NOT NULL DEFAULT 'alpha',
      filename      TEXT,
      original_name TEXT,
      mime_type     TEXT,
      size          INTEGER,
      external_url  TEXT,
      notes         TEXT DEFAULT '',
      uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      released_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('builds', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_builds_workspace ON builds(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS features (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'backlog',
      priority     TEXT NOT NULL DEFAULT 'medium',
      assignee_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      position     INTEGER NOT NULL DEFAULT 0,
      due_date     INTEGER,
      tags         TEXT NOT NULL DEFAULT '[]',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_features_status_pos ON features(status, position);`);
  // Backfill columns on pre-existing installs (must run before indexes that reference new columns)
  ensureColumn('features', 'due_date', 'INTEGER');
  ensureColumn('features', 'tags', `TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn('features', 'subtasks', `TEXT NOT NULL DEFAULT '[]'`);
  ensureColumn('features', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_features_due_date ON features(due_date);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_features_workspace ON features(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      description  TEXT DEFAULT '',
      starts_at    INTEGER NOT NULL,
      ends_at      INTEGER,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('meetings', 'workspace_id', 'INTEGER REFERENCES workspaces(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meetings_starts ON meetings(starts_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_meetings_workspace ON meetings(workspace_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_resources (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      quantity     INTEGER NOT NULL DEFAULT 0,
      notes        TEXT NOT NULL DEFAULT '',
      position     INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_resources_workspace ON minecraft_resources(workspace_id, position);`);
  ensureColumn('minecraft_resources', 'category', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('minecraft_resources', 'rarity',   "TEXT NOT NULL DEFAULT 'Commun'");
  ensureColumn('minecraft_resources', 'favorite',  'INTEGER NOT NULL DEFAULT 0');

  // Coffres (containers en jeu) : un coffre regroupe des ressources via
  // minecraft_resources.chest_id. Un même item peut exister dans plusieurs
  // coffres (une ligne par coffre). Supprimer un coffre repasse ses items en
  // « non rangé » (chest_id NULL) — le handler DELETE le force aussi, au cas où
  // les foreign_keys seraient désactivées.
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_chests (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      world        TEXT NOT NULL DEFAULT 'overworld',
      x            INTEGER,
      y            INTEGER,
      z            INTEGER,
      note         TEXT NOT NULL DEFAULT '',
      position     INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_chests_workspace ON minecraft_chests(workspace_id, position);`);
  ensureColumn('minecraft_resources', 'chest_id', 'INTEGER REFERENCES minecraft_chests(id) ON DELETE SET NULL');

  // Ressources « wanted » par workspace : la wishlist au-dessus des coffres.
  // `quantity` est l'objectif ; l'inventaire courant (minecraft_resources) donne
  // la progression côté client. `priority` : 1 haute, 2 moyenne, 3 basse.
  // `done` se coche à la main quand la quantité voulue est récupérée.
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_wanted (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      quantity     INTEGER NOT NULL DEFAULT 1,
      priority     INTEGER NOT NULL DEFAULT 2,
      note         TEXT NOT NULL DEFAULT '',
      done         INTEGER NOT NULL DEFAULT 0,
      done_at      INTEGER,
      position     INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_wanted_workspace ON minecraft_wanted(workspace_id, done, priority, position);`);
  // « Qui s'en occupe » : membre du workspace chargé de récolter la ressource.
  ensureColumn('minecraft_wanted', 'assigned_to', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');

  // Historique du stock : UN point par (workspace, nom normalisé, jour), upserté
  // à chaque mutation de l'inventaire (server/routes/minecraft.js#snapshotStock).
  // Alimente les tendances/sparklines du Résumé ; purgé au boot (400 j).
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_stock_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name_norm    TEXT NOT NULL,
      name         TEXT NOT NULL,
      day          TEXT NOT NULL,
      quantity     INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE (workspace_id, name_norm, day)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_history_ws ON minecraft_stock_history(workspace_id, day);`);
  db.prepare(`DELETE FROM minecraft_stock_history WHERE day < date('now', '-400 day')`).run();

  // Équipement nommé (« stuff ») : outils/armes/armures renommés avec leurs
  // enchantements (texte libre), un propriétaire (membre) et un rangement
  // (coffre, ou NULL = sur soi / non rangé).
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_gear (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      item_name    TEXT NOT NULL DEFAULT '',
      enchants     TEXT NOT NULL DEFAULT '',
      owner_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      chest_id     INTEGER REFERENCES minecraft_chests(id) ON DELETE SET NULL,
      note         TEXT NOT NULL DEFAULT '',
      position     INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_gear_workspace ON minecraft_gear(workspace_id, position);`);

  // POI de la carte du projet (bases, portails, fermes…) — la carte affiche
  // aussi les coffres (minecraft_chests) et les villageois, qui ont déjà des
  // coordonnées. x/z requis pour être posé sur la carte, y optionnel.
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_map_pois (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      category     TEXT NOT NULL DEFAULT 'autre',
      world        TEXT NOT NULL DEFAULT 'overworld',
      x            INTEGER,
      y            INTEGER,
      z            INTEGER,
      note         TEXT NOT NULL DEFAULT '',
      position     INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_map_pois_ws ON minecraft_map_pois(workspace_id, position);`);

  // Villageois du projet : métier, coordonnées, et trades intéressants. Un trade
  // a un prix normal + éventuellement un prix réduit pour UN joueur (réputation
  // de zombie soigné / Héros du village étant par-joueur en jeu).
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_villagers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      profession   TEXT NOT NULL DEFAULT '',
      world        TEXT NOT NULL DEFAULT 'overworld',
      x            INTEGER,
      y            INTEGER,
      z            INTEGER,
      note         TEXT NOT NULL DEFAULT '',
      position     INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_villagers_ws ON minecraft_villagers(workspace_id, position);`);
  // Tags libres (JSON array) pour filtrer la page Villageois (ex. « hall »,
  // « spawn », « à soigner »).
  ensureColumn('minecraft_villagers', 'tags', "TEXT NOT NULL DEFAULT '[]'");
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_villager_trades (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      villager_id      INTEGER NOT NULL REFERENCES minecraft_villagers(id) ON DELETE CASCADE,
      item_name        TEXT NOT NULL,
      price            TEXT NOT NULL DEFAULT '',
      discount_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      discount_price   TEXT NOT NULL DEFAULT '',
      note             TEXT NOT NULL DEFAULT '',
      position         INTEGER NOT NULL DEFAULT 0,
      created_at       INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at       INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_vtrades_villager ON minecraft_villager_trades(villager_id, position);`);

  // Cartes nommées du projet (comme quest_maps mais scopées par workspace) :
  // une vue nommée d'un monde, avec vue par défaut (centre/zoom) et une image
  // de fond 2D optionnelle calibrée aux coordonnées monde. Les marqueurs
  // (coffres, villageois, POI) affichés sont ceux du `world` de la carte.
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_maps (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      nom            TEXT NOT NULL,
      world          TEXT NOT NULL DEFAULT 'overworld',
      couleur        TEXT NOT NULL DEFAULT '#c9a8e8',
      center_x       INTEGER NOT NULL DEFAULT 0,
      center_z       INTEGER NOT NULL DEFAULT 0,
      default_span   INTEGER NOT NULL DEFAULT 512,
      image_filename TEXT,
      img_center_x   INTEGER NOT NULL DEFAULT 0,
      img_center_z   INTEGER NOT NULL DEFAULT 0,
      img_span       INTEGER NOT NULL DEFAULT 512,
      position       INTEGER NOT NULL DEFAULT 0,
      created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_maps_ws ON minecraft_maps(workspace_id, position);`);

  // Schémas / croquis du projet : un dessin libre (traits vectoriels JSON)
  // au-dessus d'une capture d'écran ou d'une feuille blanche, pour expliquer
  // les plans à deux. `strokes` = JSON [{ color, width, points:[x,y,...] }].
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_sketches (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id       INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title              TEXT NOT NULL,
      note               TEXT NOT NULL DEFAULT '',
      background_filename TEXT,
      strokes            TEXT NOT NULL DEFAULT '[]',
      position           INTEGER NOT NULL DEFAULT 0,
      created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mc_sketches_ws ON minecraft_sketches(workspace_id, position);`);

  // Fils de discussion / RP du projet (scopés par workspace). `kind` = 'rp'
  // (lore, journal du projet) ou 'discussion' (échanges). Les commentaires
  // réutilisent la table `comments` avec target_type = 'thread'.
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_threads (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title        TEXT NOT NULL,
      body         TEXT NOT NULL DEFAULT '',
      kind         TEXT NOT NULL DEFAULT 'discussion',
      pinned       INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ws_threads_ws ON workspace_threads(workspace_id, pinned, updated_at);`);

  // Recettes custom Minefield, GLOBALES (les recettes vanilla vivent côté client
  // dans src/data/recipes_vanilla.json). Éditées en admin, lues par le
  // calculateur de craft de chaque projet. `result_id`/`ingredients[].item`
  // référencent des ids de codex ; `ingredients` est un JSON [{item, count}].
  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_recipes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      result_id    TEXT NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 1,
      type         TEXT NOT NULL DEFAULT 'crafting',
      ingredients  TEXT NOT NULL DEFAULT '[]',
      note         TEXT NOT NULL DEFAULT '',
      position     INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_custom_recipes_result ON custom_recipes(result_id);`);
  // Disposition 3×3 (recette « shaped ») : JSON de 9 cases (id de codex ou '').
  ensureColumn('custom_recipes', 'grid', "TEXT NOT NULL DEFAULT '[]'");
  // Station de craft (fourneau précis pour le smelting : MC ou MF) — id de codex.
  ensureColumn('custom_recipes', 'station', "TEXT NOT NULL DEFAULT ''");

  // Boutiques (shops) et items en vente, GLOBAUX et admin-only. `project_id`
  // optionnel rattache une boutique à un workspace ; `chest_id` relie
  // optionnellement un item en vente à un coffre (stock réel). `item_id` = id de
  // codex, `price` en unité libre.
  db.exec(`
    CREATE TABLE IF NOT EXISTS shops (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      project_id  INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      currency    TEXT NOT NULL DEFAULT 'émeraudes',
      position    INTEGER NOT NULL DEFAULT 0,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS shop_items (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      shop_id   INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
      item_id   TEXT NOT NULL,
      item_name TEXT NOT NULL DEFAULT '',
      category  TEXT NOT NULL DEFAULT '',
      price     REAL NOT NULL DEFAULT 0,
      unit      TEXT NOT NULL DEFAULT 'unité',
      stock     INTEGER NOT NULL DEFAULT 0,
      chest_id  INTEGER REFERENCES minecraft_chests(id) ON DELETE SET NULL,
      note      TEXT NOT NULL DEFAULT '',
      position  INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_shop_items_shop ON shop_items(shop_id, position);`);

  // Builds importés depuis un monde solo (.mca), scopés par workspace_id. Les
  // blocs SPARSE volumineux vivent en artefact gzip sur disque (data_file) ;
  // ici on garde les métadonnées + palette + BOM précalculé + token de partage.
  db.exec(`
    CREATE TABLE IF NOT EXISTS minecraft_blueprints (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      min_x INTEGER NOT NULL, min_y INTEGER NOT NULL, min_z INTEGER NOT NULL,
      size_x INTEGER NOT NULL, size_y INTEGER NOT NULL, size_z INTEGER NOT NULL,
      block_count  INTEGER NOT NULL DEFAULT 0,
      palette      TEXT NOT NULL DEFAULT '[]',
      bom          TEXT NOT NULL DEFAULT '[]',
      data_file    TEXT,
      share_token  TEXT UNIQUE,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_blueprints_workspace ON minecraft_blueprints(workspace_id, id);`);
  // WorldEdit : on conserve le fichier source uploadé (zip region/ ou .mca isolé)
  // pour pouvoir transformer les régions réelles et exporter un .mca lossless.
  // L'artefact sparse historique (data_file) reste l'import d'origine ; le
  // staging WorldEdit vit sous uploads/worldedit/<id>/ (jamais la save source).
  ensureColumn('minecraft_blueprints', 'source_file', 'TEXT');
  ensureColumn('minecraft_blueprints', 'source_name', 'TEXT');

  // Journal d'audit WorldEdit : qui / quoi / combien / quand.
  db.exec(`
    CREATE TABLE IF NOT EXISTS worldedit_audit (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      blueprint_id   INTEGER NOT NULL REFERENCES minecraft_blueprints(id) ON DELETE CASCADE,
      actor          TEXT NOT NULL,         -- "user:<id>" ou "token:<id>"
      operation      TEXT NOT NULL,
      params_json    TEXT NOT NULL DEFAULT '{}',
      blocks_changed INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_we_audit_bp ON worldedit_audit(blueprint_id, id);`);
  // Durée d'exécution de l'opération (ms) — perf/robustesse (vague 6).
  ensureColumn('worldedit_audit', 'duration_ms', 'INTEGER NOT NULL DEFAULT 0');

  // Liens de partage scopés (view / edit) avec expiration + révocation. Plusieurs
  // liens par build possibles ; l'ancien share_token reste géré à part (legacy).
  db.exec(`
    CREATE TABLE IF NOT EXISTS blueprint_shares (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      blueprint_id INTEGER NOT NULL REFERENCES minecraft_blueprints(id) ON DELETE CASCADE,
      token        TEXT NOT NULL UNIQUE,
      scope        TEXT NOT NULL DEFAULT 'view' CHECK (scope IN ('view','edit')),
      label        TEXT NOT NULL DEFAULT '',
      expires_at   INTEGER,
      revoked_at   INTEGER,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bp_shares_bp ON blueprint_shares(blueprint_id, id);`);

  // Bibliothèque de schematics WorldEdit (presse-papier persistés), scopée par
  // workspace : on copie une sélection dans un build, on la colle dans un autre.
  // Le contenu dense (palette + indices gzip) vit sur disque (data_file).
  db.exec(`
    CREATE TABLE IF NOT EXISTS worldedit_schematics (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      size_x INTEGER NOT NULL, size_y INTEGER NOT NULL, size_z INTEGER NOT NULL,
      block_count  INTEGER NOT NULL DEFAULT 0,
      data_file    TEXT NOT NULL,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_we_schem_ws ON worldedit_schematics(workspace_id, id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id   INTEGER NOT NULL,
      author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      body        TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id   INTEGER NOT NULL,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE(target_type, target_id, document_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_attachments_target ON attachments(target_type, target_id);`);

  // ── Site-wide settings (key/value JSON, e.g. public-page section order) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  // ── Revoked JWTs (blocklist) ──
  // Logging out, deleting a user, or otherwise wanting to invalidate a session
  // before its 7-day TTL stores the token's `jti` here. requireAuth rejects
  // any token whose jti is present. Rows are pruned on every check past their
  // expiry so the table stays bounded.
  db.exec(`
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti        TEXT PRIMARY KEY,
      user_id    INTEGER,
      expires_at INTEGER NOT NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires ON revoked_tokens(expires_at);`);

  // ── Persistent rate-limit counters (login brute-force protection) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limit_hits (
      key        TEXT    NOT NULL,
      window_end INTEGER NOT NULL,
      hits       INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (key, window_end)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rl_window ON rate_limit_hits(window_end);`);

  // ── Stairs (private shared catalogue, gated by users.can_view_stairs) ──
  // GPS coordinates are required so every entry can land on the map; country/
  // region/city are filled by Nominatim reverse geocoding (server/routes/stairs)
  // and may be edited manually if the lookup fails.
  db.exec(`
    CREATE TABLE IF NOT EXISTS stairs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT NOT NULL,
      notes           TEXT NOT NULL DEFAULT '',
      step_count      INTEGER NOT NULL,
      step_height_cm  REAL,
      large_steps     INTEGER NOT NULL DEFAULT 0,
      lat             REAL NOT NULL,
      lng             REAL NOT NULL,
      country         TEXT NOT NULL DEFAULT '',
      region          TEXT NOT NULL DEFAULT '',
      city            TEXT NOT NULL DEFAULT '',
      encountered_at  INTEGER NOT NULL,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stairs_country ON stairs(country, region);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stairs_encountered_at ON stairs(encountered_at);`);

  // ── Page views (privacy-friendly site analytics) ──
  // No cookie, no raw IP. `visitor_hash` is a daily-rotating salted digest of
  // ip+ua so we can count unique visitors per day without storing PII — it's
  // irreversible and changes every midnight, so it can't track someone across
  // days. See server/routes/analytics.js.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pageviews (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      path         TEXT NOT NULL,
      referrer     TEXT NOT NULL DEFAULT '',
      device       TEXT NOT NULL DEFAULT 'desktop',
      country      TEXT NOT NULL DEFAULT '',
      visitor_hash TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pageviews_created ON pageviews(created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pageviews_path ON pageviews(path);`);
  ensureColumn('pageviews', 'browser', "TEXT NOT NULL DEFAULT ''");

  // ── Interaction events (link clicks, track plays, project views, contact) ──
  // Same privacy model as pageviews: daily-rotating visitor_hash, no PII.
  // `name` is one of a fixed allowlist (server/routes/analytics.js), `label`
  // is the specific target (social network, track title, project name…).
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      name         TEXT NOT NULL,
      label        TEXT NOT NULL DEFAULT '',
      visitor_hash TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_name ON events(name, created_at);`);

  // ── Page timings (dwell time + scroll depth, RGPD-friendly) ──
  // One row per end-of-visit beacon. `duration_ms` is the *active* time only
  // (paused while the tab is hidden, capped server-side). `scroll_pct` is the
  // furthest 0..100 scroll position reached. Same daily-rotating visitor_hash
  // as pageviews — no PII, no cross-day tracking possible.
  db.exec(`
    CREATE TABLE IF NOT EXISTS page_timings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      path         TEXT NOT NULL,
      duration_ms  INTEGER NOT NULL,
      scroll_pct   INTEGER NOT NULL DEFAULT 0,
      visitor_hash TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_page_timings_created ON page_timings(created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_page_timings_path ON page_timings(path);`);

  // ── Link clicks (enriched: internal nav, writing zone, outbound) ──
  // Captures cross-page navigation initiated from the writing zone (chapter ↔
  // book ↔ project), plus outbound links. `to_host` is empty for same-origin
  // navigations; for outbound it stores the hostname only (no path/query =
  // no PII tokens). Same privacy model as pageviews.
  db.exec(`
    CREATE TABLE IF NOT EXISTS link_clicks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_path    TEXT NOT NULL,
      to_path      TEXT NOT NULL DEFAULT '',
      to_host      TEXT NOT NULL DEFAULT '',
      kind         TEXT NOT NULL DEFAULT 'internal',
      visitor_hash TEXT NOT NULL DEFAULT '',
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_link_clicks_created ON link_clicks(created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_link_clicks_from ON link_clicks(from_path);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_link_clicks_kind ON link_clicks(kind, created_at);`);

  // ── First seen of each path (powers "new pages" dashboard section) ──
  // Captures the very first time a given public path was viewed. Back-filled
  // on first migration from the existing `pageviews` table so pre-existing
  // installs don't lose history.
  db.exec(`
    CREATE TABLE IF NOT EXISTS path_first_seen (
      path          TEXT PRIMARY KEY,
      first_seen_at INTEGER NOT NULL
    );
  `);
  // One-shot backfill: seed first_seen_at from the earliest pageview per path.
  const fsCount = db.prepare(`SELECT COUNT(*) AS n FROM path_first_seen`).get().n;
  if (fsCount === 0) {
    db.exec(`
      INSERT OR IGNORE INTO path_first_seen (path, first_seen_at)
      SELECT path, MIN(created_at) FROM pageviews GROUP BY path
    `);
  }

  // ── Contact form messages (public POST /api/contact, admin dashboard) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL DEFAULT '',
      email      TEXT NOT NULL,
      message    TEXT NOT NULL,
      read       INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at);`);

  // ── Project images (portfolio pages hero + screenshots) ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_images (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      filename      TEXT    NOT NULL UNIQUE,
      original_name TEXT,
      mime_type     TEXT,
      size          INTEGER,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);

  // ── Writing space (RP / worldbuilding) ──────────────────────────────────────
  // Three content levels: a *project* (a universe, e.g. « Nostra », shown on the
  // home page) owns *works* (its books / « livres ») which own ordered chapters.
  // Each chapter may point at an existing music track (FK to `tracks` — its PK is
  // a plain integer). Characters and the glossary are scoped to a project
  // (unique to it). No audio is stored here; the reader streams the full file via
  // /api/audio/:filename. Images reuse the project_images pipeline, so
  // writing_media only references the on-disk UUID filename — never a raw path.
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_projects (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      slug         TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      title_kr     TEXT NOT NULL DEFAULT '',
      subtitle     TEXT NOT NULL DEFAULT '',
      description  TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','wip','termine')),
      accent_color TEXT NOT NULL DEFAULT '#c9a8e8',
      cover_image  TEXT NOT NULL DEFAULT '',
      tags         TEXT NOT NULL DEFAULT '[]',
      ambient_effect TEXT NOT NULL DEFAULT 'none',
      has_glossary INTEGER NOT NULL DEFAULT 1,
      is_published INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_projects_sort ON writing_projects(sort_order);`);
  // Per-project toggle for the Korean glossary feature (not every universe uses it).
  ensureColumn('writing_projects', 'has_glossary', 'INTEGER NOT NULL DEFAULT 1');

  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_works (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE,
      slug         TEXT NOT NULL UNIQUE,
      title        TEXT NOT NULL,
      title_kr     TEXT NOT NULL DEFAULT '',
      subtitle     TEXT NOT NULL DEFAULT '',
      description  TEXT NOT NULL DEFAULT '',
      status       TEXT NOT NULL DEFAULT 'brouillon' CHECK (status IN ('brouillon','wip','termine')),
      accent_color TEXT NOT NULL DEFAULT '#c9a8e8',
      cover_image  TEXT NOT NULL DEFAULT '',
      tags         TEXT NOT NULL DEFAULT '[]',
      ambient_effect TEXT NOT NULL DEFAULT 'none',
      is_published INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_works_sort ON writing_works(sort_order);`);
  // Columns added across releases (safe on pre-existing installs).
  ensureColumn('writing_works', 'tags', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('writing_works', 'ambient_effect', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn('writing_works', 'project_id', 'INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE');
  // Tree of typed entries within a project: a work can be nested under another
  // work (parent_id), carries a free `type` (Livre, Chapitre, Lettre, Ville,
  // Cité, Monde, Région, Lore…) and an optional `content` for direct lore text
  // (shown above its chapters/children).
  ensureColumn('writing_works', 'parent_id', 'INTEGER REFERENCES writing_works(id) ON DELETE CASCADE');
  ensureColumn('writing_works', 'type', "TEXT NOT NULL DEFAULT 'Livre'");
  ensureColumn('writing_works', 'content', "TEXT NOT NULL DEFAULT ''");
  // Optional OST for the element's own lore content, and characters linked to
  // the element with a free note (e.g. "Auteur : Nielas") — JSON [{id,note}].
  ensureColumn('writing_works', 'audio_track_id', 'INTEGER REFERENCES tracks(id) ON DELETE SET NULL');
  ensureColumn('writing_works', 'linked_characters', "TEXT NOT NULL DEFAULT '[]'");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_works_project ON writing_works(project_id, sort_order);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_works_parent ON writing_works(parent_id, sort_order);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_chapters (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id        INTEGER NOT NULL REFERENCES writing_works(id) ON DELETE CASCADE,
      number         TEXT NOT NULL DEFAULT '',
      title          TEXT NOT NULL DEFAULT '',
      title_kr       TEXT NOT NULL DEFAULT '',
      content        TEXT NOT NULL DEFAULT '',
      audio_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_chapters_work ON writing_chapters(work_id, sort_order);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE,
      slug         TEXT NOT NULL UNIQUE,
      name         TEXT NOT NULL,
      name_kr      TEXT NOT NULL DEFAULT '',
      role         TEXT NOT NULL DEFAULT '',
      bio          TEXT NOT NULL DEFAULT '',
      avatar_image TEXT NOT NULL DEFAULT '',
      relations    TEXT NOT NULL DEFAULT '[]',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('characters', 'project_id', 'INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id, sort_order);`);

  // Media (screenshots / schemas / maps) attached to a work or a chapter.
  // `filename` is the UUID produced by the shared image uploader and must match
  // a project_images row to be served — same anti-leak guard as audio/images.
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_media (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      work_id    INTEGER REFERENCES writing_works(id) ON DELETE CASCADE,
      chapter_id INTEGER REFERENCES writing_chapters(id) ON DELETE CASCADE,
      type       TEXT NOT NULL DEFAULT 'screenshot' CHECK (type IN ('screenshot','schema','carte')),
      filename   TEXT NOT NULL,
      caption    TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_media_work ON writing_media(work_id, sort_order);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_writing_media_chapter ON writing_media(chapter_id, sort_order);`);

  // Korean glossary for the reading-mode tooltips ({{kr:…}} tokens), per project.
  db.exec(`
    CREATE TABLE IF NOT EXISTS glossary_terms (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id   INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE,
      term_kr      TEXT NOT NULL,
      romanization TEXT NOT NULL DEFAULT '',
      meaning      TEXT NOT NULL DEFAULT '',
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('glossary_terms', 'project_id', 'INTEGER REFERENCES writing_projects(id) ON DELETE CASCADE');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_glossary_project ON glossary_terms(project_id, sort_order);`);

  // Interactive 3D world map of a project (« Carte du monde »). Each zone is a
  // clickable building on the project's island. A zone either *links* an
  // existing entity of the project (kind work/character/glossary + target_id —
  // its title/cover/description are resolved at read time, no double entry) or
  // is free-form (kind 'libre', all fields its own). Non-empty own fields
  // always override the resolved ones. `connections` is a JSON array of other
  // zone ids of the same project (drawn as arcs). The biome preset lives on
  // writing_projects.map_biome; the map only renders when zones exist.
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_map_zones (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL DEFAULT 'libre' CHECK (kind IN ('work','character','glossary','libre')),
      target_id   INTEGER,
      title       TEXT NOT NULL DEFAULT '',
      subtitle    TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT '',
      tags        TEXT NOT NULL DEFAULT '[]',
      date        TEXT NOT NULL DEFAULT '',
      link        TEXT NOT NULL DEFAULT '',
      x           REAL NOT NULL DEFAULT 0,
      z           REAL NOT NULL DEFAULT 0,
      scale       REAL NOT NULL DEFAULT 1,
      rotation    REAL NOT NULL DEFAULT 0,
      building    TEXT NOT NULL DEFAULT 'tour',
      connections TEXT NOT NULL DEFAULT '[]',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_map_zones_project ON writing_map_zones(project_id, sort_order);`);
  // Map hierarchy (« monde → cité ») :
  // - a project owns *world maps* (writing_worldmaps — giant 2D atlases with
  //   POI), several per project (Surface, Profondeurs…) ;
  // - each work (Cité, Région…) can carry its own local voxel map
  //   (writing_works.map_biome/map_terrain) shown on its reader page ;
  // - zones are scoped by `worldmap_id` (world POI, 2D marker) or `work_id`
  //   (local-map building). Rows with neither are pre-hierarchy leftovers.
  db.exec(`
    CREATE TABLE IF NOT EXISTS writing_worldmaps (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES writing_projects(id) ON DELETE CASCADE,
      name       TEXT NOT NULL DEFAULT 'Surface',
      terrain    TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_worldmaps_project ON writing_worldmaps(project_id, sort_order);`);
  ensureColumn('writing_map_zones', 'worldmap_id', 'INTEGER REFERENCES writing_worldmaps(id) ON DELETE CASCADE');
  ensureColumn('writing_map_zones', 'work_id', 'INTEGER REFERENCES writing_works(id) ON DELETE CASCADE');
  ensureColumn('writing_map_zones', 'marker', "TEXT NOT NULL DEFAULT ''");
  // Territory polygon owned by a world-map POI (JSON { color, points:[[x,z]…] },
  // drawn as a tinted area + dashed border around its capital/city).
  ensureColumn('writing_map_zones', 'territory', "TEXT NOT NULL DEFAULT ''");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_map_zones_worldmap ON writing_map_zones(worldmap_id, sort_order);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_map_zones_work ON writing_map_zones(work_id, sort_order);`);
  ensureColumn('writing_works', 'map_biome', "TEXT NOT NULL DEFAULT 'plaines'");
  ensureColumn('writing_works', 'map_terrain', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('writing_projects', 'map_biome', "TEXT NOT NULL DEFAULT 'plaines'");
  // Free-form terrain description (JSON: regions/rivers/lakes/paths/biomes…)
  // consumed by the voxel engine client-side — see docs/carte-3d.md. Editing
  // it never requires touching the engine code.
  ensureColumn('writing_projects', 'map_terrain', "TEXT NOT NULL DEFAULT ''");

  // One-time migration for installs created before the project layer existed:
  // gather orphan works/characters/glossary under a single default project so
  // nothing is lost. Runs only while orphans exist (guarded), then never again.
  const orphans = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM writing_works   WHERE project_id IS NULL) AS w,
      (SELECT COUNT(*) FROM characters      WHERE project_id IS NULL) AS c,
      (SELECT COUNT(*) FROM glossary_terms  WHERE project_id IS NULL) AS g
  `).get();
  if (orphans.w || orphans.c || orphans.g) {
    let proj = db.prepare('SELECT id FROM writing_projects ORDER BY sort_order, id LIMIT 1').get();
    if (!proj) {
      const r = db.prepare(`
        INSERT INTO writing_projects (slug, title, subtitle, status, is_published, sort_order)
        VALUES ('univers', 'Mon univers', 'Univers à renommer', 'wip', 1, 0)
      `).run();
      proj = { id: r.lastInsertRowid };
    }
    db.prepare('UPDATE writing_works  SET project_id = ? WHERE project_id IS NULL').run(proj.id);
    db.prepare('UPDATE characters     SET project_id = ? WHERE project_id IS NULL').run(proj.id);
    db.prepare('UPDATE glossary_terms SET project_id = ? WHERE project_id IS NULL').run(proj.id);
  }

  // ══════════════════════════════════════════════════════════════════════
  //  Quest tracker (« Quêtes » — Nostra / Minefield). Global module (NOT
  //  workspace-scoped): a small set of authorised members share one quest DB.
  //  Completion is per-member + per-period (period_key). The site never holds
  //  a reputation score (that lives in-game) — factions/tiers are a reference,
  //  and rewards only *document* what a quest grants.
  // ══════════════════════════════════════════════════════════════════════

  // A faction (« Hewyr », « Château »…) or a mastery track (« Forge »…). Its
  // tiers are its own — never shared with another faction.
  db.exec(`
    CREATE TABLE IF NOT EXISTS factions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nom         TEXT NOT NULL,
      couleur     TEXT NOT NULL DEFAULT '#c9a8e8',
      type        TEXT NOT NULL DEFAULT 'faction' CHECK (type IN ('faction','maitrise')),
      description TEXT NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_factions_sort ON factions(sort_order, id);`);

  // Reputation / mastery tiers of a faction (« Néophyte maladroit »=1, …).
  db.exec(`
    CREATE TABLE IF NOT EXISTS faction_tiers (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      faction_id INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
      nom_palier TEXT NOT NULL,
      seuil      INTEGER NOT NULL DEFAULT 0,
      ordre      INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_faction_tiers_faction ON faction_tiers(faction_id, ordre);`);

  // A quest chain (« suite »). The linear-progression illusion is rendered from
  // the edge graph; a chain row is just a grouping label + optional faction.
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_chains (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nom         TEXT NOT NULL,
      faction_id  INTEGER REFERENCES factions(id) ON DELETE SET NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_chains_faction ON quest_chains(faction_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS quests (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      titre           TEXT NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      occurrence_type TEXT NOT NULL DEFAULT 'simple'
                      CHECK (occurrence_type IN ('simple','journaliere','hebdomadaire','mensuelle')),
      faction_id      INTEGER REFERENCES factions(id) ON DELETE SET NULL,
      chain_id        INTEGER REFERENCES quest_chains(id) ON DELETE SET NULL,
      chain_rank      INTEGER NOT NULL DEFAULT 0,
      due_date        INTEGER,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quests_faction ON quests(faction_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quests_chain ON quests(chain_id, chain_rank);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quests_occurrence ON quests(occurrence_type);`);

  // Directed unlock graph: from_quest → to_quest (allows branches from one node).
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_edges (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      from_quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      to_quest_id   INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      UNIQUE (from_quest_id, to_quest_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_edges_from ON quest_edges(from_quest_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_edges_to ON quest_edges(to_quest_id);`);

  // Inputs (what to spend/provide). ref_code = a codex item id (public/codex +
  // codex_vanilla), never a FK — the referential is a JSON catalogue, not a table.
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_inputs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id   INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL DEFAULT 'item'
                 CHECK (kind IN ('item','pa','reputation','pnj','autre')),
      ref_code   TEXT,
      faction_id INTEGER REFERENCES factions(id) ON DELETE SET NULL,
      quantite   INTEGER,
      label      TEXT NOT NULL DEFAULT '',
      icon       TEXT,
      ordre      INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_inputs_quest ON quest_inputs(quest_id, ordre);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_rewards (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id        INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      kind            TEXT NOT NULL DEFAULT 'item'
                      CHECK (kind IN ('item','pa','reputation','deblocage','autre')),
      ref_code        TEXT,
      faction_id      INTEGER REFERENCES factions(id) ON DELETE SET NULL,
      quantite        INTEGER,
      unlock_quest_id INTEGER REFERENCES quests(id) ON DELETE SET NULL,
      label           TEXT NOT NULL DEFAULT '',
      icon            TEXT,
      ordre           INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_rewards_quest ON quest_rewards(quest_id, ordre);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_rewards_faction ON quest_rewards(faction_id);`);
  // Récompenses ALÉATOIRES : une quête de récolte peut ne rien donner, ou n
  // objets. Même modèle que les tables de butin des contenants, mais porté par
  // la ligne elle-même plutôt que par une table à part — la liste des
  // récompenses reste une seule liste, et l'index inversé « où trouver quoi »
  // hérite des probabilités sans requête supplémentaire.
  //   probabilite IS NULL → ligne GARANTIE (le cas historique, inchangé)
  //   probabilite renseignée → ligne du tirage aléatoire de la quête
  // quantite_min/max décrivent une fourchette ; quantite reste la valeur fixe
  // quand il n'y a pas de fourchette.
  ensureColumn('quest_rewards', 'probabilite', 'REAL');
  ensureColumn('quest_rewards', 'probabilite_source', 'TEXT');
  ensureColumn('quest_rewards', 'quantite_min', 'INTEGER');
  ensureColumn('quest_rewards', 'quantite_max', 'INTEGER');

  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_prerequisites (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id     INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      kind         TEXT NOT NULL DEFAULT 'autre'
                   CHECK (kind IN ('quete_terminee','reputation_min','item_possede','maitrise_min','autre')),
      ref_quest_id INTEGER REFERENCES quests(id) ON DELETE SET NULL,
      faction_id   INTEGER REFERENCES factions(id) ON DELETE SET NULL,
      tier_id      INTEGER REFERENCES faction_tiers(id) ON DELETE SET NULL,
      ref_code     TEXT,
      valeur       INTEGER,
      label        TEXT NOT NULL DEFAULT '',
      ordre        INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_prereqs_quest ON quest_prerequisites(quest_id, ordre);`);

  // 1–2 map points per quest (validated server-side). Raw in-game X/Y/Z.
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_map_points (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      label    TEXT NOT NULL DEFAULT '',
      role     TEXT NOT NULL DEFAULT 'autre'
               CHECK (role IN ('recuperation','rendu','pnj','autre')),
      x        INTEGER NOT NULL DEFAULT 0,
      y        INTEGER NOT NULL DEFAULT 0,
      z        INTEGER NOT NULL DEFAULT 0,
      ordre    INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_map_points_quest ON quest_map_points(quest_id, ordre);`);

  // Per-member, per-period completion. The reset is implicit: "done this
  // period?" = does a row exist for the current period_key. Nothing is ever
  // deleted on reset, so history is preserved and the model is replayable.
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_completions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id     INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      member_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      period_key   TEXT NOT NULL,
      completed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE (quest_id, member_id, period_key)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_completions_member ON quest_completions(member_id, period_key);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_completions_quest ON quest_completions(quest_id, period_key);`);

  // User-defined quest groups — a free organizational axis on top of the fixed
  // faction (origin) and chain (sequence) structure. A quest can belong to
  // several groups (many-to-many). Shared/editable like factions & chains.
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nom         TEXT NOT NULL,
      couleur     TEXT NOT NULL DEFAULT '#c9a8e8',
      description TEXT NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_groups_sort ON quest_groups(sort_order, id);`);
  // Groupes PRIVÉS : owner_id NULL = groupe partagé (historique), sinon le
  // groupe n'est visible/gérable que par son propriétaire (sélections perso
  // pour la projection de gains).
  ensureColumn('quest_groups', 'owner_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_group_items (
      group_id INTEGER NOT NULL REFERENCES quest_groups(id) ON DELETE CASCADE,
      quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, quest_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_group_items_quest ON quest_group_items(quest_id);`);

  // Standalone points of interest on the quest world map — NOT tied to a quest.
  // Special buildings, quest-item farming zones, NPCs, etc. Shared/editable.
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_map_pois (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      label       TEXT NOT NULL,
      category    TEXT NOT NULL DEFAULT 'autre'
                  CHECK (category IN ('batiment','farm','pnj','ressource','autre')),
      note        TEXT NOT NULL DEFAULT '',
      couleur     TEXT NOT NULL DEFAULT '',
      x           INTEGER NOT NULL DEFAULT 0,
      y           INTEGER NOT NULL DEFAULT 0,
      z           INTEGER NOT NULL DEFAULT 0,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_map_pois_cat ON quest_map_pois(category);`);

  // Multiple named maps (e.g. Overworld / Nether, or distinct regions). Each map
  // carries its own default view — center + span — because a server world is
  // rarely centred on 0,0. Quest map points and free POIs belong to a map.
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_maps (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nom          TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      couleur      TEXT NOT NULL DEFAULT '#c9a8e8',
      center_x     INTEGER NOT NULL DEFAULT 0,
      center_z     INTEGER NOT NULL DEFAULT 0,
      default_span INTEGER NOT NULL DEFAULT 512,
      image_filename TEXT,
      img_center_x INTEGER NOT NULL DEFAULT 0,
      img_center_z INTEGER NOT NULL DEFAULT 0,
      img_span     INTEGER NOT NULL DEFAULT 512,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_maps_sort ON quest_maps(sort_order, id);`);
  // Optional real 2D map image (reuses the /api/images pipeline), calibrated to
  // world coords: the image is centred at (img_center_x, img_center_z) and spans
  // img_span blocks across its width. Added post-hoc for installs on the first
  // multi-map release.
  ensureColumn('quest_maps', 'image_filename', 'TEXT');
  ensureColumn('quest_maps', 'img_center_x', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quest_maps', 'img_center_z', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quest_maps', 'img_span', 'INTEGER NOT NULL DEFAULT 512');
  // A NULL map_id means "the default (first) map" — resolved at read time so
  // deleting a map (SET NULL) never orphans a point off the map view.
  ensureColumn('quest_map_pois', 'map_id', 'INTEGER REFERENCES quest_maps(id) ON DELETE SET NULL');
  ensureColumn('quest_map_points', 'map_id', 'INTEGER REFERENCES quest_maps(id) ON DELETE SET NULL');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_map_pois_map ON quest_map_pois(map_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_map_points_map ON quest_map_points(map_id);`);

  // Items custom (« liste d'objets custom ») : un item Minecraft/Minefield du
  // codex renommé (ex. « Chair de zombie » → « Chair de noyé »), avec des
  // enchantements libres (JSON array de textes). ref_code = id de codex de
  // l'item de base (pas de FK — le référentiel est un catalogue JSON). Les
  // lignes de quêtes y font référence via ref_code = 'custom:<id>' ; le
  // rapprochement avec les coffres (minecraft_resources) se fait par nom
  // normalisé sur le nom custom.
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_custom_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      nom           TEXT NOT NULL,
      ref_code      TEXT,
      enchantements TEXT NOT NULL DEFAULT '[]',
      note          TEXT NOT NULL DEFAULT '',
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_custom_items_sort ON quest_custom_items(sort_order, id);`);
  // Stats libres de l'item (JSON array de textes, ex. « Dégâts +10 »,
  // « Vitesse +20 % ») — même modèle que les enchantements.
  ensureColumn('quest_custom_items', 'stats', "TEXT NOT NULL DEFAULT '[]'");

  // ══════════════════════════════════════════════════════════════════════
  //  Items UNIQUES — `quest_custom_items` promue en entité de premier plan.
  //  Historiquement « un item du codex renommé » ; c'est désormais LE
  //  catalogue d'objets du serveur (géodes, monnaies, équipement custom…),
  //  autonome (créable sans quête) et référencé partout par la convention
  //  déjà en place `ref_code = 'custom:<id>'` — d'où l'extension EN PLACE
  //  plutôt qu'une table parallèle : aucun id ne bouge, aucune ligne de
  //  quête existante ne casse.
  // ══════════════════════════════════════════════════════════════════════

  // Échelle de rareté ORDONNÉE et éditable en ligne (commun → légendaire).
  // Volontairement une table et non un enum : de nouveaux paliers apparaissent
  // au fil des découvertes en jeu, sans redéploiement.
  db.exec(`
    CREATE TABLE IF NOT EXISTS unique_item_rarities (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      nom        TEXT NOT NULL,
      couleur    TEXT NOT NULL DEFAULT '#c9a8e8',
      ordre      INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_unique_item_rarities_ordre ON unique_item_rarities(ordre, id);`);

  // Sets d'items uniques (« il existe 6 sets de joyaux, plus le set contient de
  // joyaux plus il est précieux »). `taille` = le nombre de pièces que le set
  // compte EN JEU : c'est ce qui permet d'afficher « 3/5 documentés » sans
  // ressaisir la liste, les membres étant simplement les items qui pointent
  // dessus. Table éditable pour la même raison que l'échelle de rareté : de
  // nouveaux sets apparaissent au fil des mises à jour du serveur.
  db.exec(`
    CREATE TABLE IF NOT EXISTS unique_item_sets (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      slug       TEXT,
      nom        TEXT NOT NULL,
      couleur    TEXT NOT NULL DEFAULT '#c9a8e8',
      taille     INTEGER NOT NULL DEFAULT 0,
      note       TEXT NOT NULL DEFAULT '',
      ordre      INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_unique_item_sets_ordre ON unique_item_sets(ordre, id);`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_item_sets_slug ON unique_item_sets(slug) WHERE slug IS NOT NULL AND slug <> '';`);

  // Champs d'item unique. `ref_code` (existant) porte l'item support du codex —
  // c'est le `base_item_id` de la spec, gardé sous son nom historique pour ne
  // pas réécrire les lignes existantes. `note` (existant) sert de champ Notes.
  // `categorie` n'a délibérément PAS de CHECK : en SQLite une contrainte CHECK
  // ne s'étend pas sans reconstruire la table, or la liste doit rester ouverte
  // — la validation vit côté serveur (quests-admin.js#UNIQUE_ITEM_CATEGORIES).
  ensureColumn('quest_custom_items', 'slug', 'TEXT');
  ensureColumn('quest_custom_items', 'lore', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('quest_custom_items', 'rarete_id', 'INTEGER REFERENCES unique_item_rarities(id) ON DELETE SET NULL');
  ensureColumn('quest_custom_items', 'categorie', "TEXT NOT NULL DEFAULT 'autre'");
  ensureColumn('quest_custom_items', 'faction_id', 'INTEGER REFERENCES factions(id) ON DELETE SET NULL');
  ensureColumn('quest_custom_items', 'icone_override', 'TEXT');
  ensureColumn('quest_custom_items', 'est_vendable', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quest_custom_items', 'prix_vente', 'REAL');
  // Unité du prix : 'pa' ou 'custom:<id>' (un item unique de catégorie monnaie).
  ensureColumn('quest_custom_items', 'prix_unite', "TEXT NOT NULL DEFAULT 'pa'");
  ensureColumn('quest_custom_items', 'est_ouvrable', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quest_custom_items', 'tags', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('quest_custom_items', 'set_id', 'INTEGER REFERENCES unique_item_sets(id) ON DELETE SET NULL');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_items_slug ON quest_custom_items(slug) WHERE slug IS NOT NULL AND slug <> '';`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_unique_items_rarete ON quest_custom_items(rarete_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_unique_items_categorie ON quest_custom_items(categorie);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_unique_items_set ON quest_custom_items(set_id);`);
  backfillUniqueItemSlugs();

  // Table de butin d'un contenant ouvrable (« géode »). Un résultat est soit un
  // autre item unique (FK, d'où la détection de cycle côté serveur), soit un id
  // de codex, soit des PA / de la réputation, soit du texte libre. La somme des
  // probabilités n'est JAMAIS contrainte : elle est signalée, pas imposée.
  db.exec(`
    CREATE TABLE IF NOT EXISTS loot_entries (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_item_id     INTEGER NOT NULL REFERENCES quest_custom_items(id) ON DELETE CASCADE,
      resultat_type      TEXT NOT NULL DEFAULT 'item_referentiel'
                         CHECK (resultat_type IN ('unique_item','item_referentiel','pa','reputation','autre')),
      resultat_ref       TEXT,
      resultat_unique_id INTEGER REFERENCES quest_custom_items(id) ON DELETE SET NULL,
      faction_id         INTEGER REFERENCES factions(id) ON DELETE SET NULL,
      label_affiche      TEXT NOT NULL DEFAULT '',
      quantite_min       INTEGER NOT NULL DEFAULT 1,
      quantite_max       INTEGER NOT NULL DEFAULT 1,
      probabilite        REAL NOT NULL DEFAULT 0,
      probabilite_source TEXT NOT NULL DEFAULT 'estimee'
                         CHECK (probabilite_source IN ('officielle','estimee','observee')),
      ordre              INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loot_entries_item ON loot_entries(unique_item_id, ordre);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loot_entries_result ON loot_entries(resultat_unique_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loot_entries_ref ON loot_entries(resultat_ref);`);

  // Journal d'ouvertures : ce qu'un membre a RÉELLEMENT obtenu. Sert à calculer
  // un taux empirique (+ intervalle de confiance) à côté de la proba déclarée.
  // Aucune donnée personnelle nouvelle : member_id est le compte déjà connecté,
  // exactement comme quest_completions.
  db.exec(`
    CREATE TABLE IF NOT EXISTS loot_observations (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_item_id     INTEGER NOT NULL REFERENCES quest_custom_items(id) ON DELETE CASCADE,
      loot_entry_id      INTEGER REFERENCES loot_entries(id) ON DELETE SET NULL,
      resultat_type      TEXT NOT NULL DEFAULT 'item_referentiel'
                         CHECK (resultat_type IN ('unique_item','item_referentiel','pa','reputation','autre')),
      resultat_ref       TEXT,
      resultat_unique_id INTEGER REFERENCES quest_custom_items(id) ON DELETE SET NULL,
      label_affiche      TEXT NOT NULL DEFAULT '',
      quantite           INTEGER NOT NULL DEFAULT 1,
      member_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at         INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loot_observations_item ON loot_observations(unique_item_id, created_at);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_loot_observations_member ON loot_observations(member_id);`);
  linkCustomRefsInLoot();

  // Sources MANUELLES d'un item : ce qui n'entre dans aucune source dérivée
  // (drop de mob, coffre, événement…). Le reste de la page « Où trouver quoi »
  // est calculé, jamais ressaisi.
  db.exec(`
    CREATE TABLE IF NOT EXISTS unique_item_sources (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      unique_item_id INTEGER NOT NULL REFERENCES quest_custom_items(id) ON DELETE CASCADE,
      kind           TEXT NOT NULL DEFAULT 'autre'
                     CHECK (kind IN ('mob','coffre','evenement','pnj','peche','minage','autre')),
      label          TEXT NOT NULL DEFAULT '',
      note           TEXT NOT NULL DEFAULT '',
      map_id         INTEGER REFERENCES quest_maps(id) ON DELETE SET NULL,
      x              INTEGER,
      y              INTEGER,
      z              INTEGER,
      ordre          INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_unique_item_sources_item ON unique_item_sources(unique_item_id, ordre);`);

  // ── Quêtes d'achat : n offres par quête, chacune « ce qu'on donne » →
  //    « ce qu'on reçoit ». La monnaie est soit des PA, soit un item unique de
  //    catégorie monnaie (ligne kind='item' + ref_code='custom:<id>', la même
  //    convention que les entrées/récompenses — une seule façon de désigner un
  //    objet dans tout le module).
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_offers (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      vendeur  TEXT NOT NULL DEFAULT '',
      note     TEXT NOT NULL DEFAULT '',
      stock    INTEGER,
      limite   TEXT NOT NULL DEFAULT '',
      map_id   INTEGER REFERENCES quest_maps(id) ON DELETE SET NULL,
      x        INTEGER,
      y        INTEGER,
      z        INTEGER,
      ordre    INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_offers_quest ON quest_offers(quest_id, ordre);`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS quest_offer_lines (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      offer_id INTEGER NOT NULL REFERENCES quest_offers(id) ON DELETE CASCADE,
      sens     TEXT NOT NULL DEFAULT 'donne' CHECK (sens IN ('donne','recoit')),
      kind     TEXT NOT NULL DEFAULT 'item' CHECK (kind IN ('item','pa','autre')),
      ref_code TEXT,
      quantite INTEGER NOT NULL DEFAULT 1,
      label    TEXT NOT NULL DEFAULT '',
      ordre    INTEGER NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_offer_lines_offer ON quest_offer_lines(offer_id, sens, ordre);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_offer_lines_ref ON quest_offer_lines(ref_code);`);

  // ── Familles de quêtes + recette de craft ──
  // `categorie` sans CHECK (même raison que unique_items.categorie : la liste
  // doit rester extensible sans reconstruire la table).
  ensureColumn('quests', 'categorie', "TEXT NOT NULL DEFAULT 'recolte'");
  // La recette d'une quête de craft RÉUTILISE quest_inputs (ingrédients) et
  // quest_rewards (résultat) — d'où le suivi « Où trouver dans les coffres » et
  // le flux cockpit qui marchent d'emblée sur les crafts. Ne s'ajoutent ici que
  // la mise en scène (station, grille 3×3) et la maîtrise requise.
  ensureColumn('quests', 'craft_station', "TEXT NOT NULL DEFAULT ''");
  ensureColumn('quests', 'craft_grid', "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn('quests', 'craft_shapeless', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quests', 'maitrise_faction_id', 'INTEGER REFERENCES factions(id) ON DELETE SET NULL');
  ensureColumn('quests', 'maitrise_tier_id', 'INTEGER REFERENCES faction_tiers(id) ON DELETE SET NULL');
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quests_categorie ON quests(categorie);`);
  // Index inversé « où trouver quoi » : les sources dérivées interrogent les
  // lignes de quêtes par ref_code (égalité exacte sur 'custom:<id>' ou id codex).
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_inputs_ref ON quest_inputs(ref_code);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_quest_rewards_ref ON quest_rewards(ref_code);`);

  // ── Cockpit MF : réglages PERSO du flux pull ──
  // Liste d'items par utilisateur (pas la wishlist de groupe minecraft_wanted) :
  // envoyée dans la section `wanted` du flux cockpit. `workspace_id` optionnel
  // rattache l'item à un projet ; x/y/z = coordonnées en jeu optionnelles.
  db.exec(`
    CREATE TABLE IF NOT EXISTS cockpit_items (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      quantity     INTEGER NOT NULL DEFAULT 1,
      priority     INTEGER NOT NULL DEFAULT 2,
      note         TEXT NOT NULL DEFAULT '',
      workspace_id INTEGER REFERENCES workspaces(id) ON DELETE SET NULL,
      x            INTEGER,
      y            INTEGER,
      z            INTEGER,
      done         INTEGER NOT NULL DEFAULT 0,
      done_at      INTEGER,
      position     INTEGER NOT NULL DEFAULT 0,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cockpit_items_user ON cockpit_items(user_id, done, priority, position);`);

  // Quêtes suivies par utilisateur : aucune ligne = tout est envoyé au cockpit ;
  // au moins une ligne = seules les quêtes suivies partent dans le flux.
  db.exec(`
    CREATE TABLE IF NOT EXISTS cockpit_quest_follows (
      user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_id INTEGER NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
      UNIQUE (user_id, quest_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cockpit_follows_user ON cockpit_quest_follows(user_id);`);

  // Guarantee a default map exists, then adopt any pre-existing points/POIs
  // created before the multi-map feature. Runs once (guarded by empty table).
  if (db.prepare('SELECT COUNT(*) AS n FROM quest_maps').get().n === 0) {
    const def = db.prepare(`
      INSERT INTO quest_maps (nom, description, center_x, center_z, default_span, sort_order)
      VALUES ('Monde principal', 'Carte par défaut', 0, 0, 512, 0)
    `).run();
    db.prepare('UPDATE quest_map_pois SET map_id = ? WHERE map_id IS NULL').run(def.lastInsertRowid);
    db.prepare('UPDATE quest_map_points SET map_id = ? WHERE map_id IS NULL').run(def.lastInsertRowid);
  }

  // ── Atelier « Salle des coffres » (plans de rangement Minefield) ──
  // Un plan = un gabarit (dims) + un document JSON (étages, zones, coffres,
  // circulation). Le document est édité et autosauvé d'un bloc côté client,
  // donc il vit dans une colonne unique ; les métadonnées restent en colonnes
  // scalaires pour lister les plans sans parser le document.
  //
  // `revision` porte le verrou optimiste : la sauvegarde est un UPDATE
  // conditionnel (… WHERE id = ? AND revision = ?), pas un read-then-write —
  // deux éditeurs simultanés ne peuvent donc pas s'écraser sans 409.
  //
  // Le module ne stocke AUCUNE ressource ni quantité : un coffre est une case
  // et un type (simple/double), jamais un inventaire.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_plans (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      mc_version TEXT NOT NULL DEFAULT '1.21',
      dim_x      INTEGER NOT NULL DEFAULT 125,
      dim_y      INTEGER NOT NULL DEFAULT 200,
      dim_z      INTEGER NOT NULL DEFAULT 125,
      origin_x   INTEGER,
      origin_y   INTEGER,
      origin_z   INTEGER,
      data       TEXT NOT NULL DEFAULT '{}',
      revision   INTEGER NOT NULL DEFAULT 1,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vault_plans_owner ON vault_plans(created_by, updated_at);`);

  // Partage d'un plan avec un autre compte : droits d'édition complets (la v1
  // ne prévoit pas de lecture seule). La suppression reste au propriétaire.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_plan_shares (
      plan_id    INTEGER NOT NULL REFERENCES vault_plans(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      PRIMARY KEY (plan_id, user_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vault_shares_user ON vault_plan_shares(user_id);`);

  // Snapshots : copie figée du document, du gabarit ET des catégories
  // référencées (elles vivent dans une table globale, donc un snapshot doit
  // embarquer sa propre copie pour rester cohérent des mois plus tard).
  // Restaurer = dupliquer dans un NOUVEAU plan ; l'original n'est jamais écrasé.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_plan_versions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id    INTEGER NOT NULL REFERENCES vault_plans(id) ON DELETE CASCADE,
      label      TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vault_versions_plan ON vault_plan_versions(plan_id, id);`);

  // Catégories de rangement — table GLOBALE partagée par tous les plans
  // (« Redstone », « Construction »…). `item_ids` est un tableau JSON d'ids de
  // codex, purement descriptif : il documente ce qui va dans la catégorie, sans
  // aucune quantité. Une zone référence des catégories par id ; un id supprimé
  // est simplement ignoré à la lecture côté client (pas de FK dans le document).
  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#c9a8e8',
      item_ids   TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vault_categories_sort ON vault_categories(sort_order, id);`);

  // ── Lore « Nostra » (enquête collaborative sur le lore de la map Minefield) ──
  // Module global comme les quêtes : accès gaté par users.can_view_lore (admins
  // outre), tables relationnelles préfixées lore_. Les enums extensibles
  // (entry_type, status, stance, relation_type, dimension) n'ont volontairement
  // PAS de CHECK — listes dans server/lore/enums.js, même raison que
  // quests.categorie : un CHECK SQLite ne s'étend pas sans rebuild de table.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_entries (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      slug          TEXT NOT NULL UNIQUE,
      body_md       TEXT NOT NULL DEFAULT '',
      entry_type    TEXT NOT NULL DEFAULT 'observation',
      coord_x       INTEGER,
      coord_y       INTEGER,
      coord_z       INTEGER,
      dimension     TEXT NOT NULL DEFAULT 'overworld',
      is_canon      INTEGER NOT NULL DEFAULT 0,
      discovered_at INTEGER,
      author_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_entries_type ON lore_entries(entry_type);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_entries_coords ON lore_entries(dimension, coord_x, coord_z);`);
  // Deux serveurs/mondes distincts (Nostra, Novum) partagent la salle
  // d'enquête : chaque donnée géographique porte son monde. Liste extensible
  // dans server/lore/enums.js (MONDES), pas de CHECK.
  ensureColumn('lore_entries', 'monde', `TEXT NOT NULL DEFAULT 'nostra'`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_hypotheses (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      body_md         TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'open',
      confidence      INTEGER NOT NULL DEFAULT 50,
      created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at     INTEGER,
      resolution_note TEXT NOT NULL DEFAULT '',
      created_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_hypotheses_status ON lore_hypotheses(status);`);

  // Le cœur du système : une même observation peut soutenir une hypothèse et
  // en contredire une autre. Une seule position par paire (hypothèse, entrée).
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_evidence (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      hypothesis_id INTEGER NOT NULL REFERENCES lore_hypotheses(id) ON DELETE CASCADE,
      entry_id      INTEGER NOT NULL REFERENCES lore_entries(id) ON DELETE CASCADE,
      stance        TEXT NOT NULL DEFAULT 'neutral',
      note          TEXT NOT NULL DEFAULT '',
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE (hypothesis_id, entry_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_evidence_entry ON lore_evidence(entry_id);`);

  // Médias rattachés à une entrée OU une hypothèse (ou à rien : fond de carte).
  // Fichiers WebP recompressés + miniature, servis UNIQUEMENT par
  // /api/lore/media/file/:f derrière le gate lore — jamais en statique.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_media (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id       INTEGER REFERENCES lore_entries(id) ON DELETE CASCADE,
      hypothesis_id  INTEGER REFERENCES lore_hypotheses(id) ON DELETE CASCADE,
      filename       TEXT NOT NULL,
      thumb_filename TEXT,
      original_name  TEXT NOT NULL DEFAULT '',
      mime_type      TEXT,
      width          INTEGER,
      height         INTEGER,
      size           INTEGER NOT NULL DEFAULT 0,
      caption        TEXT NOT NULL DEFAULT '',
      uploaded_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_media_entry ON lore_media(entry_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_media_hypothesis ON lore_media(hypothesis_id);`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_lore_media_filename ON lore_media(filename);`);

  // Tags libres avec couleur optionnelle + liaison N-N.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_tags (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#c9a8e8'
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_entry_tags (
      entry_id INTEGER NOT NULL REFERENCES lore_entries(id) ON DELETE CASCADE,
      tag_id   INTEGER NOT NULL REFERENCES lore_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (entry_id, tag_id)
    );
  `);

  // Relations orientées entre entrées (same_system, points_to, contradicts,
  // variant_of, located_in) — nourrit la vue graphe.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_links (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entry_id INTEGER NOT NULL REFERENCES lore_entries(id) ON DELETE CASCADE,
      to_entry_id   INTEGER NOT NULL REFERENCES lore_entries(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL DEFAULT 'points_to',
      note          TEXT NOT NULL DEFAULT '',
      created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE (from_entry_id, to_entry_id, relation_type)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_links_to ON lore_links(to_entry_id);`);

  // Historique : snapshot du body_md à chaque save (pas de diff), cible
  // 'entry' ou 'hypothesis' — même patron polymorphe que comments. Pas de FK
  // (deux tables cibles) : purgé explicitement par store.deleteEntry/Hypothesis.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_revisions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL,
      target_id   INTEGER NOT NULL,
      body_md     TEXT NOT NULL,
      author_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_revisions_target ON lore_revisions(target_type, target_id, id);`);

  // Fond(s) de carte calibrés : les deux points de référence saisis tels quels
  // (X des coins bas-gauche / bas-droit + Z du bord bas du render) ; le client
  // dérive centre + span et la hauteur du ratio naturel de l'image — même
  // mécanique d'affichage que quest_maps / minecraft_maps.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_maps (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT NOT NULL,
      dimension      TEXT NOT NULL DEFAULT 'overworld',
      image_filename TEXT,
      img_x_left     INTEGER,
      img_x_right    INTEGER,
      img_z_bottom   INTEGER,
      position       INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  ensureColumn('lore_maps', 'monde', `TEXT NOT NULL DEFAULT 'nostra'`);

  // Fond de carte en TUILES : la grille des cartes Minecraft, sur DEUX niveaux
  // de zoom. Au niveau `zoom`, une case fait 128·2^zoom blocs et la tuile
  // (i, j) couvre X ∈ [i·côté-64, i·côté+64+côté-128) — le décalage de -64 est
  // le même à tous les niveaux (formule du jeu), donc une case de zoom 2
  // (512×512) contient EXACTEMENT 4×4 cases de zoom 0. On expose 0 (détail) et
  // 2 (atlas) ; ré-uploader une case la remplace, à son niveau seulement.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_map_tiles (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      map_id      INTEGER NOT NULL REFERENCES lore_maps(id) ON DELETE CASCADE,
      zoom        INTEGER NOT NULL DEFAULT 0,
      tile_x      INTEGER NOT NULL,
      tile_z      INTEGER NOT NULL,
      filename    TEXT NOT NULL,
      uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      UNIQUE (map_id, zoom, tile_x, tile_z)
    );
  `);
  // Bases antérieures aux niveaux de zoom : la contrainte UNIQUE portait sur
  // (map_id, tile_x, tile_z), ce qui interdirait la même case aux deux
  // niveaux. SQLite ne sait pas modifier une contrainte de table → rebuild
  // (les tuiles existantes sont toutes du niveau 0, d'où le `0` littéral).
  // Rien ne référence lore_map_tiles : le rename ne casse aucune FK.
  if (!db.prepare(`PRAGMA table_info(lore_map_tiles)`).all().some((c) => c.name === 'zoom')) {
    db.exec(`
      BEGIN;
      ALTER TABLE lore_map_tiles RENAME TO lore_map_tiles_pre_zoom;
      CREATE TABLE lore_map_tiles (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        map_id      INTEGER NOT NULL REFERENCES lore_maps(id) ON DELETE CASCADE,
        zoom        INTEGER NOT NULL DEFAULT 0,
        tile_x      INTEGER NOT NULL,
        tile_z      INTEGER NOT NULL,
        filename    TEXT NOT NULL,
        uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        UNIQUE (map_id, zoom, tile_x, tile_z)
      );
      INSERT INTO lore_map_tiles
        (id, map_id, zoom, tile_x, tile_z, filename, uploaded_by, created_at, updated_at)
        SELECT id, map_id, 0, tile_x, tile_z, filename, uploaded_by, created_at, updated_at
        FROM lore_map_tiles_pre_zoom;
      DROP TABLE lore_map_tiles_pre_zoom;
      COMMIT;
    `);
  }

  // Peuples du monde (Hewyr, Ondiens…) : un PNJ (lore_entries.peuple_id) y est
  // rattaché, et porte ses dialogues relevés en jeu — plusieurs par PNJ, avec
  // un nom de quête optionnel en étiquette libre.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_peuples (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      color         TEXT NOT NULL DEFAULT '#7be3a8',
      description_md TEXT NOT NULL DEFAULT '',
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_dialogues (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id   INTEGER NOT NULL REFERENCES lore_entries(id) ON DELETE CASCADE,
      texte      TEXT NOT NULL,
      quest_name TEXT NOT NULL DEFAULT '',
      position   INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_dialogues_entry ON lore_dialogues(entry_id, position, id);`);
  // Un PNJ (entrée de type pnj) peut appartenir à un peuple — colonne ajoutée
  // ici, APRÈS la création de lore_peuples (cible de la FK).
  ensureColumn('lore_entries', 'peuple_id', 'INTEGER REFERENCES lore_peuples(id) ON DELETE SET NULL');

  // Tracés d'enquête sur la carte : lignes / polygones reliant des points
  // (« les tours forment-elles une étoile ? »). Sommets en coordonnées monde,
  // JSON [[x,z],…] — même choix que minecraft_sketches.strokes : un tracé est
  // un tout, jamais requêté sommet par sommet.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_shapes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension  TEXT NOT NULL DEFAULT 'overworld',
      name       TEXT NOT NULL DEFAULT '',
      color      TEXT NOT NULL DEFAULT '#e8c86a',
      closed     INTEGER NOT NULL DEFAULT 0,
      points     TEXT NOT NULL DEFAULT '[]',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_shapes_dim ON lore_shapes(dimension);`);
  ensureColumn('lore_shapes', 'monde', `TEXT NOT NULL DEFAULT 'nostra'`);

  // Recherche plein-texte (première utilisation de FTS5 du repo). Table FTS
  // ordinaire (pas external-content) : le texte est dupliqué mais la synchro
  // reste explicite et greppable dans server/lore/store.js — pas de triggers.
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS lore_fts USING fts5(
      kind UNINDEXED, ref_id UNINDEXED, title, body
    );
  `);

  // Journal d'audit du module Lore (page « 🛡 Admin », réservée au rôle admin).
  // Table EN AJOUT SEUL : aucune route ne la met à jour ni ne la supprime.
  //
  // Son intérêt tient entièrement aux SNAPSHOTS. Tout le reste du module est en
  // cascade : supprimer une entrée efface ses médias, ses liens, ses preuves et
  // ses révisions, et unlink les fichiers. Après coup, plus rien ne dit ce qui a
  // disparu ni qui l'a fait. On fige donc au moment de l'action :
  //   - `actor_name`  : survit à la suppression du compte (la FK est SET NULL) ;
  //   - `label`       : titre/nom de la cible AVANT sa disparition ;
  //   - `detail`      : JSON — poids, MIME, dimensions, et le décompte de ce que
  //                     la cascade a emporté (médias + octets).
  // Sans ces copies, la page d'audit ne montrerait que des identifiants morts.
  db.exec(`
    CREATE TABLE IF NOT EXISTS lore_audit (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_name  TEXT NOT NULL DEFAULT '',
      action      TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id   INTEGER,
      label       TEXT NOT NULL DEFAULT '',
      detail      TEXT NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_audit_created ON lore_audit(created_at DESC);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_audit_actor ON lore_audit(actor_id, created_at DESC);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_lore_audit_action ON lore_audit(action, target_type);`);
}

// Rattache à leur item unique les résultats de butin saisis en référence texte
// « custom:<id> ». Le picker de résultat travaille sur le catalogue AUGMENTÉ
// (codex + items uniques) : choisir un item unique alors que le type « item du
// codex » était resté sélectionné écrivait `item_referentiel` +
// `resultat_ref = 'custom:9'`, affiché brut (« custom:9 »), sans prix — donc
// hors du calcul d'espérance — et invisible dans « Où l'obtenir », qui suit la
// FK. Les DEUX tables migrent ensemble : la clé de regroupement passe de
// `item:custom:9` à `unique:9`, et le journal d'ouvertures ne se rapprocherait
// plus de sa ligne déclarée si une seule des deux bougeait.
// Rejouable : ne touche que les lignes dont la cible existe encore.
function linkCustomRefsInLoot() {
  for (const table of ['loot_entries', 'loot_observations']) {
    db.exec(`
      UPDATE ${table}
         SET resultat_type = 'unique_item',
             resultat_unique_id = CAST(substr(resultat_ref, 8) AS INTEGER),
             resultat_ref = NULL
       WHERE resultat_type = 'item_referentiel'
         AND resultat_ref GLOB 'custom:[0-9]*'
         AND CAST(substr(resultat_ref, 8) AS INTEGER) IN (SELECT id FROM quest_custom_items)
    `);
  }
}

// Donne un slug aux items uniques qui n'en ont pas encore (lignes créées avant
// la promotion du catalogue). Rejouable : ne touche que les slugs vides.
// Le slugify est LOCAL — server/slugify.js importe db.js, l'importer ici
// créerait un cycle ; le runtime, lui, passe par uniqueSlug().
function backfillUniqueItemSlugs() {
  const rows = db.prepare(`SELECT id, nom FROM quest_custom_items WHERE slug IS NULL OR slug = ''`).all();
  if (rows.length === 0) return;
  const slugify = (s) => String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const taken = new Set(
    db.prepare(`SELECT slug FROM quest_custom_items WHERE slug IS NOT NULL AND slug <> ''`)
      .all().map((r) => r.slug),
  );
  const upd = db.prepare(`UPDATE quest_custom_items SET slug = ? WHERE id = ?`);
  for (const r of rows) {
    const base = slugify(r.nom) || `item-${r.id}`;
    let candidate = base;
    let n = 1;
    while (taken.has(candidate)) { n += 1; candidate = `${base}-${n}`; }
    taken.add(candidate);
    upd.run(candidate, r.id);
  }
}

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

// ── Generic JSON-blob CRUD (public collections) ──
export function listAll(collection) {
  const rows = db.prepare(`SELECT id, position, data FROM ${collection} ORDER BY position ASC, id ASC`).all();
  return rows.map((r) => ({ id: r.id, position: r.position, ...JSON.parse(r.data) }));
}

export function getOne(collection, id) {
  const row = db.prepare(`SELECT id, position, data FROM ${collection} WHERE id = ?`).get(id);
  if (!row) return null;
  return { id: row.id, position: row.position, ...JSON.parse(row.data) };
}

export function insert(collection, data, position = null) {
  const { id, position: _pos, ...rest } = data || {};
  const pos = position ?? (db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM ${collection}`).get().n);
  const result = db
    .prepare(`INSERT INTO ${collection} (position, data) VALUES (?, ?)`)
    .run(pos, JSON.stringify(rest));
  return getOne(collection, result.lastInsertRowid);
}

export function update(collection, id, data) {
  const existing = getOne(collection, id);
  if (!existing) return null;
  const { id: _i, position: _p, ...payload } = { ...existing, ...data };
  const newPos = data.position ?? existing.position;
  db.prepare(
    `UPDATE ${collection}
     SET position = ?, data = ?, updated_at = strftime('%s','now')
     WHERE id = ?`,
  ).run(newPos, JSON.stringify(payload), id);
  return getOne(collection, id);
}

export function remove(collection, id) {
  return db.prepare(`DELETE FROM ${collection} WHERE id = ?`).run(id).changes > 0;
}

export function reorder(collection, orderedIds) {
  const stmt = db.prepare(`UPDATE ${collection} SET position = ? WHERE id = ?`);
  const tx = db.transaction((ids) => { ids.forEach((id, idx) => stmt.run(idx, id)); });
  tx(orderedIds);
  return listAll(collection);
}

export function count(collection) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${collection}`).get().n;
}

export const COLLECTIONS = PUBLIC_COLLECTIONS;
