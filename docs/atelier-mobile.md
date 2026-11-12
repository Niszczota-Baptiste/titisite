# Mon Atelier — l'atelier d'auteur sur le téléphone

« Mon Atelier » est l'application Android personnelle de création, reliée à ce
site. Un seul atelier sur deux supports : le téléphone pour saisir et
travailler partout, le site pour approfondir, organiser et développer.

Ce document décrit **la part du site** : le bundle embarqué dans l'application,
ce que le serveur a gagné (médias audio privés, marques de travail, assistance
facultative), les contrats avec le natif, la configuration, les migrations et
ce qui a été vérifié. Le natif Android vit dans un autre dépôt
(`AndroidApp/apps/mon-atelier`, voir son `docs/ARCHITECTURE.md`).

Lecture préalable : [`atelier-auteur.md`](atelier-auteur.md) (accès, partage,
modèle de données, sauvegarde, hors connexion).

## Architecture retenue

L'application est un conteneur **Capacitor** (WebView Android + plugins natifs
en Kotlin) qui **embarque l'interface** : elle ne la charge pas depuis le site.

| Couche | Où | Rôle |
|---|---|---|
| Logique partagée | `src/components/author/*` | l'atelier lui-même : éditeur, fiches, sons, synchronisation, hors connexion — **le même code** que `/auteur` sur le web |
| Interface téléphone | `src/mobile/` | accueil centré création, capture, enregistrement, boîte de réception, partage entrant, réglages de l'application |
| Stockage local | `src/mobile/platform/vault.js` (natif : dossier privé ; web : IndexedDB), `offline/store.js` (brouillons, file d'envoi) | ce qui n'existe encore que sur l'appareil |
| Accès à l'API | `src/api/client.js` | inchangé : appels **relatifs** `/api/…`, cookie de session |
| Fonctions natives | `src/mobile/platform/*.js` → plugins Kotlin | micro, fichiers, partage entrant, raccourcis, Mon Temps, adresse du site |

### Le point clé : la coquille est servie sous l'origine du site

Le WebView charge l'interface embarquée **sous l'origine du site choisi par
l'utilisateur** (`https://mon-site.example`), et seules les requêtes `/api/…`
partent réellement vers le réseau. Conséquences, toutes vérifiées à travers le
banc « conteneur » (`test/e2e/container.js`) :

- le cookie de session reste **de première partie**, `HttpOnly`,
  `SameSite=Strict` : aucune règle CORS, aucun jeton lisible par le JavaScript,
  aucun changement de l'authentification du site ;
- l'en-tête anti-CSRF `X-Author-Request` et la garde des médias privés
  (`/api/author/media/:f`, lecture par plages comprise) fonctionnent tels quels ;
- le site n'a **rien à ouvrir** pour l'application : pas d'origine
  supplémentaire, pas de point d'entrée dédié.

Solutions écartées : CORS avec identifiants (affaiblit `SameSite`), proxy natif
des écritures (le WebView ne donne pas le corps des requêtes à
`shouldInterceptRequest`), jeton porteur stocké côté JavaScript (interdit par
les règles du site).

Avant qu'un site soit relié, la coquille tourne sous `https://localhost` en
**atelier local** : capturer et enregistrer fonctionnent, rien ne part.

### Construire le bundle

```bash
npm run build:atelier      # → dist-atelier/ (vite.atelier.config.js, racine src/mobile)
npm run dev:atelier        # développement dans un navigateur
```

- `VITE_ATELIER_APP` distingue l'application du site (`runtime.js` : `IS_APP`,
  portée du service worker `/`, lien d'accueil).
- Une CSP est inscrite dans `index.html` au build (pas de script distant, pas
  de police distante : polices système).
- Le service worker de l'application a une liste de pré-cache **vide** (les
  fichiers sont déjà dans l'APK) ; il ne sert qu'aux copies de lecture.
- `dist-atelier/` est copié dans l'APK par
  `AndroidApp/apps/mon-atelier/scripts/build-web.sh` (révision épinglée dans
  `site.lock`).

## Configuration de la connexion au site

- **L'adresse du site se saisit dans l'application** (écran « Relier mon
  site »). Elle n'est compilée nulle part et n'est jamais déduite de l'adresse
  d'un dépôt. Le natif vérifie d'abord que l'adresse répond comme ce site
  (`GET /api/health`), puis relance la coquille sous cette origine.
- **HTTPS obligatoire** dans la version release. La version de développement
  accepte `http://` (réseau local, essais).
- **Côté serveur : rien à configurer pour l'application.** Vérifier seulement :
  - nginx : le bloc `location ~ ^/api/author/projects/[0-9]+/audio$`
    (`deploy/nginx.conf`, 260 Mo) — sans lui l'envoi d'une prise retombe sur la
    limite par défaut de 10 Mo ;
  - `.env` (facultatif) : `AUTHOR_AUDIO_MAX_BYTES` (250 Mo par défaut),
    `ANTHROPIC_API_KEY` + `AUTHOR_ASSIST_MODEL` pour l'assistance facultative.
- Le compte est celui du site : même e-mail, même mot de passe, mêmes droits
  (`canAuthor` pour le propriétaire, partages `omniscient` / `lecteur` pour les
  invités). Changer d'adresse ou de compte ne montre jamais le travail de l'un à
  l'autre (stockage web rangé par origine ; copies de lecture effacées au
  changement de compte ; captures marquées par propriétaire).

