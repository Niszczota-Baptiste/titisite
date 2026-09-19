import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Login } from '../components/admin/Login';
import { api } from '../api/client';
import { ACC, ACC_RGB, Button, Input } from '../components/admin/ui';
import { useConfirm } from '../ui/ConfirmProvider';
import { usePageMeta } from '../hooks/usePageMeta';
import './playlist.css';

const names = { spotify: 'Spotify', apple: 'Apple Music' };
const labels = { confirmed: 'Présent', pending: 'En attente', sending: 'Envoi…', sent: 'Envoyé · confirmation attendue',
  unmatched: 'À associer', uncertain: 'Envoi à vérifier', manual: 'À retirer manuellement dans Apple Music',
  remove_pending: 'Retrait en attente', removed: 'Retiré', missing: 'Retiré dans Apple Music' };
const time = ms => `${Math.floor((ms || 0) / 60000)}:${String(Math.floor((ms || 0) / 1000) % 60).padStart(2, '0')}`;
const date = ms => ms ? new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Pas encore';
let musicKitPromise;
function loadMusicKit() {
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (!musicKitPromise) musicKitPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = setTimeout(() => { script.remove(); musicKitPromise = null; reject(new Error('Chargement de MusicKit trop long. Réessaie.')); }, 20000);
    const ready = () => { clearTimeout(timeout); resolve(window.MusicKit); };
    document.addEventListener('musickitloaded', ready, { once: true });
    script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
    script.async = true;
    script.onload = () => { if (window.MusicKit) ready(); };
    script.onerror = () => { clearTimeout(timeout); musicKitPromise = null; document.removeEventListener('musickitloaded', ready); script.remove(); reject(new Error('Impossible de charger MusicKit.')); };
    document.head.appendChild(script);
  });
  return musicKitPromise;
}

