import { audioFiles, composeText, imageFiles, itemKind, itemTitle, refFor } from './model.js';

// Classer une capture dans un projet du site — envoi REJOUABLE.
//
// Chaque morceau part avec une référence client dérivée de l'identifiant de la
// capture : si la réponse se perd ou si l'application est fermée en plein
// envoi, le nouvel essai retrouve ce qui est déjà arrivé au lieu de le créer
// une seconde fois. `progress` (gardé avec la capture) évite en plus de
// refaire les étapes déjà confirmées.
//
//   - un son → une idée musicale (ou une nouvelle version d'une idée existante,
//     `target.entityId`), la prise et ses repères ;
//   - texte, lien, image → une idée dans la boîte à idées du projet, ses images
//     rangées dessus.
//
// Rien n'est publié : tout arrive dans l'atelier PRIVÉ. `P` est le client d'un
// projet (api.author.p(pid)), `files` donne accès aux fichiers de la capture
// (files.blob(fileRef) → Blob), `save(progress)` persiste l'avancement,
// `sendTake` vient de components/author/audio/upload.js. Tout est injecté : la
// fonction se teste sans navigateur.

const captured = (item, file) => Math.floor((file?.capturedAt ? file.capturedAt * 1000 : item.createdAt) / 1000);

export async function fileItem({ P, item, files, sendTake, save = async () => {}, onProgress = () => {} }) {
  const progress = { ...(item.progress || {}), mediaIds: { ...(item.progress?.mediaIds || {}) } };
  const step = async (patch) => { Object.assign(progress, patch); await save(progress); };
  const kind = itemKind(item);
  const extra = { origin: String(item.origin || 'saisie').slice(0, 120), capturedAt: Math.floor(item.createdAt / 1000) };
  let entityId = progress.entityId || item.target?.entityId || null;

  if (kind === 'audio') {
    if (!entityId) {
      const note = String(item.text || '').trim();
      const created = await P.entities.create({
        kind: 'sound', title: itemTitle(item, 'Idée musicale'), body: [note, item.url].filter(Boolean).join('\n\n'), clientRef: refFor(item, '-s'),
      });
      entityId = created.id;
      await step({ entityId });
    }
    const takes = audioFiles(item);
    for (let i = 0; i < takes.length; i += 1) {
      const f = takes[i];
      if (progress.mediaIds[f.id]) continue;
      const take = {
        name: f.name, mime: f.mime, sizeBytes: f.size, durationMs: f.durationMs || null, capturedAt: captured(item, f),
        source: item.origin === 'enregistrement' ? 'recorded' : String(item.origin || '').startsWith('partage') ? 'shared' : 'imported',
        integrity: f.integrity || '', markers: f.markers || [], toBlob: () => files.blob(f),
      };
      const media = await sendTake(P, take, {
        clientRef: refFor(item, `-a${i}`), entityId, label: f.label || itemTitle(item, 'Prise'),
        onProgress: (p) => onProgress((i + p) / takes.length),
      });
      progress.mediaIds[f.id] = media.id;
      await save(progress);
    }
  } else if (!entityId) {
    const res = await P.notes.quick(composeText(item), [], refFor(item), extra);
    entityId = res.id;
    await step({ entityId });
  }

  // Images : rangées sur l'élément créé (idée, ou idée musicale).
  const images = imageFiles(item);
  for (let i = 0; i < images.length; i += 1) {
    const f = images[i];
    if (progress.mediaIds[f.id]) continue;
    const fd = new FormData();
    fd.append('image', await files.blob(f), f.name || `image-${i + 1}.jpg`);
    fd.append('entityId', String(entityId));
    fd.append('purpose', 'gallery');
    fd.append('clientRef', refFor(item, `-i${i}`));
    const media = await P.media.upload(fd, {});
    progress.mediaIds[f.id] = media.id;
    await save(progress);
  }
  onProgress(1);
  return { entityId, kind: kind === 'audio' ? 'sound' : 'note', progress };
}
