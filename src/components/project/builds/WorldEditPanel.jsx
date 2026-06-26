import { useEffect, useState } from 'react';
import { Button, Field, Input } from '../../admin/ui';
import { muted } from '../shared';
import { useToast } from '../../../ui/ToastProvider';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useCodex } from '../../../hooks/useCodex';
import { CodexPicker } from '../../admin/editors/minecraft/CodexPicker';
import { SchematicLibrary } from './SchematicLibrary';
import { HeightmapTool } from './HeightmapTool';

// id de bloc « minecraft:oak_stairs » → id codex « oak_stairs » et inverse.
const bareId = (name) => (name && name.includes(':') ? name.split(':').slice(1).join(':') : (name || ''));
const nsName = (entry, id) => `${entry?.source === 'minefield' ? 'minefield' : 'minecraft'}:${id}`;

// Panneau « WorldEdit » : sélection (saisie X/Y/Z) + opérations générées depuis
// /operations, appliquées sur une copie de staging (non destructif). Annuler /
// Réinitialiser / Exporter. Le rendu 3D au-dessus est rechargé via onChanged().

const AXES = ['x', 'y', 'z'];
const PHASE_LABEL = {
  queued: 'En file', load: 'Chargement des chunks', apply: 'Application de l’opération',
  commit: 'Écriture des régions', preview: 'Génération de l’aperçu', done: 'Terminé',
};
const CONFIRM_OPS = new Set(['set', 'replace', 'cut', 'walls', 'faces', 'hollow', 'overlay', 'naturalize', 'sphere', 'cyl', 'smooth', 'stack', 'scale', 'mix', 'pyramid', 'cone', 'line', 'erode', 'dilate', 'drain']);

function CoordRow({ label, value, onChange, active, onActivate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={onActivate} title="Coin déplacé par les flèches du clavier"
        style={{ width: 66, textAlign: 'left', fontSize: 12, cursor: 'pointer', background: 'transparent', border: 'none',
          padding: 0, fontFamily: "'Inter',sans-serif", fontWeight: active ? 700 : 400,
          color: active ? '#ffd24a' : 'rgba(180,170,200,0.55)' }}>
        {active ? '▸ ' : ''}{label}
      </button>
      {AXES.map((a) => (
        <Input key={a} type="number" value={value[a]} aria-label={`${label} ${a}`}
          onChange={(e) => onChange({ ...value, [a]: Math.round(Number(e.target.value)) })}
          style={{ width: 72, padding: '6px 8px' }} />
      ))}
    </div>
  );
}