export default function Playlist() {
  const { user, loading } = useAuth();
  usePageMeta('Playlist Commune', 'La playlist privée partagée entre Apple Music et Spotify.');
  useEffect(() => {
    document.body.style.cursor = '';
  }, []);
  if (loading) return <main className="pc" style={{ '--pc-accent': ACC, '--pc-accent-rgb': ACC_RGB }}><p>Chargement de ta session…</p></main>;
  if (!user) return <Login title="Playlist Commune" subtitle="Connecte-toi avec ton compte habituel du site." />;
  return <PlaylistContent key={user.id} />;
}
function PlaylistContent() {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const [data, setData] = useState(null), [tab, setTab] = useState('playlist');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''), [results, setResults] = useState(null), [filter, setFilter] = useState('');
  const [lists, setLists] = useState({}), [selection, setSelection] = useState({});
  const [music, setMusic] = useState(null), [musicError, setMusicError] = useState('');
  const active = useRef(true), actionLock = useRef(false);
  const refresh = useCallback(async () => {
    const next = await api.playlist.status(); if (active.current) setData(next);
  }, []);
  useEffect(() => {
    active.current = true;
    let timer, disposed = false;
    const tick = async () => {
      try { if (!document.hidden) await refresh(); }
      catch (e) { if (active.current) { setData(null); setError(e.message); } }
      if (!disposed) timer = setTimeout(tick, 5000);
    };
    void tick();
    const connection = new URLSearchParams(location.search).get('connection');
    if (connection) { setTab('settings'); setNotice(connection === 'spotify' ? 'Spotify connecté. Choisis maintenant la playlist à synchroniser.' : 'Connexion non terminée. Réessaie depuis Réglages.'); history.replaceState(null, '', '/playlist'); }
    return () => { disposed = true; active.current = false; clearTimeout(timer); };
  }, [refresh]);
  useEffect(() => {
    if (tab !== 'settings' || !data?.apple.canConfigure || !data.apple.configured || music) return;
    let cancelled = false;
    Promise.all([loadMusicKit(), api.playlist.developerToken()]).then(async ([kit, { token }]) => {
      await kit.configure({ developerToken: token, app: { name: 'Playlist Commune', build: '1.0.0' } });
      if (!cancelled) { setMusic(kit.getInstance()); setMusicError(''); }
    }).catch(e => { if (!cancelled) setMusicError(e.message); });
    return () => { cancelled = true; };
  }, [tab, data?.apple.canConfigure, data?.apple.configured, music]);
  async function act(fn, message) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); await refresh(); if (message) setNotice(message); }
    catch (e) { setError(e.message); }
    finally { actionLock.current = false; setBusy(false); }
  }
  async function search(e) {
    e.preventDefault();
    await act(async () => { const r = await api.playlist.search(query.trim()); setResults(r.tracks); if (r.errors.length) setError(r.errors.join(' · ')); });
  }
  const all = data?.tracks || [], tracks = all.filter(t => !t.deleted_at), retired = all.filter(t => t.deleted_at && (t.platforms.apple.status !== 'removed' || t.platforms.spotify.status !== 'removed'));
  const needs = tracks.filter(t => t.sync_status !== 'synced').length;
  const connected = data?.spotify.playlistId && data?.apple.playlistId;
  return <main className="pc" style={{ '--pc-accent': ACC, '--pc-accent-rgb': ACC_RGB }}>
    <header className="pc-top"><Link to="/project">← Mon espace</Link><span>{user.name || user.email}</span><Button variant="ghost" onClick={logout}>Déconnexion</Button></header>
    <section className="pc-hero"><div className="pc-disc" aria-hidden="true"><span>PC</span></div><div><p className="pc-eyebrow">DEUX PERSONNES · UNE PLAYLIST</p><h1>Playlist<br /><em>Commune.</em></h1><p>Toi sur Apple Music, lui sur Spotify.<br />Vos découvertes au même endroit.</p></div></section>
    <div className="pc-summary"><span><strong>{tracks.length}</strong> morceaux</span><span><strong>{needs}</strong> en attente</span><span className="pc-refresh">Synchro native toutes les {Math.round((data?.interval || 45000) / 1000)} s · dernier passage {date(data?.lastCycle)}</span></div>
    <nav className="pc-tabs" aria-label="Playlist Commune">{[['playlist','Playlist'],['add','Ajouter'],['settings','Réglages']].map(([id, text]) => <Button variant={tab === id ? 'primary' : 'ghost'} key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{text}</Button>)}</nav>
    {error && <div className="pc-alert" role="alert">{error}</div>}
    {notice && <div className="pc-notice" role="status">{notice}</div>}
    {!data && !error && <p>Chargement de la playlist…</p>}
    {data && <>
      {!connected && <div className="pc-notice">La playlist attend ses deux connexions. <Button variant="ghost" onClick={() => setTab('settings')}>Ouvrir les réglages →</Button></div>}
      {['spotify','apple'].map(p => data[p].error && <div className="pc-alert" key={p}>{names[p]} : {data[p].error === 'QUOTA_EXCEEDED' ? 'quota dépassé' : data[p].error === 'reconnect_or_permissions' ? 'connexion ou permissions à renouveler' : 'synchronisation en attente'}.{data[p].backoff?.until > Date.now() && ` Reprise au plus tôt à ${date(data[p].backoff.until)}.`} <Button variant="ghost" onClick={() => setTab('settings')}>Réglages</Button></div>)}
      {tab === 'playlist' && <section aria-label="Morceaux partagés"><div className="pc-toolbar"><label><span className="pc-sr">Filtrer la playlist</span><Input type="search" placeholder="Filtrer vos morceaux…" value={filter} onChange={e => setFilter(e.target.value)} /></label><Button variant="ghost" disabled={busy} onClick={() => act(() => api.playlist.sync(), 'Synchronisation demandée.')}>Actualiser ↻</Button></div>
        {!tracks.length && <div className="pc-empty"><span aria-hidden="true">♫</span><h2>Le premier morceau, c’est vous.</h2><p>Ajoute une découverte ou liez vos playlists dans les réglages.</p><Button variant="ghost" className="pc-primary" onClick={() => setTab('add')}>Ajouter un morceau</Button></div>}
        <div className="pc-tracklist">{tracks.filter(t => `${t.title} ${t.artist}`.toLocaleLowerCase('fr').includes(filter.toLocaleLowerCase('fr'))).map(t => <article className="pc-track" key={t.id}>
          <TrackInfo track={t} /><div className="pc-trackmeta"><small>Ajouté par {t.added_by_name || 'un membre'} · {new Date(t.added_at).toLocaleDateString('fr-FR')}</small><div className="pc-badges">{['spotify','apple'].map(p => <span key={p} className={`pc-badge ${t.platforms[p].status === 'confirmed' ? p : ''}`}>{names[p]} · {labels[t.platforms[p].status]}</span>)}</div></div>
          <Button variant="ghost" className="pc-remove" disabled={busy} onClick={async () => { if (await confirm(`Retirer « ${t.title} » de la playlist commune et de Spotify ? Le retrait dans Apple Music sera manuel.`)) void act(() => api.playlist.remove(t.id), 'Retrait enregistré. Apple Music doit être mis à jour manuellement.'); }}>Retirer</Button>
          {['spotify','apple'].map(p => <TrackResolution key={p} track={t} provider={p} busy={busy} act={act} />)}
        </article>)}</div>
        {retired.length > 0 && <aside className="pc-retired"><h2>Retraits à terminer</h2><p>La suppression reste mémorisée : ces morceaux ne seront pas réimportés depuis Apple Music.</p>{retired.map(t => <div key={t.id}><strong>{t.title}</strong> · {t.artist}<p>{labels[t.platforms.apple.status]} · Spotify : {labels[t.platforms.spotify.status]}</p></div>)}</aside>}
      </section>}
      {tab === 'add' && <section><h2>Votre prochaine découverte</h2><p className="pc-muted">Recherche dans les deux catalogues. La correspondance et l’envoi démarrent dès l’ajout.</p><form className="pc-search" onSubmit={search}><label className="pc-sr" htmlFor="pc-query">Titre ou artiste</label><Input id="pc-query" type="search" placeholder="Un titre, un artiste…" minLength={2} maxLength={150} value={query} onChange={e => setQuery(e.target.value)} required /><Button variant="ghost" type="submit" className="pc-primary" disabled={busy}>{busy ? 'Recherche…' : 'Rechercher'}</Button></form>
        {results?.length === 0 && <p>Aucun morceau trouvé. Essaie un titre ou un artiste différent.</p>}
        <div className="pc-tracklist">{results?.map(t => <article key={`${t.provider}:${t.remote_id}`} className="pc-track pc-result"><TrackInfo track={t} /><span className="pc-muted">{names[t.provider]}</span><Button variant="ghost" disabled={busy} className="pc-primary" onClick={() => act(() => api.playlist.add(t.provider, t.remote_id), 'Morceau enregistré. Synchronisation en cours.')}>+ Ajouter</Button></article>)}</div>
      </section>}
      {tab === 'settings' && <section><h2>Chacun son compte. La même musique.</h2><div className="pc-settings">{['spotify','apple'].map(p => <article className="pc-service" key={p}><span className={`pc-dot ${p}`} /><h3>{names[p]}</h3><p>{data[p].connected ? 'Compte connecté' : 'Compte à connecter'} · {data[p].playlistId ? 'Playlist liée' : 'Playlist à choisir'}</p>
        {!data[p].configured && <p className="pc-alert">Les clés {names[p]} doivent être renseignées sur le serveur.</p>}
        {data[p].canConfigure ? <>
          <Button variant="ghost" disabled={busy || !data[p].configured || (p === 'apple' && !music)} onClick={() => act(async () => {
            if (p === 'spotify') { const r = await api.playlist.connectSpotify(); window.location.assign(r.url); }
            else { const musicUserToken = await music.authorize(); await api.playlist.connectApple(musicUserToken); }
          }, p === 'apple' ? 'Apple Music connecté.' : undefined)}>{data[p].connected ? 'Reconnecter' : 'Connecter'} {names[p]}</Button>
          {p === 'apple' && musicError && <p role="alert">{musicError}</p>}
          {p === 'apple' && !music && !musicError && data[p].configured && <small>Préparation de MusicKit…</small>}
          {data[p].connected && !data[p].playlistId && <div className="pc-bind"><Button variant="ghost" disabled={busy} onClick={() => act(async () => { const l = await api.playlist.playlists(p); setLists(old => ({ ...old, [p]: l })); })}>Charger mes playlists</Button>
            {lists[p] && <><label htmlFor={`pc-${p}`}>Playlist existante</label><select id={`pc-${p}`} value={selection[p] || ''} onChange={e => setSelection(old => ({ ...old, [p]: e.target.value }))}><option value="">Choisir…</option>{lists[p].map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select><Button variant="ghost" disabled={busy || !selection[p]} onClick={() => act(() => api.playlist.bind(p, { id: selection[p] }), 'Playlist liée. Ses morceaux seront importés.')}>Lier cette playlist</Button></>}
            <Button variant="ghost" className="pc-primary" disabled={busy} onClick={() => act(() => api.playlist.bind(p, { create: true }), 'Playlist Commune créée et liée.')}>Créer « Playlist Commune »</Button></div>}
        </> : <p className="pc-muted">L’autre membre gère cette connexion depuis son compte du site.</p>}
        {data[p].playlistId && <p className="pc-muted">Dernière lecture : {date(data[p].lastRead)}</p>}
      </article>)}</div><div className="pc-footnote"><h3>À savoir</h3><p>Les ajouts se synchronisent dans les deux sens. Les retraits depuis ce site ou Spotify restent à effectuer manuellement dans Apple Music. Un retrait fait uniquement dans Apple Music est signalé, sans supprimer le morceau commun.</p><p>Le délai inclut le passage du serveur et la propagation propre à chaque service. L’ordre des morceaux n’est pas synchronisé.</p></div></section>}
    </>}
  </main>;
}
function TrackInfo({ track: t }) {
  return <div className="pc-trackinfo">{t.artwork ? <img src={t.artwork} alt="" loading="lazy" width="56" height="56" /> : <span className="pc-cover" aria-hidden="true">♫</span>}<div><h3>{t.title}</h3><p>{t.artist} <span>· {time(t.duration_ms)}</span></p></div></div>;
}
function TrackResolution({ track, provider: p, busy, act }) {
  const confirm = useConfirm();
  const d = track.platforms[p];
  if (!['unmatched','uncertain','missing','pending'].includes(d.status)) return null;
  return <div className="pc-resolution">
    {d.status === 'unmatched' && <details><summary>Choisir la version sur {names[p]}</summary>{d.candidates.length ? d.candidates.map(c => <div className="pc-candidate" key={c.remote_id}><span>{c.title} — {c.artist} · {time(c.duration_ms)}</span><Button variant="ghost" disabled={busy} onClick={() => act(() => api.playlist.match(track.id, p, c.remote_id), 'Correspondance enregistrée.')}>Choisir</Button></div>) : <p>Aucun candidat proposé. Réessaie plus tard.</p>}</details>}
    <Button variant="ghost" disabled={busy} onClick={async () => {
      const confirmed = d.status !== 'uncertain' || await confirm(`Vérifie dans ${names[p]} que « ${track.title} » est absent. Un envoi précédent peut avoir réussi. Confirmer son absence et réessayer ?`);
      if (confirmed) void act(() => api.playlist.retry(track.id, p, true), 'Nouvelle tentative demandée.');
    }}>{d.status === 'uncertain' ? 'Vérifier puis réessayer' : d.status === 'missing' ? 'Rajouter dans Apple Music' : `Réessayer · ${names[p]}`}</Button>
  </div>;
}
