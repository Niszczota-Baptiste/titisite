// Maths pures de la carte du lore — testées dans test/lore-map-math.test.js.
// Convention Minecraft : X croît vers l'est, Z croît vers le SUD. À l'écran le
// nord est en haut : la coordonnée verticale de rendu suit Z croissant vers le
// bas, donc un relèvement de 0° (nord) pointe vers les Z décroissants.

// Vecteur unitaire (monde) d'un relèvement en degrés : 0° = nord = -Z,
// 90° = est = +X. C'est LA formule à ne pas inverser (jamais cos/sin sur Z+).
export function bearingDirection(deg) {
  const r = (deg * Math.PI) / 180;
  return { dx: Math.sin(r), dz: -Math.cos(r) };
}

// Rectangle monde de l'image de fond, à partir de la calibration deux points
// (X des coins bas-gauche / bas-droit + Z du bord bas) et du ratio h/w naturel
// de l'image. Le bord BAS est ancré : le haut monte vers les Z décroissants.
export function imagePlacement(map, aspect) {
  if (!map) return null;
  const { imgXLeft, imgXRight, imgZBottom } = map;
  if (imgXLeft == null || imgXRight == null || imgZBottom == null) return null;
  const spanX = imgXRight - imgXLeft;
  if (spanX <= 0 || !Number.isFinite(aspect) || aspect <= 0) return null;
  const spanZ = spanX * aspect;
  return { left: imgXLeft, top: imgZBottom - spanZ, spanX, spanZ };
}

// Distance euclidienne X/Z pour l'outil de mesure (pas de Y sur une carte).
export function measureDistance(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

// Position d'un point monde dans la vue {cx, cz, span}, en % du cadre.
export function toPct(view, x, z) {
  return {
    left: ((x - view.cx) / view.span + 0.5) * 100,
    top: ((z - view.cz) / view.span + 0.5) * 100,
  };
}

// Zoom molette centré sur le curseur : le point monde sous la souris ne bouge
// pas. `f` > 1 éloigne, < 1 rapproche.
export function zoomAt(view, world, f, { min = 32, max = 200000 } = {}) {
  const span = Math.max(min, Math.min(max, view.span * f));
  const k = span / view.span;
  return {
    cx: world.x - (world.x - view.cx) * k,
    cz: world.z - (world.z - view.cz) * k,
    span,
  };
}
