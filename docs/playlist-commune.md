# Playlist Commune — intégration à titisite

Page `/playlist`, API `/api/playlist`, même Express, même SQLite, même processus PM2,
mêmes comptes que le site. Aucun service supplémentaire et aucune inscription publique.
Le dépôt MusicGroup n'est pas requis. Les deux personnes utilisent leurs comptes du
site existants : le premier administrateur active la playlist, puis le second la rejoint
avec un code privé. Chacun configure exclusivement son propre compte musical.

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
node --test --test-concurrency=1 test/playlist.test.js test/playlist-queue.test.js test/playlist-deployment.test.js
git add .
git commit -m "Ajouter Playlist Commune pour Apple Music et Spotify"
git push -u origin feat/playlist-commune
```

Le patch part du commit `627759e`. Si `git apply --check` signale un conflit,
réconcilier les changements avec les nouvelles modifications du site avant de
continuer. Après revue et fusion dans `main`, reprendre les étapes ci-dessous.
L'archive fournit aussi tous les fichiers pour consulter ou reprendre le travail.

### Configuration de production

1. Vérifier que vos deux comptes du site existent déjà. Aucun compte musical ni email
   ne doit être ajouté dans `.env` pour une nouvelle installation.
2. Sauvegarder SQLite et `.env`. La clé AES est créée automatiquement à côté de SQLite
   (`data.sqlite.playlist.key`) au premier démarrage. La sauvegarde habituelle la copie
   dans `/var/backups/titisite`; sans cette clé, les tokens deviennent illisibles.
   Ne jamais committer `.env`, cette clé ou la clé `.p8`.
3. Installer le changement avec les commandes habituelles, après publication sur `main` :

   ```sh
   sudo bash /var/www/titisite/deploy/backup.sh
   sudo bash /var/www/titisite/deploy/deploy.sh
   ```

   Les migrations additives s'exécutent dans `server/db.js#migrate` au démarrage.
   La sauvegarde habituelle inclut donc les morceaux et les tokens chiffrés.
4. `CANONICAL_ORIGIN` et `PLAYLIST_POLL_SECONDS` restent les seuls réglages utiles au
   déploiement. Les identifiants Spotify/Apple sont saisis dans `/playlist` par leurs
   propriétaires et chiffrés côté serveur.

```dotenv
PLAYLIST_POLL_SECONDS=45
CANONICAL_ORIGIN=https://baptiste-niszczota.com
```

La clé locale est générée par le serveur avec les permissions `0600`. Ne la crée pas
à la main et ne la change jamais après que des tokens ont été enregistrés.

