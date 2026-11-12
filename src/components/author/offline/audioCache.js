import { audioWifiOnly, connectionInfo } from './net.js';

// Sons disponibles hors connexion — toujours sur demande.
//
// Écouter une prise en ligne ne laisse aucune copie sur l'appareil (lecture par
// plages). « Garder hors connexion » télécharge le fichier ENTIER et le dépose
// dans le cache des médias de l'atelier ; le service worker le sert ensuite
// plage par plage (déplacement dans la piste compris), réseau ou pas. Comme le
// reste des copies de l'atelier, il est effacé à la déconnexion et au
// changement de compte (src/api/client.js).

const MEDIA = 'au-media-v1';
const supported = () => typeof caches !== 'undefined';
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };
export function subscribeAudioCache(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// Le service worker doit contrôler la page pour servir la copie.
export const audioOfflineReady = () => supported() && typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller;

export async function isAudioCached(url) {
  if (!supported()) return false;
  try { return !!(await (await caches.open(MEDIA)).match(url)); } catch { return false; }
}

// → { count, bytes } pour les prises données ({ url, size }) déjà sur l'appareil.
export async function cachedAudioStats(takes) {
  if (!supported()) return { count: 0, bytes: 0, urls: new Set() };
  const cache = await caches.open(MEDIA);
  const urls = new Set();
  let bytes = 0;
  for (const t of takes) {
    if (await cache.match(t.url)) { urls.add(t.url); bytes += t.size || 0; }
  }
  return { count: urls.size, bytes, urls };
}

// Réseau mobile + réglage « Wi-Fi seulement » : on ne télécharge pas sans accord.
export async function meteredBlock() {
  if (!audioWifiOnly()) return false;
  const info = await connectionInfo();
  return info.connected && !info.unmetered;
}

// Télécharge une prise entière. Refuse une réponse partielle ou d'une taille
// inattendue : une copie tronquée serait pire que pas de copie.
export async function cacheAudio(take) {
  if (!supported()) throw Object.assign(new Error('unsupported'), { code: 'unsupported' });
  const res = await fetch(take.url, { credentials: 'include', cache: 'no-store' });
  if (res.status !== 200) throw Object.assign(new Error(`http_${res.status}`), { status: res.status });
  const blob = await res.blob();
  if (take.size && blob.size !== take.size) throw Object.assign(new Error('size_mismatch'), { code: 'size_mismatch' });
  const headers = new Headers({ 'Content-Type': res.headers.get('Content-Type') || take.mimeType || 'application/octet-stream', 'Content-Length': String(blob.size) });
  await (await caches.open(MEDIA)).put(take.url, new Response(blob, { status: 200, headers }));
  emit();
}

export async function uncacheAudio(url) {
  if (!supported()) return;
  await (await caches.open(MEDIA)).delete(url);
  emit();
}
