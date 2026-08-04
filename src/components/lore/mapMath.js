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

// ── Grille des cartes Minecraft (tuiles, deux niveaux de zoom) ─────────────
// Un joueur posé en (0,0) est au CENTRE de sa carte : au niveau 0 la tuile
// (i, j) couvre [i·128-64, i·128+64) × [j·128-64, j·128+64). Ce décalage de
// -64 est ce qui aligne la grille sur les cartes réelles du jeu — s'en écarter
// décalerait toutes les captures d'un demi-carte.
//
// Le jeu calcule le centre d'une carte de zoom n par
//   i = 128·2ⁿ ; centre = floor((pos + 64) / i)·i + i/2 - 64
// donc la tuile d'indice k couvre [k·i - 64, k·i + i - 64) : **le décalage de
// -64 vaut à TOUS les niveaux**, et les grilles s'emboîtent exactement (une
// case de zoom 2 = 4×4 cases de zoom 0, jamais à cheval). C'est cette
// propriété qui permet d'empiler les couches sans couture ni recalage.
export const TILE_SIZE = 128;
export const TILE_OFFSET = -64;

// Les deux niveaux exposés : l'atlas « deux crans dézoomé » (512×512 blocs)
// qui sert de fond d'arrivée, et le détail (128×128) qui se pose dessus.
export const ATLAS_ZOOM = 2;
export const DETAIL_ZOOM = 0;
// Du plus grossier au plus fin : c'est aussi l'ordre d'empilement au rendu.
export const TILE_ZOOMS = [ATLAS_ZOOM, DETAIL_ZOOM];

// Côté d'une tuile en blocs : 128 au niveau 0, 512 au niveau 2.
export function tileSize(zoom = 0) {
  return TILE_SIZE * (2 ** zoom);
}

// Au-delà de cette largeur de vue, une case de 128 blocs ne ferait plus que
// quelques pixels : on ne montre que l'atlas. En dessous, le détail prend le
// dessus là où il existe. (2048 blocs de large ⇒ 16 cases fines ⇒ ~50 px.)
export const DETAIL_MAX_SPAN = 2048;

// Le niveau que la vue « regarde » — celui que le mode 🧩 pré-sélectionne et
// que la grille suit par défaut.
export function zoomForView(view) {
  return view.span <= DETAIL_MAX_SPAN ? DETAIL_ZOOM : ATLAS_ZOOM;
}

// Coordonnée monde → indice de tuile (le bloc -64 appartient déjà à la tuile 0).
export function worldToTile(x, z, zoom = 0) {
  const s = tileSize(zoom);
  return {
    tileX: Math.floor((x - TILE_OFFSET) / s),
    tileZ: Math.floor((z - TILE_OFFSET) / s),
  };
}

// Rectangle monde d'une tuile : { left, top, size } (top = Z le plus petit,
// c'est-à-dire le bord NORD, puisque le nord est Z décroissant).
export function tileRect(tileX, tileZ, zoom = 0) {
  const s = tileSize(zoom);
  return {
    left: tileX * s + TILE_OFFSET,
    top: tileZ * s + TILE_OFFSET,
    size: s,
  };
}

// Case parente d'une tuile au niveau supérieur (128 → 512). L'emboîtement
// étant exact, c'est une simple division entière — floor, pas troncature,
// sinon tout le quadrant négatif se décalerait d'une case.
export function tileParent(tileX, tileZ, fromZoom, toZoom) {
  const f = 2 ** (toZoom - fromZoom);
  return { tileX: Math.floor(tileX / f), tileZ: Math.floor(tileZ / f) };
}

// Indices de tuiles couvrant la vue, bornés par `max` pour ne jamais générer
// des milliers de rectangles quand on dézoome à l'échelle du monde.
export function tilesInView(view, { zoom = 0, max = 1200 } = {}) {
  const half = view.span / 2;
  const a = worldToTile(view.cx - half, view.cz - half, zoom);
  const b = worldToTile(view.cx + half, view.cz + half, zoom);
  const cols = b.tileX - a.tileX + 1;
  const rows = b.tileZ - a.tileZ + 1;
  if (cols * rows > max || cols <= 0 || rows <= 0) return [];
  const out = [];
  for (let j = a.tileZ; j <= b.tileZ; j += 1) {
    for (let i = a.tileX; i <= b.tileX; i += 1) out.push({ tileX: i, tileZ: j });
  }
  return out;
}

// Vue cadrée sur un lot de tuiles : leur union RECTANGLE, pas leurs centres —
// cadrer sur les centres couperait la moitié des cases du bord.
export function fitTiles(tiles, zoom, { pad = 1.08, minSpan = 256 } = {}) {
  if (!tiles || tiles.length === 0) return null;
  const s = tileSize(zoom);
  let minX = Infinity; let maxX = -Infinity;
  let minZ = Infinity; let maxZ = -Infinity;
  for (const t of tiles) {
    const r = tileRect(t.tileX, t.tileZ, zoom);
    minX = Math.min(minX, r.left);
    maxX = Math.max(maxX, r.left + s);
    minZ = Math.min(minZ, r.top);
    maxZ = Math.max(maxZ, r.top + s);
  }
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    span: Math.max(minSpan, Math.max(maxX - minX, maxZ - minZ) * pad),
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
