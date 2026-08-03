# Audit de sécurité — août 2026

> Audit indépendant réalisé le 2026-08-03 sur la branche
> `claude/security-audit-complete-lf5vh3` (base : `afc108e`). Périmètre demandé :
> OWASP Top 10, injections SQL, XSS, CSRF, SSRF, RCE, authentification, gestion
> de session, permissions, exposition de données sensibles, configuration
> serveur, dépendances, secrets.
>
> Cet audit est **indépendant** de `AUDIT.md` (juillet 2026) : le code a été
> relu sans présumer que les conclusions précédentes tenaient toujours.

## Résumé

**3 vulnérabilités corrigées, 3 commits, 6 tests ajoutés (352 → 358).**
Aucune fonctionnalité métier retirée.

| # | Gravité | Faille | Statut |
|---|---|---|---|
| V1 | Haute ×7 | CVE dans l'arbre de dépendances ; porte CI rouge | ✅ corrigé |
| V2 | Moyenne | Élévation de portée : lien de partage WorldEdit → bibliothèque du workspace | ✅ corrigé |
| V3 | Moyenne | SMTP : repli silencieux en clair (STARTTLS opportuniste) | ✅ corrigé |

Le socle est solide : la quasi-totalité des classiques OWASP est traitée **et**
couverte par des tests de non-régression. Les trois failles trouvées sont dans
les angles morts habituels d'un code par ailleurs soigné : la chaîne
d'approvisionnement, la couture entre deux modèles d'autorisation, et une
option par défaut d'une bibliothèque tierce.

---

## V1 · Dépendances vulnérables (7 CVE hautes)