// Parse « facing=east, half=top » → { facing:'east', half:'top' }.
function parseStates(str) {
  const out = {};
  for (const part of String(str || '').split(',')) {
    const [k, v] = part.split('=').map((s) => s.trim());
    if (k && v) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function ParamField({ param, value, onChange, catalog, byId }) {
  if (param.type === 'enum') {
    return (
      <Field label={param.label}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
          {param.values.map((v) => <option key={v} value={v}>{param.labels?.[v] || String(v)}</option>)}
        </select>
      </Field>
    );
  }
  if (param.type === 'int') {
    return (
      <Field label={param.label}>
        <Input type="number" value={value} onChange={(e) => onChange(Math.round(Number(e.target.value)))} style={{ width: 110 }} />
      </Field>
    );
  }
  if (param.type === 'block') {
    const v = value || { name: '', statesStr: '' };
    return (
      <Field label={param.label}>
        <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
          {/* Autocomplétion blocs + items (vanilla & Minefield), filtrée à la saisie */}
          <CodexPicker catalog={catalog} byId={byId} value={bareId(v.name)}
            onChange={(id, entry) => onChange({ ...v, name: nsName(entry, id) })}
            placeholder="Rechercher un bloc / item…" />
          <Input placeholder="ou nom exact (minecraft:oak_stairs)" value={v.name}
            onChange={(e) => onChange({ ...v, name: e.target.value.trim().toLowerCase() })} />
          <Input placeholder="états (facing=east, half=top) — optionnel" value={v.statesStr}
            onChange={(e) => onChange({ ...v, statesStr: e.target.value })} />
        </div>
      </Field>
    );
  }
  if (param.type === 'pattern') {
    const rows = Array.isArray(value) ? value : [];
    const set = (r) => onChange(r);
    const total = rows.reduce((s, x) => s + (Number(x.weight) || 0), 0);
    return (
      <Field label={param.label}>
        <div style={{ display: 'grid', gap: 6, minWidth: 250 }}>
          {rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <CodexPicker catalog={catalog} byId={byId} value={bareId(row.name)}
                  onChange={(id, entry) => set(rows.map((r, j) => (j === i ? { ...r, name: nsName(entry, id) } : r)))}
                  placeholder="Bloc…" />
              </div>
              <Input type="number" value={row.weight} aria-label="poids" style={{ width: 58 }}
                onChange={(e) => set(rows.map((r, j) => (j === i ? { ...r, weight: Math.max(0, Math.round(Number(e.target.value)) || 0) } : r)))} />
              <span style={{ ...muted, fontSize: 11, width: 34, textAlign: 'right' }}>{total > 0 ? Math.round((Number(row.weight) || 0) / total * 100) : 0}%</span>
              <button type="button" onClick={() => set(rows.filter((_, j) => j !== i))} style={rmBtn}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => set([...rows, { name: '', weight: 1 }])} style={addBtn}>+ ajouter un bloc</button>
          <span style={{ ...muted, fontSize: 11 }}>Poids relatifs (ex. 20/30/20…) — les % se calculent tout seuls.</span>
        </div>
      </Field>
    );
  }
  if (param.type === 'bool') {
    return (
      <Field label={param.label}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#ede8f8' }}>
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: '#c9a8e8' }} />
          {param.label}
        </label>
      </Field>
    );
  }
  if (param.type === 'mask') {
    const v = value || { type: 'all' };
    const opts = [['all', 'Aucun'], ['solid', 'Blocs pleins'], ['air', 'Air seulement'], ['exposed', 'Surface exposée'], ['on_surface', 'Au-dessus de la surface'], ['above', 'Au-dessus de Y'], ['below', 'En-dessous de Y']];
    return (
      <Field label={param.label}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={v.type} onChange={(e) => onChange({ ...v, type: e.target.value })} style={selectStyle}>
            {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {(v.type === 'above' || v.type === 'below') && (
            <Input type="number" value={v.y ?? 0} aria-label="Y" style={{ width: 70 }}
              onChange={(e) => onChange({ ...v, y: Math.round(Number(e.target.value)) || 0 })} />
          )}
        </div>
      </Field>
    );
  }
  if (param.type === 'biome') {
    // Liste déroulante des biomes courants + saisie libre (biomes modés).
    return (
      <Field label={param.label}>
        <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
          <select value={(param.values || []).includes(value) ? value : ''} onChange={(e) => e.target.value && onChange(e.target.value)} style={selectStyle}>
            <option value="">— choisir —</option>
            {(param.values || []).map((v) => <option key={v} value={v}>{v.replace('minecraft:', '')}</option>)}
          </select>
          <Input placeholder="ou id exact (minecraft:plains)" value={value || ''}
            onChange={(e) => onChange(e.target.value.trim().toLowerCase())} />
        </div>
      </Field>
    );
  }
  if (param.type === 'blocklist') {
    const rows = Array.isArray(value) ? value : [];
    const set = (r) => onChange(r);
    return (
      <Field label={param.label}>
        <div style={{ display: 'grid', gap: 6, minWidth: 200 }}>
          {rows.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <CodexPicker catalog={catalog} byId={byId} value={bareId(row.name)}
                  onChange={(id, entry) => set(rows.map((r, j) => (j === i ? { ...r, name: nsName(entry, id) } : r)))}
                  placeholder="Bloc source…" />
              </div>
              {rows.length > 1 && <button type="button" onClick={() => set(rows.filter((_, j) => j !== i))} style={rmBtn}>×</button>}
            </div>
          ))}
          <button type="button" onClick={() => set([...rows, { name: '' }])} style={addBtn}>+ ajouter un bloc source</button>
        </div>
      </Field>
    );
  }
  return null;
}

