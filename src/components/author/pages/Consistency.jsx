import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../../ui/ToastProvider';
import { useAuthor } from '../context';
import { kindMeta } from '../kinds';
import { useShellPage } from '../Shell';
import { Btn, Dialog, Empty, ErrorLine, Tabs, entityPath, humanError, relativeTime } from '../ui';

// Cohérence du monde : les règles tournent côté serveur
// (server/author/consistency.js) sur une photographie du projet. Chaque
// problème mène aux éléments concernés ; « Ignorer » est mémorisé sans
// toucher aux données ; les mentions non reliées proposent le lien en un clic.
//
// Trois natures, à ne pas confondre :
//   - calculée   : déduite de ce qui est daté et relié (un mort qui parle, une
//                  fin avant un début) — le calcul ne se discute pas, les
//                  données peut-être ;
//   - déclarée   : repose sur une relation que TU as posée (« contredit ») ;
//   - suggestion : une piste, pas un problème (mention sans lien).
// Ignorer se fait AVEC une raison, gardée et affichée : dans six mois, on sait
// encore pourquoi c'était voulu.

const SEV = {
  error: { label: 'Incohérence', color: '#ff8a9b', icon: '⛔' },
  warning: { label: 'À vérifier', color: '#e8d27c', icon: '⚠️' },
  info: { label: 'Suggestion', color: '#80c8e8', icon: '💡' },
};

const NATURE = {
  calculee: { label: 'Calculée', hint: 'Déduite des dates et des relations du projet.' },
  declaree: { label: 'Déclarée', hint: 'Repose sur une relation que tu as posée toi-même.' },
  suggestion: { label: 'Suggestion', hint: 'Une piste à regarder, pas une erreur.' },
};
const REASONS = ['C\'est voulu', 'Faux positif', 'À revoir plus tard'];

