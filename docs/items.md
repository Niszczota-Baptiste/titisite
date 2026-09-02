# Module « Items customs Minefield » (`/items`)

La base de données des objets customs du serveur : l'atelier des scribes et des
admins Minefield. Reprend le classeur *« BASE DE DONNÉE DES ITEMS CUSTOMS SUR
MINEFIELD »* (v1.0, xadrow) et lui ajoute ce qu'un tableur ne peut pas faire —
un **calcul de puissance**, un **contrôle d'unicité des CMD** et une vue
d'équilibrage.

Le classeur source énonçait trois objectifs ; ce sont les onglets :

| Objectif du document | Onglet |
|---|---|
| « recenser tous les items custom créés » | 📦 Catalogue |
| « servir d'exemple pour des futurs scribes » (donc pouvoir dire si un item est équilibré) | ⚖️ Équilibrage |
| « garder un œil sur les CMD pour pouvoir ajouter des nouveaux assets graphiques » | 🎨 CMD |
| — (règle le barème du calcul) | ⚙️ Référentiel |

## Patron

Module **global** sur le modèle des quêtes et du lore : routeur `/api/items`
(`server/routes/items.js`), moteur et accès données dans `server/items/*`, front
`src/components/items/*` + page `src/pages/Items.jsx`. Deux flags :
`users.can_view_items` ouvre la consultation, `users.can_edit_items`
l'écriture — et implique la lecture. Les admins passent outre les deux.

Entrée de menu : lien « 🧪 Items customs » de l'onglet Minecraft des projets,
rendu **uniquement** si `canViewItems` (`?projet=<slug>` pour le lien de retour,
mémorisé en session comme sur `/quetes` et `/lore`).

Volontairement **séparé de `quest_custom_items`** : celui-là est le catalogue de
butin des joueurs (géodes, monnaies, prix de rachat, journaux d'ouverture),
celui-ci est l'atelier de conception (CMD, commande `/give`, équilibrage). Un
pont facultatif les relie — `mf_items.unique_item_id`, `ON DELETE SET NULL` —
pour quand un item conçu ici entre en jeu et devient du butin.

## Données (préfixe `mf_`, dans `db.js#migrate`)

- `mf_item_tiers` — l'échelle des paliers, **ordonnée et éditable**. Le serveur
  en fait déjà coexister deux (`echelle` : `standard` Commun→Artefact, et
  `trefonds` Banal→Légendaire) et d'autres suivront : une table, pas un enum.
  `budget` = les points qu'un item de ce palier est censé coûter.
- `mf_item_series` — les deux premiers chiffres du CMD (`code`, unique). « 01 »
  réserve la plage 1001–1999.
- `mf_item_panoplies` — les sets (Rossignol, Corbeau, ancestral…). `taille` = ce
  que la panoplie compte **en jeu**, donc « 3/5 documentées » est dérivé.
- `mf_items` — l'item. Toutes les colonnes du tableur, plus `statut`
  (`a_tester` / `en_jeu` / `abandonne`) : le document marquait « pas encore en
  jeu » par une **couleur de cellule**, information qu'aucune requête ne pouvait
  atteindre ; ici c'est une colonne, donc un filtre.
- `mf_item_attributes` — un modificateur par ligne. `mode` (`flat` / `pourcent`)
  distingue les deux opérations vanilla que le tableur note « 4 » et « −15 % » :
  *add* (Operation 0) et *multiply_base* (Operation 1). Sans ce champ, « +4 » et
  « +4 % » seraient indiscernables et aucun calcul n'aurait de sens.
- `mf_item_enchants` — un enchantement par ligne. Le drapeau **incassable** y
  voyage sous la clé réservée `unbreakable_flag` : c'est une propriété de
  l'item, mais lui donner une colonne pour un booléen ne valait pas une
  migration. Il ressort en `item.unbreakable`, jamais dans la liste.
- `mf_power_weights` — le barème du calcul, éditable en ligne.

Deux index méritent d'être signalés : `idx_mf_items_cmd` est **unique** (deux
items qui partagent un CMD cassent silencieusement le modèle de l'un des deux
dans le resource pack), et les slugs le sont aussi.

## Le calcul de puissance

Fonctions **pures** dans `server/items/power.js`, testées dans
`test/item-power.test.js`. Jamais stockée : recalculée à la lecture depuis le
barème courant — une valeur figée se serait désynchronisée au premier poids
corrigé, et c'est exactement l'incohérence que ce module existe pour supprimer.

```
puissance = poids(matériau) × coefficient(classe)      ← l'item de base
          + Σ (valeur × poids)  sur les attributs      ← les stats
          + Σ (niveau × poids)  sur les enchantements  ← les effets
          + forfait « incassable »
```

