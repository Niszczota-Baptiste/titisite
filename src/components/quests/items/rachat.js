// Barèmes de RACHAT d'un set de joyaux — fonctions PURES, testées dans
// test/rachat.test.js.
//
// Un set se revend de deux façons qui se croisent : à l'unité ou en lot (le set
// complet), et payé en PA chez un PNJ ou en réputation chez un autre. La seule
// question que l'écran doit trancher est donc : **garder les pièces pour
// compléter le lot, ou les écouler à l'unité ?**
//
// Deux règles d'honnêteté, les mêmes que pour les tables de butin (loot.js) :
//   1. on ne compare JAMAIS deux paiements différents entre eux. 40 PA et
//      12 points de réputation ne se soustraient pas, et aucun taux de change
//      n'est inventé — chaque monnaie a sa propre comparaison ;
//   2. tant que la TAILLE du set est inconnue (0), le total à l'unité n'est pas
//      calculable : on le dit au lieu de comparer un lot à une somme inventée.

/** Un barème s'applique à un item s'il vise son set entier, ou lui en propre. */
export const rachatVise = (r, itemId) => (
  r.uniqueItemId == null || Number(r.uniqueItemId) === Number(itemId)
);

/**
 * Clé de la monnaie d'un barème : deux lignes ne sont comparables que si elles
 * paient dans la même chose. La réputation est distinguée PAR FACTION — gagner
 * chez les Ondiens n'est pas gagner chez les Marchands.
 */
export function monnaieKey(r) {
  if (!r) return '';
  if (r.paiement === 'reputation') return `reputation:${r.factionId ?? ''}`;
  if (r.paiement === 'item') return `item:${r.refCode || ''}`;
  return 'pa';
}

/**
 * Regroupe les barèmes par monnaie et confronte, pour chacune, la vente à
 * l'unité et la vente en lot.
 *
 * `taille` = le nombre de pièces du set EN JEU (`unique_item_sets.taille`) :
 * c'est lui qui donne le total à l'unité, pas le nombre de pièces documentées
 * — vendre le lot suppose de l'avoir complet.
 *
 * Renvoie, par monnaie :
 *   { key, paiement, factionId, refCode, unite, lot, totalUnite, ecart, pct,
 *     verdict } où `verdict` ∈ 'lot' | 'unite' | 'equivalent' | null.
 * `null` quand la comparaison n'a pas de sens (un seul des deux barèmes connu,
 * ou taille du set inconnue) : on affiche alors ce qu'on sait, sans trancher.
 */
export function comparerRachats(rachats, taille, { marge = 0 } = {}) {
  const parMonnaie = new Map();
  for (const r of rachats || []) {
    const key = monnaieKey(r);
    if (!parMonnaie.has(key)) {
      parMonnaie.set(key, {
        key,
        paiement: r.paiement || 'pa',
        factionId: r.factionId ?? null,
        factionNom: r.factionNom ?? null,
        refCode: r.refCode ?? null,
        unite: null,
        lot: null,
      });
    }
    const m = parMonnaie.get(key);
    // Plusieurs PNJ pour la même monnaie : on garde la MEILLEURE offre — c'est
    // celle qu'on ira voir.
    const montant = Number(r.montant) || 0;
    const cible = r.lot ? 'lot' : 'unite';
    // eslint-disable-next-line security/detect-object-injection -- `cible` vaut 'lot' ou 'unite', littéraux ci-dessus
    if (m[cible] == null || montant > m[cible].montant) {
      // eslint-disable-next-line security/detect-object-injection -- idem
      m[cible] = { montant, pnj: r.pnj || '', questId: r.questId ?? null, note: r.note || '', id: r.id };
    }
  }

  const n = Math.max(0, Math.trunc(Number(taille) || 0));
  return [...parMonnaie.values()].map((m) => {
    const totalUnite = m.unite && n > 0 ? m.unite.montant * n : null;
    const lot = m.lot ? m.lot.montant : null;
    if (totalUnite == null || lot == null) {
      return { ...m, taille: n, totalUnite, ecart: null, pct: null, verdict: null };
    }
    const ecart = lot - totalUnite;
    const pct = totalUnite > 0 ? (ecart / totalUnite) * 100 : null;
    const verdict = ecart > marge ? 'lot' : ecart < -marge ? 'unite' : 'equivalent';
    return { ...m, taille: n, totalUnite, ecart, pct, verdict };
  });
}

/**
 * Le meilleur prix UNITAIRE en PA qu'un PNJ propose pour cet item — ou null.
 * Sert de prix de repli dans les calculs d'espérance : un joyau sans prix
 * estimé mais racheté 5 PA à l'unité ne vaut pas « inconnu », il vaut 5 PA.
 * Le prix du LOT n'entre jamais là-dedans : il est conditionné à la possession
 * du set complet, ce n'est pas la valeur d'une pièce isolée.
 */
export function prixUnitaireRachat(rachats, itemId) {
  const candidats = (rachats || [])
    .filter((r) => !r.lot && r.paiement === 'pa' && rachatVise(r, itemId))
    .map((r) => Number(r.montant) || 0)
    .filter((v) => v > 0);
  return candidats.length ? Math.max(...candidats) : null;
}

/** Libellé court d'une monnaie de rachat, pour l'affichage. */
export function monnaieLabel(m, itemsById) {
  if (!m) return '';
  if (m.paiement === 'reputation') return `réputation ${m.factionNom || ''}`.trim();
  if (m.paiement === 'item') {
    const id = /^custom:(\d+)$/.exec(String(m.refCode || ''));
    return id ? (itemsById?.get(Number(id[1]))?.nom || 'objet') : (m.refCode || 'objet');
  }
  return 'PA';
}
