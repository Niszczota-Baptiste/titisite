import { isNetworkError } from '../offline/net.js';
import { newClientRef } from '../offline/store.js';

// Envoi d'une prise vers l'atelier privé, rejouable sans doublon.
//
// La référence client est choisie AVANT le premier essai et conservée par
// l'appelant : si la réponse se perd, le nouvel essai demande d'abord au
// serveur s'il a déjà la prise (GET /audio/by-ref) au lieu de renvoyer des
// dizaines de mégaoctets — et, s'il renvoie quand même, le serveur répond avec
// la prise déjà reçue.
//
// Après l'envoi, on compare ce que le serveur dit avoir reçu (taille) à ce
// qu'on a envoyé : c'est cette vérification qui autorise l'appareil à libérer
// sa copie locale.

export function newTakeRef() {
  return newClientRef();
}

export async function sendTake(P, take, { clientRef, entityId = null, label = '', notes = '', reference = false, onProgress } = {}) {
  const ref = clientRef || newTakeRef();
  let media = null;
  try {
    media = await P.audio.byRef(ref);
  } catch (err) {
    if (err.status !== 404) throw err;
  }
  if (!media) {
    const blob = await take.toBlob();
    const fd = new FormData();
    fd.append('audio', blob, take.name);
    fd.append('clientRef', ref);
    if (entityId) fd.append('entityId', String(entityId));
    if (label) fd.append('label', label);
    if (notes) fd.append('notes', notes);
    if (take.durationMs) fd.append('durationMs', String(Math.round(take.durationMs)));
    if (take.capturedAt) fd.append('capturedAt', String(take.capturedAt));
    if (take.source) fd.append('source', take.source);
    if (take.integrity) fd.append('integrity', take.integrity);
    if (reference) fd.append('reference', '1');
    media = await P.audio.upload(fd, { onProgress });
    if (take.sizeBytes && media.size !== take.sizeBytes) {
      const err = new Error('size_mismatch');
      err.media = media;
      throw err;
    }
  }
  // Repères posés pendant la prise : même logique, une référence par repère.
  const markers = take.markers || [];
  for (let i = 0; i < markers.length; i += 1) {
    const m = markers[i];
    await P.audio.markers.create(media.id, {
      tMs: Math.max(0, Math.round(m.tMs)), endMs: m.endMs ?? undefined, kind: m.kind || 'marker',
      label: m.label || '', note: m.note || '', clientRef: `${ref.slice(0, 40)}-m${i}`,
    });
  }
  return media;
}

export { isNetworkError };
