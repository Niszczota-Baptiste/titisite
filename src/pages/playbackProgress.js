export function displayedPosition(sample, now = Date.now()) {
  if (!sample?.current) return 0;
  const { positionMs, durationMs, playing } = sample.current;
  // Never extrapolate indefinitely when a tab, connection or service stops updating.
  const age = Math.min(15000, Math.max(0, now - sample.receivedAt + (sample.ageMs || 0)));
  return Math.max(0, Math.min(durationMs, positionMs + (playing && !sample.error ? age : 0)));
}

export function applePlayback(music, items) {
  const media = music?.nowPlayingItem;
  if (!music?.isAuthorized || !media) return null;
  const ids = [media.id, media.attributes?.playParams?.id, media.playParams?.id].filter(Boolean).map(String);
  const item = items.find(q => q.apple_status === 'sent' && q.apple_catalog_id && ids.includes(String(q.apple_catalog_id)));
  if (!item) return null;
  const durationMs = music.currentPlaybackDuration * 1000, positionMs = music.currentPlaybackTime * 1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(positionMs)) return null;
  return { id: item.id, title: item.title, artist: item.artist, artwork: item.artwork,
    durationMs, positionMs: Math.max(0, Math.min(durationMs, positionMs)), playing: music.isPlaying === true };
}

export function waitingTracks(items, provider, started = []) {
  const key = provider === 'apple' ? 'apple_started_at' : 'spotify_started_at';
  return items.filter(item => !item[key] && !started.includes(item.id));
}
