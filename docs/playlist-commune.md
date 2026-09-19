# Playlist Commune — intégration à titisite

Page `/playlist`, API `/api/playlist`, même Express, même SQLite, même processus PM2,
mêmes comptes que le site. Aucun service supplémentaire et aucune inscription publique.
Le dépôt MusicGroup n'est pas requis. Le module est fermé tant que les deux emails
ne sont pas configurés ; les comptes du site doivent déjà exister.

## Activer sur le VPS

### Si le code est fourni sous forme d'archive ou de patch

Cette section ne concerne que la livraison de secours lorsque l'accès GitHub en
écriture est indisponible. Si le code est déjà sur `main`, passer à la configuration.
`titisite-playlist-commune.zip` contient les sources complètes modifiées, sans secrets,
base SQLite, dépendances installées ou données de démonstration locales.

La méthode recommandée conserve ton historique Git : télécharger
`playlist-commune.patch`, puis depuis une copie propre de ton dépôt titisite :

```sh
git switch -c feat/playlist-commune
git apply --check /chemin/vers/playlist-commune.patch
git apply /chemin/vers/playlist-commune.patch
npm ci
npm run build
node --test test/playlist.test.js test/playlist-deployment.test.js
git add .
git commit -m "Ajouter Playlist Commune pour Apple Music et Spotify"
git push -u origin feat/playlist-commune
```

Le patch part du commit `3db5a9b`. Si `git apply --check` signale un conflit,
réconcilier les changements avec les nouvelles modifications du site avant de
continuer. Après revue et fusion dans `main`, reprendre les étapes ci-dessous.
L'archive fournit aussi tous les fichiers pour consulter ou reprendre le travail.

### Configuration de production

1. Dans l'administration existante, créer le compte de ton ami s'il n'existe pas.
   Choisir exactement deux emails : le tien pour Apple Music, le sien pour Spotify.
   Aucun autre membre, même administrateur, n'a accès à la playlist.
2. Sauvegarder SQLite et `.env`. Conserver séparément la clé de chiffrement : sans elle,
   les tokens sauvegardés deviennent illisibles. Ne jamais committer `.env` ou la clé `.p8`.
3. Installer le changement avec les commandes habituelles, après publication sur `main` :

   ```sh
   sudo bash /var/www/titisite/deploy/backup.sh
   sudo bash /var/www/titisite/deploy/deploy.sh
   ```

   Les migrations additives s'exécutent dans `server/db.js#migrate` au démarrage.
   La sauvegarde habituelle inclut donc les morceaux et les tokens chiffrés.
4. Éditer `/var/www/titisite/.env` directement sur le VPS, avec les variables suivantes.
   Les valeurs ci-dessous sont des exemples à remplacer, pas des identifiants fonctionnels.

```dotenv
PLAYLIST_APPLE_EMAIL=ton-compte-du-site@example.com
PLAYLIST_SPOTIFY_EMAIL=compte-du-site-de-ton-ami@example.com
PLAYLIST_ENCRYPTION_KEY=remplacer_par_64_caracteres_hexadecimaux
PLAYLIST_POLL_SECONDS=45
SPOTIFY_CLIENT_ID=identifiant_application_spotify
APPLE_TEAM_ID=identifiant_equipe_apple
APPLE_KEY_ID=identifiant_cle_musickit
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\ncontenu_de_la_cle_p8\n-----END PRIVATE KEY-----"
CANONICAL_ORIGIN=https://baptiste-niszczota.com
```

Générer la clé de chiffrement une fois :

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
sudo chmod 600 /var/www/titisite/.env
sudo -u titisite env PM2_HOME=/home/titisite/.pm2 pm2 reload titisite --update-env
```

5. Reporter le changement du bloc Nginx `location` dans la configuration active :
   `/api/playlist/spotify/callback` doit être exclu des journaux d'accès et d'erreur
   (le code OAuth transite dans l'URL). Le fichier `deploy/nginx.conf` contient le bloc.
   Vérifier avec `sudo nginx -t`, puis `sudo systemctl reload nginx`.
   Aucun port supplémentaire, sous-domaine ou proxy supplémentaire n'est nécessaire.
6. Ouvrir `/playlist`. Le lien apparaît aussi dans l'en-tête de l'espace projet pour
   les deux comptes autorisés après rafraîchissement de leur session.

Le déploiement existant ne copie pas automatiquement `deploy/nginx.conf` : l'étape 5
est donc à faire une fois. Conserver un seul processus PM2 (configuration actuelle).
Changer les deux propriétaires après utilisation exige une migration des données et
connexions ; ne pas réaffecter simplement les emails à d'autres personnes.

## Spotify : ton ami

- Créer l'application dans le [Dashboard Spotify](https://developer.spotify.com/dashboard)
  depuis le compte Premium de ton ami. Ajouter le compte autorisé dans les paramètres
  de l'application en mode développement si nécessaire.
- Enregistrer exactement cette Redirect URI HTTPS :
  `https://baptiste-niszczota.com/api/playlist/spotify/callback`.
