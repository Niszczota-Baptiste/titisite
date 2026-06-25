import { useEffect, useState } from 'react';
import { Button, Field, Input } from '../../admin/ui';
import { muted } from '../shared';
import { useToast } from '../../../ui/ToastProvider';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { useCodex } from '../../../hooks/useCodex';
import { CodexPicker } from '../../admin/editors/minecraft/CodexPicker';

// id de bloc « minecraft:oak_stairs » → id codex « oak_stairs » et inverse.
const bareId = (name) => (name && name.includes(':') ? name.split(':').slice(1).join(':') : (name || ''));
const nsName = (entry, id) => `${entry?.source === 'minefield' ? 'minefield' : 'minecraft'}:${id}`;

// Panneau « WorldEdit » : sélection (saisie X/Y/Z) + opérations générées depuis
// /operations, appliquées sur une copie de staging (non destructif). Annuler /
// Réinitialiser / Exporter. Le rendu 3D au-dessus est rechargé via onChanged().

const AXES = ['x', 'y', 'z'];
const CONFIRM_OPS = new Set(['set', 'replace', 'cut', 'walls', 'faces', 'hollow', 'overlay', 'naturalize', 'sphere', 'cyl', 'smooth', 'stack', 'scale']);

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
          {param.values.map((v) => <option key={v} value={v}>{String(v)}</option>)}
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
  return null;
}

function defaultParams(op) {
  const out = {};
  for (const p of op.params) {
    out[p.name] = p.type === 'block' ? { name: '', statesStr: '' } : (p.default ?? (p.type === 'int' ? 0 : ''));
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

  const apply = async () => {
    setBusy(true);
    try {
      const res = await we.transform({ operation: opId, params: buildParams(), selection: sel });
      toast?.success?.(`${op.label} : ${res.blocksChanged} bloc(s) modifié(s)`);
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

  const reset = async () => {
    const ok = await confirm({ title: 'Réinitialiser', message: 'Toutes les modifications en cours seront jetées (retour à la source importée).', confirmLabel: 'Réinitialiser', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await we.reset(); toast?.success?.('Staging réinitialisé'); await refreshState(); onChanged?.(); }
    catch { toast?.error?.('Action impossible'); }
    finally { setBusy(false); }
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
        <div style={{ ...muted, fontSize: 11 }}>
          Coin actif (★ <span style={{ color: '#ffd24a' }}>{active === 'A' ? 'A' : 'B'}</span>) : <strong>flèches</strong> = X/Z au bloc près, <strong>PgUp/PgDn</strong> = Y · <strong>Shift+clic glissé</strong> = régler Y dans la vue
        </div>
      </div>

      {groupOrder.map((g) => (
        <div key={g} style={{ marginBottom: 8 }}>
          <div style={{ ...muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>{g}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ops.filter((o) => (o.group || 'Autres') === g).map((o) => (
              <button key={o.id} type="button" onClick={() => setOpId(o.id)} style={chip(o.id === opId)}>{o.label}</button>
            ))}
          </div>
        </div>
      ))}

      <div style={{ ...muted, fontSize: 12, marginBottom: 8 }}>{op.description}</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {op.params.map((p) => (
          <ParamField key={p.name} param={p} value={params[p.name]} catalog={catalog} byId={byId}
            onChange={(v) => setParams((prev) => ({ ...prev, [p.name]: v }))} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <Button onClick={onApply} disabled={busy}>Appliquer</Button>
        <Button variant="ghost" onClick={undo} disabled={busy || !state.undoDepth}>↶ Annuler</Button>
        <Button variant="ghost" onClick={reset} disabled={busy || !state.hasPendingEdits}>Réinitialiser</Button>
        <a href={we.exportUrl()} style={exportLink}>⬇ Exporter .mca</a>
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
const selectStyle = {
  background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '7px 10px', color: '#ede8f8', fontSize: 13, fontFamily: "'Inter',sans-serif",
};
const exportLink = {
  display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  textDecoration: 'none', color: 'rgba(232,228,248,0.75)', border: '1px solid rgba(80,50,130,0.32)',
  fontFamily: "'Space Grotesk',sans-serif",
};
const chip = (active) => ({
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontFamily: "'Inter',sans-serif",
  background: active ? 'rgba(201,168,232,0.2)' : 'transparent',
  border: `1px solid ${active ? '#c9a8e8' : 'rgba(80,50,130,0.28)'}`,
  color: active ? '#c9a8e8' : '#ede8f8',
});
