import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../ui/ToastProvider';
import { RecorderDialog } from '../../components/author/audio/RecorderDialog';
import { useEnv } from '../env';
import { newItem } from '../inbox/model.js';
import { vault } from '../platform/vault.js';

// Enregistrer un son depuis l'accueil : aucune question avant, aucune après.
// La prise est gardée sur l'appareil, dans la boîte de réception ; on la
// rangera dans un projet plus tard (ou jamais).

// Prise → fichier de capture. En natif le fichier est déjà sur l'appareil
// (aucune copie) ; dans un navigateur, le son est rangé dans le stockage local.
export async function takeAsFile(take, label) {
  const meta = {
    role: 'audio', name: take.name, mime: take.mime, durationMs: take.durationMs, integrity: take.integrity,
    markers: take.markers || [], capturedAt: take.capturedAt, label,
  };
  if (take.nativeFile) return { ...take.nativeFile, ...meta, size: take.nativeFile.size };
  return vault.addBlob(await take.toBlob(), meta);
}

export function Record() {
  const { session } = useEnv();
  const navigate = useNavigate();
  const toast = useToast();
  const kept = useRef(false);

  const keep = async ({ take, label }) => {
    const file = await takeAsFile(take, label);
    await vault.put(newItem({ files: [file], origin: 'enregistrement', owner: session.owner }));
    kept.current = true;
    toast.success('Prise gardée sur cet appareil');
  };

  return (
    <div className="am-screen">
      <RecorderDialog open onClose={() => navigate(kept.current ? '/boite' : '/', { replace: true })} onTake={keep} title="🎙️ Enregistrer un son" />
    </div>
  );
}
