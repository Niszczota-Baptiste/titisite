import { Modal, formatDate } from '../project/shared';
import { GOLD, INK, MUTED, body, panel } from './theme';

// Édition asynchrone : si quelqu'un a sauvegardé pendant qu'on dessinait, le PUT
// repart en 409 et l'utilisateur tranche. Le téléchargement du JSON local est
// proposé d'abord — c'est le filet avant un choix irréversible.

export function ConflictModal({ conflict, onReload, onOverwrite, onDownload }) {
  if (!conflict) return null;
  return (
    <Modal open onClose={() => {}} title="Plan modifié entre-temps" width={520}>
      <p style={{ ...body, fontSize: 13.5, color: INK, lineHeight: 1.55 }}>
        {conflict.updatedBy
          ? <>Ce plan a été modifié par <strong style={{ color: GOLD }}>{conflict.updatedBy}</strong></>
          : <>Ce plan a été modifié depuis une autre session</>}
        {conflict.updatedAt ? <> le {formatDate(conflict.updatedAt)}</> : null}
        {' '}(révision {conflict.serverRevision}). Tes modifications locales ne sont pas encore enregistrées.
      </p>

      <div style={{ ...panel, ...body, fontSize: 12, color: MUTED, margin: '12px 0' }}>
        <strong style={{ color: INK }}>Recharger</strong> reprend la version du serveur et perd tes
        modifications locales. <strong style={{ color: INK }}>Écraser</strong> impose ta version et
        remplace celle du serveur.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onDownload} style={ghost}>Télécharger mon JSON</button>
        <button type="button" onClick={onReload} style={ghost}>Recharger</button>
        <button type="button" onClick={onOverwrite} style={primary}>Écraser</button>
      </div>
    </Modal>
  );
}

const ghost = {
  padding: '8px 14px', borderRadius: 9, cursor: 'pointer', ...body, fontSize: 12.5,
  background: 'transparent', border: '1px solid rgba(120,100,170,0.4)', color: INK,
};

const primary = {
  padding: '8px 14px', borderRadius: 9, cursor: 'pointer', ...body, fontSize: 12.5, fontWeight: 700,
  background: GOLD, border: 'none', color: '#1a1206',
};
