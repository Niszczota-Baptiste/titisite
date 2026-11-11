import { isNative, native } from './bridge.js';

// Session créative (« Écriture » ou « Musique ») et Mon Temps.
//
// Une session commence, se met en pause et se termine quand JE le décide —
// jamais d'après l'activité de l'écran : on réfléchit, on joue d'un instrument,
// téléphone posé. Dans l'application, l'état est gardé côté natif (plugin
// AtelierSessions) et transmis à Mon Temps par le contrat commun des commandes
// externes (contracts/mon-atelier--mon-temps.md) ; Mon Temps reste seul juge :
// il ignore un arrêt qui ne correspond plus à l'activité en cours. Sans Mon
// Temps (ou dans un navigateur), la session reste un simple repère local.
//
//   { active: null | { activity: 'writing' | 'music', startedAt, paused, pausedAt },
//     monTemps: { state: 'ready' | 'absent' | 'unsupported' | 'denied', label },
//     last: null | { code, label } }

const KEY = 'am-session';
export const ACTIVITIES = { writing: 'Écriture', music: 'Musique' };

const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
const writeLocal = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch { /* ignore */ } };
const localState = () => ({ active: readLocal(), monTemps: { state: 'absent', label: 'Mon Temps n\'est disponible que dans l\'application.' }, last: null });

export async function sessionStatus() {
  if (!isNative()) return localState();
  try { return await native('AtelierSessions', 'status'); } catch { return localState(); }
}

export async function sessionCommand(command, activity) {
  if (isNative()) return native('AtelierSessions', command, activity ? { activity } : {});
  const cur = readLocal();
  const now = Date.now();
  if (command === 'start') writeLocal({ activity, startedAt: now, paused: false, pausedAt: null });
  if (command === 'pause' && cur) writeLocal({ ...cur, paused: true, pausedAt: now });
  if (command === 'resume' && cur) writeLocal({ ...cur, paused: false, pausedAt: null });
  if (command === 'stop') writeLocal(null);
  return localState();
}
