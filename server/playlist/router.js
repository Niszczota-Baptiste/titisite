import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createStore } from './store.js';
import { runtimeConfig, createSettings } from './settings.js';
import { createProviders } from './providers.js';
import { createEngine } from './engine.js';

export function createPlaylistFeature(db, requireAuth, config = runtimeConfig(db), fetcher) {
  const store = createStore(db, config.key), settings = createSettings(store, config);
  const api = createProviders(store, config, fetcher);
  const engine = createEngine(store, api, config), router = Router();
  const wrap = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);
  const provider = req => {
    if (!['spotify', 'apple'].includes(req.params.provider)) throw new Error('Service inconnu.');
    return req.params.provider;
  };
  const adapter = p => p === 'spotify' ? api.spotify : api.apple;
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9.:-]{1,128}$/.test(value);
  const cookie = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/playlist/spotify/callback' };
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  // The site session is SameSite=Strict and is absent on this cross-site redirect.
  // Bind the one-use OAuth state to a short-lived, HttpOnly Lax cookie instead.
  router.get('/spotify/callback', wrap(async (req, res) => {
    res.clearCookie('playlist_oauth', cookie);
    const state = req.query.state, bound = req.cookies?.playlist_oauth;
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || typeof bound !== 'string' || state.length !== bound.length || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(bound))) return res.redirect('/playlist?connection=error');
    const flow = store.token(`oauth:${state}`);
    store.db.prepare('DELETE FROM playlist_tokens WHERE provider=?').run(`oauth:${state}`);
    const user = flow && db.prepare('SELECT * FROM users WHERE id=?').get(flow.userId);
    const revoked = flow?.jti && db.prepare('SELECT 1 FROM revoked_tokens WHERE jti=?').get(flow.jti);
    if (!flow || flow.expires < Date.now() || !user || settings.owner('spotify') !== user.id || user.token_version !== flow.tv || revoked || typeof req.query.code !== 'string') return res.redirect('/playlist?connection=error');
    try {
      await engine.exclusive(() => api.finishOAuth(req.query.code, flow.verifier, user.id));
      res.redirect('/playlist?connection=spotify');
    } catch { res.redirect('/playlist?connection=error'); }
  }));
  router.use(requireAuth);
  router.use((req, res, next) => {
    if (['GET','HEAD'].includes(req.method)) return next();
    const origins = [config.origin, ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])];
    if (!origins.includes(req.get('origin')) || req.get('X-Playlist-Request') !== '1') return res.status(403).json({ error: 'Origine de la requête refusée.' });
    next();
  });
  router.use(rateLimit({ windowMs: 60_000, max: 90, standardHeaders: true, legacyHeaders: false, message: { error: 'Trop de requêtes. Réessaie dans une minute.' } }));
  function requireOwner(req, res, p) {
    if (req.user.id === settings.owner(p)) return true;
    res.status(403).json({ error: 'Seul le propriétaire de ce service peut modifier sa connexion.' });
    return false;
  }
  router.get('/status', (req, res) => {
    if (!settings.member(req.user.id)) return res.json({ onboarding: true, setup: settings.summary(req.user) });
    const status = p => ({ connected: Boolean(store.token(p)), playlistId: store.state(`${p}:playlist`),
      lastRead: store.state(`${p}:lastRead`), error: store.state(`${p}:error`), backoff: store.state(`${p}:backoff`),
      canConfigure: req.user.id === settings.owner(p),
      settingsRevision: store.state(`${p}:settingsRevision`, 0),
      configured: p === 'spotify' ? Boolean(config.clientId) : Boolean(config.privateKey && config.keyId && config.teamId) });
    res.json({ setup: settings.summary(req.user), tracks: store.list(), spotify: status('spotify'), apple: status('apple'), interval: config.interval, lastCycle: store.state('lastCycle') });
  });
  router.post('/setup', wrap(async (req, res) => {
    await engine.exclusive(() => settings.initialize(req.user, req.body?.provider));
    res.json({ ok: true });
  }));
  const joinLimit = rateLimit({ windowMs: 900_000, max: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessaie dans 15 minutes.' } });
  router.post('/join', joinLimit, wrap(async (req, res) => {
    await engine.exclusive(() => settings.join(req.user, req.body?.code));
    res.json({ ok: true });
  }));
  router.use((req, res, next) => settings.member(req.user.id) ? next() : res.status(403).json({ error: 'Cette playlist est réservée aux deux membres invités.' }));
  router.post('/invite', wrap(async (req, res) => {
    res.json(await engine.exclusive(() => settings.invite(req.user)));
  }));
  router.put('/:provider/settings', wrap(async (req, res) => {
    const p = provider(req); if (!requireOwner(req, res, p)) return;
    await engine.exclusive(() => { settings.save(req.user, p, req.body || {}); api.invalidateDeveloperToken(); });
    res.json({ ok: true });
  }));
  router.post('/:provider/disconnect', wrap(async (req, res) => {
    const p = provider(req); if (!requireOwner(req, res, p)) return;
    await engine.exclusive(() => {
      if (p === 'spotify') {
        const saved = store.token(p);
        if (saved) store.set('spotify:identity', saved.accountId || saved.spotifyId);
        db.prepare("DELETE FROM playlist_tokens WHERE provider LIKE 'oauth:%'").run();
      }
      db.prepare('DELETE FROM playlist_tokens WHERE provider=?').run(p);
      store.set(`${p}:error`, null);
    });
    res.json({ ok: true });
  }));
  // Light polling revalidates the existing session on every request (including logout/revocation).
  router.post('/sync', (_req, res) => { void engine.sync().catch(() => {}); res.status(202).json({ ok: true }); });
  router.post('/spotify/connect', wrap(async (req, res) => {
    if (!requireOwner(req, res, 'spotify')) return;
    const flow = api.beginOAuth();
    db.prepare("DELETE FROM playlist_tokens WHERE provider LIKE 'oauth:%'").run();
    store.saveToken(`oauth:${flow.state}`, req.user.id, { verifier: flow.verifier, expires: Math.min(Date.now() + 600_000, req.token.exp * 1000), jti: req.token.jti, tv: req.user.token_version });
    res.cookie('playlist_oauth', flow.state, { ...cookie, maxAge: 600_000 });
    res.json({ url: flow.url });
  }));
  router.get('/apple/developer-token', (req, res, next) => {
    if (!requireOwner(req, res, 'apple')) return;
    try { res.json({ token: api.developerToken() }); } catch (e) { next(e); }
  });
  router.post('/apple/connect', wrap(async (req, res) => {
    if (!requireOwner(req, res, 'apple')) return;
    const token = req.body?.musicUserToken;
    if (typeof token !== 'string' || token.length < 20 || token.length > 12000) return res.status(400).json({ error: 'Music User Token invalide.' });
    await engine.exclusive(() => api.connectApple(token, req.user.id));
    res.json({ ok: true });
  }));
  router.get('/:provider/playlists', wrap(async (req, res) => {
    const p = provider(req); if (!requireOwner(req, res, p)) return;
    res.json(await engine.exclusive(() => adapter(p).playlists()));
  }));
  router.post('/:provider/playlist', wrap(async (req, res) => {
    const p = provider(req); if (!requireOwner(req, res, p)) return;
    await engine.exclusive(async () => {
      if (store.state(`${p}:playlist`)) throw new Error('Playlist déjà liée. Le remplacement nécessite une migration explicite de la base.');
      let id = req.body?.id;
      if (req.body?.create === true) {
        if (store.state(`${p}:creating`)) throw new Error('Création précédente incertaine : recharge les playlists et sélectionne celle créée.');
        store.set(`${p}:creating`, true);
        try { id = await adapter(p).create(); }
        catch (e) { if (!e.uncertain) store.set(`${p}:creating`, false); throw e; }
      } else {
        if (!validId(id)) throw new Error('Identifiant de playlist invalide.');
        await adapter(p).validate(id);
      }
      if (!validId(id)) throw new Error('La plateforme n’a pas retourné de playlist.');
      store.set(`${p}:playlist`, id); store.set(`${p}:creating`, false);
    });
    void engine.sync().catch(() => {});
    res.json({ ok: true });
  }));
  router.get('/search', wrap(async (req, res) => {
    const q = req.query.q;
    if (typeof q !== 'string' || q.trim().length < 2 || q.length > 150) return res.status(400).json({ error: 'Recherche : entre 2 et 150 caractères.' });
    const results = await engine.exclusive(() => Promise.allSettled([api.spotify.search(q), api.apple.search(q)]));
    res.json({ tracks: results.flatMap(r => r.status === 'fulfilled' ? r.value : []), errors: results.flatMap((r, i) => r.status === 'rejected' ? [i === 0 ? 'Spotify indisponible' : 'Apple Music indisponible'] : []) });
  }));
  router.post('/tracks', wrap(async (req, res) => {
    const { provider: p, id } = req.body || {};
    if (!['spotify','apple'].includes(p) || !validId(id)) return res.status(400).json({ error: 'Morceau invalide.' });
    res.status(202).json(await engine.add(p, id, req.user.id));
  }));
  router.delete('/tracks/:id', wrap(async (req, res) => {
    await engine.exclusive(() => engine.remove(Number(req.params.id)));
    void engine.sync().catch(() => {}); res.json({ ok: true });
  }));
  router.post('/tracks/:id/:provider/match', wrap(async (req, res) => {
    const p = provider(req);
    if (!validId(req.body?.id)) return res.status(400).json({ error: 'Candidat invalide.' });
    await engine.match(Number(req.params.id), p, req.body.id); res.json({ ok: true });
  }));
  router.post('/tracks/:id/:provider/retry', wrap(async (req, res) => {
    const p = provider(req), id = Number(req.params.id);
    await engine.exclusive(async () => {
      const row = store.get(id), d = store.delivery(id, p);
      if (!row || row.deleted_at || !d || !['uncertain','unmatched','pending','missing'].includes(d.status)) throw new Error('Aucune relance disponible.');
      if (d.status === 'uncertain' && req.body?.confirmAbsent !== true) throw new Error('Vérifie d’abord dans l’application que ce morceau est absent.');
      // A fresh full read before retry is mandatory, even with an unchanged Spotify snapshot.
      const view = await adapter(p).read(true);
      const exists = view.tracks.some(t => p === 'spotify' ? t.spotify_uri === row.spotify_uri : t.apple_catalog_id && t.apple_catalog_id === row.apple_catalog_id);
      store.mark(id, p, exists ? 'confirmed' : 'pending');
      if (p === 'spotify') store.set('spotify:snapshot', null);
    });
    void engine.sync().catch(() => {}); res.json({ ok: true });
  }));
  router.use((err, _req, res, _next) => {
    const error = err.reason ? ({ not_connected: 'Connecte ce service dans Réglages.', configuration_missing: 'Clés du service absentes du serveur.', QUOTA_EXCEEDED: 'Quota Spotify dépassé. Synchronisation différée.', rate_limited: 'Limite du service atteinte. Réessaie plus tard.', reconnect_or_permissions: 'Reconnecte le service et vérifie ses autorisations.', playlist_missing: 'Choisis une playlist dans Réglages.', network_error: 'Service injoignable. Vérifie le résultat avant de réessayer.' }[err.reason] || 'Le service musical est indisponible.') : (err.code?.startsWith('SQLITE') ? 'Cette correspondance existe déjà dans la playlist.' : err.message);
    res.status(err.status === 429 ? 429 : 400).json({ error });
  });
  return { router, start: engine.start, stop: engine.stop };
}
