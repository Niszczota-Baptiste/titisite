// Maths des tables de butin — fonctions PURES, sans React ni DOM, pour être
// testables directement (test/loot-math.test.js).
//
// Le calcul répond à une seule question : « vendre le contenant tel quel, ou
// l'ouvrir ? ». Il doit donc être honnête plutôt que flatteur — d'où deux
// règles tenues partout ici :
//   1. un résultat sans prix connu n'est PAS compté comme valant 0 : il est
//      exclu et sa part de probabilité est remontée à l'affichage
//      (`nonValorisePct`), sinon l'espérance paraîtrait basse à tort ;
//   2. les prix libellés dans une AUTRE monnaie que celle du contenant ne sont
//      pas convertis (aucun taux inventé) : ils rejoignent les non valorisés.

/** Somme des probabilités déclarées (peut dépasser 100 : c'est signalé, pas corrigé). */
export function sommeProbabilites(loot) {
  return (loot || []).reduce((s, l) => s + (Number(l.probabilite) || 0), 0);
}

/** Quantité moyenne d'une ligne (bornes incluses). */
export const quantiteMoyenne = (l) => (
  ((Number(l.quantiteMin) || 0) + (Number(l.quantiteMax) || Number(l.quantiteMin) || 0)) / 2
);

/** Reliquat à déclarer pour atteindre 100 % (0 si la table est pleine ou déborde). */
export const reliquat = (loot) => Math.max(0, 100 - sommeProbabilites(loot));

/**
 * Prix unitaire d'une ligne de butin, exprimé dans `unite` — ou null si
 * inconnu / libellé dans une autre monnaie.
 * - `pa`              : 1 PA vaut 1 PA (la ligne EST la monnaie)
 * - `unique_item`     : le prix de vente estimé de l'objet visé
 * - le reste (item du codex, réputation, texte libre) : pas de prix connu
 */
export function prixUnitaire(ligne, unite) {
  if (ligne.resultatType === 'pa') return unite === 'pa' ? 1 : null;
  if (ligne.resultatType === 'unique_item') {
    const prix = ligne.ciblePrix;
    if (prix == null || !Number.isFinite(Number(prix))) return null;
    if ((ligne.ciblePrixUnite || 'pa') !== unite) return null; // pas de conversion
    return Number(prix);
  }
  return null;
}

/**
 * Espérance d'une ouverture, dans la monnaie du contenant.
 * Renvoie le détail ligne à ligne (pour le panneau dépliable) et la part de
 * table non valorisée.
 */
export function esperance(item, loot) {
  const unite = item?.prixUnite || 'pa';
  const lignes = (loot || []).map((l) => {
    const p = (Number(l.probabilite) || 0) / 100;
    const qte = quantiteMoyenne(l);
    const pu = prixUnitaire(l, unite);
    return {
      ligne: l,
      probabilite: Number(l.probabilite) || 0,
      quantiteMoyenne: qte,
      prixUnitaire: pu,
      valorisee: pu != null,
      apport: pu == null ? 0 : p * qte * pu,
    };
  });
  const valeur = lignes.reduce((s, x) => s + x.apport, 0);
  const somme = sommeProbabilites(loot);
  const nonValorisePct = lignes
    .filter((x) => !x.valorisee)
    .reduce((s, x) => s + x.probabilite, 0);
  return { unite, valeur, lignes, sommeProbabilites: somme, nonValorisePct };
}

/**
 * « Plutôt vendre » ou « plutôt ouvrir » ? Comparaison à ±`marge` près
 * (10 % par défaut) — en deçà, l'écart n'est pas significatif vu la précision
 * des tables. `null` quand la comparaison n'a pas de sens (pas de prix de vente,
 * ou espérance nulle faute de résultat valorisé).
 */
