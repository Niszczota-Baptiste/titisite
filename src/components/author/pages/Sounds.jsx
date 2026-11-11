import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { AudioPlayer } from '../audio/AudioPlayer';
import { RecorderDialog } from '../audio/RecorderDialog';
import { AUDIO_ACCEPT, fileAsTake } from '../audio/TakesPanel';
import { formatMs } from '../audio/time.js';
import { sendTake } from '../audio/upload.js';
import { useAuthor } from '../context';
import { kindMeta } from '../kinds';
import { isNetworkError } from '../offline/net.js';
import { useShellPage } from '../Shell';
import { Btn, Empty, ErrorLine, PromptDialog, formatDateTime, humanError, relativeTime } from '../ui';

// Atelier musical du projet : les idées musicales (chacune avec ses prises) et
// les prises pas encore rangées. Tout y est privé ; publier une prise est un
// geste séparé, depuis la fiche de l'idée.

export function Sounds() {
  const { pid, P, version, createEntity, bump } = useAuthor();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const meta = kindMeta('sound');
  const [items, setItems] = useState(null);
  const [loose, setLoose] = useState([]);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [openId, setOpenId] = useState(null);
  const fileInput = useRef(null);
  useShellPage({ crumbs: [{ label: meta.plural }], title: meta.plural });

  const load = useCallback(() => {
    P.entities.list({ kind: 'sound', sort: 'updated', limit: 200 }).then((r) => setItems(r.items)).catch((e) => { setError(e); setItems([]); });
    P.audio.list().then((list) => setLoose(list.filter((a) => !a.entity || a.entity.trashed))).catch(() => setLoose([]));
  }, [P]);
  useEffect(() => { load(); }, [load, version]);

  const create = async (title) => {
    setCreating(false);
    try {
      const e = await createEntity('sound', { title });
      navigate(`/auteur/${pid}/e/${e.id}`);
    } catch (err) { toast.error(humanError(err)); }
  };

  // Une prise enregistrée ici devient une idée musicale à part entière, avec
  // cette prise pour référence.
  const keepTake = async ({ take, label }) => {
    const e = await createEntity('sound', { title: label });
    if (e.local) {
      // Créée hors connexion : pas encore d'identifiant côté site pour y ranger la prise.
      throw Object.assign(new Error('offline'), { offline: true, status: 0 });
    }
    await sendTake(P, take, { entityId: e.id, label });
    toast.success('Idée musicale créée, prise rangée');
    bump();
    navigate(`/auteur/${pid}/e/${e.id}`);
  };

  const importFiles = async (files) => {
    for (const file of [...files]) {
      try {
        const take = await fileAsTake(file);
        await sendTake(P, take, { label: (file.name || '').replace(/\.[^.]+$/, '') });
      } catch (err) {
        toast.error(`${file.name} : ${isNetworkError(err) ? 'hors connexion, réessaie plus tard' : humanError(err.body?.error || err)}`);
      }
    }
    load();
  };

  const file = async (take, entityId) => {
    try { await P.audio.update(take.id, { entityId }); bump(); load(); }
    catch (err) { toast.error(humanError(err.body?.error || err)); }
  };

  const asNewIdea = async (take) => {
    try {
      const e = await createEntity('sound', { title: take.label || 'Idée musicale' });
      await P.audio.update(take.id, { entityId: e.id });
      navigate(`/auteur/${pid}/e/${e.id}`);
    } catch (err) { toast.error(humanError(err.body?.error || err)); }
  };

  const remove = async (take) => {
    const ok = await confirm({ title: 'Supprimer cette prise ?', message: `« ${take.label || 'Prise'} » sera supprimée définitivement.`, confirmLabel: 'Supprimer définitivement', danger: true });
    if (!ok) return;
    try { await P.audio.remove(take.id); load(); } catch (err) { toast.error(humanError(err)); }
  };

  return (
    <div className="au-page">
      <div className="au-page-head">
        <div>
          <h1>{meta.icon} {meta.plural}</h1>
          <p className="au-sub">Mélodies, rythmes, paroles : capture, compare, annote. Tout reste privé tant que tu ne publies pas.</p>
        </div>
        <div className="au-actions">
          <Btn variant="primary" onClick={() => setRecording(true)}>● Enregistrer</Btn>
          <Btn onClick={() => setCreating(true)}>＋ {meta.newLabel}</Btn>
          <Btn variant="ghost" onClick={() => fileInput.current?.click()}>Importer un son</Btn>
          <input ref={fileInput} type="file" accept={AUDIO_ACCEPT} multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />

      {items === null && <p className="au-muted">Chargement…</p>}
      {items?.length === 0 && loose.length === 0 && (
        <Empty icon="🎵" title="Aucune idée musicale pour l'instant">
          Enregistre quelques secondes, fredonne, tape un rythme : l&apos;idée est gardée, tu la développeras plus tard.
        </Empty>
      )}

      <div className="au-sound-list">
        {items?.map((e) => (
          <div key={e.id} className="au-card au-sound">
            <div className="au-sound-head">
              <Link to={`/auteur/${pid}/e/${e.id}`} className="au-sound-title">{e.icon || meta.icon} {e.title || 'Sans titre'}</Link>
              <span className="au-faint au-sound-meta">
                {[meta.listMeta(e), `${e.audioCount || 0} prise${e.audioCount > 1 ? 's' : ''}`, `modifiée ${relativeTime(e.updatedAt)}`].filter(Boolean).join(' · ')}
              </span>
            </div>
            {e.summary && <p className="au-muted au-sound-summary">{e.summary}</p>}
            {e.reference
              ? (openId === e.id
                ? <AudioPlayer src={e.reference.url} durationMs={e.reference.durationMs} label={e.title} compact />
                : <Btn size="small" onClick={() => setOpenId(e.id)}>▶ Écouter la référence <span className="au-faint">· {formatMs(e.reference.durationMs)}</span></Btn>)
              : <span className="au-faint" style={{ fontSize: 12.5 }}>{e.audioCount ? 'Pas de prise de référence.' : 'Pas encore de prise.'}</span>}
          </div>
        ))}
      </div>

      {loose.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 className="au-card-title">Prises non rangées <span className="au-faint">({loose.length})</span></h2>
          <p className="au-faint" style={{ fontSize: 12.5, marginTop: 0 }}>Importées sans idée, ou dont l&apos;idée musicale a été supprimée. Elles restent privées.</p>
          {loose.map((t) => (
            <div key={t.id} className="au-card au-sound">
              <div className="au-sound-head">
                <strong>{t.label || t.originalName || `Prise ${t.id}`}</strong>
                <span className="au-faint au-sound-meta">{formatMs(t.durationMs)} · {formatDateTime(t.capturedAt || t.createdAt)}</span>
              </div>
              <AudioPlayer src={t.url} durationMs={t.durationMs} label={t.label || 'prise'} compact />
              <div className="au-sound-file">
                <select className="au-select" defaultValue="" aria-label="Ranger cette prise dans une idée musicale" onChange={(e) => { if (e.target.value) file(t, Number(e.target.value)); }}>
                  <option value="">Ranger dans…</option>
                  {(items || []).map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </select>
                <Btn size="small" onClick={() => asNewIdea(t)}>En faire une idée</Btn>
                <Btn size="small" variant="ghost" onClick={() => remove(t)}>Supprimer</Btn>
              </div>
            </div>
          ))}
        </section>
      )}

      <PromptDialog open={creating} title={`＋ ${meta.newLabel}`} label="Titre (provisoire, ça se change)" placeholder="Valse du port" confirmLabel="Créer" onClose={() => setCreating(false)} onSubmit={create} />
      <RecorderDialog open={recording} onClose={() => setRecording(false)} onTake={keepTake} title="🎙️ Enregistrer une idée" />
    </div>
  );
}