**La rareté ne multiplie pas la puissance.** Un multiplicateur « ×0,4 parce que
c'est un Commun » écraserait précisément l'anomalie qu'on cherche à voir — un
Commun aussi fort qu'un artefact obtiendrait un petit score. Elle entre par
`mf_item_tiers.budget`, et l'indice `puissance / budget` est le signal
d'équilibrage. La puissance seule reste comparable d'un palier à l'autre.

Quatre verdicts : `ok`, `sur`, `sous` — et `incomplet`, qui n'est **pas** une
nuance de `sous` : un item sans le moindre attribut ni enchantement a une fiche
à documenter, pas un équilibrage à revoir. Deux gestes différents, deux mots
différents.

Un pourcentage est d'abord ramené en unité plate via `reference` (MOVEMENT_SPEED
−15 % → −0,15 × 0,1 = −0,015) : sans cette conversion, un « % » et un « point »
seraient sommés comme s'ils partageaient une unité. Le détail affiché sur la
fiche montre la conversion en clair, pour qu'un score contesté se vérifie sans
lire le code.

`suggestTier()` propose le palier dont le budget est le plus proche, **à échelle
constante** — suggérer « Honorable » (Tréfonds) pour une épée de la guilde
d'explorateurs n'aurait aucun sens. Sans tier déclaré, on retombe sur l'échelle
`standard` plutôt que de tirer au hasard entre les deux.

### Régler le barème

Onglet Référentiel → Barème. Les poids sont en base et s'éditent en ligne :
quand un score sonne faux, on corrige le poids fautif — pas l'item. Le bouton
« ↺ Barème par défaut » réinsère les valeurs d'amorçage de `defaultWeights()`.

Les budgets d'amorçage sont **étalonnés sur le corpus du classeur lui-même** :
la pièce d'artefact la mieux documentée (Écailles princières des Grands Fonds)
pèse 224 points, d'où un budget d'artefact à 230 plutôt qu'un chiffre rond.

## La commande `/give`

`server/items/command.js`, pure et testée. Deux commandes coexistent sur une
fiche, et c'est délibéré :

- **régénérée** (`item.commandeGeneree`) — dérivée des champs, donc toujours
  d'accord avec eux ; le tableur la recopiait à la main et elle dérivait dès
  qu'un attribut bougeait ;
- **saisie** (`mf_items.commande`) — conservée telle quelle, **jamais
  interprétée**. Certaines commandes du classeur font des choses qu'aucun
  formulaire ne modélise (le `LodestonePos` de la boussole piaf, les couleurs de
  nom).

Deux pièges traités : les **UUID** des modificateurs sont déterministes
(`uuidFor`, dérivé du slug) — tirés au hasard, la commande changerait à chaque
affichage et un diff ne dirait plus rien ; et l'**apostrophe** est échappée dans
les littéraux SNBT (`Lore:['[{"text":"sous l'eau"}]']` ferme la chaîne au milieu
du mot — le classeur source en contient plusieurs, cassées).

## CMD

`GET /api/items/series/:id/next-cmd` propose le prochain numéro libre de la
série. Le classeur demande de « rester dans l'ordre croissant » pour que le
resource pack reste réalisable ; un tableur ne peut que le demander, ici le
serveur le tient. L'onglet CMD affiche aussi les **trous** de numérotation : un
numéro sauté est un modèle que le pack n'aura jamais.

Un CMD déjà pris répond **409** en nommant l'item qui le détient, plutôt que de
laisser l'index unique échouer sans message. Un **code de série** en doublon
répond de même (`code_taken`).

## Seed

`server/seed-items.js` — les données réelles du classeur (51 items, 10 paliers,
9 séries, 7 panoplies), pas un jeu de démonstration. **Idempotent ligne par
ligne**, clé **(série, nom)** — et pas le nom seul, parce que l'onglet Nostra
reprend les neuf pièces de la guilde d'explorateurs sous les mêmes noms. Ce
choix, plutôt qu'un court-circuit au premier enregistrement, laisse une version
ultérieure du classeur ajouter ses items sans écraser ce que les scribes ont
retouché en ligne. `SEED_ITEMS=off` pour ne rien insérer.

### Ce que le `.xlsx` porte et que le PDF perdait

Le seed est extrait du **classeur**, pas de son export PDF, parce que trois
informations dont ce module dépend ne survivent pas à l'export texte :

- **La couleur de police.** « Les items en rouges ne sont pas encore introduits
  en jeu et doivent être testés/équilibrés » — c'est la seule marque de statut
  du document. Rouge → `a_tester`, noir → `en_jeu`.
- **Le format de cellule.** « 0.05 » affiché « 5 % » est un modificateur
  Operation 1 (multiply_base) ; « 4.0 » sans format est un ajout brut
  (Operation 0). Le PDF ne montrait que le rendu, jamais la valeur. Cas
  particulier : une cellule où la valeur a été tapée en toutes lettres
  (`pls 5% (0.05)`) est lue comme un pourcentage d'après le signe `%` de son
  texte — sinon « 5 » deviendrait +5 blocs/tick, trente fois la vitesse de
  marche.
