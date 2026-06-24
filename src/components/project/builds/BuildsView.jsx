import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadBlockCodex, resolveBlock } from '../../../data/blockCodex';
import { useCodex } from '../../../hooks/useCodex';
import { useIsMobile } from '../../../hooks/useIsMobile';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useToast } from '../../../ui/ToastProvider';
import { Button, Empty, ErrorBanner, Field, Input, Modal, card, muted } from '../shared';
import { CodexPicker } from '../../admin/editors/minecraft/CodexPicker';
import { BlueprintBom } from './BlueprintBom';
import { BlueprintCanvas } from './BlueprintCanvas';
import { ShareControls } from './ShareControls';
import { WorldEditPanel } from './WorldEditPanel';
import { SharesPanel } from './SharesPanel';

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
  const [dupId, setDupId] = useState(null);
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
                <Button variant="ghost" onClick={() => setDupId(b.id)}>Dupliquer</Button>
                <Button variant="ghost" onClick={() => remove(b)}>Supprimer</Button>
              </div>
              {openId === b.id && <BlueprintViewer ws={ws} id={b.id} isMobile={isMobile} items={items} chests={chests} />}
            </div>
          ))}
        </div>
      )}

      {dupId != null && (
        <DuplicateModal ws={ws} id={dupId} toast={toast}
          onClose={() => setDupId(null)}
          onDone={() => { setDupId(null); load(); }} onError={setErr} />
      )}
    </div>
  );
}

// Dupliquer un build en remplaçant un/plusieurs types de blocs (même structure,
// autres matériaux). `from` = type présent dans le build, `to` = bloc du codex.
function DuplicateModal({ ws, id, toast, onClose, onDone, onError }) {
  const { catalog, byId } = useCodex();
  const [detail, setDetail] = useState(null);
  const [codex, setCodex] = useState(null);
  const [name, setName] = useState('');
  const [swaps, setSwaps] = useState([{ from: '', toId: '', toName: '' }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    ws.blueprints.get(id).then((d) => { if (alive) { setDetail(d); setName(`${d.name} (variante)`); } }).catch(() => onError?.('Build introuvable.'));
    loadBlockCodex().then((c) => alive && setCodex(c));
    return () => { alive = false; };
  }, [ws, id]);

  // Types de blocs présents dans le build (depuis le BOM).
  const blockTypes = useMemo(() => (detail?.bom || []).map((b) => b.blockId), [detail]);
  const setSwap = (i, patch) => setSwaps((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    const clean = swaps
      .filter((s) => s.from && s.toName)
      .map((s) => ({ from: s.from, to: s.toName }));
    setBusy(true);
    try {
      await ws.blueprints.duplicate(id, { name, swaps: clean });
      toast?.success?.(clean.length ? 'Variante créée' : 'Build dupliqué');
      onDone();
    } catch (e) { onError?.(e.message || 'Duplication impossible.'); }
    finally { setBusy(false); }
  };

  const label = (blockId) => (codex ? resolveBlock(codex, blockId).nomFr : blockId);

  return (
    <Modal open onClose={onClose} title="📑 Dupliquer le build" width={680}>
      <Field label="Nom de la copie"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div style={{ fontSize: 12, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'rgba(180,170,200,0.55)', margin: '14px 0 8px' }}>
        Remplacements de blocs (optionnel)
      </div>
      <p style={{ ...muted, fontSize: 12, marginTop: 0 }}>
        Garde la même structure et change le matériau (ex. chêne → sapin). Laisse vide pour une copie identique.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {swaps.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={row.from} onChange={(e) => setSwap(i, { from: e.target.value })}
              style={{ flex: '1 1 200px', background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.28)', borderRadius: 10, padding: '9px 12px', color: '#ede8f8', fontSize: 14 }}>
              <option value="">— bloc à remplacer —</option>
              {blockTypes.map((bid) => <option key={bid} value={bid}>{label(bid)}</option>)}
            </select>
            <span style={{ color: 'rgba(180,170,200,0.5)' }}>→</span>
            <div style={{ flex: '1 1 200px', minWidth: 160 }}>
              <CodexPicker catalog={catalog} byId={byId} value={row.toId}
                onChange={(id2, entry) => setSwap(i, { toId: id2, toName: `${entry?.source === 'minefield' ? 'minefield' : 'minecraft'}:${id2}` })}
                placeholder="Nouveau bloc…" />
            </div>
            <button type="button" onClick={() => setSwaps((s) => s.filter((_, j) => j !== i))}
              style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 8, cursor: 'pointer', background: 'rgba(220,60,60,0.12)', border: '1px solid rgba(220,60,60,0.3)', color: '#f87171', fontSize: 16 }}>×</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setSwaps((s) => [...s, { from: '', toId: '', toName: '' }])}
        style={{ marginTop: 10, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px dashed rgba(80,50,130,0.4)', color: 'rgba(200,180,240,0.8)', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
        + Remplacement
      </button>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <Button onClick={submit} disabled={busy || !detail}>{busy ? 'Duplication…' : 'Dupliquer'}</Button>
        <Button variant="ghost" onClick={onClose}>Annuler</Button>
      </div>
    </Modal>
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

  // Charge le rendu : aperçu du staging WorldEdit en priorité (modifications en
  // cours), sinon l'artefact d'origine du build.
  const we = useMemo(() => ws.blueprints.worldedit(id), [ws, id]);
  const reload = useCallback(() => {
    return fetch(we.previewUrl(), { credentials: 'include' })
      .then((r) => (r.ok ? r : fetch(ws.blueprints.dataUrl(id), { credentials: 'include' })))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then(setData)
      .catch(() => setErr('Données du build illisibles.'));
  }, [we, ws, id]);

  useEffect(() => {
    let alive = true;
    setData(null); setErr('');
    reload();
    ws.blueprints.get(id).then((d) => alive && setDetail(d)).catch(() => {});
    loadBlockCodex().then((c) => alive && setCodex(c));
    return () => { alive = false; };
  }, [ws, id, reload]);

  const height = isMobile ? 320 : 480;

  if (err) return <div style={{ ...card, padding: 16, marginTop: 8, color: '#fb923c' }}>{err}</div>;
  if (!data || !codex) return <div style={{ ...card, padding: 16, marginTop: 8, ...muted }}>Chargement du build…</div>;

  return (
    <div style={{ ...card, padding: 0, marginTop: 8, overflow: 'hidden' }}>
      <BlueprintCanvas key={`${data.size.x}x${data.size.y}x${data.size.z}-${data.count}`} data={data} codex={codex} height={height} />
      <ShareControls ws={ws} id={id} initialToken={detail?.shareToken || null} />
      <WorldEditPanel we={we} onChanged={reload} />
      <SharesPanel ws={ws} id={id} />
      {detail?.bom && (
        <BlueprintBom bom={detail.bom} codex={codex} items={items} chests={chests} />
      )}
    </div>
  );
}
