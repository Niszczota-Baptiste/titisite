# Contexte pour les agents — Playlist Commune

Lire aussi `CLAUDE.md` pour les conventions générales du site et
[`docs/playlist-commune.md`](docs/playlist-commune.md) pour la configuration et les limites.

## Travail réalisé

- Fonction intégrée à **titisite**, route React `/playlist`, API `/api/playlist`.
  Aucun exécutable, second projet, service ou paquet supplémentaire.
- Sessions et utilisateurs existants réutilisés. Le premier administrateur active la
  playlist depuis `/playlist`, choisit son service et génère une invitation privée.
  Le second compte existant la rejoint avec ce code. Les membres sont stockés dans
  `playlist_members` ; chacun configure ses propres clés depuis sa session.
- Interface française responsive : File d’attente, Ajouter, Playlists, Réglages. Palette du site
  (fond `#050511`, texte `#ede8f8`, accent `ACC` violet), composants `Button`/`Input`,
  `useConfirm`, `usePageMeta`, API centralisée sous `api.playlist`.
- Migration additive appelée par `server/db.js#migrate` : `shared_tracks`,
  `playlist_aliases`, `playlist_deliveries`, `playlist_tokens`, `playlist_state`,
  `playlist_members`, `playback_queue`.
  Le store est initialisé après les migrations, avant l'écoute HTTP.
- Spotify : Authorization Code + PKCE, refresh serveur, endpoints 2026 `/items`,
  `/me/playlists`, recherche limitée à 10, identité stable `account_id`, lecture
  directe `/me/player/play` avec `user-modify-playback-state`.
- Apple : JWT ES256 signé serveur, MusicKit JS `authorize()` navigateur,
  Music User Token chiffré côté serveur, catalogue français, relation `catalog` et
  lecture directe dans le navigateur après clic utilisateur.
- Secrets AES-256-GCM avec clé dédiée générée automatiquement à côté de SQLite
  (`data.sqlite.playlist.key`) ; la clé `.p8` Apple est chiffrée en base puis exclue de Git.
- Synchro serveur 45 s configurable ; interface rafraîchie toutes les 5 s quand
  visible. File unique pour les écritures, lectures paginées et snapshot Spotify.
- Matching ISRC puis titre/artiste/durée ±3 s ; candidats manuels si incertitude.
- Suppressions web/Spotify mémorisées par tombstone ; retrait Apple manuel.
  Les retraits Apple seuls sont signalés, sans suppression globale.

## Invariants à préserver

1. Ne jamais traiter une lecture partielle ou une erreur distante comme une liste vide.
2. Ne jamais utiliser le snapshot d'une écriture comme checkpoint d'une lecture.
3. Ne jamais réémettre automatiquement un ajout dont le résultat est incertain.
   Les API n'offrent pas d'idempotence transactionnelle avec SQLite.
4. Ne jamais réimporter une ligne supprimée depuis une application native.
5. Les IDs Apple `library-songs` et les IDs catalogue sont différents.
6. Seul le propriétaire configuré connecte son service ; les deux peuvent ajouter
   et supprimer des morceaux. Une modification des propriétaires nécessite une migration.
7. Le cookie normal reste `SameSite=Strict`. Le retour OAuth utilise un cookie séparé
   HttpOnly `Lax`, un state à usage unique, PKCE et une revérification de la session d'origine.
8. Aucun token utilisateur dans le frontend persistant, les logs ou les réponses de statut.
9. Les quotas `429`, `Retry-After` et `QUOTA_EXCEEDED` déclenchent un backoff persistant.

## Déploiement

Les commandes restent :

```sh
sudo bash /var/www/titisite/deploy/backup.sh
sudo bash /var/www/titisite/deploy/deploy.sh
```

Le script existant tire `main`, exécute `npm ci`, build Vite, prune les dépendances de
développement, reload PM2 et contrôle `/api/health`. Les nouvelles tables sont créées
au démarrage. Le backup SQLite inclut la playlist et les tokens chiffrés. `.env` et
la clé de chiffrement doivent être conservés séparément pour pouvoir les restaurer.
Le module fonctionne sans réglage VPS musical : le premier membre le démarre dans
l'interface, le second rejoint avec une invitation. Les connexions réelles nécessitent
les clés Spotify/Apple saisies par leurs propriétaires respectifs.
Le fichier Nginx du dépôt exclut les codes OAuth des logs ; voir le guide pour
reporter cette règle sur une installation dont la configuration a déjà été copiée.

## Vérifications et limites

