import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useBlueprintSelection } from './useBlueprintSelection';

// Plein écran : la vue 3D occupe tout l'écran, le panneau WorldEdit flotte dessus.
const FS_CANVAS = { position: 'fixed', inset: 0, zIndex: 10000, background: '#0d0a1c' };
const FS_PANEL = {
  position: 'fixed', top: 12, left: 12, width: 360, maxWidth: 'calc(100vw - 24px)',
  maxHeight: 'calc(100vh - 24px)', overflowY: 'auto', zIndex: 10001,
  background: 'rgba(13,10,28,0.92)', border: '1px solid rgba(120,90,180,0.45)',
  borderRadius: 12, boxShadow: '0 12px 48px rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
};

const EXTRACT_ERRORS = {
  empty_box: 'Aucun bloc dans la zone sélectionnée.',
  too_many_blocks: 'Zone trop dense (plus de 3 M de blocs) — réduis-la.',
  out_of_bounds: 'La sélection dépasse les limites du build.',
  invalid_selection: 'Sélection invalide.',
  not_editable: 'Build importé sans sa source — non extractible.',
};

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
export function BuildsView({ ws, slug, items = [], chests = [], initialOpenId = null }) {
  const isMobile = useIsMobile(720);
  const confirm = useConfirm();
  const toast = useToast();

  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [dupId, setDupId] = useState(null);
  const [err, setErr] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showBlank, setShowBlank] = useState(false);
  const [showMapart, setShowMapart] = useState(false);

  const load = () => ws.blueprints.list().then(setList).catch(() => setErr('Chargement impossible.'));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  // Deep-link (?build=<id>) : ouvre directement le build une fois la liste chargée.
  useEffect(() => {
    if (initialOpenId && Array.isArray(list) && list.some((b) => b.id === initialOpenId)) setOpenId(initialOpenId);
  }, [initialOpenId, list]);

  const remove = async (b) => {
    const ok = await confirm({ title: 'Supprimer le build', message: `« ${b.name} » sera supprimé.`, confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    try { await ws.blueprints.remove(b.id); if (openId === b.id) setOpenId(null); await load(); }
    catch { setErr('Suppression impossible.'); }
  };

  return (
    <div>
      <ErrorBanner error={err} onDismiss={() => setErr('')} />

      {!showForm && !showBlank && !showMapart && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <Button onClick={() => setShowForm(true)}>+ Importer un build</Button>
          <Button variant="ghost" onClick={() => setShowMapart(true)}>🗺️ Carte depuis une image</Button>
          <Button variant="ghost" onClick={() => setShowBlank(true)}>+ Build vierge (.mca neuf)</Button>
        </div>
      )}
      {showForm && (
        <UploadForm ws={ws} toast={toast} onDone={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)} onError={setErr} />
      )}
      {showMapart && (
        <MapArtForm ws={ws} toast={toast}
          onDone={(created) => { setShowMapart(false); load().then(() => created && setOpenId(created.id)); }}
          onCancel={() => setShowMapart(false)} onError={setErr} />
      )}
      {showBlank && (
        <BlankForm ws={ws} slug={slug} toast={toast} onDone={() => { setShowBlank(false); load(); }}
          onCancel={() => setShowBlank(false)} onError={setErr} />
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
              {openId === b.id && <BlueprintViewer ws={ws} slug={slug} id={b.id} isMobile={isMobile} items={items} chests={chests} onExtracted={load} />}
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
  const [full, setFull] = useState(true); // par défaut : import complet (sans coordonnées)
  const [bounds, setBounds] = useState({ minX: '', minY: '', minZ: '', maxX: '', maxY: '', maxZ: '' });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const setB = (k, v) => setBounds((s) => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!file) { onError('Choisis un fichier (.zip de region/ ou .mca).'); return; }
    if (!full && BOUNDS.some(([k]) => bounds[k] === '' || Number.isNaN(Number(bounds[k])))) {
      onError('Renseigne les 6 coordonnées de la boîte (F3), ou coche « charger en entier ».'); return;
    }
    setBusy(true); setProgress(0);
    try {
      const fields = full ? { name, full: 'true' } : { name, ...bounds };
      await ws.blueprints.upload(file, fields, setProgress);
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0', cursor: 'pointer', color: '#ede8f8', fontSize: 13 }}>
        <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} style={{ accentColor: '#c9a8e8' }} />
        Charger le fichier en entier (détecter les limites automatiquement)
      </label>
      {!full && (
        <>
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
        </>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <Button onClick={submit} disabled={busy}>{busy ? `Import… ${Math.round(progress * 100)}%` : 'Importer'}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Button>
        {busy && <span style={{ ...muted, fontSize: 12 }}>Parsing du monde (peut prendre un moment)…</span>}
      </div>
    </div>
  );
}

// Crée un build vierge (.mca neuf, rempli d'air) à une position monde choisie.
function BlankForm({ ws, slug, toast, onDone, onCancel, onError }) {
  const [name, setName] = useState('Build vierge');
  const [origin, setOrigin] = useState({ x: 0, y: 0, z: 0 });
  const [size, setSize] = useState({ x: 64, y: 64, z: 64 });
  const [busy, setBusy] = useState(false);
  const num = (v) => (v === '' || v === '-' ? v : Math.round(Number(v)));

  const submit = async () => {
    setBusy(true);
    try {
      const created = await ws.blueprints.createBlank({
        name,
        origin: { x: Number(origin.x) || 0, y: Number(origin.y) || 0, z: Number(origin.z) || 0 },
        size: { x: Number(size.x) || 64, y: Number(size.y) || 64, z: Number(size.z) || 64 },
      });
      toast?.success?.(`Build vierge « ${created.name} » créé`);
      onDone();
      if (slug) window.open(`/project/${slug}/minecraft?view=builds&build=${created.id}`, '_blank', 'noopener');
    } catch { onError?.('Création impossible.'); }
    finally { setBusy(false); }
  };

  const Row = ({ label, val, set }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ ...muted, fontSize: 12, width: 70 }}>{label}</span>
      {['x', 'y', 'z'].map((a) => (
        <Input key={a} type="number" value={val[a]} aria-label={`${label} ${a}`}
          onChange={(e) => set({ ...val, [a]: num(e.target.value) })} style={{ width: 90 }} />
      ))}
    </div>
  );

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <Field label="Nom du build vierge"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <p style={{ ...muted, fontSize: 12, margin: '4px 0 10px' }}>
        Un <code>.mca</code> neuf rempli d’air, à la position monde choisie. Colle-y des morceaux d’autres builds
        (Copier dans un build → Coller ici) pour assembler, puis exporte : il s’insère exactement à ces coordonnées dans Minecraft.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        <Row label="Position (coin)" val={origin} set={setOrigin} />
        <Row label="Taille (blocs)" val={size} set={setSize} />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <Button onClick={submit} disabled={busy}>{busy ? 'Création…' : 'Créer le build vierge'}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Button>
      </div>
    </div>
  );
}

