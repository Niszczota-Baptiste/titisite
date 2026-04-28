import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { db, migrate } from './db.js';
import { ensureSeedUsers } from './users.js';
import { createWorkspace, findBySlug } from './workspaces.js';

// Test data for the site launch: an 8-week bass training program shaped as a
// kanban workspace. Idempotent — if the workspace already exists, we leave it
// alone so re-runs don't duplicate cards.

const WORKSPACE = {
  slug: 'programme-basse',
  name: 'Programme Basse — 8 Semaines',
  description: [
    'Profil : Batteur + Producteur Ableton avancé + Bassiste 1 an.',
    'Volume : 4-6h/semaine (≈40h sur 8 semaines).',
    'Styles cibles : Pop/J-rock (DAY6) + Métal/prog.',
    'Objectif : avoir la technique pour jouer ce que ton cerveau imagine.',
  ].join(' '),
  color: '#8b5cf6',
  icon: '🎸',
  tags: ['musique', 'basse', 'training'],
};

const CARDS = [
  {
    title: 'Diagnostic main droite',
    week: 1,
    category: 'Technique',
    description: [
      "Filme ta main droite en jouant un passage rapide d'un morceau métal/prog que tu aimes. Identifie ce qui cloche.",
      '',
      '**Critère de validation** : Tu as un BPM de référence + 2 défauts identifiés pour mesurer tes progrès.',
      '',
      '**Ressources** : Talkingbass — "Right Hand Technique Diagnostic"',
    ].join('\n'),
    subtasks: [
      'Filmer 30 sec en jouant à ta vitesse max actuelle',
      'Identifier : tension dans le poignet ? doigts qui se relèvent trop ? attaque irrégulière ?',
      'Noter ta vitesse max "propre" actuelle (BPM, croches)',
    ],
  },
  {
    title: 'Exercice de chromatisme 1-2-3-4',
    week: 1,
    category: 'Technique',
    description: [
      "L'exercice fondamental main droite + main gauche. Beaucoup plus exigeant qu'il n'en a l'air.",
      '',
      '**Critère de validation** : 3 minutes à 80 BPM en croches sans aucune double-attaque du même doigt.',
      '',
      '**Ressources** : YouTube — Mark J Smith "Permutations Exercise"',
    ].join('\n'),
    subtasks: [
      'Pattern 1234 sur chaque corde, alternance stricte index/majeur',
      'À 60 BPM en croches, 5 minutes sans rupture',
      'Monter à 80 BPM seulement quand 60 est parfait',
      'Variante : 1324, 1432, 4321 (sur 1 corde) à 60 BPM',
    ],
  },
  {
    title: 'Octaves sans regarder',
    week: 2,
    category: 'Technique / Théorie',
    description: [
      "Les yeux fermés, trouver toutes les octaves d'une note donnée sur le manche. C'est LE skill qui débloque le jeu sans regarder.",
      '',
      '**Critère de validation** : Tu trouves les 5 positions d\'une note les yeux fermés en moins de 15 secondes.',
      '',
      '**Ressources** : Talkingbass — "Fretboard Visualization"',
    ].join('\n'),
    subtasks: [
      'Yeux fermés, jouer un Do en case 8 corde E, puis trouver les 4 autres Do sur le manche',
      'Idem pour Fa, Sol, Sib, Mi',
      'Refaire en boucle pendant 10 min/séance',
    ],
  },
  {
    title: 'Triades majeures/mineures sur 4 cordes',
    week: 2,
    category: 'Théorie / Technique',
    description: [
      'Tu connais les triades via le piano roll. Là tu les internalises au manche.',
      '',
      '**Critère de validation** : Tu enchaînes triades C → Am → F → G en 4 positions différentes du manche sans regarder.',
      '',
      '**Ressources** : YouTube — Scott\'s Bass Lessons "Triads Mastery"',
    ].join('\n'),
    subtasks: [
      'Jouer triades majeures 1-3-5 sur 4 inversions de Do',
      'Idem en Sol et Ré majeur',
      'Variante mineure (1-b3-5) sur Am, Em, Dm',
      'Test : sur backing track 1 accord, balader la triade tout le manche',
    ],
  },
  {
    title: 'Travail au métronome — méthode "5 BPM"',
    week: 3,
    category: 'Technique',
    description: [
      'Méthode brutalement efficace : jouer 1 minute parfaite à BPM X, puis +5. Si rupture → retour à X-5. Le seul moyen scientifique de gagner en vitesse.',
      '',
      '**Critère de validation** : Tu joues 1 min à BPM_initial + 20 sans rupture d\'alternance.',
      '',
      '**Ressources** : Talkingbass — "Building Speed for Bass"',
    ].join('\n'),
    subtasks: [
      'Pattern 1234 en croches, partir 10 BPM sous ta vitesse confortable',
      'Monter par paliers de +5 BPM/jour, 1 minute parfaite à chaque palier',
      'Tenir un journal des BPM atteints',
      'Objectif fin de semaine : +20 BPM par rapport au BPM de référence (semaine 1)',
    ],
  },
  {
    title: 'Galops métal (croche + 2 doubles)',
    week: 3,
    category: 'Technique / Style',
    description: [
      'Pattern rythmique fondamental du métal. Tu le sens naturellement (batteur), reste à l\'incarner aux doigts.',
      '',
      '**Critère de validation** : Galop tenu 2 minutes à 120 BPM sans tension dans l\'avant-bras.',
      '',
      '**Ressources** : YouTube — "Metal Bass Gallop Technique"',
    ].join('\n'),
    subtasks: [
      'Pattern "1 - 2 et" à 80 BPM sur corde de Mi à vide',
      'Doigté : index pour la croche, M-I pour les doubles',
      'Monter à 120 BPM (très lent pour du métal mais c\'est l\'objectif propre)',
      'Appliquer sur un riff Iron Maiden simple ("The Trooper" intro)',
    ],
  },
  {
    title: 'Sessions longues sans regarder',
    week: 4,
    category: 'Technique',
    description: [
      'L\'endurance se construit par des sessions volontairement longues à BPM modéré, pas par l\'intensité.',
      '',
      '**Critère de validation** : Tu tiens 20 min de jeu continu sans regarder ta main gauche.',
      '',
      '**Ressources** : Songsterr pour les tabs DAY6',
    ].join('\n'),
    subtasks: [
      'Jouer "Time of Your Life" 3 fois de suite sans regarder le manche',
      'Choisir 1 morceau J-rock et faire pareil (suggestion : "Congratulations" - DAY6)',
      'Session de 20 minutes non-stop sur un backing track au choix',
    ],
  },
  {
    title: 'Lignes prog en lecture lente',
    week: 4,
    category: 'Répertoire / Technique',
    description: [
      'Le prog te donne des défis techniques + métriques irrégulières (terrain de jeu pour batteur).',
      '',
      '**Critère de validation** : Passage joué 3x de suite sans erreur à vitesse originale.',
      '',
      '**Ressources** : Songsterr / GuitarPro tabs ralenties',
    ].join('\n'),
    subtasks: [
      'Choisir 8 mesures d\'une ligne Tool, Karnivool, Periphery ou Polyphia',
      'La travailler à 50% vitesse originale jusqu\'à exécution parfaite',
      'Monter à 75% puis 100% par paliers',
    ],
  },
  {
    title: 'Thumb (T) pur',
    week: 5,
    category: 'Technique',
    description: [
      'Le slap n\'est pas qu\'une technique, c\'est une grammaire. On commence par le pouce seul.',
      '',
      '**Critère de validation** : Son slap clair (pas étouffé, pas métallique) à 80 BPM en noires régulières.',
      '',
      '**Ressources** : YouTube — Marlowe DK "Slap Bass Lesson 1" / Scott\'s Bass Lessons "Slap Bass Foundations"',
    ].join('\n'),
    subtasks: [
      'Position pouce parallèle aux cordes, attaque depuis le poignet (pas le bras)',
      'T sur corde de Mi à vide, 60 BPM, 5 min',
      'Alterner T sur Mi et La à vide (1-1-2-2)',
      'Tester sur drone funky dans Ableton',
    ],
  },
  {
    title: 'Pop (P) avec index',
    week: 5,
    category: 'Technique',
    description: [
      'Le complément du thumb. C\'est le contraste T/P qui crée le groove slap.',
      '',
      '**Critère de validation** : Pattern T-T-P-T joué 1 min à 90 BPM sans rupture.',
      '',
      '**Ressources** : YouTube — "Slap Bass for Beginners" (BassBuzz)',
    ].join('\n'),
    subtasks: [
      'Pop index sur corde de Sol, 60 BPM',
      'Pattern T-P-T-P alterné Mi/Sol à 60 BPM',
      'Pattern "T-T-P-T" classique funk',
      'Enregistrer 30 sec dans Ableton, écouter au casque la propreté',
    ],
  },
  {
    title: 'Slap sur grille',
    week: 6,
    category: 'Technique / Composition',
    description: [
      'Sortir des exercices, créer une vraie ligne slap.',
      '',
      '**Critère de validation** : 8 mesures slap groovy enregistrées, qui tiennent dans un mix.',
      '',
      '**Ressources** : Backing tracks YouTube "funk slap backing track"',
    ].join('\n'),
    subtasks: [
      'Sur grille Em-C-G-D, écrire une ligne slap simple T-P par mesure',
      'L\'enregistrer dans Ableton avec drums',
      'Comparer ton son slap au reste du mix : trop fort ? trop fin ?',
    ],
  },
  {
    title: 'Palm mute pour le métal',
    week: 6,
    category: 'Technique / Style',
    description: [
      'Le palm mute donne le côté "moteur" des basses métal. Articulation essentielle.',
      '',
      '**Critère de validation** : Tu passes muté/clair sans rupture rythmique.',
      '',
      '**Ressources** : YouTube — "Palm Mute Bass Metal"',
    ].join('\n'),
    subtasks: [
      'Position paume main droite près du chevalet',
      'Galop palm muté à 100 BPM',
      'Alterner 2 mesures muté / 2 mesures clair sur même riff',
      'Ajouter ça à ton riff métal de la semaine 3',
    ],
  },
  {
    title: 'Transcrire au manche tes propres compos MIDI',
    week: 7,
    category: 'Synthèse',
    description: [
      'L\'exercice le plus rentable de tout le programme pour ton profil. Tu prends une ligne que TU as composée au piano roll et tu apprends à la jouer au manche.',
      '',
      '**Critère de validation** : Tu joues ta ligne par cœur, sans la tab, en synchro avec le projet Ableton.',
      '',
      '**Ressources** : Tes propres projets',
    ].join('\n'),
    subtasks: [
      'Choisir une ligne de basse MIDI d\'une de tes compos récentes',
      'Imprimer/noter les notes (octave par octave)',
      'La jouer lentement au manche, trouver les meilleurs doigtés',
      'La jouer en synchro avec ta version MIDI dans Ableton',
    ],
  },
  {
    title: 'Réenregistrer 1 morceau (MIDI → basse réelle)',
    week: 7,
    category: 'Production / Composition',
    description: [
      'Remplacer la basse MIDI d\'un de tes morceaux par une vraie prise basse. Mix inclus.',
      '',
      '**Critère de validation** : Tu as un bounce du morceau avec ta basse réelle, qui tient face à la version MIDI.',
      '',
      '**Ressources** : Plugins basse Ableton (Amp / Cabinet) ou Neural DSP si tu en as',
    ].join('\n'),
    subtasks: [
      'Choisir 1 morceau fini où la basse est en MIDI',
      'Apprendre la ligne (de la semaine 7 carte 1)',
      'Enregistrer en DI dans Ableton (carte son)',
      'Comparer A/B : MIDI vs prise réelle. Qu\'est-ce qui change ? Quel mix ?',
    ],
  },
  {
    title: 'Compo 1 — Pop/J-rock',
    week: 8,
    category: 'Composition',
    description: [
      'Composer une ligne en partant de la basse, pas du piano roll. Inverser ta démarche habituelle.',
      '',
      '**Critère de validation** : Morceau pop/J-rock 2 min minimum, ligne de basse jouée en vrai.',
      '',
      '**Ressources** : Inspirations — DAY6 "Congratulations", "Sweet Chaos"',
    ].join('\n'),
    subtasks: [
      'Improviser un riff de basse seul (5 min libre dans Ableton)',
      'Construire le morceau autour de ce riff (drums puis accords)',
      'Couplet + refrain minimum',
    ],
  },
  {
    title: 'Compo 2 — Métal/prog',
    week: 8,
    category: 'Composition',
    description: [
      'Pousser ta technique acquise dans un contexte créatif intense.',
      '',
      '**Critère de validation** : Morceau prog/métal 2 min, ligne basse réelle, structure non triviale.',
      '',
      '**Ressources** : Inspirations — Tool, Karnivool, Polyphia, Periphery',
    ].join('\n'),
    subtasks: [
      'Riff palm muté + galop comme moteur principal',
      'Au moins 1 changement de signature ou tempo (terrain batteur)',
      'Ligne de basse enregistrée en vrai, pas en MIDI',
    ],
  },
  {
    title: 'Bilan + plan suivant',
    week: 8,
    category: 'Méta',
    description: [
      'Faire le point objectif sur tes progrès.',
      '',
      '**Critère de validation** : Document de bilan + 1 objectif clair pour la suite.',
      '',
      '**Ressources** : Tes propres enregistrements',
    ].join('\n'),
    subtasks: [
      'Comparer ton diagnostic main droite (S1) à ton niveau actuel : combien de BPM gagnés ?',
      'Réécouter une compo d\'avant programme vs une nouvelle',
      'Choisir le focus du prochain cycle (tapping ? jazz ? 5 cordes ?)',
    ],
  },
];

