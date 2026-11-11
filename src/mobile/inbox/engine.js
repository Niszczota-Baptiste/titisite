import { api } from '../../api/client';
import { sendTake } from '../../components/author/audio/upload.js';
import { isNetworkError, pauseReason, subscribeAuth, subscribeNet } from '../../components/author/offline/net.js';
import { networkInfo } from '../platform/config.js';
import { vault } from '../platform/vault.js';
import { fileItem } from './file.js';
import { audioFiles } from './model.js';

// Envoi des captures classées vers le site. Une passe à la fois ; relancée au
// retour du réseau, à la reconnexion, quand une capture est classée, et
// régulièrement tant que quelque chose attend.
//
// Trois issues, jamais confondues :
//   - reçue par le site (taille vérifiée pour les sons) → la copie locale est
//     libérée ;
//   - réseau coupé, session expirée, accès refusé, site saturé → la capture
//     reste « en attente d'envoi », intacte, la passe s'arrête ;
//   - refusée par le site (format, projet supprimé…) → « échec », avec la
//     raison ; rien n'est effacé.
//
// Les sons peuvent attendre le Wi-Fi (réglage) : ils restent alors en attente,
// et l'interface le dit.

const WIFI_KEY = 'am-upload-audio';
export const audioOverWifiOnly = () => { try { return localStorage.getItem(WIFI_KEY) !== 'any'; } catch { return true; } };
export const setAudioOverWifiOnly = (v) => { try { localStorage.setItem(WIFI_KEY, v ? 'wifi' : 'any'); } catch { /* ignore */ } };

const listeners = new Set();
let state = { running: false, sending: null, progress: 0, waitingWifi: 0, paused: null, offline: false, lastAt: null };
const set = (patch) => { state = { ...state, ...patch }; for (const fn of listeners) fn(state); };
export const getInboxSync = () => state;
export function subscribeInboxSync(fn) { listeners.add(fn); return () => listeners.delete(fn); }

let context = null; // { owner, serverUrl }
let again = false;

export async function runInbox() {
  const ctx = context;
  if (!ctx?.owner) return;
  if (state.running) { again = true; return; }
  set({ running: true, paused: null, offline: false });
  let waitingWifi = 0;
  try {
    const queued = (await vault.list())
      .filter((it) => it.state === 'queued' && it.target?.serverUrl === ctx.serverUrl && (!it.owner || it.owner === ctx.owner))
      .sort((a, b) => a.createdAt - b.createdAt);
    let net = null;
    for (const item of queued) {
      if (audioFiles(item).length && audioOverWifiOnly()) {
        net = net || await networkInfo();
        if (!net.unmetered) { waitingWifi += 1; continue; }
      }
      let cur = item;
      set({ sending: item.id, progress: 0 });
      try {
        const out = await fileItem({
          P: api.author.p(item.target.pid), item, files: vault, sendTake,
          save: async (progress) => { cur = await vault.put({ ...cur, progress }); },
          onProgress: (p) => set({ progress: p }),
        });
        await vault.remove(item.id);
        window.dispatchEvent(new CustomEvent('am-filed', { detail: { item, out } }));
      } catch (err) {
        if (isNetworkError(err)) { set({ offline: true }); break; }
        const pause = pauseReason(err);
        if (pause) { set({ paused: pause }); break; }
        await vault.put({ ...cur, state: 'failed', error: String(err.body?.error || err.message || 'erreur') });
      }
    }
  } finally {
    set({ running: false, sending: null, progress: 0, waitingWifi, lastAt: Date.now() });
    if (again) { again = false; setTimeout(runInbox, 0); }
  }
}

let wired = false;
export function startInboxSync(ctx) {
  context = ctx;
  if (!wired) {
    wired = true;
    subscribeNet((n) => { if (n.online) runInbox(); });
    subscribeAuth((a) => { if (a.state === 'ok') runInbox(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runInbox(); });
    setInterval(() => { if (context?.owner) runInbox(); }, 30_000);
  }
  if (ctx?.owner) runInbox();
}

export function stopInboxSync() { context = null; }