const MAPART_ERRORS = {
  missing_file: 'Choisis une image à convertir.',
  too_tall: 'Un mur ne peut pas dépasser 3 cartes de haut (limite de hauteur du monde). Passe en « Sol » ou réduis les lignes.',
  image_unreadable: 'Image illisible — réessaie avec un PNG/JPG.',
  empty_image: 'Image entièrement transparente — rien à poser.',
  mapart_failed: 'Génération impossible.',
};
const MAPART_PRESETS = [
  { cols: 1, rows: 1, label: '1 carte' },
  { cols: 2, rows: 1, label: '2×1' },
  { cols: 1, rows: 2, label: '1×2' },
  { cols: 2, rows: 2, label: '2×2' },
  { cols: 3, rows: 3, label: '3×3' },
];
const MAPART_SEL = {
  background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.28)', borderRadius: 10,
  padding: '9px 12px', color: '#ede8f8', fontSize: 14, fontFamily: "'Inter',sans-serif",
};

// Screenshot → carte en blocs : on choisit la taille (grille de cartes 128×128),
// l'orientation (mur vertical / sol à plat) et le cadrage, puis le serveur crée
// un build plat coloré (map-art) visible dans le générateur 3D et exportable .mca.
function MapArtForm({ ws, toast, onDone, onCancel, onError }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [name, setName] = useState('');
  const [cols, setCols] = useState(1);
  const [rows, setRows] = useState(1);
  const [orientation, setOrientation] = useState('wall');
  const [fit, setFit] = useState('cover');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  // Aperçu de l'image choisie (objectURL révoqué au changement/démontage).
  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Un mur est vertical → borné à 3 cartes de haut (hauteur du monde).
  const maxRows = orientation === 'wall' ? 3 : 4;
  const clampRows = (r) => Math.max(1, Math.min(maxRows, r || 1));
  const clampCols = (c) => Math.max(1, Math.min(4, c || 1));
  const setOrient = (o) => { setOrientation(o); if (o === 'wall') setRows((r) => Math.min(3, r)); };

  const submit = async () => {
    if (!file) { onError('Choisis une image à convertir.'); return; }
    setBusy(true); setProgress(0);
    try {
      const created = await ws.blueprints.fromImage(file, {
        cols: String(clampCols(cols)), rows: String(clampRows(rows)), orientation, fit, name,
      }, setProgress);
      toast?.success?.(`Carte créée : « ${created.name} »`);
      onDone(created);
    } catch (e) {
      onError(MAPART_ERRORS[e?.message] || MAPART_ERRORS[e?.body?.error] || 'Génération impossible.');
    } finally { setBusy(false); }
  };

  const blocks = cols * 128 * rows * 128;

  return (
    <div style={{ ...card, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px', minWidth: 220 }}>
          <Field label="Image (screenshot, photo…)">
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ color: '#ede8f8', fontSize: 13 }} />
          </Field>
          <Field label="Nom de la carte">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Carte ${cols}×${rows}`} />
          </Field>
        </div>
        {preview && (
          <img src={preview} alt="aperçu" style={{
            width: 120, height: 120, flexShrink: 0, objectFit: fit === 'contain' ? 'contain' : 'cover',
            borderRadius: 8, border: '1px solid rgba(80,50,130,0.3)', background: 'rgba(14,9,28,0.6)',
          }} />
        )}
      </div>

      <div style={{ ...muted, fontSize: 12, margin: '10px 0 6px' }}>Taille (une carte Minecraft = 128×128 blocs)</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {MAPART_PRESETS.filter((p) => orientation !== 'wall' || p.rows <= 3).map((p) => {
          const on = p.cols === cols && p.rows === rows;
          return (
            <button key={p.label} type="button" onClick={() => { setCols(p.cols); setRows(clampRows(p.rows)); }}
              style={{
                padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif",
                background: on ? 'rgba(150,110,220,0.28)' : 'rgba(14,9,28,0.6)',
                border: `1px solid ${on ? 'rgba(150,110,220,0.6)' : 'rgba(80,50,130,0.28)'}`, color: '#ede8f8',
              }}>{p.label}</button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...muted, fontSize: 11 }}>Colonnes</span>
          <Input type="number" min={1} max={4} value={cols}
            onChange={(e) => setCols(clampCols(Math.round(Number(e.target.value))))} style={{ width: 84 }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...muted, fontSize: 11 }}>Lignes</span>
          <Input type="number" min={1} max={maxRows} value={rows}
            onChange={(e) => setRows(clampRows(Math.round(Number(e.target.value))))} style={{ width: 84 }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...muted, fontSize: 11 }}>Orientation</span>
          <select value={orientation} onChange={(e) => setOrient(e.target.value)} style={MAPART_SEL}>
            <option value="wall">Mur (vertical)</option>
            <option value="floor">Sol (à plat)</option>
          </select>
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ ...muted, fontSize: 11 }}>Cadrage</span>
          <select value={fit} onChange={(e) => setFit(e.target.value)} style={MAPART_SEL}>
            <option value="cover">Remplir (recadre)</option>
            <option value="contain">Entier (bords vides)</option>
            <option value="fill">Étirer</option>
          </select>
        </label>
      </div>

      <p style={{ ...muted, fontSize: 12, margin: '12px 0 0' }}>
        {cols * 128}×{rows * 128} blocs ({cols * rows} carte{cols * rows > 1 ? 's' : ''}, {blocks.toLocaleString('fr-FR')} blocs).
        Chaque bloc reprend la couleur de carte la plus proche du pixel — visible dans le générateur 3D
        et exportable en <code>.mca</code> pour la refaire en jeu.
      </p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
        <Button onClick={submit} disabled={busy || !file}>{busy ? `Génération… ${Math.round(progress * 100)}%` : 'Générer la carte'}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Annuler</Button>
        {busy && <span style={{ ...muted, fontSize: 12 }}>Conversion en blocs…</span>}
      </div>
    </div>
  );
}

function BlueprintViewer({ ws, slug, id, isMobile, items, chests, onExtracted }) {
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null); // méta + bom
  const [codex, setCodex] = useState(null);
  const [err, setErr] = useState('');
  const [weState, setWeState] = useState(null); // state WorldEdit (bbox, rôle, undo…)
  const [fullscreen, setFullscreen] = useState(false);
  const toast = useToast();

  const we = useMemo(() => ws.blueprints.worldedit(id), [ws, id]);
  const { selection, setSelection, onPick, active, setActive } = useBlueprintSelection(weState?.bbox || null, weState?.extent || null);

  // Plein écran : bloque le scroll du corps + sortie à Échap.
  useEffect(() => {
    if (!fullscreen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [fullscreen]);

  // Charge le rendu : aperçu du staging WorldEdit en priorité, sinon l'artefact d'origine.
  const reload = useCallback(() => {
    return fetch(we.previewUrl(), { credentials: 'include' })
      .then((r) => (r.ok ? r : fetch(ws.blueprints.dataUrl(id), { credentials: 'include' })))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('http'))))
      .then(setData)
      .catch(() => setErr('Données du build illisibles.'));
  }, [we, ws, id]);

  const refreshState = useCallback(() => we.state().then(setWeState).catch(() => {}), [we]);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(''); setWeState(null);
    reload();
    refreshState();
    ws.blueprints.get(id).then((d) => alive && setDetail(d)).catch(() => {});
    loadBlockCodex().then((c) => alive && setCodex(c));
    return () => { alive = false; };
  }, [ws, id, reload, refreshState]);

  // Extraction d'une zone → nouveau build léger, ouvert dans un nouvel onglet.
  const onExtract = useCallback(async (name) => {
    if (!selection) return;
    try {
      const created = await ws.blueprints.extract(id, { selection, name });
      toast?.success?.(`Zone extraite : « ${created.name} »`);
      onExtracted?.();
      if (slug) window.open(`/project/${slug}/minecraft?view=builds&build=${created.id}`, '_blank', 'noopener');
    } catch (e) {
      toast?.error?.(EXTRACT_ERRORS[e?.message] || 'Extraction impossible');
    }
  }, [ws, id, slug, selection, toast, onExtracted]);

  // Pinceau interactif : un clic dans la vue 3D applique une opération (sphère)
  // centrée sur le bloc visé — réutilise /transform (forme sphère). Anti-spam via
  // un verrou pour ne pas empiler les requêtes.
  const brushBusy = useRef(false);
  const onBrush = useCallback(async (coord, { radius, mode, block }) => {
    if (brushBusy.current || !weState?.bbox) return;
    const lim = weState.bbox;
    const cl = (v, a) => Math.max(lim.min[a], Math.min(lim.max[a], v));
    const selection = {
      min: { x: cl(coord.x - radius, 'x'), y: cl(coord.y - radius, 'y'), z: cl(coord.z - radius, 'z') },
      max: { x: cl(coord.x + radius, 'x'), y: cl(coord.y + radius, 'y'), z: cl(coord.z + radius, 'z') },
      shape: { type: 'sphere' },
    };
    const op = mode === 'smooth'
      ? { operation: 'smooth', params: { iterations: 2 } }
      : { operation: 'set', params: { block: { name: mode === 'erase' ? 'minecraft:air' : (block || 'minecraft:stone') } } };
    brushBusy.current = true;
    try {
      await we.transform({ ...op, selection });
      await reload(); refreshState();
    } catch (e) {
      toast?.error?.(e?.body?.error === 'bad_block' ? 'Bloc du pinceau invalide' : 'Pinceau impossible');
    } finally { brushBusy.current = false; }
  }, [we, weState, reload, refreshState, toast]);

  const height = isMobile ? 320 : 480;
  const pickEnabled = !!(weState?.canEdit && weState?.editable);

  if (err) return <div style={{ ...card, padding: 16, marginTop: 8, color: '#fb923c' }}>{err}</div>;
  if (!data || !codex) return <div style={{ ...card, padding: 16, marginTop: 8, ...muted }}>Chargement du build…</div>;

  return (
    <div style={{ ...card, padding: 0, marginTop: 8, overflow: 'hidden' }}>
      <div style={fullscreen ? FS_CANVAS : undefined}>
        <BlueprintCanvas key={`bp-${id}`}
          data={data} codex={codex} height={height}
          selection={selection} onPick={onPick} pickEnabled={pickEnabled}
          yLimits={weState?.bbox ? { min: weState.bbox.min.y, max: weState.bbox.max.y } : null}
          fillHeight={fullscreen} fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen((v) => !v)}
          onBrush={pickEnabled ? onBrush : null} />
      </div>
      <div style={fullscreen ? FS_PANEL : undefined}>
        <WorldEditPanel we={we} state={weState} selection={selection} setSelection={setSelection}
          active={active} setActive={setActive} onChanged={reload} refreshState={refreshState} onExtract={onExtract} />
      </div>
      {!fullscreen && (
        <>
          <ShareControls ws={ws} id={id} initialToken={detail?.shareToken || null} />
          <SharesPanel ws={ws} id={id} />
          {detail?.bom && (
            <BlueprintBom bom={detail.bom} codex={codex} items={items} chests={chests}
              ws={ws} buildName={detail?.name} toast={toast} />
          )}
        </>
      )}
    </div>
  );
}