**Faille.** `npm audit` remontait 9 vulnérabilités (7 hautes) dans l'arbre
transitif : `brace-expansion` (DoS par expansion non bornée → OOM),
`js-yaml` (CPU quadratique), `fast-uri` (confusion d'hôte), `postcss`,
`shell-quote` (via `concurrently`), `body-parser` (limite de taille
silencieusement désactivée). Le job CI `npm audit --audit-level=high` était donc
**rouge sur `main`** — c'est-à-dire qu'un garde-fou existant ne gardait plus rien.

**Correction.** `npm audit fix` (jamais `--force`, cf. `CLAUDE.md`) : seul
`package-lock.json` bouge, aucune version déclarée dans `package.json` ne change.
7 avis sur 9 disparaissent.

Restent `react-router` / `react-router-dom` (GHSA-qwww-vcr4-c8h2). L'avis porte
sur le **RSC Mode** — contournement CSRF dans le traitement serveur des *server
actions*. Cette appli est une SPA 100 % client (`<BrowserRouter>` + `<Routes>`
déclaratifs, aucun data router, aucun `loader`/`action`, aucun paquet
`@react-router/*` installé, aucun rendu serveur) : **le code vulnérable n'est
jamais chargé**. Le seul correctif proposé par npm est un downgrade en 7.11.0
(régression) ; la ligne corrigée est la v8, où `react-router-dom` a fusionné dans
`react-router` — migration majeure sans rapport avec le risque réel.

Plutôt que de désarmer `--audit-level=high` pour tout le monde à cause de ce seul
avis, `scripts/audit-gate.mjs` garde la porte armée sur **tout** sauf les avis
explicitement listés, chacun avec sa justification et une **date de revue** :
passé cette date l'exemption expire et la CI re-échoue. L'exemption est un délai,
pas un oubli.

La porte **échoue fermée** : si `npm audit` lui-même casse (pas de lockfile,
registre injoignable), npm renvoie un JSON d'erreur sans clé `vulnerabilities`,
qu'un filtre naïf lirait comme « rien à signaler ». Le script exige la preuve
positive que l'audit a tourné.

> ⏰ **Revue à faire avant le 2026-11-01** — sinon la CI repassera au rouge,
> volontairement. Voir `ALLOWLIST` dans `scripts/audit-gate.mjs`.

---

## V2 · Lien de partage WorldEdit → bibliothèque du workspace

**Faille (élévation de portée / IDOR).** Les liens `blueprint_shares` sont
scopés à **un build** : c'est tout leur intérêt — confier l'édition d'une
construction sans ouvrir le projet. Mais `attachRoutes()` monte les mêmes
handlers sur les deux points d'entrée (session JWT et token), or la bibliothèque
de schematics est scopée au **workspace**.

Le porteur d'un lien « edit » — non authentifié, potentiellement extérieur —
pouvait donc, sur tout le workspace : lister la bibliothèque, charger dans son
presse-papier puis coller le contenu de builds **jamais partagés**, les
télécharger en `.schem`/`.litematic`, et **supprimer définitivement** n'importe
quelle schematic enregistrée (fichier `unlink` + ligne `DELETE`).

Le seul contrôle restant était l'expiration ou la révocation du lien.

**Correction.** `req.we` porte désormais `session` (true sur la voie scoped, où
cookie et appartenance au workspace sont déjà vérifiés ; false sur la voie
token). Un `requireSession` garde les cinq routes de portée workspace.

L'import reste ouvert aux liens « edit » — charger un fichier dans *son*
presse-papier pour le coller dans le build partagé est exactement ce que le lien
autorise — mais `save=true` est ignoré hors session, donc un partage n'écrit
jamais dans la bibliothèque commune. **Aucune capacité n'est retirée aux membres
du workspace.** `GET /state` expose `library` et le client masque le panneau 📚
sur un partage plutôt que d'afficher des boutons qui répondraient 403.

**Contre-épreuve.** Garde neutralisée → le test de régression échoue ; garde en
place → il passe. Le test n'est pas décoratif.

---

## V3 · SMTP : repli silencieux en clair

**Faille (CWE-319).** `createTransport` était appelé avec `secure` seul. Sur les
ports non-465 (587 par défaut), `secure: false` demande à nodemailer de négocier
STARTTLS — mais sans `requireTLS`, la négociation est *opportuniste* : si le
serveur n'annonce pas STARTTLS dans sa bannière EHLO, **la session continue en
clair**.

Deux façons d'y arriver : un serveur mal configuré, ou un actif réseau qui retire
la capacité de la bannière (« STARTTLS stripping ») — attaque active classique et
silencieuse, puisque l'envoi réussit. Partaient alors sur le fil : `SMTP_PASS`
(AUTH PLAIN/LOGIN est du base64, pas du chiffrement) et le contenu des messages,
c'est-à-dire **les messages du formulaire de contact** — nom, adresse e-mail et
texte libre de visiteurs — ainsi que les digests.

**Correction.** `requireTLS: !secure` : dès que la connexion n'est pas déjà
chiffrée de bout en bout, le chiffrement devient une exigence et non une
préférence. Un envoi qui échoue bruyamment vaut mieux qu'un mot de passe sur le
fil. Ajout de `tls.minVersion: 'TLSv1.2'`. Aucun changement pour une
configuration SMTP correcte.

---

## Ce qui a été vérifié et jugé sain

Passé en revue sans trouver de faille exploitable :

- **Injections SQL** — 100 % des requêtes en *prepared statements*
  (better-sqlite3). Les rares noms de tables interpolés
  (`db.js#listAll/insert/…`, `slugify.js#uniqueSlug`, `ensureColumn`) viennent
  tous de constantes de module (`PUBLIC_COLLECTIONS`, `COLLECTIONS`) ou de
  littéraux d'appel, jamais d'une entrée requête. Les clauses `IN (…)`
  construites dynamiquement (`me.js`, `calendar.js`, `quests.js`) ne concatènent
  que des `?`, avec les valeurs liées.
- **XSS** — aucun `innerHTML`. Le seul `dangerouslySetInnerHTML` du dépôt injecte
  des keyframes CSS constantes (`project/detail/Ambient.jsx:16`). Les deux
  moteurs Markdown maison (`writing/markdown.jsx`, `lore/markdown.jsx`) ne
  produisent que des éléments React — donc échappés — et filtrent les `href` par
  allowlist de schéma (`http(s)`, `/`, `#`), ce qui bloque `javascript:` et
  `data:`. `rel="noopener noreferrer"` partout où `target="_blank"` apparaît.
  `builds.js#normalizeExternalUrl` refuse tout schéma hors http(s).
- **CSRF** — cookie `SameSite=Strict` + CORS `origin: false` en prod. Le repli
  `Authorization: Bearer` n'ouvre rien (un site tiers ne peut pas poser cet
  en-tête sans préflight autorisé).
- **SSRF** — un seul `fetch` sortant (Nominatim), URL constante, coordonnées
  validées numériquement et bornées (±90/±180), sérialisé, timeout 8 s.
  `CANONICAL_ORIGIN` obligatoire en prod : aucune URL n'est dérivée de l'en-tête
  `Host`.
- **RCE** — aucun `child_process`, `eval`, ni `new Function` dans `server/` ou
  `src/`.
- **Traversée de chemin** — les endpoints de fichiers (`/api/audio/:f`,
  `/api/images/:f`, `/api/lore/media/file/:f`) appliquent une regex sur le nom
  **et** exigent que le nom existe en base ; `sendFile` est borné par `root`. Les
  fichiers sont stockés sous UUID + extension assainie.
- **Pollution de prototype** — aucune écriture à clé contrôlée par
  l'utilisateur ; les rares `obj[k] = …` portent sur des données NBT/palette
  internes, jamais sur un corps de requête.