## Contrats avec le natif

Le JavaScript n'importe aucune bibliothèque Capacitor : il appelle
`window.Capacitor.nativePromise(plugin, méthode, arguments)` (`platform/bridge.js`).
Dans un navigateur, des adaptateurs « web » prennent le relais — c'est ce qui
permet de tester l'interface sans téléphone.

| Plugin | Méthodes | Remarques |
|---|---|---|
| `AtelierConfig` | `get`, `probe {url}`, `setServer {url}`, `network` | adresse du site ; type de connexion (Wi-Fi ou non) |
| `AtelierVault` | `list`, `put {item}`, `remove {id}`, `pick {role}`, `stats` | boîte de réception locale ; les fichiers se lisent par une adresse locale, jamais par le pont |
| `AtelierRecorder` | `prepare`, `start`, `pause`, `resume`, `mark {label}`, `stop`, `status`, `recover`, `release {id}` ; événements `state`, `finished` | enregistrement par un service au premier plan ; seuls l'état et le chemin du fichier passent par le pont |
| `AtelierIntake` | `pendingShare`, `clearShare {keep}`, `launchAction` ; événements `share`, `action` | partage entrant (aperçu avant import), raccourcis |
| `AtelierSessions` | `status`, `start {activity}`, `pause`, `resume`, `stop` | session créative ↔ Mon Temps |

Formes exactes (références de fichier, prise, partage, session) : en tête de
chaque fichier de `src/mobile/platform/`. Trois plugins d'office de Capacitor
(`WebView`, `CapacitorHttp`, `CapacitorCookies`) sont **fermés** par le natif,
et la page ne peut lire que les dossiers de la boîte de réception — pas le
reste du stockage privé de l'application, où le WebView garde son cookie.

Aucun contenu de brouillon ne sort vers une autre application : Mon Temps ne
reçoit qu'une activité (« Écriture » / « Musique »), une heure et un libellé
fixe ; les raccourcis n'ouvrent que des écrans.

## Ce que le site a gagné

### Création musicale privée

- Type d'élément **`sound`** (idée musicale) : paroles, tempo, mesure,
  tonalité, accords, instruments, structure, ambiance — tous facultatifs.
  Privé : absent de `GUEST_KINDS`, donc invisible des invités.
- **Prises audio privées** : `author_media.kind = 'audio'`. Contenu vérifié par
  ses octets (m4a, aac, mp3, ogg, wav, flac, webm), empreinte SHA-256, envoi
  **idempotent** par `clientRef`, lecture par plages derrière la garde de
  l'atelier. `/api/tracks` et `/api/audio` (portfolio public) ne reçoivent
  **jamais** un brouillon.
- Repères (`author_media_markers`) : repère, boucle A–B, extrait (non
  destructif : un intervalle nommé, pas un nouveau fichier), interruption.
- Versions d'une même idée et **prise de référence**.
- Métronome (horloge audio, sans dérive), tap tempo, décompte avant la prise.
- **Publication = copie explicite** : choisir la version → aperçu → confirmer
  la destination. Le fichier public est une copie sous un autre nom ;
  l'original reste privé. La synchronisation ne publie rien.

Routes : `GET/POST …/audio`, `GET …/audio/by-ref/:ref`, `GET …/media/:id/audio`,
`GET …/media/:id/download`, `…/media/:id/markers`, `…/markers/:id`,
`GET …/media/:id/publication`, `POST …/media/:id/publish` (`api.author.p(pid).audio.*`).

### Écriture

