import { Button } from '../components/admin/ui';
import { api } from '../api/client';
import { useConfirm } from '../ui/ConfirmProvider';

const names = { spotify: 'Spotify', apple: 'Apple Music' };
const states = { pending: 'En attente', sending: 'Envoi en cours', sent: 'Ajouté au lecteur', error: 'Action requise', uncertain: 'Envoi à vérifier', unmatched: 'Version à choisir' };
const errors = { no_active_device: 'Ouvre Spotify et lance un premier titre sur ton PC, puis réessaie.', premium_required: 'Spotify Premium est nécessaire.', reconnect_or_permissions: 'Reconnecte ton compte dans Réglages pour autoriser la lecture.', not_connected: 'Connecte ton compte dans Réglages.', configuration_missing: 'Renseigne tes clés dans Réglages.', QUOTA_EXCEEDED: 'Quota dépassé. Reprise après le délai imposé par Spotify.', rate_limited: 'Le service demande de patienter avant le prochain envoi.', network_error: 'La connexion a été interrompue. Vérifie le lecteur avant une nouvelle tentative.' };

export function PlaybackQueue({ data, busy, act, music, receiving, setReceiving, musicError, connectApple, appleProgress, appleNeedsReload, openTrack, onAdd, onSettings }) {
  const confirm = useConfirm(), items = data.queue || [];
  const appleMine = data.apple.canConfigure, spotifyMine = data.spotify.canConfigure;
  async function playApple(item) {
    const index = music.queue?.items?.findIndex(t => String(t.id) === item.apple_catalog_id || String(t.attributes?.playParams?.id) === item.apple_catalog_id) ?? -1;
    if (index < 0) throw new Error('Ce titre n’est plus dans ce lecteur Apple Music. Vérifie sa file avant de le renvoyer.');
    await music.changeToMediaAtIndex(index);
    await music.play();
  }
  return <section aria-label="File d’attente commune">
    <h2>À écouter ensemble</h2>
    <p>Ajoutez des titres à vos lecteurs, sans créer de playlist. Chacun garde ses commandes de lecture.</p>
    {!(appleMine ? data.apple.connected : data.spotify.connected) && <div className="pc-notice">Connecte ton service pour recevoir les titres. Les clés et leurs instructions sont dans Réglages. <Button variant="ghost" onClick={onSettings}>Connecter mon service</Button></div>}
    <div className="pc-notice"><p>Spotify : ouvre l’application sur ton PC et lance un premier titre pour activer l’appareil. Apple Music : garde cette page ouverte et active la réception ci-dessous. Les deux lecteurs avancent indépendamment.</p></div>
    {appleMine && <div className="pc-player"><h3>Ton lecteur Apple Music</h3>
      <p>La musique joue dans cette page. La file de l’application Apple Music sur PC n’est pas pilotable depuis le site.</p>
      <div className="pc-play-actions"><Button variant="primary" disabled={busy || !music || !data.apple.connected || appleNeedsReload} onClick={() => void act(async () => {
        if (receiving) { setReceiving(false); return; }
        if (!music.isAuthorized) await connectApple();
        setReceiving(true);
      }, receiving ? 'Réception suspendue.' : 'Réception activée ici. Clique sur Lire ma file pour commencer.')}>{receiving ? 'Suspendre la réception' : 'Activer la réception ici'}</Button>
      <Button variant="ghost" disabled={busy || !music} onClick={() => void act(() => music.play())}>▶ Lire ma file</Button>
      <Button variant="ghost" disabled={busy || !music} onClick={() => void act(() => music.pause())}>Pause</Button></div>
      {musicError && <p role="alert">{musicError}</p>}
      {appleProgress && <p role="status">{appleProgress}</p>}
      {appleNeedsReload && <p role="alert">L’autorisation Apple a expiré. Recharge cette page pour réessayer.</p>}
      <small>Après un rechargement, les titres déjà envoyés ne sont pas renvoyés automatiquement. Un seul onglet doit recevoir la musique.</small>
    </div>}
    {!items.length ? <div className="pc-empty"><h3>Votre file est vide</h3><Button variant="primary" onClick={onAdd}>Chercher un morceau</Button></div> : <ol className="pc-playback-list">{items.map(q => <li key={q.id} className="pc-playback-item">
      <div className="pc-trackinfo">{q.artwork && <img src={q.artwork} width="56" height="56" alt="" loading="lazy" />}<div><h3>{q.title}</h3><p>{q.artist}</p><small>Proposé par {q.added_by_name || 'un membre'}</small></div></div>
      <div className="pc-play-actions">
        {spotifyMine && <Button variant="primary" disabled={busy || !q.spotify_uri || !data.spotify.connected} onClick={() => void act(() => api.playlist.queuePlay(q.id), 'Lecture demandée sur ton appareil Spotify actif.')}>▶ Lire sur mon Spotify</Button>}
        {appleMine && <Button variant="primary" disabled={busy || !music || q.apple_status !== 'sent'} onClick={() => void act(() => playApple(q))}>▶ Lire ici</Button>}
        {['spotify','apple'].map(p => <Button key={p} variant="ghost" disabled={!q[p === 'spotify' ? 'spotify_uri' : 'apple_catalog_id']} onClick={() => openTrack(q, p)}>Ouvrir {names[p]}</Button>)}
      </div>
      {['spotify','apple'].map(p => <div key={p} className="pc-queue-status"><strong>{names[p]} · {states[q[`${p}_status`]]}</strong>
        {q[`${p}_error`] && <p>{errors[q[`${p}_error`]] || 'Le service n’a pas accepté l’envoi. Vérifie ton compte puis réessaie.'}</p>}
        {q[`${p}_status`] === 'uncertain' && <p>Le titre a peut-être été ajouté. Vérifie sa présence dans le lecteur.</p>}
        {data[p].canConfigure && q[`${p}_status`] === 'unmatched' && <div><p>Choisis la bonne version :</p>{q[`${p}_candidates`].map(c => <Button variant="ghost" key={c.remote_id} disabled={busy} onClick={() => void act(() => api.playlist.queueMatch(q.id, p, c.remote_id))}>{c.title} — {c.artist}</Button>)}</div>}
        {data[p].canConfigure && ['error','uncertain','unmatched'].includes(q[`${p}_status`]) && <Button variant="ghost" disabled={busy} onClick={async () => {
          const checked = q[`${p}_status`] !== 'uncertain' || await confirm(`Vérifie que « ${q.title} » est absent de la file ${names[p]}. Confirmer son absence et renvoyer ?`);
          if (checked) void act(() => api.playlist.queueRetry(q.id, p, true));
        }}>Vérifier puis réessayer</Button>}
      </div>)}
      <Button variant="ghost" disabled={busy || [q.apple_status, q.spotify_status].includes('sending')} onClick={async () => {
        if (await confirm('Masquer ce titre de la file commune ? Les envois en attente seront annulés. Un titre déjà envoyé reste dans le lecteur et doit y être retiré manuellement.')) void act(() => api.playlist.queueRemove(q.id));
      }}>Masquer de la file commune</Button>
    </li>)}</ol>}
    <p className="pc-muted">Cette liste suit les envois, pas la fin des morceaux. Masque les titres terminés. « Ouvrir » affiche le titre dans le service ; le lancement automatique dépend de ton navigateur. « Lire » interrompt le morceau actuel et un titre déjà en file peut y rester une seconde fois.</p>
  </section>;
}