const rmBtn = {
  flexShrink: 0, width: 28, height: 28, borderRadius: 7, cursor: 'pointer',
  background: 'rgba(220,60,60,0.12)', border: '1px solid rgba(220,60,60,0.3)', color: '#f87171', fontSize: 15,
};
const addBtn = {
  padding: '5px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, justifySelf: 'start',
  background: 'transparent', border: '1px dashed rgba(80,50,130,0.4)', color: 'rgba(200,180,240,0.8)', fontFamily: "'Inter',sans-serif",
};
const miniBtnSt = {
  padding: '3px 8px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600,
  background: 'transparent', border: '1px solid rgba(80,50,130,0.32)', color: 'rgba(232,228,248,0.8)', fontFamily: "'Inter',sans-serif",
};

function defaultParams(op) {
  const out = {};
  for (const p of op.params) {
    out[p.name] = p.type === 'block' ? { name: '', statesStr: '' }
      : p.type === 'pattern' ? [{ name: '', weight: 1 }]
        : p.type === 'blocklist' ? [{ name: '' }]
          : p.type === 'mask' ? { type: 'all' }
            : p.type === 'bool' ? (p.default ?? false)
              : (p.default ?? (p.type === 'int' ? 0 : ''));
  }
  return out;
}

// Composant CONTRÔLÉ : `state` (we.state()), `selection` et `setSelection` sont
// fournis par le parent (qui les partage avec la vue 3D pour le picking).
export function WorldEditPanel({ we, state, selection, setSelection, active, setActive, onChanged, refreshState, onExtract }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { catalog, byId } = useCodex(); // pour l'autocomplétion blocs/items

  const [ops, setOps] = useState([]);
  const [opId, setOpId] = useState('mirror');
  const [params, setParams] = useState({});
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState({ dx: 0, dy: 0, dz: 0 });
  const [clip, setClip] = useState(null); // dims du presse-papier {sx,sy,sz}
  const [progress, setProgress] = useState(null); // { phase, pct } pendant un job async

  useEffect(() => {
    let alive = true;
    we.operations().then((r) => { if (alive) setOps(r.operations || []); }).catch(() => {});
    return () => { alive = false; };
  }, [we]);

  const op = ops.find((o) => o.id === opId);
  const groupOrder = [];
  for (const o of ops) { const g = o.group || 'Autres'; if (!groupOrder.includes(g)) groupOrder.push(g); }
  useEffect(() => { if (op) setParams(defaultParams(op)); }, [opId, ops.length]);

  if (state && state.editable === false) {
    return (
      <div style={wrap}>
        <div style={{ ...muted, fontSize: 12 }}>
          ⚠️ Ce build a été importé sans son fichier de région source : il n’est pas éditable.
          Ré-importez le <code>.mca</code> / <code>region.zip</code> pour activer WorldEdit.
        </div>
      </div>
    );
  }
  if (!state || !selection || !op) return <div style={{ ...wrap, ...muted, fontSize: 12 }}>Chargement de l’éditeur…</div>;
  if (!state.canEdit) return null; // viewer : sélection/aperçu seulement (pas d’écriture)

  const sel = selection;
  // « Tout le build » = l'emprise du contenu (pas toute la hauteur du monde).
  const full = state.extent || state.bbox;
  const setFull = () => setSelection({ min: { ...full.min }, max: { ...full.max } });

  const buildParams = () => {
    const out = {};
    for (const p of op.params) {
      const v = params[p.name];
      if (p.type === 'block') out[p.name] = { name: v.name, states: parseStates(v.statesStr) };
      else out[p.name] = v;
    }
    return out;
  };

  // Au-delà de ce volume, on bascule en transform ASYNCHRONE (jobId + suivi de
  // progression) pour ne pas bloquer ni faire « tourner » l'UI sans retour.
  const HEAVY = 150_000;

  // Lance un job async et suit sa progression jusqu'au résultat.
  const runAsync = (body) => new Promise((resolve, reject) => {
    we.transformAsync(body).then(({ jobId }) => {
      setProgress({ phase: 'queued', pct: 0 });
      const iv = setInterval(async () => {
        try {
          const j = await we.job(jobId);
          setProgress({ phase: j.phase, pct: j.pct });
          if (j.status === 'done') { clearInterval(iv); setProgress(null); resolve(j.result || {}); }
          else if (j.status === 'error') { clearInterval(iv); setProgress(null); reject(new Error(j.error)); }
        } catch (e) { clearInterval(iv); setProgress(null); reject(e); }
      }, 350);
    }).catch(reject);
  });

  const apply = async () => {
    setBusy(true);
    try {
      const body = { operation: opId, params: buildParams(), selection: sel };
      const heavy = opId !== 'copy' && volume(sel) > HEAVY;
      const res = heavy ? await runAsync(body) : await we.transform(body);
      // copy/cut remplissent le presse-papier → on mémorise ses dimensions.
      if (opId === 'copy' && res.clipboard) setClip(res.clipboard);
      else if (opId === 'cut') setClip({ sx: Math.abs(sel.max.x - sel.min.x) + 1, sy: Math.abs(sel.max.y - sel.min.y) + 1, sz: Math.abs(sel.max.z - sel.min.z) + 1 });
      toast?.success?.(opId === 'copy' ? 'Sélection copiée dans le presse-papier'
        : `${op.label} : ${res.blocksChanged} bloc(s) modifié(s)${res.ms != null ? ` · ${res.ms} ms` : ''}`);
      await refreshState();
      onChanged?.();
    } catch (e) {
      toast?.error?.(errLabel(e?.message));
    } finally { setBusy(false); }
  };

  const undo = async () => {
    setBusy(true);
    try { await we.undo(); toast?.success?.('Opération annulée'); await refreshState(); onChanged?.(); }
    catch (e) { toast?.error?.(e?.message === 'nothing_to_undo' ? 'Rien à annuler' : 'Annulation impossible'); }
    finally { setBusy(false); }
  };

  const redo = async () => {
    setBusy(true);
    try { await we.redo(); toast?.success?.('Rétabli'); await refreshState(); onChanged?.(); }
    catch (e) { toast?.error?.(e?.message === 'nothing_to_redo' ? 'Rien à rétablir' : 'Rétablissement impossible'); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    const ok = await confirm({ title: 'Réinitialiser', message: 'Toutes les modifications en cours seront jetées (retour à la source importée).', confirmLabel: 'Réinitialiser', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await we.reset(); toast?.success?.('Staging réinitialisé'); await refreshState(); onChanged?.(); }
    catch { toast?.error?.('Action impossible'); }
    finally { setBusy(false); }
  };

  // ── Sélection : forme, étendre/réduire/décaler, baguette magique ──
  const clampSel = (s) => {
    const lim = state.bbox;
    const cl = (v, a) => Math.max(lim.min[a], Math.min(lim.max[a], v));
    return {
      ...s,
      min: { x: cl(s.min.x, 'x'), y: cl(s.min.y, 'y'), z: cl(s.min.z, 'z') },
      max: { x: cl(s.max.x, 'x'), y: cl(s.max.y, 'y'), z: cl(s.max.z, 'z') },
    };
  };
  const grow = (d) => setSelection((s) => clampSel({ ...s, min: { x: s.min.x - d, y: s.min.y - d, z: s.min.z - d }, max: { x: s.max.x + d, y: s.max.y + d, z: s.max.z + d } }));
  const shiftSel = (a, d) => setSelection((s) => clampSel({ ...s, min: { ...s.min, [a]: s.min[a] + d }, max: { ...s.max, [a]: s.max[a] + d } }));
  const setShape = (type) => setSelection((s) => ({ ...s, shape: { type } }));
  const shape = sel.shape?.type || 'box';

  const wand = async () => {
    setBusy(true);
    try {
      const r = await we.floodSelect({ x: sel.min.x, y: sel.min.y, z: sel.min.z });
      setSelection((s) => ({ ...s, min: { ...r.min }, max: { ...r.max } }));
      toast?.success?.(`Baguette : ${r.count.toLocaleString('fr')} blocs « ${r.block} »`);
    } catch (e) {
      toast?.error?.(e?.message === 'empty_seed' ? 'Vise un bloc (coin A) — pas de l’air' : 'Baguette impossible');
    } finally { setBusy(false); }
  };

  const needsConfirm = opId === 'cut' || (CONFIRM_OPS.has(opId) && volume(sel) > 50_000);
  const onApply = async () => {
    if (needsConfirm) {
      const ok = await confirm({ title: `${op.label} sur ${volume(sel).toLocaleString('fr')} blocs`, message: 'Opération large sur la sélection. Continuer ?', confirmLabel: 'Appliquer' });
      if (!ok) return;
    }
    apply();
  };

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <strong style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 14 }}>🪓 WorldEdit</strong>
        <span style={{ ...muted, fontSize: 11 }}>
          {state.hasPendingEdits ? '● modifications en cours (staging)' : 'aucune modification'} · undo : {state.undoDepth}
        </span>
      </div>

      {state.hasPendingEdits && (
        <div style={recoveryBanner}>
          💾 <strong>Sauvegarde auto</strong> : vos modifications vivent côté serveur (staging non destructif) et
          <strong> survivent à un rechargement</strong> de la page. Exportez le .mca quand c’est prêt, ou réinitialisez pour repartir de la source.
        </div>
      )}

      <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
        <CoordRow label="Coin A" value={sel.min} onChange={(v) => setSelection({ ...sel, min: v })}
          active={active === 'A'} onActivate={() => setActive?.('A')} />
        <CoordRow label="Coin B" value={sel.max} onChange={(v) => setSelection({ ...sel, max: v })}
          active={active === 'B'} onActivate={() => setActive?.('B')} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={setFull} style={{ padding: '4px 10px', fontSize: 12 }}>Tout le build</Button>
          {onExtract && (
            <Button variant="ghost" onClick={() => onExtract()} disabled={busy} style={{ padding: '4px 10px', fontSize: 12 }}>
              ✂️ Extraire la zone → nouveau build
            </Button>
          )}
          <span style={{ ...muted, fontSize: 11 }}>{volume(sel).toLocaleString('fr')} blocs · max {state.maxSelectionVolume.toLocaleString('fr')}</span>
        </div>
        {/* Forme + étendre/réduire/décaler + baguette : repliable pour alléger. */}
        <details style={advBox}>
          <summary style={advSummary}>Sélection avancée — forme, étendre/réduire, décaler, baguette</summary>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...muted, fontSize: 11 }}>Forme</span>
              <select value={shape} onChange={(e) => setShape(e.target.value)} style={{ ...selectStyle, padding: '5px 8px', fontSize: 12 }}>
                <option value="box">⬛ Boîte</option>
                <option value="sphere">⚪ Sphère</option>
                <option value="cylinder">🟢 Cylindre</option>
              </select>
              <Button variant="ghost" onClick={() => grow(1)} style={miniBtnSt} title="Étendre d’1 bloc (tous axes)">＋ Étendre</Button>
              <Button variant="ghost" onClick={() => grow(-1)} style={miniBtnSt} title="Réduire d’1 bloc">－ Réduire</Button>
              <Button variant="ghost" onClick={wand} disabled={busy} style={miniBtnSt} title="Sélectionne les blocs connectés au coin A">🪄 Baguette</Button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...muted, fontSize: 11 }}>Décaler</span>
              {[['x', 'X'], ['y', 'Y'], ['z', 'Z']].map(([a, l]) => (
                <span key={a} style={{ display: 'inline-flex', gap: 2 }}>
                  <button type="button" onClick={() => shiftSel(a, -1)} style={miniBtnSt}>−{l}</button>
                  <button type="button" onClick={() => shiftSel(a, 1)} style={miniBtnSt}>+{l}</button>
                </span>
              ))}
            </div>
            <div style={{ ...muted, fontSize: 11 }}>
              Coin actif (★ <span style={{ color: '#ffd24a' }}>{active === 'A' ? 'A' : 'B'}</span>) : <strong>flèches</strong> = X/Z au bloc près, <strong>PgUp/PgDn</strong> = Y · <strong>Shift+clic glissé</strong> = régler Y dans la vue
            </div>
          </div>
        </details>
      </div>

      {/* Choix de l'opération : menu déroulant groupé par catégorie. */}
      <Field label="Opération">
        <select value={opId} onChange={(e) => setOpId(e.target.value)} style={{ ...selectStyle, width: '100%', maxWidth: 360 }}>
          {groupOrder.map((g) => (
            <optgroup key={g} label={g}>
              {ops.filter((o) => (o.group || 'Autres') === g).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>

      <div style={{ ...muted, fontSize: 12, margin: '8px 0' }}>{op.description}</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {op.params.map((p) => (
          <ParamField key={p.name} param={p} value={params[p.name]} catalog={catalog} byId={byId}
            onChange={(v) => setParams((prev) => ({ ...prev, [p.name]: v }))} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <Button onClick={onApply} disabled={busy}>Appliquer</Button>
        <Button variant="ghost" onClick={undo} disabled={busy || !state.undoDepth}>↶ Annuler</Button>
        <Button variant="ghost" onClick={redo} disabled={busy || !state.redoDepth}>↷ Rétablir</Button>
        <Button variant="ghost" onClick={reset} disabled={busy || !state.hasPendingEdits}>Réinitialiser</Button>
      </div>

      {progress && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...muted, fontSize: 11, marginBottom: 4 }}>{PHASE_LABEL[progress.phase] || 'Traitement…'} — {progress.pct}%</div>
          <div style={{ height: 8, borderRadius: 6, background: 'rgba(80,50,130,0.2)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress.pct}%`, background: 'linear-gradient(90deg,#c9a8e8,#7dd3fc)', transition: 'width 0.25s' }} />
          </div>
        </div>
      )}

      {/* Image → relief (heightmap) */}
      <HeightmapTool we={we} selection={sel} onChanged={onChanged} refreshState={refreshState} />

      {/* Bibliothèque de schematics + import/export .schem/.litematic */}
      <SchematicLibrary we={we} clipboard={clip} onLoaded={setClip} />

      {/* Export + placement dans le monde */}
      <div style={{ marginTop: 12, borderTop: '1px solid rgba(80,50,130,0.18)', paddingTop: 10 }}>
        <div style={{ ...muted, fontSize: 11, marginBottom: 6 }}>
          📦 S’insère dans le monde à <strong style={{ color: '#c9a8e8' }}>X {full.min.x}…{full.max.x}</strong>,
          {' '}<strong style={{ color: '#c9a8e8' }}>Y {full.min.y}…{full.max.y}</strong>,
          {' '}<strong style={{ color: '#c9a8e8' }}>Z {full.min.z}…{full.max.z}</strong>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...muted, fontSize: 12 }}>Décaler à l’export :</span>
          {['dx', 'dy', 'dz'].map((k) => (
            <Input key={k} type="number" value={offset[k]} aria-label={k} style={{ width: 78 }}
              onChange={(e) => setOffset((o) => ({ ...o, [k]: Math.round(Number(e.target.value)) || 0 }))} />
          ))}
          <a href={we.exportUrl(offset)} style={exportLink}>⬇ Exporter .mca</a>
        </div>
        {(offset.dx || offset.dy || offset.dz) ? (
          <div style={{ ...muted, fontSize: 10, marginTop: 4 }}>
            Décalage non nul → les chunks sont reconstruits (les coffres/biomes ne sont pas conservés).
          </div>
        ) : null}
      </div>
    </div>
  );
}

const volume = (s) => (Math.abs(s.max.x - s.min.x) + 1) * (Math.abs(s.max.y - s.min.y) + 1) * (Math.abs(s.max.z - s.min.z) + 1);
function errLabel(code) {
  return ({
    out_of_bounds: 'Sélection hors des limites du build',
    selection_too_large: 'Sélection trop grande',
    invalid_selection: 'Sélection invalide',
    bad_block: 'Bloc invalide (format namespace:id)',
    empty_clipboard: 'Presse-papier vide',
    rate_limited: 'Trop d’opérations, patiente une minute',
  })[code] || 'Opération impossible';
}

const wrap = { padding: 14, borderTop: '1px solid rgba(80,50,130,0.22)' };
const advBox = {
  borderRadius: 8, border: '1px solid rgba(80,50,130,0.2)', background: 'rgba(14,9,28,0.35)', padding: '6px 10px',
};
const advSummary = {
  cursor: 'pointer', fontSize: 12, color: 'rgba(200,180,240,0.85)', fontFamily: "'Inter',sans-serif", userSelect: 'none',
};
const recoveryBanner = {
  margin: '0 0 10px', padding: '8px 12px', borderRadius: 8, fontSize: 11.5, lineHeight: 1.5,
  color: 'rgba(232,228,248,0.85)', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.28)',
};
const selectStyle = {
  background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '7px 10px', color: '#ede8f8', fontSize: 13, fontFamily: "'Inter',sans-serif",
};
const exportLink = {
  display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  textDecoration: 'none', color: 'rgba(232,228,248,0.75)', border: '1px solid rgba(80,50,130,0.32)',
  fontFamily: "'Space Grotesk',sans-serif",
};
