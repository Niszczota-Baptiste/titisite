import { isNative, native, nativeOn } from './bridge.js';

// Ce qui arrive de l'extérieur de l'application (plugin AtelierIntake) :
//   - un partage depuis une autre application (texte, lien, image, son) ;
//   - une action de lancement (raccourci d'application, Mon Focus) :
//     'capture' | 'record' | 'resume'.
// Le partage n'est PAS importé d'office : l'application en montre un aperçu et
// attend la décision (écran /partage). Les fichiers partagés sont copiés par
// le natif dans un dossier d'attente, sans passer par le pont.

export async function pendingShare() {
  if (!isNative()) return null;
  try { return (await native('AtelierIntake', 'pendingShare')).share || null; } catch { return null; }
}

// `keep` : true = les fichiers en attente sont adoptés par la boîte de
// réception (ne pas les effacer) ; false = partage refusé, tout est effacé.
export async function clearShare(keep) {
  if (!isNative()) return;
  try { await native('AtelierIntake', 'clearShare', { keep: !!keep }); } catch { /* rien à nettoyer */ }
}

export async function launchAction() {
  if (!isNative()) return null;
  try { return (await native('AtelierIntake', 'launchAction')).action || null; } catch { return null; }
}

export function onShare(handler) { return nativeOn('AtelierIntake', 'share', handler); }
export function onAction(handler) { return nativeOn('AtelierIntake', 'action', (d) => handler(d.action)); }
