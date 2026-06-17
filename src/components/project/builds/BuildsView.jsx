import { useEffect, useState } from 'react';
import { loadBlockCodex } from '../../../data/blockCodex';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { Button, Empty, ErrorBanner, Field, Input, card, muted } from '../shared';
import { BlueprintBom } from './BlueprintBom';
import { BlueprintCanvas } from './BlueprintCanvas';
import { ShareControls } from './ShareControls';

const PARSE_ERRORS = {
  box_too_big: 'Boîte trop grande (max 2048×384×2048).',
  too_many_blocks: 'Trop de blocs dans la boîte — réduis la sélection.',
  region_coords_unknown: 'Nom de fichier .mca invalide (attendu : r.X.Z.mca).',
  no_region: 'Aucun fichier de région trouvé dans l\'archive.',
  zip_invalid: 'ZIP illisible.',
  zip64_unsupported: 'ZIP trop volumineux (ZIP64 non géré) — envoie les .mca utiles.',
  empty_box: 'Aucun bloc dans cette boîte.',
  parse_failed: 'Échec du parsing du monde.',
};

const BOUNDS = [
  ['minX', 'X min'], ['minY', 'Y min'], ['minZ', 'Z min'],
  ['maxX', 'X max'], ['maxY', 'Y max'], ['maxZ', 'Z max'],
];

// Sous-onglet « Builds 3D » : import d'un monde solo (.mca/zip) borné par la
// boîte F3, liste des builds, et visionneuse 3D + slider de couche. Le BOM et le
// partage sont ajoutés par les phases suivantes (PlanView/Share).
export function BuildsView({ ws, items = [], chests = [] }) {
  const isMobile = useIsMobile(720);
  const confirm = useConfirm();
  const toast = useToast();

  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = () => ws.blueprints.list().then(setList).catch(() => setErr('Chargement impossible.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const remove = async (b) => {
    const ok = await confirm({ title: 'Supprimer le build', message: `« ${b.name} » sera supprimé.`, confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    try { await ws.blueprints.remove(b.id); if (openId === b.id) setOpenId(null); await load(); }
    catch { setErr('Suppression impossible.'); }
  };

  return (
    <div>
      <ErrorBanner error={err} onDismiss={() => setErr('')} />

      {!showForm && (
        <Button onClick={() => setShowForm(true)} style={{ marginBottom: 14 }}>+ Importer un build</Button>
      )}
      {showForm && (
        <UploadForm ws={ws} toast={toast} onDone={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)} onError={setErr} />
      )}

      {list == null ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : list.length === 0 ? (
        <Empty>Aucun build importé. Exporte les fichiers region/ de ton monde et envoie-les ici.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map((b) => (
            <div key={b.id}>
              <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, color: '#ede8f8' }}>🏗️ {b.name}</div>
                  <div style={{ ...muted, fontSize: 12 }}>
                    {b.size.x}×{b.size.y}×{b.size.z} · {b.blockCount.toLocaleString('fr-FR')} blocs · {b.paletteCount} types
                  </div>
                </div>
                <Button variant="ghost" onClick={() => setOpenId(openId === b.id ? null : b.id)}>
                  {openId === b.id ? 'Fermer' : 'Ouvrir'}
                </Button>
                <Button variant="ghost" onClick={() => remove(b)}>Supprimer</Button>
              </div>
              {openId === b.id && <BlueprintViewer ws={ws} id={b.id} isMobile={isMobile} items={items} chests={chests} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UploadForm({ ws, toast, onDone, onCancel, onError }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [bounds, setBounds] = useState({ minX: '', minY: '', minZ: '', maxX: '', maxY: '', maxZ: '' });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const setB = (k, v) => setBounds((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!file) { onError('Choisis un fichier (.zip de region/ ou .mca).'); return; }
    if (BOUNDS.some(([k]) => bounds[k] === '' || Number.isNaN(Number(bounds[k])))) {
      onError('Renseigne les 6 coordonnées de la boîte (F3).'); return;
    }
    setBusy(true); setProgress(0);
    try {
      await ws.blueprints.upload(file, { name, ...bounds }, setProgress);
      toast?.success?.('Build importé');
      onDone();
    } catch (e) {
      onError(PARSE_ERRORS[e.body?.error] || PARSE_ERRORS[e.message] || e.message || 'Import impossible.');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 220px' }}>
          <Field label="Nom du build"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Manoir du port" /></Field>
        </div>
        <div style={{ flex: '2 1 220px' }}>
          <Field label="Fichier (.zip du dossier region/ ou .mca)">
            <input type="file" accept=".zip,.mca" onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ color: '#ede8f8', fontSize: 13 }} />
          </Field>
        </div>
      </div>
      <p style={{ ...muted, fontSize: 12, margin: '8px 0' }}>
        Coordonnées de la boîte englobante (lues au <strong>F3</strong> en jeu) — seuls ces blocs seront extraits.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {BOUNDS.map(([k, lbl]) => (
          <div key={k} style={{ flex: '1 1 80px', minWidth: 70 }}>
            <Field label={lbl}>
              <Input type="number" value={bounds[k]} onChange={(e) => setB(k, e.target.value)} />
            </Field>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <Button onClick={submit} disabled={busy}>{busy ? `Import… ${Math.round(progress * 100)}%` : 'Importer'}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Button>
        {busy && <span style={{ ...muted, fontSize: 12 }}>Parsing du monde (peut prendre un moment)…</span>}
      </div>
    </div>
  );
}

function BlueprintViewer({ ws, id, isMobile, items, chests }) {
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null); // méta + bom
  const [codex, setCodex] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setData(null); setErr('');
    fetch(ws.blueprints.dataUrl(id), { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then((d) => { if (alive) setData(d); })
      .catch(() => alive && setErr('Données du build illisibles.'));
    ws.blueprints.get(id).then((d) => alive && setDetail(d)).catch(() => {});
    loadBlockCodex().then((c) => alive && setCodex(c));
    return () => { alive = false; };
  }, [ws, id]);

  const height = isMobile ? 320 : 480;

  if (err) return <div style={{ ...card, padding: 16, marginTop: 8, color: '#fb923c' }}>{err}</div>;
  if (!data || !codex) return <div style={{ ...card, padding: 16, marginTop: 8, ...muted }}>Chargement du build…</div>;

  return (
    <div style={{ ...card, padding: 0, marginTop: 8, overflow: 'hidden' }}>
      <BlueprintCanvas data={data} codex={codex} height={height} />
      <ShareControls ws={ws} id={id} initialToken={detail?.shareToken || null} />
      {detail?.bom && (
        <BlueprintBom bom={detail.bom} codex={codex} items={items} chests={chests} />
      )}
    </div>
  );
}
