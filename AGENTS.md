# Contexte pour les agents — Playlist Commune

Lire aussi `CLAUDE.md` pour les conventions générales du site et
[`docs/playlist-commune.md`](docs/playlist-commune.md) pour la configuration et les limites.

## Travail réalisé

- Fonction intégrée à **titisite**, route React `/playlist`, API `/api/playlist`.
  Aucun exécutable, second projet, service ou paquet supplémentaire.
- Sessions et utilisateurs existants réutilisés. Deux emails autorisés dans `.env` :
  `PLAYLIST_APPLE_EMAIL` et `PLAYLIST_SPOTIFY_EMAIL`. Pas de contournement administrateur.
- Interface française responsive : Playlist, Ajouter, Réglages. Palette du site
  (fond `#050511`, texte `#ede8f8`, accent `ACC` violet), composants `Button`/`Input`,
  `useConfirm`, `usePageMeta`, API centralisée sous `api.playlist`.
- Migration additive appelée par `server/db.js#migrate` : `shared_tracks`,
  `playlist_aliases`, `playlist_deliveries`, `playlist_tokens`, `playlist_state`.
  Le store est initialisé après les migrations, avant l'écoute HTTP.
- Spotify : Authorization Code + PKCE, refresh serveur, endpoints 2026 `/items`,
  `/me/playlists`, recherche limitée à 10, identité stable `account_id`.
- Apple : JWT ES256 signé serveur, MusicKit JS `authorize()` navigateur,
  Music User Token chiffré côté serveur, catalogue français et relation `catalog`.
- Secrets AES-256-GCM avec clé dédiée ; la clé `.p8` est exclue de Git.
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
Le module reste fermé si les deux emails ne sont pas configurés ; le site fonctionne
sans identifiants musicaux. Les connexions réelles nécessitent les clés Spotify/Apple.
Le fichier Nginx du dépôt exclut les codes OAuth des logs ; voir le guide pour
reporter cette règle sur une installation dont la configuration a déjà été copiée.

## Vérifications et limites

`node --test test/playlist.test.js test/playlist-deployment.test.js` (23 tests),
`npm run build`, lint de sécurité et contrôle
de l'interface à 390 px. La suite du site a quatre échecs locaux reproduits sur la
base `3db5a9b` sous Windows (codex Minecraft/catégories + droits sur symlinks).
Le lockfile n'a pas changé ; ses vulnérabilités existantes sont documentées dans le guide.
Le test de déploiement démarre le vrai serveur en mode production, contrôle la session
existante et la route SPA construite, la migration idempotente et une sauvegarde SQLite.
Ne pas affirmer que les vrais comptes musicaux ou le VPS ont été testés sans y avoir
accès : la validation disponible utilise une base locale et des API simulées.

Avant toute publication, vérifier le HEAD distant et préserver les commits récents.
Ne pas modifier le contenu CV/portfolio de `src/data` ni fusionner les changements
sans rapport. Aucun secret ou fichier de démonstration local ne doit être committé.