- **Le nom des onglets**, qui porte le code de série : 01 guilde explo,
  02 Nostra, 03 St. Philippe, 04 Tréfonds, 05 Rafvenwout, 06 Ondiens, 07 Nous,
  08 peuple piaf, 99 autres. Les trois séries encore vides sont créées quand
  même : une série sans item est une plage de CMD réservée.

Deux pièges d'extraction, traités : les entêtes ne sont pas aux mêmes colonnes
d'un onglet à l'autre (la commande `/give` est en BA sur l'un, en BB sur
l'autre ; la liste des enchantements se décale d'une colonne dans l'onglet
Tréfonds), et l'entête du palier y est noyé dans une phrase (« TIER   NB:
système trefonds: Banal, correct… »). Les colonnes sont donc repérées par le
**début** de leur libellé, jamais par leur lettre.

### La commande `/give` fait foi

Huit lignes en portent une. Quand elle contredit les colonnes, c'est elle qui
est reprise — c'est elle qui tourne en jeu — et l'écart est noté sur la fiche :

- la **Jupette des Chants éternels** annonce 20 d'armure en colonne, 8 dans sa
  commande ;
- le **Trident des fonds marins** a son « 10 » dans la colonne *Infinity* alors
  que sa commande dit `impaling`, et ses deux vitesses (main principale +20 %,
  main secondaire +40 %) ne tiennent pas dans une cellule ;
- le **Tentacule d'honneur** est `tentacle` en colonne, `minefield:tentacle`
  dans la commande.

Le lore vient aussi de la commande quand elle existe : la colonne DESCRIPTION
aplatit sur une ligne ce que `Lore:[…]` découpe en deux.

### Ce qui reste absent, et qu'on n'invente pas

- **Aucun CMD n'est renseigné** dans le classeur : ils restent vides, et
  l'onglet CMD propose le prochain numéro libre de la série.
- **Cinq pièces des sets Colombe et Louve n'ont pas de nom** : il est déduit de
  la panoplie et de l'item de base, avec une `note` qui le dit.
- Le **« Set du Faulcon »**, cité quatre fois sans aucune pièce nommée, existe
  comme panoplie vide de taille 4 — inventer quatre items aurait été pire.
- Les **fautes de frappe du classeur sont conservées** (« Epée batarde »,
  « Haume du Corbeau », « vilalge piaf ») : ce sont les noms des scribes, à
  corriger dans l'application, pas au passage d'un import.
- Le `slot` d'un modificateur est **déduit de l'item de base** (un casque agit
  sur la tête) : le classeur n'a pas de colonne pour ça, et sans slot un bonus
  d'armure s'appliquerait dans tous les emplacements à la fois. Les lignes qui
  portent une commande tiennent leur slot de la commande.

### Resynchronisation

Une première version de ce seed lisait le PDF et se trompait de codes de série
(Tréfonds en 03, Ondiens en 04), déduisait le statut de la présence d'une
commande faute de couleurs, et manquait l'onglet Rafvenwout. Une **passe unique**
(`resyncDepuisClasseur`, flag `mf_items_source_xlsx` dans `site_settings`,
même patron que `item_sets_backfilled`) supprime les items **encore intacts** —
`created_by IS NULL AND updated_by IS NULL AND updated_at = created_at`, donc
insérés par le seed et jamais réenregistrés — et les recrée depuis le classeur.
Un item créé ou retouché en ligne n'est jamais touché ; c'est ce que vérifie
`test/items-seed.test.js`.

## API

Tout est derrière `requireAuth` + le gate de lecture ; les écritures exigent en
plus `can_edit_items`.

| Route | Rôle |
|---|---|
| `GET /api/items/ref` | tout le référentiel en un appel (le formulaire en a besoin d'un coup) |
| `GET /api/items` | liste filtrée (`q`, `tier`, `serie`, `panoplie`, `statut`, `acquisition`) |
| `GET /api/items/:idOrSlug` | fiche complète, puissance et commande comprises |
| `POST /api/items/power` | puissance d'un **brouillon** non enregistré (aperçu du formulaire) |
| `POST\|PUT\|DELETE /api/items[/:id]` | CRUD (édition) |
| `GET\|POST\|PUT\|DELETE /api/items/tiers[/:id]`, `.../series`, `.../panoplies` | référentiel |
| `GET /api/items/series/:id/next-cmd` | prochain CMD libre |
| `GET /api/items/weights`, `PUT .../weights/:cle`, `POST .../weights/reset` | barème |

`POST /api/items/power` existe pour que l'aperçu du formulaire et le score
enregistré viennent de **la même implémentation**. Recalculer côté client irait
plus vite mais ferait exister deux formules, dont celle affichée pendant qu'on
règle un item.
