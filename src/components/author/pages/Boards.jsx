import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useAuthor } from '../context';
import { useShellPage } from '../Shell';
import { Btn, Empty, ErrorLine, PromptDialog, relativeTime, useMenu } from '../ui';

// Les tableaux blancs du livre (carte politique, intrigues, arbres
// généalogiques…). Un tableau = une page infinie.

export function Boards() {
  const { pid, P, version } = useAuthor();
  const [boards, setBoards] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [openMenu, menu] = useMenu();
  const confirm = useConfirm();
  const navigate = useNavigate();
  useShellPage({ crumbs: [{ label: 'Tableaux blancs' }], title: 'Tableaux blancs' });

  const load = useCallback(() => P.boards.list().then(setBoards).catch(setError), [P]);
  useEffect(() => { load(); }, [load, version]);

  // Un tableau est privé par défaut (c'est un outil de brainstorming) : on
  // l'ouvre explicitement aux invités omniscients. Les idées posées dessus
  // restent masquées pour eux dans tous les cas.
  const toggleShared = async (b) => {
    try { await P.boards.update(b.id, { shared: !b.shared }); load(); } catch (err) { setError(err); }
  };

  const menuFor = (b) => [
    { label: 'Renommer', icon: '✎', onClick: () => setRenaming(b) },
    { label: b.shared ? 'Ne plus partager' : 'Partager avec les omniscients', icon: '👁️', onClick: () => toggleShared(b) },
    { sep: true },
    { label: 'Supprimer', icon: '🗑', danger: true, onClick: async () => {
      if (!(await confirm({ title: `Supprimer « ${b.title} » ?`, message: `${b.nodeCount} élément(s) posés dessus seront effacés (les fiches de l'univers, elles, restent).`, confirmLabel: 'Supprimer', danger: true }))) return;
      await P.boards.remove(b.id); load();
    } },
  ];

  const create = async (title) => {
    setCreating(false);
    try { const b = await P.boards.create({ title }); navigate(`/auteur/${pid}/tableaux/${b.id}`); } catch (err) { setError(err); }
  };

  return (
    <div className="au-page">
      <div className="au-page-head">
        <div><h1>🧩 Tableaux blancs</h1><div className="au-sub">Mind maps, cartes relationnelles, structures politiques, intrigues…</div></div>
        <div className="au-actions"><Btn variant="primary" onClick={() => setCreating(true)}>＋ Nouveau tableau</Btn></div>
      </div>
      <ErrorLine error={error} onClose={() => setError(null)} />
      {boards && boards.length === 0 && (
        <Empty icon="🧩" title="Aucun tableau" action={<Btn variant="primary" onClick={() => setCreating(true)}>＋ Premier tableau</Btn>}>
          Une page infinie pour poser cartes, personnages, lieux, images et flèches.
        </Empty>
      )}
      <div className="au-cards">
        {boards?.map((b) => (
          <Link key={b.id} to={`/auteur/${pid}/tableaux/${b.id}`} className="au-ecard au-board-card"
            onContextMenu={(e) => openMenu(e, menuFor(b))}>
            <div className="au-board-thumb" aria-hidden>🧩</div>
            <div className="au-ecard-top">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="au-row-title">{b.title}</div>
                <div className="au-row-meta">
                  {b.nodeCount} élément{b.nodeCount > 1 ? 's' : ''} · {relativeTime(b.updatedAt)}
                  {b.shared && <span className="au-validated" title="Visible par les lecteurs omniscients (hors idées)">👁️ partagé</span>}
                </div>
              </div>
              <button type="button" className="au-btn is-ghost is-small is-icon" aria-label="Actions" onClick={(e) => { e.preventDefault(); openMenu(e, menuFor(b)); }}>⋯</button>
            </div>
          </Link>
        ))}
      </div>
      {menu}
      <PromptDialog open={creating} title="Nouveau tableau" label="Titre" placeholder="Carte politique du royaume" confirmLabel="Créer" onClose={() => setCreating(false)} onSubmit={create} />
      <PromptDialog open={!!renaming} title="Renommer" label="Titre" initial={renaming?.title || ''} onClose={() => setRenaming(null)}
        onSubmit={async (t) => { const b = renaming; setRenaming(null); await P.boards.update(b.id, { title: t }); load(); }} />
    </div>
  );
}
