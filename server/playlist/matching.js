export const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function similarity(a, b) {
  a = normalize(a); b = normalize(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const grams = s => new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)));
  const aa = grams(a), bb = grams(b);
  return 2 * [...aa].filter(g => bb.has(g)).length / (aa.size + bb.size || 1);
}
export function rank(source, candidates) {
  const versions = s => normalize(s).split(' ').filter(w => ['live','remix','acoustic','instrumental','karaoke','remaster','remastered'].includes(w)).sort().join(',');
  return candidates.map(track => {
    const exact = Boolean(source.isrc && track.isrc && source.isrc.toUpperCase() === track.isrc.toUpperCase());
    const title = similarity(source.title, track.title), artist = similarity(source.artist, track.artist);
    const duration = source.duration_ms > 0 && track.duration_ms > 0 && Math.abs(source.duration_ms - track.duration_ms) <= 3000;
    const reliable = exact || (title >= 0.92 && artist >= 0.88 && duration && versions(source.title) === versions(track.title));
    return { ...track, score: exact ? 1 : title * 0.6 + artist * 0.4, reliable, exact };
  }).sort((a, b) => b.score - a.score);
}
export function choose(ranked) {
  if (ranked[0]?.exact) return ranked[0];
  // Two near-equivalent releases without ISRC evidence require a human choice.
  return ranked[0]?.reliable && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.04) ? ranked[0] : null;
}
