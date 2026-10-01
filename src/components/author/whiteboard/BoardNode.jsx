import { memo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { kindMeta } from '../kinds';
import { cx } from '../ui';

// Un nœud du tableau. Texte TOUJOURS rendu comme texte (React l'échappe) :
// aucune mise en forme HTML ne peut s'y glisser.

function ShapeBg({ shape, color }) {
  if (shape === 'ellipse') {
    return <svg className="au-wb-shapebg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><ellipse cx="50" cy="50" rx="49" ry="49" fill={`color-mix(in srgb, ${color} 22%, var(--au-surface-solid))`} stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
  }
  if (shape === 'diamond') {
    return <svg className="au-wb-shapebg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden><polygon points="50,1 99,50 50,99 1,50" fill={`color-mix(in srgb, ${color} 22%, var(--au-surface-solid))`} stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg>;
  }
  return null;
}

export const BoardNode = memo(function BoardNode({
  node, pid, selected, single, editing, onPointerDown, onDoubleClick, onContextMenu, onEditDone,
}) {
  const ta = useRef(null);
  useEffect(() => {
    if (editing && ta.current) { ta.current.focus(); ta.current.select(); }
  }, [editing]);
  const color = node.color || (node.kind === 'entity' ? kindMeta(node.entity?.kind).color : '#c9a8e8');
  const style = { transform: `translate(${node.x}px, ${node.y}px)`, width: node.w, height: node.h, zIndex: node.kind === 'group' ? 0 : 1, '--nc': color };

  let body;
  if (node.kind === 'entity') {
    const e = node.entity;
    body = e ? (
      <div className="au-wb-entity">
        <span className="au-avatar" style={{ '--kc': e.color || kindMeta(e.kind).color }}>
          {e.coverUrl ? <img src={e.coverUrl} alt="" /> : (e.icon || kindMeta(e.kind).icon)}
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span className="au-wb-entity-kind">{kindMeta(e.kind).label}</span>
          <span className="au-wb-entity-title">{e.title}</span>
          {e.summary && <span className="au-wb-entity-sum">{e.summary}</span>}
        </span>
        <Link to={`/auteur/${pid}/e/${e.id}`} className="au-wb-open" onPointerDown={(ev) => ev.stopPropagation()} aria-label={`Ouvrir ${e.title}`} title="Ouvrir la fiche">↗</Link>
      </div>
    ) : <div className="au-wb-entity is-missing">Élément supprimé ou à la corbeille</div>;
  } else if (node.kind === 'image') {
    body = node.media
      ? <img className="au-wb-img" src={node.media.thumbUrl && node.w < 500 ? node.media.thumbUrl : node.media.url} alt={node.text || ''} draggable={false} />
      : <div className="au-wb-entity is-missing">Image supprimée</div>;
  } else if (editing) {
    body = (
      <textarea ref={ta} className="au-wb-edit" defaultValue={node.text}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); onEditDone(node, e.currentTarget.value); }
        }}
        onBlur={(e) => onEditDone(node, e.currentTarget.value)} aria-label="Texte" />
    );
  } else {
    const [first, ...rest] = (node.text || '').split('\n');
    body = node.kind === 'card' ? (
      <div className="au-wb-text">
        {node.text ? <><strong>{first}</strong>{rest.length > 0 && <span>{`\n${rest.join('\n')}`}</span>}</> : <span className="au-faint">Double-clic pour écrire</span>}
      </div>
    ) : <div className="au-wb-text">{node.text || (node.kind === 'group' ? 'Groupe' : <span className="au-faint">Double-clic pour écrire</span>)}</div>;
  }

  return (
    <div className={cx('au-wb-node', `is-${node.kind}`, node.kind === 'shape' && `shape-${node.shape}`, selected && 'is-selected')}
      style={style} data-node={node.id}
      onPointerDown={(e) => onPointerDown(e, node)} onDoubleClick={(e) => onDoubleClick(e, node)} onContextMenu={(e) => onContextMenu(e, node)}>
      {node.kind === 'shape' && <ShapeBg shape={node.shape} color={color} />}
      {node.kind === 'comment' && <span className="au-wb-comment-ico" aria-hidden>💬</span>}
      {body}
      {node.kind === 'image' && node.text && <span className="au-wb-caption">{node.text}</span>}
      {selected && single && !editing && (
        <>
          <span className="au-wb-handle is-resize" data-handle="resize" aria-hidden />
          <span className="au-wb-handle is-connect" data-handle="connect" title="Glisser pour relier" aria-hidden>＋</span>
        </>
      )}
    </div>
  );
});
