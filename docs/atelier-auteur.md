# Atelier d'auteur (`/auteur`)

Espace **privé** de conception d'un livre : un « cerveau d'auteur » qui relie
personnages, lieux, lore, événements, chapitres, idées, tableaux blancs et
tâches. Une seule personne y a accès : le compte propriétaire.

- Front : `src/pages/Auteur.jsx` (garde d'affichage + chargement paresseux) →
  `src/components/author/` (application, pages dans `pages/`).
- Back : `server/routes/author.js` (API) + `server/author/*` (schéma, stores,
  moteur de cohérence). Migration : `server/author/schema.js#migrateAuthor`,
  appelée par `db.js#migrate`.
- Tests : `test/author.test.js` (intégration, garde d'accès comprise),
  `test/author-text.test.js` (fonctions pures : comptage, snapshots, règles).

## Accès : trois verrous, tous côté serveur

1. **Rôle + drapeau** — `requireAuthor` : rôle `admin` **et**
   `users.can_author = 1`. Pas d'outrepassement admin : un second
   administrateur reçoit 403.
2. **Le drapeau ne s'obtient pas depuis l'interface** — aucune route
   d'édition des comptes ne l'accepte (`/api/users` l'ignore). Il est recalculé
   à **chaque démarrage** par `syncAuthorOwner()` depuis la configuration :
   `AUTHOR_OWNER_EMAIL`, à défaut `ADMIN_EMAIL`. Un drapeau posé à la main en
   base sur un autre compte disparaît au redémarrage suivant.
3. **Propriété des données** — toute donnée appartient à un projet
   (`author_projects.owner_id`) ; `resolveAuthorProject` ne sert un projet
   qu'à son propriétaire, sinon **404** (on ne distingue pas « inexistant » de
   « pas à toi »). Même avec le drapeau forcé en base, un autre compte ne voit
   rien (testé).

En plus :

- **CSRF** : cookie `SameSite=Strict` + en-tête `X-Author-Request: 1` exigé sur
  toute écriture (posé par `src/api/client.js` et `uploadFile`). Un formulaire
  d'un autre site ne peut pas l'ajouter ; un `fetch` cross-origin qui l'ajoute
  déclenche un preflight refusé.
- **Médias privés** : images réencodées en WebP par sharp (EXIF retiré,
  miniature), allowlist JPEG/PNG/WebP + extension, 15 Mo (`AUTHOR_IMAGE_MAX_BYTES`),
  fichier illisible → 415. Servies **uniquement** par
  `GET /api/author/media/:filename` : nom contraint par regex **et** connu en
  base dans un projet de l'appelant. Jamais via `/api/images` (public).
- **XSS** : aucun `dangerouslySetInnerHTML`. Markdown rendu par
  `src/components/author/markdown.jsx` (éléments React uniquement, liens
  `http(s)`/relatifs seulement) ; textes du tableau blanc rendus comme texte ;
  extraits de recherche balisés par caractères de contrôle puis découpés en
  `<mark>`.
- **Validation** : `server/author/validate.js` (types, bornes, catégories et
  lignes de temps du même projet), noms de colonnes jamais issus de
  l'utilisateur, recherche par clé limitée aux clés propres (`own()`).
- Limiteurs : 300 écritures/min, 30 envois d'images/min (en plus du global).
- Compte propriétaire **non supprimable** tant qu'il possède un livre
  (`DELETE /api/users/:id` → 409, FK `RESTRICT` en dernier recours).
- `/auteur` exclu des statistiques de fréquentation, `noindex`, MiniPlayer masqué.

## Modèle de données

« Class table inheritance » : chaque élément est une ligne de
`author_entities` (titre, résumé, corps Markdown, icône, couleur, couverture,
favori, `revision`, `deleted_at`), ses champs propres dans la table de son type.
Toutes les relations sont donc de **vraies clés étrangères**.

| Table | Rôle |
|---|---|
| `author_projects` | un livre ; `owner_id` (RESTRICT), objectif de mots |
| `author_entities` | base commune de tout élément |
| `author_characters` / `author_places` / `author_lore` / `author_events` / `author_chapters` / `author_notes` | champs propres à chaque type |
| `author_categories` | catégories configurables, `domain` = `lore` (factions, religions, magie…) ou `place` (ville, royaume…) |
| `author_timelines` | lignes de temps (« Histoire ancienne », « Timeline du récit »…) |
| `author_acts`, `author_beats` | plan : actes, moments forts ; chapitres et moments forts partagent l'espace de positions d'un acte |
| `author_links` | relations orientées typées (`ami`, `mentor`, `membre_de`, `apparait_dans`, `cause`…), symétriques stockées une fois |
| `author_tags`, `author_entity_tags` | tags globaux au projet |
| `author_aliases` | alias et **anciens noms** (servent la recherche et la cohérence) |
| `author_revisions` | historique (snapshots) du `content` des chapitres et du `body` des fiches |
| `author_media`, `author_map_pins` | images privées ; points cliquables sur la carte d'un lieu (x/y en fractions) |
| `author_tasks` | tâches, liées ou non à un élément |
| `author_boards`, `author_board_nodes`, `author_board_edges` | tableaux blancs : un nœud par ligne (FK vers un élément ou un média), flèches en FK composites |
| `author_issue_dismissals` | problèmes de cohérence ignorés (clé stable) |
| `author_fts` | FTS5 (`rowid` = id d'élément, `remove_diacritics`), synchronisée explicitement par `entities.js` |

Les listes extensibles (types, statuts, relations) n'ont **pas de CHECK** :
elles vivent dans `server/author/enums.js` (+ miroir d'affichage
`src/components/author/kinds.js`).

## Sauvegarde : ne jamais perdre ni écraser en silence

- **Brouillon local à chaque frappe** (`useEntityDoc` → `localStorage`
  `au-draft:<projet>:<id>`) avant tout réseau ; au retour, un bandeau propose
  de restaurer ce qui n'était pas parti.
- **PUT partiel sous révision (CAS)** : seuls les champs modifiés partent,
  avec la révision attendue. 409 → **fusion champ par champ** : un champ que
  l'autre appareil n'a pas touché garde ma valeur et la sauvegarde repart
  seule ; seul un champ modifié des deux côtés ouvre la modale (« Garder ma
  version » / « Prendre l'autre » — dans ce cas mon texte long part d'abord
  dans l'historique).
- **Gestes structurels** (favori, « ouvert récemment », positions) : pas de
  révision, ils ne provoquent pas de conflit.
- **Snapshots** (`server/author/revisions.js`) : automatiques avant la
  première retouche, puis au plus toutes les 10 min d'écriture, et
  immédiatement avant une grosse suppression (≥ 200 mots ou > 30 %) ;
  manuels étiquetés (jamais purgés). Restaurer fige d'abord la version
  actuelle (« Avant restauration »).
- **Tableau blanc** : lots d'opérations idempotentes, révision par lot ; 409 →
  « Réappliquer mes changements » sur la version à jour, ou recharger.
- **Corbeille** : supprimer = `deleted_at` (restaurable) ; la purge est un
  second geste. Supprimer un livre exige de retaper son titre (serveur).
- **Fermeture d'onglet** : envoi `keepalive` ; avertissement `beforeunload`
  tant qu'une sauvegarde est en cours ou en erreur. Erreur réseau → nouvel
  essai toutes les 5 s, indicateur « Erreur de sauvegarde ».
- **Exports** : sauvegarde JSON complète et manuscrit Markdown (Réglages).

## Moteur de cohérence

`server/author/consistency.js` : `loadWorld()` prend une photographie du
projet, `runRules()` applique des **fonctions pures** (testées). Règles
actuelles : ancien nom encore utilisé dans un chapitre, personnage nommé avant
sa première apparition (`apparait_dans`), ubiquité (deux événements
simultanés en des lieux non emboîtés), enchaînement impossible
(`cause`/`precede` à rebours, fin avant début), contradictions déclarées,
chapitre « terminé » vide, mentions non reliées (avec l'action « créer les
relations »). Texte indexé une fois par chapitre (ensemble de mots) : pas de
coût quadratique. Résultat mémorisé par projet tant que rien ne bouge.

**Ajouter une règle** = une entrée `{ id, label, run(world) }` dans `RULES`,
renvoyant des problèmes `{ key, severity, title, detail, entityIds }` — la
`key` doit être stable pour que « Ignorer » survive aux recalculs.

## Interface

- Ordinateur : barre latérale repliable, fil d'Ariane, palette `Ctrl/⌘ K`,
  raccourcis (`I` idée, `/` recherche, `G` puis lettre pour naviguer, `?` aide),
  menus contextuels (clic droit), glisser-déposer.
- Téléphone : barre d'onglets (Accueil, Idées, Livre, Chercher, Plus),
  bouton d'idée flottant, dialogues plein écran, menus en feuille d'actions,
  cibles ≥ 44 px, appui long pour glisser (`useDnd`) ou ouvrir un menu,
  pincement sur le tableau blanc et le graphe.
- Thème sombre (défaut) et clair, sur les jetons du site.
- Éditeur : Markdown dans une colonne à empattements, formatage par boutons
  et raccourcis (l'annulation native est préservée via `execCommand`),
  typographie française automatique, `[[Nom]]` avec suggestions, mode focus,
  mode machine à écrire, compteurs et objectif, historique.

## Ajouter…

| Ajouter… | …dans |
|---|---|
| un type d'élément | table + `migrateAuthor`, `KINDS`/`KIND_TABLE`/`KIND_FIELDS` (`enums.js`), `LIST_COLS` (`entities.js`), `KINDS` + sections (`kinds.js`), route de liste (`AuthorApp.jsx`) |
| un champ de fiche | colonne (`schema.js`, `ensureColumn` si la table existe déjà en prod), `KIND_FIELDS`, puis la définition de champ dans `kinds.js` (le rendu suit) |
| une relation | `RELATION_KINDS` (`enums.js`) + `RELATIONS` (`kinds.js`) ; `defaultRelation` si un couple de types doit la proposer |
| une règle de cohérence | `RULES` (`consistency.js`) + son test |
| un module (page) | composant dans `pages/`, route dans `AuthorApp.jsx`, entrée dans `nav.js` |

## Configuration

- `AUTHOR_OWNER_EMAIL` (optionnel) : e-mail du compte propriétaire ; par défaut
  `ADMIN_EMAIL`. Le compte doit avoir le rôle `admin`.
- `AUTHOR_IMAGE_MAX_BYTES` (optionnel) : taille max d'une image (15 Mo).

Aucune dépendance ajoutée. Les tables sont créées au démarrage (migration
additive) ; `backup.sh` les sauvegarde avec le reste de `data.sqlite`, les
images vivent dans `uploads/` comme les autres médias.
