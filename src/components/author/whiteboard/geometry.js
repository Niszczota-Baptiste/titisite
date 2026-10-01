// Géométrie du tableau blanc (fonctions pures).

export function newId() {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return rnd.slice(0, 16);
}

export const center = (n) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

// Point où le segment centre(a) → centre(b) sort du rectangle de a.
export function borderPoint(n, toward) {
  const c = center(n);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : (n.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (n.h / 2) / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

export function edgePoints(a, b) {
  const ca = center(a);
  const cb = center(b);
  return { p1: borderPoint(a, cb), p2: borderPoint(b, ca) };
}

export function rectsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function normRect(x0, y0, x1, y1) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

export function boundsOf(nodes) {
  if (!nodes.length) return null;
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Caméra qui cadre `b` dans une vue w×h.
export function fitCamera(b, w, h, pad = 60) {
  if (!b) return { x: w / 2, y: h / 2, k: 1 };
  const k = Math.max(0.1, Math.min(1.5, Math.min((w - pad * 2) / Math.max(b.w, 1), (h - pad * 2) / Math.max(b.h, 1))));
  return { k, x: w / 2 - (b.x + b.w / 2) * k, y: h / 2 - (b.y + b.h / 2) * k };
}

export const NODE_DEFAULTS = {
  card: { w: 220, h: 120, color: '#c9a8e8' },
  text: { w: 260, h: 60, color: '' },
  comment: { w: 200, h: 110, color: '#e8d27c' },
  shape: { w: 160, h: 100, color: '#80c8e8', shape: 'rect' },
  group: { w: 480, h: 320, color: '#8a80a0' },
  entity: { w: 230, h: 96, color: '' },
  image: { w: 320, h: 220, color: '' },
};

export const BOARD_COLORS = ['#c9a8e8', '#e88cb8', '#80c8e8', '#9ad4ae', '#e8d27c', '#e8a87c', '#ff8a9b', '#8a80a0'];
