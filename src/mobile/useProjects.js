import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

// Projets du compte connecté, avec une petite copie sur l'appareil (titres
// seulement) pour que l'accueil propose « Reprendre » même sans réseau.
// La copie est rangée par compte et effacée à la déconnexion.

const KEY = (owner) => `am-projects:${owner}`;
const LAST_KEY = 'au-last-project'; // posé par l'atelier à l'ouverture d'un projet

function readCache(owner) {
  try { return JSON.parse(localStorage.getItem(KEY(owner)) || 'null'); } catch { return null; }
}

export function forgetProjects(owner) {
  try { if (owner) localStorage.removeItem(KEY(owner)); } catch { /* ignore */ }
}

export function lastProjectId() {
  try { return Number(localStorage.getItem(LAST_KEY)) || null; } catch { return null; }
}

export function useProjects(session) {
  const owner = session.status === 'ready' ? session.owner : null;
  const [state, setState] = useState(() => ({ list: owner ? readCache(owner)?.list || null : null, fresh: false, error: null }));

  const reload = useCallback(async () => {
    if (!owner) { setState({ list: null, fresh: false, error: null }); return; }
    try {
      const list = (await api.author.projects.list()).map((p) => ({
        id: p.id, title: p.title, subtitle: p.subtitle || '', access: p.access, kind: p.kind || null,
        updatedAt: p.updatedAt || null, words: p.words ?? null, ownerName: p.ownerName || null,
      }));
      try { localStorage.setItem(KEY(owner), JSON.stringify({ at: Date.now(), list })); } catch { /* ignore */ }
      setState({ list, fresh: true, error: null });
    } catch (error) {
      setState((s) => ({ list: s.list || readCache(owner)?.list || null, fresh: false, error }));
    }
  }, [owner]);

  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

// Projet à reprendre : le dernier ouvert sur cet appareil, sinon le plus
// récemment modifié.
export function pickRecent(list) {
  if (!list?.length) return null;
  const last = lastProjectId();
  return list.find((p) => p.id === last) || [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
}
