// Parsing « intelligent » du champ coordonnées de l'éditeur d'entrée —
// fonctions pures, testées dans test/lore-coords.test.js. Formats acceptés :
//   « -353 -5636 »                          → x z
//   « -353, 64, -5636 »                     → x y z
//   « x=-353 z=-5636 » / « X: -353 Z: -5636 »
//   « XYZ: -353.500 / 64.00000 / -5636.500 » (collé depuis l'écran F3)
// Les décimales sont arrondies à l'entier le plus proche (les relevés portent
// déjà une marge de 1 à 10 blocs). Les nombres sont capturés par une simple
// classe de caractères [\d.,-] puis validés par parseFloat — pas de groupe
// quantifié imbriqué (la règle detect-unsafe-regex y verrait un ReDoS).

const toInt = (v) => Math.round(parseFloat(String(v).replace(/,/g, '.')));

export function parseCoords(input) {
  const s = String(input || '').trim().slice(0, 300);
  if (!s) return null;

  // 1. Valeurs étiquetées : x=… z=… (y optionnel), insensible à la casse.
  const labeled = {};
  const labelRe = /([xyz])\s*[:=]\s*(-?[\d.,]+)/gi;
  let m;
  while ((m = labelRe.exec(s)) !== null) {
    const n = toInt(m[2]);
    if (!Number.isFinite(n)) continue;
    const axis = m[1].toLowerCase();
    if (axis === 'x') labeled.x = n;
    else if (axis === 'y') labeled.y = n;
    else labeled.z = n;
  }
  if (labeled.x !== undefined && labeled.z !== undefined) {
    return { x: labeled.x, y: labeled.y ?? null, z: labeled.z };
  }

  // 2. Nombres nus (le préfixe « XYZ: » de F3 est ignoré) : 2 → x z, 3 → x y z.
  const nums = (s.replace(/^xyz\s*:?\s*/i, '').match(/-?[\d.,]+/g) || [])
    .map(toInt)
    .filter((n) => Number.isFinite(n));
  if (nums.length === 2) return { x: nums[0], y: null, z: nums[1] };
  if (nums.length === 3) return { x: nums[0], y: nums[1], z: nums[2] };
  return null;
}

export function formatCoords({ x, y, z }) {
  if (x === null || x === undefined || z === null || z === undefined) return '';
  return y === null || y === undefined ? `X ${x} · Z ${z}` : `X ${x} · Y ${y} · Z ${z}`;
}
