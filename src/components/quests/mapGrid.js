// Shared grid math for the quest maps — the single-quest editor grid
// (QuestMap) and the aggregated world map (QuestWorldMap). Pure functions over
// { x, z } world coordinates; no React.

export function computeView(points, { defaultSpan = 256, padFactor = 1.6, minSpan = 64 } = {}) {
  const xs = points.map((p) => p.x);
  const zs = points.map((p) => p.z);
  if (xs.length === 0) return { cx: 0, cz: 0, span: defaultSpan };
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minZ = Math.min(...zs); const maxZ = Math.max(...zs);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(minSpan, maxX - minX, maxZ - minZ) * padFactor || defaultSpan;
  return { cx, cz, span };
}

// "Nice" round grid step (1/2/5 × 10ⁿ) so ~6 divisions span the view.
export function niceStep(span) {
  const target = span / 6;
  const pow = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 2, 5, 10]) if (m * pow >= target) return m * pow;
  return 10 * pow;
}

export function gridLines(view, step) {
  const half = view.span / 2;
  const v = []; const h = [];
  const startX = Math.ceil((view.cx - half) / step) * step;
  for (let x = startX; x <= view.cx + half; x += step) {
    v.push({ world: x, pct: ((x - view.cx) / view.span + 0.5) * 100, axis: x === 0 });
  }
  const startZ = Math.ceil((view.cz - half) / step) * step;
  for (let z = startZ; z <= view.cz + half; z += step) {
    h.push({ world: z, pct: ((z - view.cz) / view.span + 0.5) * 100, axis: z === 0 });
  }
  return { v, h };
}
