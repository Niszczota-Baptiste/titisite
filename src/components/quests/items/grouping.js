// Les axes de rangement du catalogue d'items — fonctions PURES, testées dans
// test/item-grouping.test.js.
//
// Un même catalogue se lit de plusieurs façons selon ce qu'on cherche : « quel
// équipement existe ? » n'est pas la même question que « qu'est-ce qui sort des
// géodes ? » ni que « qu'est-ce que vendent les Ondiens ? ». Plutôt qu'un
// classement imposé, la page offre un axe au choix — d'où ce module, qui ne
// connaît ni React ni le DOM et se contente de découper une liste en sections.
//
// Deux règles tiennent tout :
//   1. une section vide n'existe pas (on n'affiche pas « Consommable 0 ») ;
//   2. sur un axe MULTIVALUÉ — un objet sort de plusieurs contenants — l'objet
//      apparaît dans chaque section. Le compte total des sections dépasse alors
//      le nombre d'objets, et c'est voulu : ranger n'est pas partitionner.

/** Section « ce qui n'entre dans aucune case » — toujours en dernier. */
export const SANS = '__sans__';

/**
 * Découpe `items` en sections selon `axe`.
 * `ctx` fournit les référentiels nécessaires : { categories, categorieOrdre,
 * rarities, sets, factions }.
 * Renvoie [{ key, label, icon, color, items, multiple }] — `multiple` marque un
 * axe où un objet peut compter dans plusieurs sections.
 */
export function grouper(items, axe, ctx = {}) {
  const def = AXES[axe];
  if (!def) return null;
  return def.sections(items || [], ctx);
}

/** Construit les sections d'un axe à valeur unique, dans un ordre de référence. */
function parCle(items, cleDe, ordre, meta, labelSans) {
  const par = new Map();
  for (const it of items) {
    const cle = cleDe(it) ?? SANS;
    if (!par.has(cle)) par.set(cle, []);
    par.get(cle).push(it);
  }
  const suite = [...ordre, ...[...par.keys()].filter((k) => k !== SANS && !ordre.includes(k))];
  const sections = suite
    .filter((k, i) => par.has(k) && suite.indexOf(k) === i)
    .map((k) => ({ ...meta(k), key: String(k), items: par.get(k) }));
  if (par.has(SANS)) {
    sections.push({ key: SANS, label: labelSans, icon: '·', color: null, items: par.get(SANS) });
  }
  return sections;
}

const AXES = {
  aucun: {
    label: 'Sans sections',
    sections: () => null,
  },

  categorie: {
    label: 'Catégorie',
    sections: (items, { categories = {}, categorieOrdre = [] }) => parCle(
      items,
      // eslint-disable-next-line security/detect-object-injection -- clé issue du catalogue, lecture seule d'un objet littéral
      (i) => (categories[i.categorie] ? i.categorie : null),
      categorieOrdre,
      // eslint-disable-next-line security/detect-object-injection -- idem
      (k) => ({ label: categories[k]?.label || k, icon: categories[k]?.icon || '📦', color: null }),
      'Sans catégorie',
    ),
  },

  rarete: {
    label: 'Rareté',
    // L'échelle est ordonnée en base (`ordre` porte le sens) : on la suit à
    // l'envers, le plus remarquable en tête — c'est déjà le tri du catalogue.
    sections: (items, { rarities = [] }) => {
      const echelle = [...rarities].sort((a, b) => (b.ordre ?? 0) - (a.ordre ?? 0));
      const byId = new Map(echelle.map((r) => [r.id, r]));
      return parCle(
        items,
        (i) => (byId.has(i.rareteId) ? i.rareteId : null),
        echelle.map((r) => r.id),
        (k) => ({ label: byId.get(Number(k))?.nom || '?', icon: '◆', color: byId.get(Number(k))?.couleur || null }),
        'Rareté non renseignée',
      );
    },
  },

  set: {
    label: 'Set',
    sections: (items, { sets = [] }) => {
      const byId = new Map(sets.map((s) => [s.id, s]));
      return parCle(
        items,
        (i) => (byId.has(i.setId) ? i.setId : null),
        sets.map((s) => s.id),
        (k) => ({ label: byId.get(Number(k))?.nom || '?', icon: '💎', color: byId.get(Number(k))?.couleur || null }),
        'Hors set',
      );
    },
  },

  faction: {
    label: 'Peuple / faction',
    sections: (items, { factions = [] }) => {
      const byId = new Map(factions.map((f) => [f.id, f]));
      return parCle(
        items,
        (i) => (byId.has(i.factionId) ? i.factionId : null),
        factions.map((f) => f.id),
        (k) => ({ label: byId.get(Number(k))?.nom || '?', icon: '⚜️', color: byId.get(Number(k))?.couleur || null }),
        'Sans peuple connu',
      );
    },
  },

  contenant: {
    label: 'Ouverture (contenant)',
    // Axe MULTIVALUÉ : une géode et une écaille peuvent produire le même joyau,
    // il se range alors sous les deux. `contenants` est calculé côté serveur
    // (déclaré OU observé — cf. listUniqueItems), jamais reconstitué ici.
    sections: (items) => {
      const par = new Map();
      const sans = [];
      for (const it of items) {
        const liste = it.contenants || [];
        if (liste.length === 0) { sans.push(it); continue; }
        for (const c of liste) {
          if (!par.has(c.id)) par.set(c.id, { nom: c.nom, items: [] });
          par.get(c.id).items.push(it);
        }
      }
      const sections = [...par.entries()]
        .sort((a, b) => b[1].items.length - a[1].items.length || a[1].nom.localeCompare(b[1].nom, 'fr'))
        .map(([id, v]) => ({ key: String(id), label: v.nom, icon: '🎁', color: null, items: v.items }));
      if (sans.length) {
        sections.push({
          key: SANS, label: "Ne sort d'aucun contenant connu", icon: '·', color: null, items: sans,
        });
      }
      return sections;
    },
    multiple: true,
  },
};

/** Liste des axes pour le sélecteur, dans l'ordre d'affichage. */
export const AXES_ORDRE = ['aucun', 'categorie', 'rarete', 'set', 'faction', 'contenant'];

export const axeLabel = (k) => AXES[k]?.label || k;
export const axeMultiple = (k) => !!AXES[k]?.multiple;