- **Autorisations** — `resolveWorkspace` filtre systématiquement ; les 50
  endpoints de `minecraft.js`, ainsi que `documents`/`builds`/`features`/`tags`/
  `meetings`, vérifient tous l'appartenance au workspace **avant** de muter par
  id. `comments.js#canAccessTarget` bloque l'IDOR inter-projets. `vault.js`
  répond 404 (et non 403) sur un plan inaccessible, sans bypass admin. Les
  modules globaux (quêtes, lore, atelier, stairs) sont gardés par leur flag.
- **Anti-pivot admin** — un admin ne peut réinitialiser ni son propre mot de
  passe ni celui d'un autre admin via `/api/users/:id` (CWE-620) ; le
  self-service exige le mot de passe courant, bumpe `token_version` et journalise.
- **Secrets** — rien de sensible dans le dépôt ; `.gitignore` couvre `.env`,
  `data.sqlite*`, `uploads/`, le dump de recettes confidentiel. secretlint +
  gitleaks (historique complet) en CI, secretlint en pre-commit.
- **Vie privée / RGPD** — analytics sans cookie ni IP brute (hash salé à
  rotation quotidienne, sel dédié dérivé par HMAC), rétention 7 jours, referrer
  réduit au hostname, query strings purgées, back-office exclu. L'en-tête
  géo n'est lu que si `GEO_COUNTRY_HEADER` est explicitement configuré — sinon il
  serait falsifiable.
- **En-têtes / DoS** — helmet avec CSP explicite, HSTS prod, `frameAncestors:
  none`. Rate-limiting global + par endpoint sensible, compteur persistant SQLite
  (insensible aux redémarrages) et **deuxième limiteur par compte** qui couvre
  l'attaque distribuée. `headersTimeout` (Slowloris), `requestTimeout`,
  anti-zip-bomb sur le parsing Anvil, volumes de sélection WorldEdit bornés.

---

## Risques résiduels

Aucun n'est bloquant ; ils sont classés par rapport valeur/effort.

1. **GHSA-qwww-vcr4-c8h2 (react-router)** — non atteignable ici (cf. V1), exempté
   jusqu'au **2026-11-01**. À réévaluer à cette date : si `react-router-dom` 7.x
   reçoit un correctif rétroporté, l'exemption saute ; sinon, décider
   consciemment de la repousser ou de migrer en v8.
2. **Jetons secrets stockés en clair** (`ical_token`, `cockpit_token`,
   `blueprint_shares.token`, `minecraft_blueprints.share_token`). Un accès en
   lecture à la base (sauvegarde égarée) donne des capacités directement
   rejouables. Les stocker hachés (SHA-256, comparaison sur le haché) coûte une
   migration ; nginx exclut déjà ces URL des logs. **Non corrigé ici** : la
   migration touche 4 tables et plusieurs flux, hors du périmètre « correctifs
   minimaux et sûrs » demandé.
3. **Pas de 2FA** sur les comptes admin. Le mot de passe est le seul facteur ;
   les défenses actuelles (politique 12 caractères + denylist, double
   rate-limit IP et compte, `token_version`, anti-pivot) rendent le brute-force
   peu praticable, mais ne couvrent pas le phishing.
4. **Validation des images par extension + MIME déclaré**, pas par *magic
   bytes*, sur `POST /api/images` et l'upload membre. L'impact est limité : sharp
   recompresse tout ce qu'il sait lire, les fichiers sortent sous une extension
   image (donc `Content-Type` image + `nosniff`), et le module Lore rejette déjà
   en 415 ce que sharp ne décode pas. Aligner `/api/images` sur cette politique
   (rejet plutôt que conservation de l'original) fermerait le sujet.
5. **`GET /api/workspaces` expose `memberIds`** de chaque workspace visible.
   Fuite mineure (identifiants numériques, pas d'e-mails) entre membres d'un même
   projet.
6. **Un lien de partage « edit » reste puissant** sur le build visé : réécriture
   des régions et export `.mca` complet. C'est le contrat du lien, mais il mérite
   d'être rappelé à qui le crée — préférer une expiration courte.
7. **Suppression sans confirmation serveur** dans le module Stairs : tout
   porteur du flag `can_view_stairs` peut éditer ou supprimer l'entrée d'un
   autre. C'est le choix de conception assumé (« set partagé »), pas une faille —
   signalé pour mémoire.

---

## Chaîne de vérification

Après chaque correctif : `npm run build` ✓ et `npm test` ✓.

| Étape | Tests | Build |
|---|---|---|
| Base | 352/352 | ✓ |
| Après V1 (dépendances) | 352/352 | ✓ |
| Après V2 (WorldEdit) | 353/353 | ✓ |
| Après V3 (SMTP) | 358/358 | ✓ |

`npx eslint server/ src/ test/` : 0 erreur (152 avertissements
`detect-object-injection`, tous sur des accès indexés internes — bruit connu).
`node scripts/audit-gate.mjs` : vert, avec 1 exemption documentée.
