import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { useAuthor } from './context';
import { Btn, ErrorLine, Field, formatDateTime, humanError } from './ui';

// Partage du livre (côté propriétaire) : qui peut lire, avec quel rôle, et
// quels chapitres sont publiés pour le rôle lecteur.

export const SHARE_ROLES = [
  {
    key: 'omniscient', icon: '👁️', label: 'Omniscient',
    help: 'Voit tout le livre — fiches, chapitres en cours, plan, chronologie, graphe, tableaux partagés — et peut commenter. Ne voit jamais le brainstorming, les tâches ni la corbeille. Ne peut rien modifier.',
  },
  {
    key: 'lecteur', icon: '📖', label: 'Lecteur',
    help: 'Ne voit que les chapitres « Terminés » que tu as publiés, dans une liseuse. Rien d\'autre.',
  },
];
const roleOf = (k) => SHARE_ROLES.find((r) => r.key === k) || SHARE_ROLES[0];

export function SharingPanel() {
  const { P, pid } = useAuthor();
  const toast = useToast();
  const confirm = useConfirm();
  const [shares, setShares] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('omniscient');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => P.shares.list().then(setShares).catch(setError), [P]);
  useEffect(() => { load(); }, [load]);
  // Suggestions d'e-mails : la liste des comptes (route admin existante).
  useEffect(() => { api.users().then((list) => setAccounts(Array.isArray(list) ? list : [])).catch(() => {}); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await P.shares.add(email.trim(), role);
      setEmail('');
      toast.success('Accès ouvert');
      load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const change = async (s, next) => {
    try { await P.shares.update(s.userId, next); load(); } catch (err) { toast.error(humanError(err)); }
  };
  const revoke = async (s) => {
    if (!(await confirm({
      title: `Retirer l'accès de ${s.name} ?`, message: 'Le livre disparaît immédiatement de son côté. Ses commentaires restent.',
      confirmLabel: 'Retirer l\'accès', danger: true,
    }))) return;
    try { await P.shares.remove(s.userId); load(); } catch (err) { toast.error(humanError(err)); }
  };

  const shared = new Set((shares || []).map((s) => s.email));
  return (
    <div>
      <p className="au-muted" style={{ fontSize: 13, marginTop: 0 }}>
        Ouvre ce livre en <strong>lecture</strong> à un compte du site. Personne d&apos;autre que toi ne peut rien y modifier,
        et ton brainstorming reste privé quel que soit le rôle.
      </p>
      <div className="au-share-roles">
        {SHARE_ROLES.map((r) => <div key={r.key}><strong>{r.icon} {r.label}</strong><span className="au-faint">{r.help}</span></div>)}
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {shares?.length > 0 && (
        <div className="au-list" style={{ margin: '12px 0' }}>
          {shares.map((s) => (
            <div key={s.userId} className="au-row" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <span className="au-avatar" aria-hidden>{roleOf(s.role).icon}</span>
              <span className="au-row-main">
                <span className="au-row-title" style={{ display: 'block' }}>{s.name}</span>
                <span className="au-row-meta" style={{ display: 'block' }}>{s.email} · depuis le {formatDateTime(s.createdAt)}</span>
              </span>
              <select className="au-select" value={s.role} onChange={(e) => change(s, e.target.value)} aria-label={`Rôle de ${s.name}`} style={{ width: 'auto' }}>
                {SHARE_ROLES.map((r) => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
              </select>
              <Btn size="small" variant="ghost" onClick={() => revoke(s)}>Retirer</Btn>
            </div>
          ))}
        </div>
      )}
      {shares?.length === 0 && <p className="au-faint" style={{ fontSize: 12.5 }}>Ce livre n&apos;est partagé avec personne.</p>}
      <form onSubmit={add} className="au-share-form">
        <Field label="E-mail du compte">
          <input className="au-input" type="email" list="au-share-accounts" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="ami@exemple.fr" autoComplete="off" />
          <datalist id="au-share-accounts">
            {accounts.filter((a) => !shared.has(a.email)).map((a) => <option key={a.id} value={a.email}>{a.name}</option>)}
          </datalist>
        </Field>
        <Field label="Rôle">
          <select className="au-select" value={role} onChange={(e) => setRole(e.target.value)}>
            {SHARE_ROLES.map((r) => <option key={r.key} value={r.key}>{r.icon} {r.label}</option>)}
          </select>
        </Field>
        <Btn type="submit" variant="primary" disabled={busy || !email.trim()}>Partager</Btn>
      </form>
      <p className="au-faint" style={{ fontSize: 12, marginBottom: 0 }}>
        La personne se connecte sur le site puis ouvre <code>/auteur</code>.{' '}
        <Link to={`/auteur/${pid}/apercu`} style={{ color: 'var(--au-acc)' }}>Voir ce que voit un lecteur →</Link>
      </p>
    </div>
  );
}

// Publication d'un chapitre pour le rôle lecteur. Possible seulement au
// statut « Terminé » ; repasser à un autre statut dépublie (côté serveur).
// `beforeAction` laisse l'éditeur envoyer d'abord un statut pas encore parti.
export function ChapterPublish({ ch, onChange, beforeAction }) {
  const { P, bump } = useAuthor();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const set = async (value) => {
    setBusy(true);
    try {
      await beforeAction?.();
      const r = await P.entities.validate(ch.id, value);
      onChange?.(r.validatedAt);
      bump();
      toast.success(value ? 'Chapitre publié pour les lecteurs' : 'Chapitre retiré des lecteurs');
    } catch (err) {
      toast.error(humanError(err));
    } finally { setBusy(false); }
  };
  if (ch.validatedAt) {
    return (
      <div className="au-publish is-on">
        <span>📖 Publié pour les lecteurs <span className="au-faint">· {formatDateTime(ch.validatedAt)}</span></span>
        <Btn size="small" variant="ghost" onClick={() => set(false)} disabled={busy}>Retirer</Btn>
      </div>
    );
  }
  if (ch.status !== 'termine') {
    return <div className="au-publish au-faint">📖 Passe le chapitre en « Terminé » pour pouvoir le publier aux lecteurs (repasser à un autre statut le retire).</div>;
  }
  return (
    <div className="au-publish">
      <span>Terminé — pas encore visible des lecteurs.</span>
      <Btn size="small" variant="primary" onClick={() => set(true)} disabled={busy}>📖 Publier</Btn>
    </div>
  );
}