`node --test --test-concurrency=1 test/playlist.test.js test/playlist-queue.test.js test/playlist-deployment.test.js` (34 tests, dont
l'activation, l'invitation et la séparation des réglages),
`npm run build`, lint de sécurité et contrôle
de l'interface à 390 px. La suite du site a quatre échecs locaux reproduits sur la
base `3db5a9b` sous Windows (codex Minecraft/catégories + droits sur symlinks).
Le lockfile est mis à jour avec `multer` 2.4.0, `nodemailer` 9.1.1, `sharp` 0.35.4
et `fflate` 0.6.11 ; les alertes hautes runtime correspondantes sont corrigées.
Les alertes restantes doivent être relues après `npm ci` sur le VPS.
Le test de déploiement démarre le vrai serveur en mode production, contrôle la session
existante et la route SPA construite, la migration idempotente et une sauvegarde SQLite.
Ne pas affirmer que les vrais comptes musicaux ou le VPS ont été testés sans y avoir
accès : la validation disponible utilise une base locale et des API simulées.

Avant toute publication, vérifier le HEAD distant et préserver les commits récents.
Ne pas modifier le contenu CV/portfolio de `src/data` ni fusionner les changements
sans rapport. Aucun secret ou fichier de démonstration local ne doit être committé.

## File de lecture — suite du travail

- `server/playlist/queue.js` stocke des titres autonomes ; ne jamais les ingérer dans
  `shared_tracks` sauf clic explicite sur Playlist. Déduplication des lignes actives.
- Spotify POST `/me/player/queue`, PUT `/me/player/play`, scope de lecture à renouveler.
  Sérialisation, FIFO, backoff et aucun renvoi automatique d’un résultat incertain.
- Apple : réception volontaire dans `PlaybackQueue.jsx` / `playlistReceiver.js`,
  MusicKit setQueue puis playLater, commandes explicites Lire/Pause. Pas de contrôle
  distant de l’application native Windows. Les lecteurs ne sont pas synchronisés.
- Réservations Apple 60 s, bail navigateur 90 s ; ne jamais publier les jetons de
  réservation dans /status. Autorisation réservée au propriétaire, contrôle CSRF.
- Masquer annule les envois restants, sans effacer des files distantes. Les statuts
  sent ne prouvent pas que le titre a été écouté. Aucune suppression à la fin automatique.
- 34 tests ciblés + 24 tests sécurité ; audit npm complet zéro vulnérabilité après
  override qs 6.16.0 et mises à jour transitives fast-uri/js-yaml/nanoid. Conserver
  le lockfile et revalider à chaque mise à jour. Voir le guide pour la recette réelle.

## Diagnostic de connexion Apple

- `POST /api/playlist/apple/diagnostic` teste une vraie recherche catalogue avec
  le developer token, sans Music User Token. Réservé au propriétaire Apple avec
  session et contrôle CSRF ; respecte le backoff. Aucun secret dans la réponse.
- `appleDiagnostic.js` renvoie uniquement des messages contrôlés et les étapes
  `apple_configuration`, `apple_catalog`, `apple_account`. Un 401 Apple devient
  un 400 applicatif, pour ne pas confondre avec une session du site expirée.
- `appleConnection.js` garde `authorize()` dans le geste utilisateur, limite
  l'attente à deux minutes, empêche la sauvegarde d'une réponse tardive et demande
  un rechargement après timeout. Le compte n'est annoncé connecté qu'après la
  validation serveur. La réception de la file utilise le même parcours.
- Le bouton « Tester la configuration Apple » reste disponible si MusicKit échoue.
  Un catalogue accessible ne prouve pas que l'autorisation du compte fonctionne.
  Le 403 de `webPlayerLogout` observé ne suffit pas à identifier la cause initiale.
  Aucun assouplissement des protections navigateur ni nouveau secret requis.
- Tests supplémentaires : `test/apple-connection.test.js` et test d'intégration
  des refus d'accès/CSRF, 401/403, conservation du token précédent et backoff dans
  `test/playlist.test.js`. Aucun vrai compte Apple ni VPS testé localement.

Validation du diagnostic : 40 tests ciblés (dont déploiement production), 24 tests
de sécurité, build Vite et recherche de secrets sur les fichiers modifiés réussis.
Lint sécurité : 0 erreur, 189 avertissements existants. Pas de migration ni de
dépendance supplémentaire pour ce diagnostic.

## Aide Spotify dans la file

`PlaybackQueue.jsx` explique la connexion Premium depuis la session du membre,
l'appareil actif, la différence entre ajout à la file, lecture immédiate et lien
« Ouvrir ». L'aide dépliable détaille les envois incertains et le blocage FIFO,
la vérification avant relance et les effets de Masquer, y compris l'annulation
d'un envoi Apple en attente. Un envoi incertain n'est plus décrit comme un refus
certain. Changement de texte uniquement, aucune lecture automatique ajoutée.
