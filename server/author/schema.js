// Atelier d'auteur — schéma relationnel (tables author_*), appelé à la fin de
// db.js#migrate (même patron que migratePlaylist). Additif et idempotent.
//
// Modèle « class table inheritance » : chaque élément du livre (personnage,
// lieu, lore, événement, chapitre, idée) est une ligne de author_entities —
// titre, résumé, corps Markdown, tags, favori, révision — et ses champs propres
// vivent dans la table de son type, clé primaire = entity_id. Les relations
// (author_links), tags, alias, médias, tâches et nœuds du tableau blanc pointent
// donc tous vers UNE table avec de vraies FK : la base sait ce qui relie quoi,
// et un moteur de cohérence peut l'interroger.
//
// Les listes extensibles (kind, statuts, relations) n'ont PAS de CHECK — voir
// server/author/enums.js.

const TS = `INTEGER NOT NULL DEFAULT (strftime('%s','now'))`;

export function migrateAuthor(db, ensureColumn) {
  // Accès : drapeau réservé au compte propriétaire, jamais modifiable par l'API
  // /api/users — synchronisé au boot depuis AUTHOR_OWNER_EMAIL (défaut :
  // ADMIN_EMAIL), cf. server/author/access.js#syncAuthorOwner.
  ensureColumn('users', 'can_author', 'INTEGER NOT NULL DEFAULT 0');

  // Un projet = un livre (ou un univers). owner_id en RESTRICT : supprimer le
  // compte ne doit jamais emporter le manuscrit en cascade (la route
  // DELETE /api/users répond 409 avant d'en arriver là).
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_projects (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      title        TEXT NOT NULL,
      subtitle     TEXT NOT NULL DEFAULT '',
      description  TEXT NOT NULL DEFAULT '',
      target_words INTEGER,
      color        TEXT NOT NULL DEFAULT '#c9a8e8',
      created_at   ${TS},
      updated_at   ${TS}
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_projects_owner ON author_projects(owner_id);`);

  // Catégories configurables : `domain` = 'lore' (factions, religions, magie…)
  // ou 'place' (ville, pays, royaume…). Seedées à la création d'un projet.
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_categories (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      domain     TEXT NOT NULL DEFAULT 'lore',
      name       TEXT NOT NULL,
      icon       TEXT NOT NULL DEFAULT '',
      color      TEXT NOT NULL DEFAULT '#c9a8e8',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at ${TS}
    );
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_author_categories_name ON author_categories(project_id, domain, name COLLATE NOCASE);`);

  // Échelles de temps (« Histoire ancienne », « Timeline du récit »…) : un
  // événement appartient à une seule ligne de temps.
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_timelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '#c9a8e8',
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  ${TS}
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_timelines_project ON author_timelines(project_id, position);`);

  // Actes du plan (« Acte 1 », « Acte 2 »…) : colonnes de la vue Plan.
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_acts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      summary    TEXT NOT NULL DEFAULT '',
      color      TEXT NOT NULL DEFAULT '#c9a8e8',
      position   INTEGER NOT NULL DEFAULT 0,
      created_at ${TS},
      updated_at ${TS}
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_acts_project ON author_acts(project_id, position);`);

  // ── Éléments ──────────────────────────────────────────────────────────────
  // deleted_at : corbeille. Une suppression depuis l'interface met l'élément à
  // la corbeille (restaurable) ; seule la purge explicite fait un vrai DELETE.
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_entities (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id     INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      kind           TEXT NOT NULL,
      title          TEXT NOT NULL,
      summary        TEXT NOT NULL DEFAULT '',
      body           TEXT NOT NULL DEFAULT '',
      icon           TEXT NOT NULL DEFAULT '',
      color          TEXT NOT NULL DEFAULT '',
      cover_media_id INTEGER REFERENCES author_media(id) ON DELETE SET NULL,
      is_favorite    INTEGER NOT NULL DEFAULT 0,
      revision       INTEGER NOT NULL DEFAULT 1,
      last_opened_at INTEGER,
      deleted_at     INTEGER,
      created_at     ${TS},
      updated_at     ${TS}
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_entities_kind ON author_entities(project_id, kind, updated_at DESC);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_entities_updated ON author_entities(project_id, updated_at DESC);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_entities_opened ON author_entities(project_id, last_opened_at DESC);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_entities_fav ON author_entities(project_id, is_favorite) WHERE is_favorite = 1;`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS author_characters (
      entity_id   INTEGER PRIMARY KEY REFERENCES author_entities(id) ON DELETE CASCADE,
      first_name  TEXT NOT NULL DEFAULT '',
      nickname    TEXT NOT NULL DEFAULT '',
      titles      TEXT NOT NULL DEFAULT '',
      story_role  TEXT NOT NULL DEFAULT '',
      appearance  TEXT NOT NULL DEFAULT '',
      personality TEXT NOT NULL DEFAULT '',
      psychology  TEXT NOT NULL DEFAULT '',
      motivations TEXT NOT NULL DEFAULT '',
      goals       TEXT NOT NULL DEFAULT '',
      fears       TEXT NOT NULL DEFAULT '',
      qualities   TEXT NOT NULL DEFAULT '',
      flaws       TEXT NOT NULL DEFAULT '',
      values_text TEXT NOT NULL DEFAULT '',
      backstory   TEXT NOT NULL DEFAULT '',
      arc         TEXT NOT NULL DEFAULT '',
      notes       TEXT NOT NULL DEFAULT ''
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS author_places (
      entity_id    INTEGER PRIMARY KEY REFERENCES author_entities(id) ON DELETE CASCADE,
      category_id  INTEGER REFERENCES author_categories(id) ON DELETE SET NULL,
      history      TEXT NOT NULL DEFAULT '',
      population   TEXT NOT NULL DEFAULT '',
      culture      TEXT NOT NULL DEFAULT '',
      importance   TEXT NOT NULL DEFAULT '',
      notes        TEXT NOT NULL DEFAULT '',
      map_media_id INTEGER REFERENCES author_media(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_places_category ON author_places(category_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS author_lore (
      entity_id   INTEGER PRIMARY KEY REFERENCES author_entities(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES author_categories(id) ON DELETE SET NULL
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_lore_category ON author_lore(category_id);`);

  // sort_key : date numérique libre (année, ordinal…) qui ordonne la ligne de
  // temps et que le moteur de cohérence compare ; date_label = l'affichage
  // (« An 312 de l'Ère des Cendres »).
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_events (
      entity_id    INTEGER PRIMARY KEY REFERENCES author_entities(id) ON DELETE CASCADE,
      timeline_id  INTEGER REFERENCES author_timelines(id) ON DELETE SET NULL,
      sort_key     REAL,
      end_sort_key REAL,
      date_label   TEXT NOT NULL DEFAULT '',
      importance   INTEGER NOT NULL DEFAULT 2
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_events_time ON author_events(timeline_id, sort_key);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS author_chapters (
      entity_id          INTEGER PRIMARY KEY REFERENCES author_entities(id) ON DELETE CASCADE,
      act_id             INTEGER REFERENCES author_acts(id) ON DELETE SET NULL,
      position           INTEGER NOT NULL DEFAULT 0,
      status             TEXT NOT NULL DEFAULT 'idee',
      content            TEXT NOT NULL DEFAULT '',
      word_count         INTEGER NOT NULL DEFAULT 0,
      char_count         INTEGER NOT NULL DEFAULT 0,
      target_words       INTEGER,
      content_updated_at INTEGER
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_chapters_order ON author_chapters(act_id, position);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS author_notes (
      entity_id INTEGER PRIMARY KEY REFERENCES author_entities(id) ON DELETE CASCADE,
      status    TEXT NOT NULL DEFAULT 'brute',
      priority  INTEGER NOT NULL DEFAULT 0,
      category  TEXT NOT NULL DEFAULT '',
      note_date TEXT,
      inbox     INTEGER NOT NULL DEFAULT 0,
      position  REAL NOT NULL DEFAULT 0
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_notes_board ON author_notes(status, position);`);

  // Moments forts du plan (« événement majeur » entre deux chapitres), rangés
  // dans un acte avec les chapitres — même espace de positions.
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_beats (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      act_id     INTEGER REFERENCES author_acts(id) ON DELETE SET NULL,
      position   INTEGER NOT NULL DEFAULT 0,
      title      TEXT NOT NULL,
      summary    TEXT NOT NULL DEFAULT '',
      color      TEXT NOT NULL DEFAULT '#e8c86a',
      event_id   INTEGER REFERENCES author_entities(id) ON DELETE SET NULL,
      created_at ${TS},
      updated_at ${TS}
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_beats_act ON author_beats(project_id, act_id, position);`);

  // ── Tags, alias, relations ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_tags (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL DEFAULT '#c9a8e8',
      created_at ${TS}
    );
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_author_tags_name ON author_tags(project_id, name COLLATE NOCASE);`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_entity_tags (
      entity_id INTEGER NOT NULL REFERENCES author_entities(id) ON DELETE CASCADE,
      tag_id    INTEGER NOT NULL REFERENCES author_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (entity_id, tag_id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_entity_tags_tag ON author_entity_tags(tag_id);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS author_aliases (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL REFERENCES author_entities(id) ON DELETE CASCADE,
      alias     TEXT NOT NULL,
      kind      TEXT NOT NULL DEFAULT 'alias',
      note      TEXT NOT NULL DEFAULT ''
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_aliases_entity ON author_aliases(entity_id);`);

  // Relations orientées ; les relations symétriques (ami, rival…) sont
  // stockées une fois et lues des deux côtés.
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_links (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      from_id    INTEGER NOT NULL REFERENCES author_entities(id) ON DELETE CASCADE,
      to_id      INTEGER NOT NULL REFERENCES author_entities(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL DEFAULT 'lie_a',
      label      TEXT NOT NULL DEFAULT '',
      note       TEXT NOT NULL DEFAULT '',
      created_at ${TS},
      UNIQUE (from_id, to_id, kind)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_links_to ON author_links(to_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_links_project ON author_links(project_id, kind);`);

  // ── Historique ────────────────────────────────────────────────────────────
  // Snapshot complet (pas de diff) d'un champ long : `content` d'un chapitre,
  // `body` de tout élément. Automatiques (avant une modification importante ou
  // au plus toutes les 10 min d'écriture) ou manuels (étiquetés, jamais purgés).
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_revisions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id  INTEGER NOT NULL REFERENCES author_entities(id) ON DELETE CASCADE,
      field      TEXT NOT NULL,
      body       TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      label      TEXT NOT NULL DEFAULT '',
      manual     INTEGER NOT NULL DEFAULT 0,
      created_at ${TS}
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_revisions_entity ON author_revisions(entity_id, field, id DESC);`);

  // ── Médias (privés) ───────────────────────────────────────────────────────
  // WebP recompressés + miniature, servis UNIQUEMENT par
  // /api/author/media/:filename derrière la garde + contrôle du propriétaire —
  // jamais par /api/images (public) ni en statique.
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_media (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id     INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      entity_id      INTEGER REFERENCES author_entities(id) ON DELETE SET NULL,
      filename       TEXT NOT NULL,
      thumb_filename TEXT,
      original_name  TEXT NOT NULL DEFAULT '',
      mime_type      TEXT,
      width          INTEGER,
      height         INTEGER,
      size           INTEGER NOT NULL DEFAULT 0,
      caption        TEXT NOT NULL DEFAULT '',
      position       INTEGER NOT NULL DEFAULT 0,
      created_at     ${TS}
    );
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_author_media_filename ON author_media(filename);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_media_thumb ON author_media(thumb_filename);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_media_entity ON author_media(entity_id, position);`);

  // Points cliquables posés sur l'image de carte d'un lieu (x/y en fractions
  // 0..1 de l'image, indépendants de sa résolution).
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_map_pins (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      place_id   INTEGER NOT NULL REFERENCES author_entities(id) ON DELETE CASCADE,
      target_id  INTEGER REFERENCES author_entities(id) ON DELETE SET NULL,
      x          REAL NOT NULL,
      y          REAL NOT NULL,
      label      TEXT NOT NULL DEFAULT '',
      color      TEXT NOT NULL DEFAULT '#e8c86a',
      created_at ${TS}
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_map_pins_place ON author_map_pins(place_id);`);

  // ── Tâches ────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_tasks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      notes      TEXT NOT NULL DEFAULT '',
      done       INTEGER NOT NULL DEFAULT 0,
      done_at    INTEGER,
      due_date   TEXT,
      priority   INTEGER NOT NULL DEFAULT 0,
      entity_id  INTEGER REFERENCES author_entities(id) ON DELETE SET NULL,
      position   INTEGER NOT NULL DEFAULT 0,
      created_at ${TS},
      updated_at ${TS}
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_tasks_project ON author_tasks(project_id, done, position);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_tasks_entity ON author_tasks(entity_id);`);

  // ── Tableau blanc ─────────────────────────────────────────────────────────
  // Un nœud par ligne (position, taille, contenu) : un personnage posé sur le
  // tableau est une vraie FK, donc sa fiche sait sur quels tableaux il figure.
  // Les ids de nœuds/flèches sont générés par le client (un lot d'opérations
  // peut créer un nœud et une flèche vers lui) : clé primaire (board_id, id).
  // `revision` protège le contenu (CAS sur chaque lot) ; la caméra (view_*)
  // s'enregistre à part, sans révision.
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_boards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      revision    INTEGER NOT NULL DEFAULT 1,
      view_x      REAL NOT NULL DEFAULT 0,
      view_y      REAL NOT NULL DEFAULT 0,
      view_zoom   REAL NOT NULL DEFAULT 1,
      created_at  ${TS},
      updated_at  ${TS}
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_boards_project ON author_boards(project_id, updated_at DESC);`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_board_nodes (
      board_id   INTEGER NOT NULL REFERENCES author_boards(id) ON DELETE CASCADE,
      id         TEXT NOT NULL,
      kind       TEXT NOT NULL DEFAULT 'card',
      x          REAL NOT NULL DEFAULT 0,
      y          REAL NOT NULL DEFAULT 0,
      w          REAL NOT NULL DEFAULT 200,
      h          REAL NOT NULL DEFAULT 120,
      z          INTEGER NOT NULL DEFAULT 0,
      color      TEXT NOT NULL DEFAULT '',
      text       TEXT NOT NULL DEFAULT '',
      shape      TEXT NOT NULL DEFAULT 'rect',
      entity_id  INTEGER REFERENCES author_entities(id) ON DELETE SET NULL,
      media_id   INTEGER REFERENCES author_media(id) ON DELETE SET NULL,
      PRIMARY KEY (board_id, id)
    );
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_author_board_nodes_entity ON author_board_nodes(entity_id);`);
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_board_edges (
      board_id  INTEGER NOT NULL REFERENCES author_boards(id) ON DELETE CASCADE,
      id        TEXT NOT NULL,
      from_node TEXT NOT NULL,
      to_node   TEXT NOT NULL,
      label     TEXT NOT NULL DEFAULT '',
      color     TEXT NOT NULL DEFAULT '',
      style     TEXT NOT NULL DEFAULT 'solid',
      arrow     TEXT NOT NULL DEFAULT 'end',
      PRIMARY KEY (board_id, id),
      FOREIGN KEY (board_id, from_node) REFERENCES author_board_nodes(board_id, id) ON DELETE CASCADE,
      FOREIGN KEY (board_id, to_node) REFERENCES author_board_nodes(board_id, id) ON DELETE CASCADE
    );
  `);

  // Incohérences volontaires (« le flashback emploie l'ancien nom exprès ») :
  // la clé d'un problème est stable, l'ignorer ne touche à aucune donnée.
  db.exec(`
    CREATE TABLE IF NOT EXISTS author_issue_dismissals (
      project_id INTEGER NOT NULL REFERENCES author_projects(id) ON DELETE CASCADE,
      issue_key  TEXT NOT NULL,
      created_at ${TS},
      PRIMARY KEY (project_id, issue_key)
    );
  `);

  // Recherche plein-texte. Table FTS ordinaire synchronisée EXPLICITEMENT par
  // server/author/entities.js (pas de triggers, même choix que lore_fts) ;
  // remove_diacritics : « elise » trouve « Élise ».
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS author_fts USING fts5(
      entity_id UNINDEXED, project_id UNINDEXED, kind UNINDEXED, title, body,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
}