- Renseigner son Client ID dans `.env`. Le flux Authorization Code + PKCE S256
  ne nécessite pas de Client Secret. Le refresh token reste exclusivement côté serveur.
- Ton ami se connecte au site, ouvre Réglages, connecte Spotify puis crée « Playlist
  Commune » ou sélectionne une playlist dont il est propriétaire. Une playlist liée
  ne peut pas être remplacée accidentellement depuis l'interface.
- Scopes demandés : `playlist-read-private`, `playlist-modify-private`,
  `playlist-modify-public`. Aucun accès au lecteur n'est nécessaire.

## Apple Music : toi

- Un abonnement Apple Music actif, la synchronisation de bibliothèque et une clé
  MusicKit liée à un identifiant Media Services sont nécessaires. La création de
  cette clé nécessite l'accès au programme Apple Developer.
- Renseigner Team ID, Key ID et le PEM `.p8` dans `.env`. Ne jamais les envoyer au front.
- Connecté avec ton compte du site, ouvrir Réglages → Connecter Apple Music. MusicKit JS
  charge avant le clic, pour que `authorize()` reste associé au geste utilisateur sur iPhone.
- Le Music User Token obtenu est transmis par HTTPS puis chiffré en SQLite. Le JWT
  développeur ES256 dure 12 heures et est régénéré une heure avant expiration.
- Créer « Playlist Commune » ou sélectionner une playlist modifiable de ta bibliothèque.
  La sélection importe ses morceaux existants ; les deux playlists sont réunies.
- Un Music User Token révoqué doit être renouvelé via « Reconnecter ». Il n'existe pas
  de refresh token Apple équivalent à Spotify. La tâche continue lorsque le navigateur
  est fermé tant que ce token reste valide.

## Comportements et garanties

SQLite (`shared_tracks`) est la source de vérité. Les tables `playlist_aliases`,
`playlist_deliveries`, `playlist_tokens` et `playlist_state` conservent les identités
distantes, livraisons, secrets AES-256-GCM et checkpoints. Les références utilisateurs
réutilisent `users`. Aucun mot de passe supplémentaire.

- Ajout web : enregistrement puis lancement immédiat d'un cycle serveur. L'interface
  relit l'état toutes les 5 secondes lorsqu'elle est visible et revalide la session.
- Ajout natif : lecture toutes les 45 secondes par défaut (minimum 30 configurable),
  plus le délai de propagation des services et celui d'éventuels quotas.
- Spotify : lecture des items uniquement si `snapshot_id` change. Pagination complète
  et vérification du snapshot avant/après lecture. Le snapshot d'une écriture n'est
  jamais enregistré comme checkpoint de lecture.
- Apple : lecture paginée des library tracks et relation `catalog`, avec cache des
  métadonnées catalogues manquantes. Les IDs de bibliothèque ne deviennent jamais
  des IDs catalogue. Les imports personnels sans catalogue peuvent être rapprochés
  par titre/artiste/durée ; sinon ils restent « À associer ».
- Matching : ISRC prioritaire ; sinon similarité du titre >= 0,92, artiste >= 0,88,
  durée à ±3 secondes et contrôle des marqueurs de version. Deux résultats presque
  équivalents restent soumis au choix manuel. Les candidats sont conservés jusqu'à
  une demande explicite de nouvelle recherche.
- Déduplication par ISRC et alias de plateforme, contraintes SQLite et file de travail
  unique partagée par les routes et le polling. Les doublons déjà présents dans une
  playlist native sont regroupés dans la vue commune, sans nettoyage natif automatique.
- Une suppression web ou Spotify pose un tombstone définitif, déclenche le retrait
  Spotify et signale « à retirer manuellement dans Apple Music ». Le retrait Apple est
  confirmé au prochain passage. Les tombstones empêchent toute réimportation native.
  Réajouter volontairement un morceau supprimé exige actuellement une opération
  d'administration ; le bouton Ajouter ne le réactive pas silencieusement.
- Un retrait uniquement dans Apple Music est signalé ; le morceau commun et Spotify
  sont conservés. Un bouton permet de le remettre dans Apple Music explicitement.
- Ni suppression Apple ni réordonnancement ne sont tentés.
- `429` : cooldown persistant, `Retry-After`, backoff exponentiel avec jitter.
  `QUOTA_EXCEEDED` part d'un délai de 5 minutes minimum. Une panne d'un service
  n'est jamais interprétée comme une playlist vide.

### Réponses perdues et cohérence éventuelle

