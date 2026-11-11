import { isNative, native } from './bridge.js';

// Adresse du site auquel l'atelier est relié.
//
// Dans l'application, elle est choisie par l'utilisateur et gardée côté natif ;
// le conteneur sert alors la coquille SOUS cette origine (les appels /api
// restent relatifs, le cookie de session reste de première partie). Dans un
// navigateur, l'atelier est par construction relié au site qui le sert.
export async function loadConfig() {
  if (!isNative()) {
    return {
      native: false, serverUrl: window.location.origin, appVersion: null,
      debug: !import.meta.env?.PROD, allowCleartext: true,
    };
  }
  const c = await native('AtelierConfig', 'get');
  return { native: true, ...c, serverUrl: c.serverUrl || null };
}

// → { ok, url, status?, reason?, message? } — ne bascule rien.
export const probeServer = (url) => native('AtelierConfig', 'probe', { url });

// Enregistre l'adresse puis relance la coquille sous la nouvelle origine.
export const setServer = (url) => native('AtelierConfig', 'setServer', { url });

export async function networkInfo() {
  if (!isNative()) return { connected: typeof navigator === 'undefined' || navigator.onLine !== false, unmetered: true };
  try { return await native('AtelierConfig', 'network'); } catch { return { connected: true, unmetered: false }; }
}