export function verdictOuvrir({ valeur, prixVente, marge = 0.1 }) {
  const prix = Number(prixVente);
  if (!Number.isFinite(prix) || prix <= 0) return null;
  if (!Number.isFinite(valeur) || valeur <= 0) return null;
  const ecart = valeur / prix - 1;
  // Tolérance de comparaison : pile à la marge (132 pour 120, soit +10 %),
  // `132/120 - 1` vaut 0.10000000000000009 en flottant et basculerait sur
  // « ouvrir » alors que le bord doit rester « équivalent ».
  const EPS = 1e-9;
  if (ecart > marge + EPS) return { verdict: 'ouvrir', ecart };
  if (ecart < -marge - EPS) return { verdict: 'vendre', ecart };
  return { verdict: 'equivalent', ecart };
}

/**
 * Intervalle de confiance de Wilson à 95 % pour une proportion observée.
 * Choisi plutôt que l'approximation normale parce qu'il reste correct sur de
 * petits effectifs et près de 0 % — exactement le régime d'un journal
 * d'ouvertures qui démarre (« 2 sur 12 »).
 * Renvoie des pourcentages (0–100).
 */
export function wilson(k, n, z = 1.96) {
  const succes = Number(k) || 0;
  const total = Number(n) || 0;
  if (total <= 0) return { p: 0, bas: 0, haut: 0, n: 0 };
  const p = succes / total;
  const d = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const demi = z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));
  return {
    p: p * 100,
    bas: Math.max(0, ((centre - demi) / d) * 100),
    haut: Math.min(1, (centre + demi) / d) * 100,
    n: total,
  };
}

/**
 * Nom lisible d'une unité de prix : « PA », ou le nom de l'item-monnaie.
 * `itemsById` = Map(id → item unique).
 */
export function uniteLabel(unite, itemsById) {
  if (!unite || unite === 'pa') return 'PA';
  const m = /^custom:(\d+)$/.exec(String(unite));
  if (!m) return String(unite);
  return itemsById?.get(Number(m[1]))?.nom || 'monnaie inconnue';
}

/** « 12 × Écaille du devin » — nombre arrondi proprement (2 décimales max). */
export function formatPrix(valeur, unite, itemsById) {
  if (valeur == null || !Number.isFinite(Number(valeur))) return '—';
  const n = Math.round(Number(valeur) * 100) / 100;
  return `${n} ${uniteLabel(unite, itemsById)}`;
}

/** Clé d'identité d'un résultat — doit coller à celle du serveur (items.js). */
export function resultatKey(l) {
  if (!l) return '';
  const type = l.resultatType || 'item_referentiel';
  if (type === 'unique_item') return `unique:${l.resultatUniqueId}`;
  if (type === 'item_referentiel') return `item:${l.resultatRef || ''}`;
  return `${type}:${l.resultatRef || ''}`;
}

/**
 * Rapproche les lignes déclarées du journal d'ouvertures : pour chacune, le
 * taux observé et son intervalle. Les résultats jamais déclarés mais bel et
 * bien obtenus ressortent dans `inattendus` — ce sont des lignes à ajouter.
 */
export function croiserObservations(loot, resume) {
  const total = resume?.total || 0;
  const parKey = new Map((resume?.parResultat || []).map((o) => [o.key, o]));
  const lignes = (loot || []).map((l) => {
    const key = resultatKey(l);
    const obs = parKey.get(key);
    return {
      ...l,
      observations: obs ? { ...wilson(obs.n, total), k: obs.n } : null,
    };
  });
  const declarees = new Set(lignes.map(resultatKey));
  // L'intervalle va dans `observations`, jamais à plat : `wilson()` renvoie lui
  // aussi un `n` (la taille d'échantillon), qui écraserait le `n` de
  // l'observation (le nombre d'occurrences) et afficherait « 23× sur 23 ».
  const inattendus = (resume?.parResultat || [])
    .filter((o) => !declarees.has(o.key))
    .map((o) => ({ ...o, observations: { ...wilson(o.n, total), k: o.n } }));
  return { lignes, inattendus, total };
}
