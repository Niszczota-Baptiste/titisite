import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthor } from '../context';
import { useShellPage } from '../Shell';
import { Empty, ErrorLine, Tabs } from '../ui';
import { CommentItem, CommentsThread } from './CommentsThread';

// Page « Commentaires » : le fil général du livre, puis tous les échanges
// rattachés aux fiches et chapitres. Le propriétaire filtre « à traiter » ;
// l'invité omniscient y retrouve tout ce qui a été dit sur ce qu'il voit.

export function CommentsPage() {
  const { pid, P, guest, version } = useAuthor();
  const [tab, setTab] = useState(guest ? 'all' : 'open');
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  useShellPage({ crumbs: [{ label: 'Commentaires' }], title: 'Commentaires' });

  const load = useCallback(() => P.comments.list(tab === 'open' ? { open: 1 } : {})
    .then((list) => setItems(list.filter((c) => c.entityId !== null))).catch(setError), [P, tab]);
  useEffect(() => { load(); }, [load, version]);

  return (
    <div className="au-page is-narrow">
      <div className="au-page-head">
        <div>
          <h1>💬 Commentaires</h1>
          <div className="au-sub">
            {guest
              ? 'Tes remarques, questions et ce que tu comprends du livre — l\'auteur les lit et y répond.'
              : <>Les remarques de tes lecteurs omniscients. Les accès se gèrent dans <Link to={`/auteur/${pid}/reglages`} style={{ color: 'var(--au-acc)' }}>Réglages → Partage</Link>.</>}
          </div>
        </div>
      </div>

      <div className="au-card" style={{ marginBottom: 22 }}>
        <CommentsThread title="📕 Fil général du livre" emptyText="Ce que tu comprends de l'histoire, tes théories, tes impressions d'ensemble…" />
      </div>

      <div className="au-card-title" style={{ marginBottom: 10 }}>
        Sur les fiches et les chapitres
        {!guest && (
          <span style={{ marginLeft: 'auto' }}>
            <Tabs value={tab} onChange={setTab} options={[['open', 'À traiter'], ['all', 'Tout']]} />
          </span>
        )}
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {items?.length === 0 && (
        <Empty icon="💬" title={tab === 'open' ? 'Rien à traiter' : 'Aucun commentaire'}>
          {guest ? 'Ouvre une fiche ou un chapitre pour y laisser une remarque — tu peux aussi sélectionner un passage d\'un chapitre pour le citer.' : 'Les commentaires laissés sur une fiche ou un chapitre apparaissent ici.'}
        </Empty>
      )}
      <div className="au-comment-list">
        {items?.map((c) => <CommentItem key={c.id} c={c} onChanged={load} showTarget />)}
      </div>
    </div>
  );
}