- **Marques de travail** dans le texte (`marks.js`) : `{{reprendre: …}}`,
  `{{question: …}}`, `{{variante: A || B}}` (deux versions d'un passage).
  **Privées** : le serveur les retire de tout ce qu'il sert aux invités, du
  manuscrit exporté, de l'index de recherche et des compteurs
  (`server/author/marks.js`, copie conforme vérifiée par
  `test/author-marks.test.js` ; balayage anti-fuite étendu dans
  `test/author-sharing.test.js`).
- Recherche dans le chapitre (sans casse ni accents, occurrences surlignées),
  aperçu d'une fiche citée sans perdre sa sélection, interligne, compteurs
  masquables, aucune action de l'éditeur pendant une composition (clavier coréen).
- Nature du projet (`author_projects.kind` : roman, nouvelle, poésie, scène,
  univers, musique, mixte, libre) : oriente l'accueil, n'impose rien.
- Mode « Explorer » (pistes locales), idées « à revoir plus tard » (sans
  notification), provenance et date de capture d'une idée.
- Cohérence : chaque signalement porte sa **nature** (calculée / déclarée /
  suggestion) ; « Ignorer » garde une **raison**.

### Assistance facultative

`server/author/assist.js` — éteinte par défaut, trois verrous :

1. n'existe que si le serveur a une clé (`ANTHROPIC_API_KEY`), qui ne quitte
   jamais le serveur ;
2. activée **projet par projet** par le propriétaire (`author_projects.ai_assist`) ;
3. le serveur ne compose **aucun contexte** : seuls l'extrait sélectionné
   (≤ 6 000 signes, sans les marques de travail, montré avant l'envoi) et la
   consigne tapée partent.

Les réponses sont des propositions : aucune route n'écrit dans le projet, et
l'éditeur ne garde une proposition que sur un geste, comme **variante** ou
comme **question** — le passage d'origine reste. Pas de route côté invité.
Modèle par défaut `claude-opus-5-5` (`AUTHOR_ASSIST_MODEL`), repli côté API en
cas de refus de sécurité du modèle. Chaque demande est un appel facturé ;
limite de 30 demandes par 10 minutes.

## Continuité web ↔ téléphone

Les mécanismes de l'atelier web sont réutilisés tels quels (révision attendue,
PUT partiel, fusion champ par champ, conflit explicite, `clientRef`,
historique, corbeille). Ajouts :

- un conflit détecté pendant qu'une sauvegarde était en vol **ne peut plus être
  écrasé** par la sauvegarde suivante (correction de `useEntityDoc`, trouvée par
  les tests de bout en bout) ; la version perdante reste dans l'historique ;
- cinq états visibles, jamais confondus : *Sauvegardé sur cet appareil*, *En
  attente d'envoi*, *Synchronisé*, *Conflit à résoudre*, *Échec nécessitant une
  action* ;
- trois causes distinguées : réseau coupé, **session expirée** (reconnexion
  sans perdre le travail), **accès refusé** ;
- boîte de réception locale : une capture classée part avec des références
  dérivées de son identifiant — un envoi dont la réponse s'est perdue n'est
  jamais refait en double.

## Hors connexion : ce qui est vrai

« Disponible hors connexion » dit ce qui est **réellement** sur l'appareil
(Réglages du projet → Hors connexion) :

| | Sur l'appareil | Remarque |
|---|---|---|
| Texte (chapitres, fiches, idées, paroles, repères) | oui, après une ouverture en ligne | mis à jour à chaque visite |
| Images | miniatures et cartes de lieux (400 au plus) | les images en grand demandent le réseau |
| Sons | **seulement les prises gardées sur demande** | « Garder hors connexion », par prise ou pour le projet ; une écoute en ligne ne laisse aucune copie ; réglage « Wi-Fi seulement » |

| Sans réseau | Application | Site (navigateur) |
|---|---|---|
| Capturer une idée (texte, lien, image) | oui, même au tout premier lancement, sans compte | oui, projet déjà ouvert |
| Enregistrer un son | oui (natif), même sans compte | la prise ne peut pas être envoyée : réessayer ou télécharger le fichier |
| Lire le projet | oui, s'il a été ouvert en ligne | idem |
| Écrire dans un chapitre ou une fiche | oui | oui |
| Créer un élément | oui (identifiant provisoire) | oui |
| Écouter une prise | seulement si elle a été gardée | idem |
| Classer une capture dans un projet | choisi hors ligne, envoyé au retour du réseau | — |
| Relations, plan, tableaux, tâches, commentaires | non — message explicite | non |
| Poser un repère, garder une boucle, publier | non | non |
| Recherche plein texte | titres et alias seulement | idem |
| Assistance | non, et rien n'est mis en attente | non |

Une fonction indisponible hors connexion affiche un message ; elle ne simule
jamais un succès.

## Migrations et sauvegarde

Toutes les migrations sont **additives** (`server/author/schema.js`,
`ensureColumn` / `CREATE TABLE IF NOT EXISTS`), jouées au démarrage :

| Objet | Ajout |
|---|---|
| `author_projects` | `kind` (défaut `livre`), `ai_assist` (défaut 0) |
| `author_notes` | `revisit_on`, `origin`, `captured_at` |
| `author_sounds` | nouvelle table (idées musicales) |
| `author_media` | `kind` (défaut `image`), `duration_ms`, `label`, `notes`, `source`, `integrity`, `captured_at`, `sha256`, `client_ref` (+ index unique par projet), `published_track_id`, `published_at` |
| `author_media_markers` | nouvelle table |
| `author_issue_dismissals` | `reason` |

Aucune colonne existante n'est modifiée, aucune ligne réécrite. Export JSON du
projet : version 2 (repères et raisons ajoutés).

### Avant toute utilisation sur les données réelles

1. **Sauvegarder** : `sudo bash deploy/backup.sh` (copie cohérente de la base +
   archive des fichiers). Vérifier que les deux fichiers du jour existent dans
   `/var/backups/titisite/` et en garder une copie hors du serveur.
2. **Répéter sur une copie**, jamais sur la base en service :
   ```bash
   mkdir -p /tmp/essai && gunzip -c /var/backups/titisite/data-<date>.sqlite.gz > /tmp/essai/data.sqlite
   mkdir -p /tmp/essai/uploads && tar -xzf /var/backups/titisite/uploads-<date>.tar.gz -C /tmp/essai/uploads --strip-components=1
   DB_PATH=/tmp/essai/data.sqlite UPLOADS_DIR=/tmp/essai/uploads PORT=3999 node server/index.js
   ```
   (reprendre les autres variables du `.env`). Ouvrir l'atelier sur ce port :
   projets, chapitres, images et historique doivent être intacts. Jeter `/tmp/essai`.
3. **Déployer** (`deploy/deploy.sh` : retour automatique au commit précédent si
   `/api/health` échoue), puis recharger nginx pour le nouveau bloc.
4. **Revenir en arrière** si besoin : l'ancien code démarre sur la base migrée
   et sert le contenu existant à l'identique. Les nouveautés créées entre-temps
   (idées musicales, prises) restent en base mais il les affiche mal ; pour un
   retour exact, restaurer la sauvegarde de l'étape 1 (arrêter le service,
   remettre `data.sqlite` et `uploads/`, redémarrer).