function categoryTags(category) {
  return category.split('/').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function seedBassProgram() {
  migrate();
  ensureSeedUsers();

  const existing = findBySlug(WORKSPACE.slug);
  if (existing) {
    return { skipped: true, reason: 'workspace_already_exists', workspaceId: existing.id };
  }

  const admin = db.prepare(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`).get();
  if (!admin) throw new Error('no_admin_user — set ADMIN_EMAIL/ADMIN_PASSWORD and run seed first');

  const memberIds = db.prepare(`SELECT id FROM users`).all().map((r) => r.id);

  const ws = createWorkspace(
    {
      slug: WORKSPACE.slug,
      name: WORKSPACE.name,
      description: WORKSPACE.description,
      color: WORKSPACE.color,
      icon: WORKSPACE.icon,
      tags: WORKSPACE.tags,
      memberIds,
    },
    admin.id,
  );

  const insertFeature = db.prepare(`
    INSERT INTO features
      (workspace_id, title, description, status, priority, assignee_id, created_by, position, due_date, tags, subtasks)
    VALUES (?, ?, ?, 'backlog', ?, NULL, ?, ?, NULL, ?, ?)
  `);

  const tx = db.transaction(() => {
    CARDS.forEach((card, idx) => {
      const tags = [`semaine-${card.week}`, ...categoryTags(card.category)];
      const subtasks = card.subtasks.map((d) => ({ d, done: false }));
      const priority = card.week <= 2 ? 'high' : card.week <= 6 ? 'medium' : 'low';
      insertFeature.run(
        ws.id,
        card.title,
        card.description,
        priority,
        admin.id,
        idx,
        JSON.stringify(tags),
        JSON.stringify(subtasks),
      );
    });
  });
  tx();

  return {
    inserted: CARDS.length,
    workspaceId: ws.id,
    workspaceSlug: ws.slug,
    members: memberIds.length,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = seedBassProgram();
  console.log('[seed-bass-program]', JSON.stringify(result, null, 2));
  process.exit(0);
}
