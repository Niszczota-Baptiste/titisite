import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { loadBlockCodex } from '../data/blockCodex';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePageMeta } from '../hooks/usePageMeta';
import { BlueprintBom } from '../components/project/builds/BlueprintBom';
import { BlueprintCanvas } from '../components/project/builds/BlueprintCanvas';

// Page publique en lecture seule d'un build partagé par token (sans cookie).
// Vue 3D rotative + slider de couches + BOM (sans croisement coffres).
export default function BuildShare() {
  const { token } = useParams();
  const isMobile = useIsMobile(720);
  const [detail, setDetail] = useState(undefined); // undefined=chargement, null=introuvable
  const [data, setData] = useState(null);
  const [codex, setCodex] = useState(null);

  usePageMeta(detail?.name ? `${detail.name} — build Minecraft` : 'Build partagé');

  useEffect(() => {
    let alive = true;
    api.blueprintShared.get(token)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => alive && setDetail(null));
    fetch(api.blueprintShared.dataUrl(token))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((d) => alive && setData(d))
      .catch(() => {});
    loadBlockCodex().then((c) => alive && setCodex(c));
    return () => { alive = false; };
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', background: '#050511', color: '#ede8f8', fontFamily: "'Inter',sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: isMobile ? '24px 14px' : '40px 24px' }}>
        {detail === null ? (
          <p style={{ color: 'rgba(180,170,200,0.7)' }}>Ce lien de partage n'existe pas ou a été désactivé.</p>
        ) : detail === undefined ? (
          <p style={{ color: 'rgba(180,170,200,0.7)' }}>Chargement…</p>
        ) : (
          <>
            <h1 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: isMobile ? 24 : 32, margin: '0 0 6px' }}>
              🏗️ {detail.name}
            </h1>
            <p style={{ color: 'rgba(180,170,200,0.7)', fontSize: 14, marginTop: 0 }}>
              {detail.size.x}×{detail.size.y}×{detail.size.z} · {detail.blockCount.toLocaleString('fr-FR')} blocs · {detail.paletteCount} types · partagé en lecture seule
            </p>
            <div style={{ background: 'rgba(20,10,42,0.5)', border: '1px solid rgba(80,50,130,0.28)', borderRadius: 14, overflow: 'hidden' }}>
              {data
                ? <BlueprintCanvas data={data} codex={codex} height={isMobile ? 340 : 520} />
                : <div style={{ padding: 20, color: 'rgba(180,170,200,0.7)' }}>Chargement du build…</div>}
              <BlueprintBom bom={detail.bom} codex={codex} readOnly />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
