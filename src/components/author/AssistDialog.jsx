import { useEffect, useState } from 'react';
import { useNet } from './offline/hooks.js';
import { Btn, Dialog, cx, humanError } from './ui';

// Assistance d'écriture facultative — côté interface, trois promesses :
//   1. on voit EXACTEMENT ce qui part (l'extrait sélectionné, sans les marques
//      de travail) avant de l'envoyer, et rien d'autre ne part ;
//   2. rien n'est envoyé sans le bouton « Envoyer cet extrait » ;
//   3. une proposition n'entre dans le texte que sur un geste — et elle y entre
//      comme VARIANTE ou comme QUESTION : le passage d'origine reste en place.
// Les règles elles-mêmes (clé côté serveur, activation par projet, taille
// bornée) sont tenues par le serveur : server/author/assist.js.

export function AssistDialog({ open, onClose, P, info, excerpt, onKeep }) {
  const net = useNet();
  const [task, setTask] = useState('questions');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => { if (open) { setError(null); setResult(null); setBusy(false); } }, [open, excerpt?.text]);
  if (!open || !info || !excerpt) return null;

  const tooLong = excerpt.text.length > info.maxChars;
  const meta = info.tasks.find((t) => t.key === task) || info.tasks[0];
  const send = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await P.assist.ask({ task: meta.key, text: excerpt.text, brief: brief.trim() || undefined }));
    } catch (err) {
      setError(err);
    } finally { setBusy(false); }
  };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); } catch { /* presse-papiers indisponible */ } };
  // Une proposition qui contiendrait la syntaxe des marques ne peut pas être
  // rangée dans une marque sans la casser : on ne propose alors que la copie.
  const insertable = (text) => !!meta.insert && !/\{\{|\}\}|\|\|/.test(text) && (meta.insert === 'question' || excerpt.canWrap);

  return (
    <Dialog open onClose={onClose} title="✨ Propositions sur un extrait" width={560} initialFocus={false}
      footer={<><Btn variant="ghost" onClick={onClose}>Fermer</Btn><Btn variant="primary" onClick={send} disabled={busy || tooLong || !net.online}>{busy ? 'Demande en cours…' : result ? 'Redemander' : 'Envoyer cet extrait'}</Btn></>}>
      <div className="au-assist-sent">
        <div className="au-field-label">Ce qui sera envoyé — et rien d&apos;autre</div>
        <blockquote className="au-assist-excerpt">{excerpt.text}</blockquote>
        <div className={cx('au-faint', tooLong && 'au-assist-over')} style={{ fontSize: 12 }}>
          {excerpt.text.length} / {info.maxChars} signes{tooLong ? ' — trop long : réduis la sélection, l\'extrait n\'est jamais coupé à ta place.' : ''}
          {excerpt.cleaned && !tooLong ? ' · tes marques de travail (questions, autres versions) ont été retirées de l\'envoi.' : ''}
        </div>
      </div>

      <div className="au-chips-row" role="radiogroup" aria-label="Type de proposition" style={{ marginTop: 12 }}>
        {info.tasks.map((t) => (
          <button key={t.key} type="button" role="radio" aria-checked={task === t.key} title={t.hint}
            className={cx('au-chip', task === t.key && 'is-sel')} onClick={() => { setTask(t.key); setResult(null); }}>{t.label}</button>
        ))}
      </div>
      <div className="au-faint" style={{ fontSize: 12, margin: '4px 0 8px' }}>{meta.hint}.</div>
      <label className="au-field" style={{ display: 'block' }}>
        <span className="au-field-label" style={{ display: 'block' }}>Précision (facultative, envoyée avec l&apos;extrait)</span>
        <input className="au-input" value={brief} maxLength={info.briefMax} onChange={(e) => setBrief(e.target.value)} placeholder="Ex. : plus sec, sans adjectif" />
      </label>

      {!net.online && <p className="au-offline-note">Hors connexion : l&apos;assistance demande le réseau. Rien n&apos;est mis en attente.</p>}
      {error && <div className="au-error" role="alert">{humanError(error)}</div>}

      {result && (
        <div className="au-assist-results" aria-live="polite">
          {result.suggestions.length === 0 && <p className="au-muted">Aucune proposition cette fois.</p>}
          {result.suggestions.map((s, i) => (
            <div key={`${i}-${s.text.slice(0, 24)}`} className="au-assist-item">
              <p className="au-assist-text">{s.text}</p>
              {s.why && <p className="au-faint au-assist-why">{s.why}</p>}
              <div className="au-assist-ops">
                <Btn size="small" variant="ghost" onClick={() => copy(s.text)}>Copier</Btn>
                {insertable(s.text) && (
                  <Btn size="small" onClick={() => onKeep(meta.insert, s.text)}>
                    {meta.insert === 'question' ? 'Noter comme question' : 'Garder comme variante'}
                  </Btn>
                )}
              </div>
            </div>
          ))}
          <p className="au-faint" style={{ fontSize: 12 }}>Des propositions, pas des corrections : rien n&apos;a été modifié dans ton texte.</p>
        </div>
      )}
    </Dialog>
  );
}
