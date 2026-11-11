import { useCallback, useEffect, useState } from 'react';
import { Btn } from '../components/author/ui';
import { ACTIVITIES, sessionCommand, sessionStatus } from './platform/sessions.js';

// Session créative : début, pause et fin VOLONTAIRES — jamais déduits de
// l'écran (on réfléchit, on joue, téléphone posé). Si Mon Temps est installé,
// il en est informé ; sinon c'est un simple repère. Aucune série, aucun
// objectif, aucun rappel.

const clock = (ms) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

export function SessionCard() {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(() => sessionStatus().then(setState).catch(() => {}), []);
  useEffect(() => {
    refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const run = async (command, activity) => {
    setBusy(true);
    try { setState(await sessionCommand(command, activity)); } catch { await refresh(); } finally { setBusy(false); }
  };

  if (!state) return null;
  const a = state.active;
  return (
    <section className="au-card am-section am-session" aria-label="Session créative">
      <div className="au-card-title">⏱️ Session créative</div>
      {a ? (
        <>
          <p className="am-session-now" role="status">
            <strong>{ACTIVITIES[a.activity] || a.activity}</strong> · {a.paused ? `en pause depuis ${clock(a.pausedAt)}` : `depuis ${clock(a.startedAt)}`}
          </p>
          <div className="am-session-actions">
            {a.paused
              ? <Btn onClick={() => run('resume')} disabled={busy}>Reprendre</Btn>
              : <Btn onClick={() => run('pause')} disabled={busy}>Pause</Btn>}
            <Btn variant="primary" onClick={() => run('stop')} disabled={busy}>Terminer</Btn>
          </div>
        </>
      ) : (
        <div className="am-session-actions">
          <Btn onClick={() => run('start', 'writing')} disabled={busy}>✍️ Écriture</Btn>
          <Btn onClick={() => run('start', 'music')} disabled={busy}>🎵 Musique</Btn>
        </div>
      )}
      <p className="au-faint am-note" style={{ marginBottom: 0 }}>
        {state.last?.label ? `${state.last.label} ` : ''}{state.monTemps?.label || ''}
      </p>
    </section>
  );
}
