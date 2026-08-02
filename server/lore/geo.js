// Maths de géolocalisation Minecraft — fonctions pures, testées dans
// test/lore-geo.test.js. Convention de coordonnées : X croît vers l'EST,
// Z croît vers le SUD — le nord est donc Z DÉCROISSANT. C'est LA source
// d'erreur classique : le relèvement est atan2(dx, -dz), jamais atan2(dz, dx).

export const CARDINAL_8 = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
export const CARDINAL_16 = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO',
];

// Distance euclidienne horizontale (plan X/Z — le Y ne compte pas pour un
// relèvement à la boussole).
export function distance2D(from, to) {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

// Relèvement en degrés [0, 360) : 0 = nord (Z décroissant), 90 = est,
// 180 = sud, 270 = ouest. null si les deux points sont confondus.
export function bearingDeg(from, to) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  if (dx === 0 && dz === 0) return null;
  return (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
}

// Secteur cardinal à 8 (45° chacun, centrés sur les axes : N couvre
// [337.5, 22.5)) et à 16 (22.5° chacun).
export function cardinal8(deg) {
  return CARDINAL_8[Math.round(deg / 45) % 8];
}
export function cardinal16(deg) {
  return CARDINAL_16[Math.round(deg / 22.5) % 16];
}

// Axe des 8 le plus proche + écart signé en degrés (négatif = anti-horaire,
// ex. 359° → axe N, écart -1°). Sert au surlignage « aligné à ±tolérance ».
export function nearestAxis(deg) {
  const idx = Math.round(deg / 45) % 8;
  const axisDeg = idx * 45;
  let deviationDeg = deg - axisDeg;
  if (deviationDeg > 180) deviationDeg -= 360;
  if (deviationDeg < -180) deviationDeg += 360;
  return { axisDeg, cardinal: cardinal8(axisDeg), deviationDeg };
}

// Tout-en-un pour un couple de points : distance + relèvement + secteurs.
export function bearingInfo(from, to) {
  const distance = distance2D(from, to);
  const deg = bearingDeg(from, to);
  if (deg === null) {
    return { distance: 0, bearingDeg: null, cardinal8: null, cardinal16: null };
  }
  return { distance, bearingDeg: deg, cardinal8: cardinal8(deg), cardinal16: cardinal16(deg) };
}

// Vue « anneau » depuis une origine : chaque point reçoit distance, relèvement,
// axe le plus proche et drapeau d'alignement ; les points confondus avec
// l'origine sont écartés (pas d'angle), le tout trié par relèvement croissant.
export function ringFrom(origin, points, { tolerance = 2 } = {}) {
  const out = [];
  for (const p of points) {
    const deg = bearingDeg(origin, p);
    if (deg === null) continue;
    const axis = nearestAxis(deg);
    out.push({
      ...p,
      distance: distance2D(origin, p),
      bearingDeg: deg,
      cardinal8: cardinal8(deg),
      cardinal16: cardinal16(deg),
      nearestAxisDeg: axis.axisDeg,
      nearestAxisCardinal: axis.cardinal,
      deviationDeg: axis.deviationDeg,
      aligned: Math.abs(axis.deviationDeg) <= tolerance,
    });
  }
  out.sort((a, b) => a.bearingDeg - b.bearingDeg);
  return out;
}