Répétition jouée ici sur des données de test
(`test/tools/migration-rehearsal.mjs` : base créée par `main`, ouverte par
cette branche, rouverte par `main`) : contenu identique aux trois étapes.
**Aucun déploiement n'a été fait, aucune base réelle n'a été touchée.**

## Vérifié, et non vérifié

Vérifié ici (Node 22, Chromium piloté par Playwright, banc « conteneur ») :

- `npm test` — serveur, logique partagée, anti-fuite du partage, audio,
  marques, assistance (contre un faux serveur d'API) ;
- `npm run test:atelier` — parcours de bout en bout dans le bundle de
  l'application : connexion (cookie `HttpOnly` de première partie), écriture
  hors connexion retrouvée après fermeture, synchronisation, conflit sans
  écrasement, réponse perdue rejouée sans doublon, changement de compte sans
  fuite, enregistrement → rangement privé → lecture et repères sur les deux
  interfaces, écoute hors connexion d'une prise gardée, publication en trois
  temps, capture sans compte puis classement, éditeur (marques, recherche,
  fiche citée, composition coréenne), assistance, mise en page à 360 et 393 dp ;
- `npm run lint:security`, `npm run build`, `npm run build:atelier`.

**Non vérifié** : rien n'a tourné sur un téléphone ni sur un émulateur. Le
banc reproduit l'origine, les cookies, le service worker et le réseau, mais pas
le WebView Android lui-même ni les plugins natifs (testés à part sur la JVM).
Procédure à suivre sur l'appareil :
`AndroidApp/apps/mon-atelier/docs/TEST_TELEPHONE.md`.

## Limites connues

- L'extraction d'un passage sonore est un repère nommé, pas un nouveau fichier.
- Dans un navigateur (hors application), une prise enregistrée hors connexion
  ne peut pas être mise de côté : réessayer ou télécharger le fichier.
- Une marque de travail tient dans un paragraphe ; les marques ne s'imbriquent pas.
- Les repères d'une prise ne se posent qu'en ligne.
- L'assistance ne voit que l'extrait : elle ne connaît ni les fiches ni le
  reste du chapitre (c'est voulu) ; ses réponses s'en ressentent.
- Polices système dans l'application (aucune police téléchargée).
- La recherche plein texte ne couvre pas les marques de travail (non indexées).
