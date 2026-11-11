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
//   recorder.cancel()                 abandonne (rien n'est gardé)
//   recorder.subscribe(fn) → off      état : { status, elapsedMs, notice, error }
//
//   Take = { name, mime, sizeBytes, durationMs, capturedAt, source: 'recorded',
//            integrity: 'ok' | 'recovered', markers: [{ tMs, label, kind }],
//            previewUrl, toBlob(), release() }
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

export const recorderMessage = (err) => RECORDER_ERRORS[err?.code] || RECORDER_ERRORS[err?.message] || `Enregistrement impossible (${err?.message || 'erreur inconnue'}).`;