Ces API ne proposent pas de clé d'idempotence pour les ajouts. Une garantie absolue
« exactement une fois » entre SQLite et un service externe est donc impossible.
L'intention d'envoi est persistée **avant** la requête. Si une réponse se perd ou si
le processus redémarre pendant l'envoi, la ligne devient « Envoi à vérifier » et
n'est pas renvoyée automatiquement. Une observation distante résout l'incertitude.
Sinon, vérifier dans l'application puis utiliser le bouton de relance ; une nouvelle
lecture complète précède cette relance. La confirmation humaine doit tenir compte
du délai de visibilité Apple. Un ajout acquitté mais pas encore visible reste
« Envoyé · confirmation attendue » et n'est pas dupliqué.

Une création de playlist incertaine n'est pas répétée automatiquement : charger
les playlists et sélectionner celle créée. Les erreurs de connexion, quotas et
dernières lectures sont visibles dans l'interface. Les secrets ne figurent ni dans
les statuts API ni dans les logs du module.

## API vérifiée le 19 septembre 2026

- [Migration Spotify février 2026](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) :
  `/playlists/{id}/items`, réponse `items[].item`, création via `/me/playlists`, recherche limitée à 10.
- [Changelog février](https://developer.spotify.com/documentation/web-api/references/changes/february-2026)
  et [mars](https://developer.spotify.com/documentation/web-api/references/changes/march-2026) :
  `external_ids` / ISRC rétabli, disponible pour les morceaux.
- [Mai](https://developer.spotify.com/documentation/web-api/references/changes/may-2026) :
  `account_id` stable utilisé pour lier le compte.
- [Juillet](https://developer.spotify.com/documentation/web-api/references/changes/july-2026) :
  quota partagé par compte développeur, erreur `QUOTA_EXCEEDED`. Ne pas essayer de contourner le quota par plusieurs Client IDs.
- [Suppression Spotify](https://developer.spotify.com/documentation/web-api/reference/remove-items-playlist) :
  corps `{ "items": [{ "uri": "spotify:track:…" }] }`.
- [PKCE Spotify](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow).
- [JWT développeur Apple](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens).
- [ISRC Apple](https://developer.apple.com/documentation/applemusicapi/get-multiple-catalog-songs-by-isrc).
- [Relation d'une playlist Apple](https://developer.apple.com/documentation/applemusicapi/fetch-a-relationship-on-this-resource-by-name-5l22w).
- [Relations catalogue Apple](https://developer.apple.com/documentation/applemusicapi/handling-resource-representation-and-relationships).
- [Création Apple](https://developer.apple.com/documentation/applemusicapi/create-a-new-library-playlist)
  et [ajout Apple](https://developer.apple.com/documentation/applemusicapi/add-tracks-to-a-library-playlist).

## Vérification avant utilisation réelle

Les tests `node --test test/playlist.test.js` couvrent SQLite réel, OAuth, autorisations,
chiffrement, API simulées, pagination, collisions, suppressions, concurrence, quotas,
refresh et reprise après interruption. Ils ne remplacent pas une recette sur vos
comptes : les clés et comptes musicaux réels ne sont pas fournis avec le code.

Après configuration, vérifier : connexion de chacun depuis son compte du site ; ajout
web ; ajout natif dans chaque application ; suppression Spotify puis retrait Apple ;
affichage d'un morceau introuvable ; reprise après redémarrage PM2. Confirmer aussi
l'autorisation MusicKit sur Safari iPhone et les éventuels blocages CSP du navigateur.
Les domaines de MusicKit et des pochettes sont autorisés par Helmet ; aucune politique
`unsafe-eval` ni autorisation générale de scripts tiers n'a été ajoutée.

### Résultats de la validation locale

- 23 tests réussis : `node --test test/playlist.test.js test/playlist-deployment.test.js`.
  Le serveur réel démarre en production avec et sans configuration musicale ; la
  session existante, la route SPA, la migration répétée et la sauvegarde SQLite sont
  contrôlées. Build Vite réussi ; lint de sécurité sans erreur.
- Vérification navigateur : session existante, onglets, filtre, candidats et largeur
  de 390 px sans débordement horizontal, avec données de démonstration locales.
- Suite complète avant l'ajout des deux tests de déploiement : 540/544 tests réussis
  sous Windows (Node 24). Les quatre échecs
  concernent les libellés du codex Minecraft, les catégories Redstone et la création
  d'un lien symbolique interdite sous Windows. Ils sont reproduits sur le commit
  d'origine `3db5a9b`, sans Playlist Commune, avec seulement le harnais adapté aux
  chemins Windows. Aucun échec supplémentaire observé.
- `npm audit` signale 11 vulnérabilités des dépendances existantes (7 hautes,
  4 modérées). Aucun paquet ni lockfile n'a été modifié ici. Le script `audit:gate`
  existant ne s'exécute pas sous Windows (`spawnSync npm ENOENT`) ; l'audit direct
  a été utilisé. La CI Linux doit rester contrôlée avant fusion.
