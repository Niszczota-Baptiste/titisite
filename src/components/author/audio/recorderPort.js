// Port « enregistreur » : comment l'atelier capte un son.
//
// Par défaut, le MediaRecorder du navigateur (webRecorder.js, chargé à la
// demande). L'application Mon Atelier enregistre en natif — service au premier
// plan, écran éteint, fichier écrit sur l'appareil — et inscrit sa fabrique ici
// au démarrage (src/mobile/platform/recorder.js). L'interface (RecorderDialog)
// ne connaît que ce contrat :
//
//   recorder.kind                     'web' | 'native'
//   recorder.prepare()                demande le micro (au moment utile, pas avant)
//   recorder.start()                  commence la prise
//   recorder.pause() / resume()
//   recorder.mark(label?)             pose un repère à l'instant courant
//   recorder.stop()        → Take     termine et rend la prise
//   recorder.cancel()                 quitte l'écran d'enregistrement. Navigateur :
//                                     abandonne la prise en cours. Application : la
//                                     prise CONTINUE (service + notification) et se
//                                     retrouve en rouvrant l'écran.
//   recorder.subscribe(fn) → off      état : { status, elapsedMs, notice, error }
//   recorder.onTake?(fn) → off        prise terminée hors de l'interface (bouton
//                                     « Arrêter » de la notification)
//
//   Take = { name, mime, sizeBytes, durationMs, capturedAt, source: 'recorded',
//            integrity: 'ok' | 'recovered', markers: [{ tMs, label, kind }],
//            previewUrl, toBlob(), release() }
//
//   `release()` = l'interface n'a plus besoin de la prise (rangée, envoyée ou
//   jetée) : ses ressources locales sont libérées.
//
// `integrity: 'recovered'` = la prise a été interrompue (micro retiré, appel,
// arrêt brutal) et ce qui a été capté jusque-là a été récupéré : elle est
// signalée comme telle, jamais présentée comme une prise complète.

let factory = null;

export function setRecorderFactory(fn) {
  factory = fn;
}

export async function createRecorder() {
  if (factory) return factory();
  const { createWebRecorder } = await import('./webRecorder.js');
  return createWebRecorder();
}

// Messages d'erreur du micro, communs aux deux enregistreurs.
export const RECORDER_ERRORS = {
  unsupported: 'Ce navigateur ne sait pas enregistrer. Importe plutôt un fichier audio.',
  mic_denied: 'Le micro n\'est pas autorisé. Autorise-le pour cette page (ou pour l\'application) puis réessaie.',
  mic_policy: 'Le micro est fermé pour cette page. Recharge la page depuis l\'atelier, puis réessaie.',
  mic_missing: 'Aucun micro détecté.',
  mic_busy: 'Le micro est utilisé par une autre application (un appel en cours ?).',
  no_space: 'Plus assez de place sur l\'appareil pour enregistrer. Libère de l\'espace puis réessaie.',
  interrupted: 'L\'enregistrement a été interrompu. Ce qui a été capté est conservé.',
};

// `nativeMessage` : phrase déjà rédigée par l'application (plus précise que le
// message générique du code d'erreur).
export const recorderMessage = (err) => err?.nativeMessage || RECORDER_ERRORS[err?.code] || RECORDER_ERRORS[err?.message] || `Enregistrement impossible (${err?.message || 'erreur inconnue'}).`;

// Avis affiché pendant une prise : un code ci-dessus, ou une phrase déjà rédigée.
export const noticeText = (notice) => RECORDER_ERRORS[notice] || notice;

// Repli d'une prise qui n'a pas pu être envoyée au site. L'application y
// inscrit sa boîte de réception locale : la prise est gardée sur l'appareil et
// partira d'elle-même au retour du réseau, vers le même élément.
//   { label, run({ take, label, context }) → Promise }
let takeFallback = null;
export function setTakeFallback(spec) { takeFallback = spec; }
export const getTakeFallback = () => takeFallback;
