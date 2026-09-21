const time = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
export function NowPlaying({ live, onSettings }) {
  const { current, position, stale, error, mine } = live;
  const message = error === 'playback_permission_required' || error === 'reconnect_or_permissions'
    ? 'Reconnecte Spotify dans Réglages pour autoriser l’affichage du morceau et de sa progression.'
    : error === 'rate_limited' || error === 'QUOTA_EXCEEDED' ? 'Spotify demande de patienter. Le suivi reprendra automatiquement.'
      : error ? 'Le suivi de lecture est indisponible pour le moment. Les titres restent conservés.' : null;
  return <section className="pc-now-playing" aria-label="En cours de lecture">
    <h3>En cours de lecture · {mine === 'spotify' ? 'Spotify' : 'Apple Music'}</h3>
    {message && <p role="status">{message} {error === 'playback_permission_required' || error === 'reconnect_or_permissions' ? <button onClick={onSettings}>Réglages</button> : null}</p>}
    {current ? <>
      <div className="pc-trackinfo">{current.artwork && <img src={current.artwork} alt="" width="56" height="56" />}<div><strong>{current.title}</strong><p>{current.artist}</p></div></div>
      <p>{stale ? 'Actualisation en attente' : current.playing ? 'Lecture en cours' : 'En pause ou à l’arrêt'}</p>
      <progress value={position} max={current.durationMs} aria-label={`Progression de ${current.title}`} />
      <div className="pc-playback-time"><span>{time(position)}</span><span>{time(current.durationMs)}</span></div>
    </> : !message && <p>Aucun titre de la file détecté en lecture{mine === 'apple' ? ' dans cette page' : ' sur ton Spotify'}. Le temps apparaîtra au démarrage.</p>}
  </section>;
}