5. Reporter le changement du bloc Nginx `location` dans la configuration active :
   `/api/playlist/spotify/callback` doit être exclu des journaux d'accès et d'erreur
   (le code OAuth transite dans l'URL). Le fichier `deploy/nginx.conf` contient le bloc.
   Vérifier avec `sudo nginx -t`, puis `sudo systemctl reload nginx`.
   Aucun port supplémentaire, sous-domaine ou proxy supplémentaire n'est nécessaire.
6. Ouvrir `/playlist` avec ton compte administrateur, choisir Apple Music ou Spotify,
   puis activer la playlist. Dans Réglages, créer le code privé et l'envoyer à ton ami.
   Il ouvre `/playlist` avec son compte du site et saisit le code. Le choix du service
   attribué est automatique : la seconde personne reçoit l'autre plateforme.

Le déploiement existant ne copie pas automatiquement `deploy/nginx.conf` : l'étape 5
est donc à faire une fois. Conserver un seul processus PM2 (configuration actuelle).
Changer les deux membres après utilisation exige une migration explicite des données et
connexions ; le code d'invitation ne permet pas de remplacer un membre.

## Spotify : ton ami

- Créer l'application dans le [Dashboard Spotify](https://developer.spotify.com/dashboard)
  depuis le compte Premium de ton ami. Ajouter le compte autorisé dans les paramètres
  de l'application en mode développement si nécessaire.
- Enregistrer exactement cette Redirect URI HTTPS :
  `https://baptiste-niszczota.com/api/playlist/spotify/callback`.
- Ton ami ouvre Réglages avec son compte, déplie « Configurer mon service », suit le
  lien Spotify et colle son Client ID dans le formulaire. Le flux Authorization Code + PKCE S256
  ne nécessite pas de Client Secret. Le refresh token reste exclusivement côté serveur.
- Ton ami se connecte au site, ouvre Réglages, connecte Spotify puis crée « Playlist
  Commune » ou sélectionne une playlist dont il est propriétaire. Une playlist liée
  ne peut pas être remplacée accidentellement depuis l'interface.
- Scopes demandés : `playlist-read-private`, `playlist-modify-private`,
  `playlist-modify-public`, `user-modify-playback-state`. Le bouton « Lire sur
  Spotify » démarre le morceau sur l'appareil Spotify actif du compte Premium ;
  si aucun appareil n'est actif, Spotify refuse la commande et l'interface l'explique.

## Apple Music : toi

- Un abonnement Apple Music actif, la synchronisation de bibliothèque et une clé
  MusicKit liée à un identifiant Media Services sont nécessaires. La création de
  cette clé nécessite l'accès au programme Apple Developer.
- Dans Réglages, ouvrir « Configurer mon service », suivre le lien Apple, puis renseigner
  le Team ID, le Key ID et sélectionner le fichier `.p8`. Ne jamais envoyer ces clés à
  l'autre membre : le fichier est transmis en HTTPS puis chiffré côté serveur.
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
- Lecture directe : Spotify reçoit une commande de lecture sur son appareil actif.
  Apple Music est lu dans MusicKit JS après le clic de l'utilisateur, avec son compte
  Apple connecté ; un site web ne peut pas démarrer silencieusement l'application
  Apple Music sur un autre appareil. Les deux boutons sont indépendants et leur
  démarrage simultané n'est pas garanti.
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
- [Lecture Spotify](https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback)
  et [file de lecture](https://developer.spotify.com/documentation/web-api/reference/add-to-queue).
- [Contrôles MusicKit JS](https://developer.apple.com/musickit/web/).
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

- 34 tests réussis : `node --test --test-concurrency=1 test/playlist.test.js test/playlist-queue.test.js test/playlist-deployment.test.js`.
  Le serveur réel démarre en production avec et sans configuration musicale ; la
  session existante, la route SPA, la migration répétée, la sauvegarde SQLite,
  l'invitation et la séparation des réglages sont contrôlées. Build Vite réussi ;
  lint de sécurité sans erreur.
- Vérification navigateur : session existante, onglets, filtre, candidats et largeur
  de 390 px sans débordement horizontal, avec données de démonstration locales.
- Suite complète avant l'ajout des deux tests de déploiement : 540/544 tests réussis
  sous Windows (Node 24). Les quatre échecs
  concernent les libellés du codex Minecraft, les catégories Redstone et la création
  d'un lien symbolique interdite sous Windows. Ils sont reproduits sur le commit
  d'origine `3db5a9b`, sans Playlist Commune, avec seulement le harnais adapté aux
  chemins Windows. Aucun échec supplémentaire observé.
- Les correctifs de `multer` 2.4.0, `nodemailer` 9.1.1, `sharp` 0.35.4 et `fflate`
  0.6.11 sont inclus dans le lockfile. Ils suppriment les alertes hautes runtime
  observées sur le VPS. Relancer `npm audit` après `npm ci` puis `npm prune --omit=dev`;
  les éventuelles alertes transitives de l'outillage ne doivent pas conduire à un
  `npm audit fix` aveugle qui changerait le framework ou le lockfile sans revue.


## File commune de lecture (20 septembre 2026)

L’onglet **File d’attente** s’ouvre par défaut. Dans **Ajouter**, « File d’attente »
enregistre le titre uniquement dans `playback_queue` ; « Playlist » conserve
l’ancien fonctionnement de synchronisation des bibliothèques. Aucun choix ou création
de playlist n’est nécessaire pour la file. Vos comptes et clés restent individuels.

1. Chacun connecte son service depuis ses réglages. Le membre Spotify doit **reconnecter
   Spotify une fois** pour accepter `user-modify-playback-state` ajouté à l’autorisation.
2. Spotify Premium : ouvrir l’application et lancer un titre pour activer le PC.
   Les ajouts arrivent dans la file de l’appareil actif. « Lire sur mon Spotify »
   demande immédiatement ce titre ; cette commande interrompt la lecture actuelle.
3. Apple Music : ouvrir cette page, « Activer la réception ici », puis « Lire ma file ».
   MusicKit joue dans le navigateur. L’application Apple Music native Windows n’offre
   pas cette commande distante. Les boutons Ouvrir donnent accès au titre, sans
   garantie de démarrage automatique ni d’ajout à la file native.
4. Chaque ajout est envoyé dans l’ordre ; une erreur bloque les suivants sur le service
   concerné. L’autre service peut continuer. Choisir une version si le matching est
   incertain, ou corriger la connexion puis réessayer.
5. La liste suit les envois, pas les fins de lecture. Masquer un titre annule uniquement
   ses envois encore en attente : ceux déjà reçus restent dans les lecteurs. Pour
   écouter à nouveau un titre terminé, le masquer puis l’ajouter à nouveau explicitement.

SQLite conserve la file après redémarrage. Aucun ajout acquitté n’est automatiquement
renvoyé après rechargement du navigateur. Les titres Apple déjà reçus peuvent donc
avoir disparu du lecteur après fermeture : les rajouter explicitement si nécessaire.
Un titre lancé directement sur Spotify peut rester aussi dans sa file préexistante.
La synchronisation à la seconde près, les suppressions distantes de la file et le
réordonnancement distant ne sont pas implémentés.

Côté serveur, les écritures Spotify partagent le verrou du moteur. Un `sending`
interrompu devient `uncertain`. Une réception Apple obtient une réservation à usage
unique de 60 secondes, puis confirme le résultat ; une confirmation perdue ne provoque
pas de second ajout. Un seul navigateur peut recevoir à la fois (bail de 90 secondes).
Après suspension ou fermeture d’un onglet, attendre 90 secondes avant de recevoir sur
un autre. Les requêtes du navigateur revalident la session et les droits du propriétaire.
Les échecs réseau ambigus nécessitent une vérification humaine avant relance.

La réception Apple vérifie les nouveautés toutes les 4 secondes tant que la page reste
ouverte ; le navigateur peut ralentir un onglet masqué ou un iPhone verrouillé. Spotify
reçoit immédiatement les ajouts web, puis les quotas sont retentés au rythme du moteur.
La table est créée par la migration additive existante et incluse dans le backup SQLite.
Les commandes VPS habituelles restent inchangées.

### Validation de cette mise à jour

- 34 tests playlist/file/déploiement et 24 tests de sécurité passent.
- Build Vite réussi ; lint sans erreur (avertissements du dépôt toujours présents).
- Correction `qs` 6.16.0 via override, car Express épingle encore la version précédente.
  `fast-uri`, `js-yaml` et `nanoid` mis à jour dans le lockfile pour l’outillage.
  Audit npm complet : **0 vulnérabilité** au 20 septembre 2026.
- Comptes musicaux réels et VPS non testés. Les tests des API musicales sont simulés.

Conserver la clé AES existante en cas de migration depuis `.env`. Les anciennes clés
musicales ne doivent être retirées de `.env` qu’après avoir été enregistrées dans les
réglages web. La migration des membres ne copie pas ces clés automatiquement.
## Temps de lecture et file d’attente

Le bloc **En cours de lecture** affiche le titre de la file reconnu sur ton service,
son temps écoulé et sa durée. Spotify est interrogé environ toutes les 5 secondes
lorsque la page est visible, avec un compteur intermédiaire mis à jour chaque seconde.
Apple suit le lecteur MusicKit de cette page. Une pause ou un changement de position
est repris à la prochaine observation ; le compteur cesse d'avancer si le suivi
ne reçoit plus d'état récent. Ce n'est pas une synchronisation des deux lecteurs.

**Le membre Spotify doit se reconnecter une fois dans Réglages** pour autoriser
la lecture de l'état de son lecteur (`user-read-playback-state`).
La connexion Apple doit fonctionner avant de pouvoir suivre sa lecture.

Dès que la lecture est détectée, le titre quitte **ta** liste d'attente et reste
dans **Déjà lancés sur ton service**. L'autre personne le garde en attente jusqu'à
sa propre lecture. Le démarrage reste mémorisé après rechargement. Aucun morceau
n'est supprimé de Spotify ou d'Apple Music et aucun envoi à l'autre membre n'est
annulé par cette transition. Pour rejouer un titre déjà lancé, retire son ancienne
entrée de l'historique avant de l'ajouter de nouveau ; vérifie d'abord les envois
encore en attente chez l'autre membre.

La progression des titres écoutés hors de la file commune et des sessions privées
Spotify n'est pas affichée. Les titres lancés pendant que le suivi est fermé peuvent
rester dans la liste : le site ne déduit pas une lecture qu'il n'a pas observée.
Les migrations des deux marqueurs de démarrage sont additives ; utilise les commandes
habituelles `backup.sh` puis `deploy.sh`.

Références : [état de lecture Spotify](https://developer.spotify.com/documentation/web-api/reference/get-information-about-the-users-current-playback)
et [instance MusicKit v3](https://js-cdn.music.apple.com/musickit/v3/docs/?path=/story/reference-javascript-musickit-instance--page).

## Diagnostiquer une connexion Apple qui reste bloquée

Dans **Réglages → Apple Music**, clique sur **Tester la configuration Apple**.
Le test vérifie l'accès réel au catalogue avec la clé enregistrée. Il ne lance
aucune musique et ne crée aucune playlist.

- **Catalogue accessible** : Apple accepte la clé pour le catalogue à l'heure du
  test. Clique ensuite sur **Connecter Apple Music**. L'autorisation du compte
  reste une étape séparée ; un test réussi ne garantit pas son succès.
- **Clé refusée (401)** : vérifie que le Team ID, le Key ID et le fichier `.p8`
  correspondent à la même clé valide. Ne partage pas le contenu du fichier.
- **Accès refusé (403)** : vérifie l'association de la clé Media Services au
  Media ID et l'activation de MusicKit dans Apple Developer.
- **Limite de requêtes** : attends avant de réessayer ; le serveur respecte le
  délai imposé par Apple.

Pendant la connexion, le site distingue l'attente de validation dans la fenêtre
Apple et la vérification finale du compte sur le serveur. Après deux minutes
sans réponse de l'autorisation, ferme la fenêtre Apple et recharge la page.
Une réponse tardive ne sera pas enregistrée par cette tentative.

Si le catalogue fonctionne mais que MusicKit refuse l'autorisation, vérifie que
le même compte peut lire un titre sur [Apple Music](https://music.apple.com/).
Le seul message `webPlayerLogout 403` ne donne pas la cause du refus initial.
Les réglages supplémentaires ne doivent pas être déduits de ce seul message.
Apple décrit aussi ce cas sur son [forum développeur](https://developer.apple.com/forums/thread/837028).
Transmets le message lisible du diagnostic ; aucun export de tokens n'est nécessaire.
