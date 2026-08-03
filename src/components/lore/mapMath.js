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

// ── Grille des cartes Minecraft (tuiles 128×128) ───────────────────────────
// Un joueur posé en (0,0) est au CENTRE de sa carte : la tuile (i, j) couvre
// [i·128-64, i·128+64) × [j·128-64, j·128+64). Ce décalage de -64 est ce qui
// aligne la grille sur les cartes réelles du jeu — s'en écarter décalerait
// toutes les captures d'un demi-carte.
export const TILE_SIZE = 128;
export const TILE_OFFSET = -64;

// Coordonnée monde → indice de tuile (le bloc -64 appartient déjà à la tuile 0).
export function worldToTile(x, z) {
  return {
    tileX: Math.floor((x - TILE_OFFSET) / TILE_SIZE),
    tileZ: Math.floor((z - TILE_OFFSET) / TILE_SIZE),
  };
}

// Rectangle monde d'une tuile : { left, top, size } (top = Z le plus petit,
// c'est-à-dire le bord NORD, puisque le nord est Z décroissant).
export function tileRect(tileX, tileZ) {
  return {
    left: tileX * TILE_SIZE + TILE_OFFSET,
    top: tileZ * TILE_SIZE + TILE_OFFSET,
    size: TILE_SIZE,
  };
}

// Indices de tuiles couvrant la vue, bornés par `max` pour ne jamais générer
// des milliers de rectangles quand on dézoome à l'échelle du monde.
export function tilesInView(view, { max = 1200 } = {}) {
  const half = view.span / 2;
  const a = worldToTile(view.cx - half, view.cz - half);
  const b = worldToTile(view.cx + half, view.cz + half);
  const cols = b.tileX - a.tileX + 1;
  const rows = b.tileZ - a.tileZ + 1;
  if (cols * rows > max || cols <= 0 || rows <= 0) return [];
  const out = [];
  for (let j = a.tileZ; j <= b.tileZ; j += 1) {
    for (let i = a.tileX; i <= b.tileX; i += 1) out.push({ tileX: i, tileZ: j });
  }
  return out;
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
