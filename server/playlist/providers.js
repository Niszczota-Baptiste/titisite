import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

export class ProviderError extends Error {
  constructor(provider, status, reason, uncertain = false) {
    super(`${provider}: ${reason}`);
    Object.assign(this, { provider, status, reason, uncertain });
  }
}
export const spotifyTrack = t => ({ provider: 'spotify', remote_id: t.id, spotify_uri: t.uri,
  isrc: t.external_ids?.isrc || null, title: t.name, artist: t.artists?.map(a => a.name).join(', ') || '',
  duration_ms: t.duration_ms || 0, artwork: t.album?.images?.[0]?.url || null });
export const appleTrack = t => ({ provider: 'apple', remote_id: t.id, apple_catalog_id: t.type === 'songs' ? t.id : null,
  library_id: t.type === 'library-songs' ? t.id : null, isrc: t.attributes?.isrc || null,
  title: t.attributes?.name || 'Titre indisponible', artist: t.attributes?.artistName || '',
  duration_ms: t.attributes?.durationInMillis || 0,
  artwork: t.attributes?.artwork?.url?.replace('{w}', '160').replace('{h}', '160') || null });

export function createProviders(store, config, fetcher = fetch) {
  let developerCache;
  function developerToken() {
    if (!config.privateKey || !config.keyId || !config.teamId) throw new ProviderError('apple', 503, 'configuration_missing');
    if (!developerCache || developerCache.expires < Date.now() + 3600_000) {
      developerCache = { value: jwt.sign({}, config.privateKey, { algorithm: 'ES256', keyid: config.keyId, issuer: config.teamId, expiresIn: '12h' }), expires: Date.now() + 12 * 3600_000 };
    }
    return developerCache.value;
  }
  async function http(provider, url, options = {}) {
    const gate = store.state(`${provider}:backoff`, { until: 0, failures: 0 });
    if (gate.until > Date.now()) throw new ProviderError(provider, 429, gate.reason || 'rate_limited');
    let response;
    try {
      response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15_000) });
    } catch {
      throw new ProviderError(provider, 502, 'network_error', options.method === 'POST');
    }
    let body = null, invalidBody = false;
    try { body = response.status === 204 ? null : await response.json(); }
    catch { invalidBody = true; }
    if (response.status === 429) {
      const failures = gate.failures + 1;
      const reason = body?.error?.reason || 'rate_limited';
      const retry = response.headers.get('retry-after');
      const delay = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now()) : 0;
      const base = reason === 'QUOTA_EXCEEDED' ? 300_000 : 30_000;
      const until = Date.now() + Math.max(Number.isFinite(delay) ? delay : 0, Math.min(3600_000, base * 2 ** Math.min(failures - 1, 7))) + Math.floor(Math.random() * 1000);
      store.set(`${provider}:backoff`, { until, failures, reason });
      throw new ProviderError(provider, 429, reason);
    }
    if (!response.ok) throw new ProviderError(provider, response.status, response.status === 401 || response.status === 403 || body?.error === 'invalid_grant' ? 'reconnect_or_permissions' : 'api_error', response.status >= 500 && options.method === 'POST');
    if (invalidBody) throw new ProviderError(provider, 502, 'invalid_response', options.method === 'POST');
    store.set(`${provider}:backoff`, { until: 0, failures: 0 });
    return body;
  }
  const callback = `${config.origin}/api/playlist/spotify/callback`;
  async function exchange(params) {
    if (!config.clientId) throw new ProviderError('spotify', 503, 'configuration_missing');
    return http('spotify', 'https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, ...params }).toString(),
    });
  }
  let refreshing;
  async function accessToken(force = false) {
    const saved = store.token('spotify');
    if (!saved) throw new ProviderError('spotify', 401, 'not_connected');
    if (!force && saved.expiresAt > Date.now() + 60_000) return saved.access_token;
    if (!refreshing) refreshing = (async () => {
      const next = await exchange({ grant_type: 'refresh_token', refresh_token: saved.refresh_token });
      store.saveToken('spotify', saved.userId, { ...saved, ...next, refresh_token: next.refresh_token || saved.refresh_token, expiresAt: Date.now() + next.expires_in * 1000 });
      return next.access_token;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  function safeUrl(path, root) {
    const url = new URL(path, root);
    if (url.origin !== new URL(root).origin || !url.pathname.startsWith('/v1/')) throw new Error('URL de pagination invalide.');
    return url.href;
  }
  async function spotify(path, method = 'GET', body, retry = true) {
    const access = await accessToken();
    try {
      return await http('spotify', safeUrl(path, 'https://api.spotify.com/v1/'), { method,
        headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    } catch (error) {
      if (error.status === 401 && retry) { await accessToken(true); return spotify(path, method, body, false); }
      throw error;
    }
  }
  async function apple(path, method = 'GET', body, userToken) {
    const library = path.includes('/me/');
    const token = userToken || (library ? store.token('apple')?.musicUserToken : null);
    if (library && !token) throw new ProviderError('apple', 401, 'not_connected');
    return http('apple', safeUrl(path, 'https://api.music.apple.com/v1/'), { method,
      headers: { Authorization: `Bearer ${developerToken()}`, 'Content-Type': 'application/json', ...(token ? { 'Music-User-Token': token } : {}) },
      body: body ? JSON.stringify(body) : undefined });
  }
  async function pages(request, path, key) {
    const output = [], visited = new Set();
    while (path) {
      if (visited.has(path) || visited.size >= 500) throw new Error('Pagination incohérente.');
      visited.add(path);
      const page = await request(path);
      // eslint-disable-next-line security/detect-object-injection -- key is a constant from our two adapters.
      if (!Array.isArray(page?.[key])) throw new Error('Liste distante incomplète.');
      // eslint-disable-next-line security/detect-object-injection -- same constant key.
      output.push(...page[key]);
      path = page.next;
    }
    return output;
  }
  const catalog = `/v1/catalog/${config.storefront}`;
  const sp = {
    developerToken: null,
    async get(id) { return spotifyTrack(await spotify(`/v1/tracks/${encodeURIComponent(id)}`)); },
    async search(q) { return (await spotify(`/v1/search?${new URLSearchParams({ q, type: 'track', limit: '10', market: 'FR' })}`)).tracks.items.map(spotifyTrack); },
    async isrc(isrc) { return this.search(`isrc:${isrc}`); },
    async read(force = false) {
      const id = store.state('spotify:playlist');
      if (!id) throw new ProviderError('spotify', 409, 'playlist_missing');
      const before = await spotify(`/v1/playlists/${encodeURIComponent(id)}?fields=snapshot_id`);
      if (!before.snapshot_id) throw new Error('Snapshot Spotify manquant.');
      const cached = store.state('spotify:seen', []);
      if (!force && before.snapshot_id === store.state('spotify:snapshot')) return { tracks: cached, snapshot: before.snapshot_id };
      const items = await pages(spotify, `/v1/playlists/${encodeURIComponent(id)}/items?limit=50&market=FR`, 'items');
      // An unavailable/redacted track is not proof of a native deletion.
      if (items.some(x => !(x.item ?? x.track))) throw new ProviderError('spotify', 409, 'unavailable_playlist_item');
      const after = await spotify(`/v1/playlists/${encodeURIComponent(id)}?fields=snapshot_id`);
      if (before.snapshot_id !== after.snapshot_id) throw new ProviderError('spotify', 409, 'playlist_changed_during_read');
      const tracks = items.map(x => x.item ?? x.track).filter(t => t?.type === 'track' && !t.is_local && t.uri).map(spotifyTrack);
      return { tracks, snapshot: after.snapshot_id };
    },
    add(t) { return spotify(`/v1/playlists/${encodeURIComponent(store.state('spotify:playlist'))}/items`, 'POST', { uris: [t.spotify_uri] }); },
    remove(t) { return spotify(`/v1/playlists/${encodeURIComponent(store.state('spotify:playlist'))}/items`, 'DELETE', { items: [{ uri: t.spotify_uri }] }); },
    async playlists() {
      const me = await spotify('/v1/me');
      return (await pages(spotify, '/v1/me/playlists?limit=50', 'items')).filter(p => p.owner?.id === me.id).map(p => ({ id: p.id, name: p.name }));
    },
    async validate(id) {
      const me = await spotify('/v1/me');
      const p = await spotify(`/v1/playlists/${encodeURIComponent(id)}`);
      if (p.owner?.id !== me.id) throw new Error('La playlist Spotify doit appartenir au compte connecté.');
    },
    async create() { return (await spotify('/v1/me/playlists', 'POST', { name: 'Playlist Commune', public: false, description: 'Notre playlist Apple Music + Spotify' }))?.id; },
  };
  const ap = {
    async get(id) { const r = await apple(`${catalog}/songs/${encodeURIComponent(id)}`); if (!r.data?.[0]) throw new Error('Morceau absent du catalogue.'); return appleTrack(r.data[0]); },
    async search(q) { return ((await apple(`${catalog}/search?${new URLSearchParams({ term: q, types: 'songs', limit: '10' })}`)).results?.songs?.data || []).map(appleTrack); },
    async isrc(isrc) { return (await apple(`${catalog}/songs?${new URLSearchParams({ 'filter[isrc]': isrc })}`)).data.map(appleTrack); },
    async read() {
      const id = store.state('apple:playlist');
      if (!id) throw new ProviderError('apple', 409, 'playlist_missing');
      const songs = await pages(apple, `/v1/me/library/playlists/${encodeURIComponent(id)}/tracks?limit=100&include=catalog`, 'data');
      const tracks = [];
      for (const song of songs) {
        if (!['songs', 'library-songs'].includes(song.type)) continue;
        let cat = song.type === 'songs' ? song : song.relationships?.catalog?.data?.[0];
        // Library IDs are never sent to catalogue endpoints or treated as catalog IDs.
        if (!cat && song.type === 'library-songs' && song.attributes?.hasCatalog) {
          const r = await apple(`/v1/me/library/songs/${encodeURIComponent(song.id)}?include=catalog`);
          cat = r.data?.[0]?.relationships?.catalog?.data?.[0];
        }
        let track = appleTrack(song);
        if (cat?.id) {
          let mapped = cat.attributes?.isrc ? appleTrack(cat) : store.state(`apple:catalog:${cat.id}`);
          if (!mapped) { mapped = await ap.get(cat.id); store.set(`apple:catalog:${cat.id}`, mapped); }
          track = { ...mapped, library_id: song.type === 'library-songs' ? song.id : null };
        }
        tracks.push(track);
      }
      return { tracks };
    },
    add(t) { return apple(`/v1/me/library/playlists/${encodeURIComponent(store.state('apple:playlist'))}/tracks`, 'POST', { data: [{ id: t.apple_catalog_id, type: 'songs' }] }); },
    async playlists() { return (await pages(apple, '/v1/me/library/playlists?limit=100', 'data')).filter(p => p.attributes?.canEdit).map(p => ({ id: p.id, name: p.attributes.name })); },
    async validate(id) { const p = (await apple(`/v1/me/library/playlists/${encodeURIComponent(id)}`)).data?.[0]; if (!p?.attributes?.canEdit) throw new Error('Playlist Apple Music non modifiable.'); },
    async create() { return (await apple('/v1/me/library/playlists', 'POST', { attributes: { name: 'Playlist Commune', description: 'Notre playlist Apple Music + Spotify' } }))?.data?.[0]?.id; },
  };
  return { spotify: sp, apple: ap, developerToken,
    beginOAuth() {
      if (!config.clientId) throw new ProviderError('spotify', 503, 'configuration_missing');
      const state = crypto.randomBytes(32).toString('base64url'), verifier = crypto.randomBytes(48).toString('base64url');
      return { state, verifier, url: `https://accounts.spotify.com/authorize?${new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: callback, state, code_challenge_method: 'S256', code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), scope: 'playlist-read-private playlist-modify-private playlist-modify-public' })}` };
    },
    async finishOAuth(code, verifier, userId) {
      const token = await exchange({ grant_type: 'authorization_code', code, redirect_uri: callback, code_verifier: verifier });
      const me = await http('spotify', 'https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${token.access_token}` } });
      const old = store.token('spotify');
      if (old && (old.accountId || old.spotifyId) !== (me.account_id || me.id)) throw new Error('Reconnecte le même compte Spotify.');
      store.saveToken('spotify', userId, { ...token, accountId: me.account_id, spotifyId: me.id, expiresAt: Date.now() + token.expires_in * 1000 });
    },
    async connectApple(musicUserToken, userId) {
      await apple('/v1/me/storefront', 'GET', undefined, musicUserToken);
      // A reauthorization must retain access to the bound playlist.
      const id = store.state('apple:playlist');
      if (id) await apple(`/v1/me/library/playlists/${encodeURIComponent(id)}`, 'GET', undefined, musicUserToken);
      store.saveToken('apple', userId, { musicUserToken });
    },
  };
}