function DismissDialog({ issue, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  useEffect(() => { setReason(''); }, [issue?.key]);
  return (
    <Dialog
      open={!!issue} onClose={onClose} title="Ignorer ce signalement" width={460}
      footer={<><Btn variant="ghost" onClick={onClose}>Annuler</Btn><Btn variant="primary" onClick={() => onConfirm(reason.trim())}>Ignorer</Btn></>}
    >
      {issue && <p className="au-muted" style={{ marginTop: 0 }}>{issue.title}</p>}
      <label className="au-field" style={{ display: 'block' }}>
        <span className="au-field-label" style={{ display: 'block' }}>Pourquoi ? (facultatif, gardé avec le signalement)</span>
        <input className="au-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Ex. : il ment sur son âge, c'est le sujet du chapitre 12" />
      </label>
      <div className="au-chips-row" style={{ marginTop: 8 }}>
        {REASONS.map((r) => <button key={r} type="button" className={`au-chip ${reason === r ? 'is-sel' : ''}`} onClick={() => setReason(r)}>{r}</button>)}
      </div>
      <p className="au-faint" style={{ fontSize: 12 }}>Rien n&apos;est modifié dans le projet. Le signalement reste consultable dans « Ignorés » et se réactive d&apos;un clic.</p>
    </Dialog>
  );
}

export function Consistency() {
  const { pid, P, index, version, bump } = useAuthor();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('open');
  const [rule, setRule] = useState('');
  const [nature, setNature] = useState('');
  const [asking, setAsking] = useState(null);
  const toast = useToast();
  useShellPage({ crumbs: [{ label: 'Cohérence' }], title: 'Cohérence' });

  const load = useCallback(() => P.consistency.get().then(setData).catch(setError), [P]);
  useEffect(() => { load(); }, [load, version]);

  const byId = new Map(index.map((e) => [e.id, e]));
  const dismiss = async (issue, value, reason = '') => {
    try { await P.consistency.dismiss(issue.key, value, reason); setAsking(null); load(); bump(); } catch (err) { toast.error(humanError(err)); }
  };
  const linkAll = async (issue) => {
    const s = issue.suggestion;
    try {
      for (const chId of s.chapterIds) {
        // Personnage → chapitre (« apparaît dans ») ; chapitre → lieu/lore.
        if (s.kind === 'apparait_dans') await P.links.create({ fromId: s.entityId, toId: chId, kind: s.kind });
        else await P.links.create({ fromId: chId, toId: s.entityId, kind: s.kind });
      }
      toast.success('Relations créées');
      bump();
    } catch (err) { toast.error(humanError(err)); }
  };

  const list = data ? (tab === 'open' ? data.issues : data.dismissed) : [];
  const rules = data ? data.rules.filter((r) => [...data.issues, ...data.dismissed].some((i) => i.rule === r.id)) : [];
  const natures = Object.keys(NATURE).filter((n) => list.some((i) => i.nature === n));
  const shown = list.filter((i) => (!rule || i.rule === rule) && (!nature || i.nature === nature));

  return (
    <div className="au-page is-narrow">
      <div className="au-page-head">
        <div>
          <h1>🧭 Cohérence</h1>
          <div className="au-sub">Anciens noms, apparitions prématurées, ubiquité, chronologies impossibles, contradictions…</div>
        </div>
        <div className="au-actions">
          <Tabs value={tab} onChange={setTab} options={[['open', `À traiter${data ? ` (${data.issues.length})` : ''}`], ['dismissed', `Ignorés${data ? ` (${data.dismissed.length})` : ''}`]]} />
        </div>
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {natures.length > 1 && (
        <div className="au-chips-row" role="group" aria-label="Nature du signalement">
          <button type="button" className={`au-chip ${!nature ? 'is-sel' : ''}`} onClick={() => setNature('')}>Toutes</button>
          {natures.map((n) => (
            <button key={n} type="button" className={`au-chip ${nature === n ? 'is-sel' : ''}`} title={NATURE[n].hint} onClick={() => setNature(nature === n ? '' : n)}>
              {NATURE[n].label} ({list.filter((i) => i.nature === n).length})
            </button>
          ))}
        </div>
      )}
      {rules.length > 1 && (
        <div className="au-chips-row">
          <button type="button" className={`au-chip ${!rule ? 'is-sel' : ''}`} onClick={() => setRule('')}>Toutes les règles</button>
          {rules.map((r) => <button key={r.id} type="button" className={`au-chip ${rule === r.id ? 'is-sel' : ''}`} onClick={() => setRule(rule === r.id ? '' : r.id)}>{r.label}</button>)}
        </div>
      )}
      {data && shown.length === 0 && (
        <Empty icon={tab === 'open' ? '✨' : '📭'} title={tab === 'open' ? 'Aucune incohérence détectée' : 'Rien d\'ignoré'}>
          {tab === 'open' ? 'Plus tu relies personnages, lieux, événements et chapitres, plus la vérification est fine.' : ''}
        </Empty>
      )}
      {shown.map((i) => {
        const sev = SEV[i.severity] || SEV.info;
        return (
          <div key={i.key} className="au-card au-issue" style={{ '--sev': sev.color }}>
            <div className="au-issue-head">
              <span aria-hidden>{sev.icon}</span>
              <span className="au-pill" style={{ '--pill': sev.color }}>{sev.label}</span>
              <span className="au-faint" style={{ fontSize: 11.5 }}>{i.ruleLabel}</span>
              {NATURE[i.nature] && <span className="au-faint au-issue-nature" title={NATURE[i.nature].hint}>{NATURE[i.nature].label}</span>}
            </div>
            <div className="au-issue-title">{i.title}</div>
            {i.detail && <p className="au-muted" style={{ fontSize: 13, margin: '4px 0 8px' }}>{i.detail}</p>}
            {tab === 'dismissed' && (
              <p className="au-issue-reason">
                Ignoré{i.dismissedAt ? ` ${relativeTime(i.dismissedAt)}` : ''}{i.reason ? <> — <em>{i.reason}</em></> : ' sans raison notée'}
              </p>
            )}
            <div className="au-issue-foot">
              {i.entityIds.slice(0, 8).map((eid) => {
                const e = byId.get(eid);
                if (!e) return null;
                return (
                  <Link key={eid} to={e.kind === 'chapter' ? `/auteur/${pid}/ecrire/${eid}` : entityPath(pid, e)} className="au-chip" style={{ color: 'var(--au-text)' }}>
                    {e.icon || kindMeta(e.kind).icon} {e.number ? `${e.number}. ` : ''}{e.title}
                  </Link>
                );
              })}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {i.suggestion && tab === 'open' && <Btn size="small" variant="primary" onClick={() => linkAll(i)}>🔗 Créer les relations</Btn>}
                <Btn size="small" variant="ghost" onClick={() => (tab === 'open' ? setAsking(i) : dismiss(i, false))}>{tab === 'open' ? 'Ignorer…' : 'Réactiver'}</Btn>
              </span>
            </div>
          </div>
        );
      })}
      <DismissDialog issue={asking} onClose={() => setAsking(null)} onConfirm={(reason) => dismiss(asking, true, reason)} />
    </div>
  );
}
