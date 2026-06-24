import { useEffect, useState } from 'react';
import { Button, Field, Input } from '../../admin/ui';
import { muted } from '../shared';
import { useToast } from '../../../ui/ToastProvider';
import { useConfirm } from '../../../ui/ConfirmProvider';

// Panneau « WorldEdit » : sélection (saisie X/Y/Z) + opérations générées depuis
// /operations, appliquées sur une copie de staging (non destructif). Annuler /
// Réinitialiser / Exporter. Le rendu 3D au-dessus est rechargé via onChanged().

const AXES = ['x', 'y', 'z'];

function CoordRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ ...muted, fontSize: 12, width: 60 }}>{label}</span>
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

function ParamField({ param, value, onChange }) {
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
        <div style={{ display: 'grid', gap: 6 }}>
          <Input placeholder="minecraft:oak_stairs" value={v.name}
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

export function WorldEditPanel({ we, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();

  const [state, setState] = useState(null);
  const [ops, setOps] = useState([]);
  const [opId, setOpId] = useState('mirror');
  const [params, setParams] = useState({});
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);

  const refreshState = () => we.state().then(setState).catch(() => {});

  useEffect(() => {
    let alive = true;
    we.state().then((s) => {
      if (!alive) return;
      setState(s);
      if (s.bbox) setSel({ min: { ...s.bbox.min }, max: { ...s.bbox.max } });
    }).catch(() => {});
    we.operations().then((r) => { if (alive) setOps(r.operations || []); }).catch(() => {});
    return () => { alive = false; };
  }, [we]);

  const op = ops.find((o) => o.id === opId);
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
  if (!state || !sel || !op) return <div style={{ ...wrap, ...muted, fontSize: 12 }}>Chargement de l’éditeur…</div>;
  if (!state.canEdit) return null; // viewer : sélection/aperçu seulement (pas d’écriture)

  const setFull = () => setSel({ min: { ...state.bbox.min }, max: { ...state.bbox.max } });

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

  const needsConfirm = (opId === 'set' || opId === 'replace') && volume(sel) > 50_000;
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

      <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <CoordRow label="Coin A" value={sel.min} onChange={(v) => setSel({ ...sel, min: v })} />
        <CoordRow label="Coin B" value={sel.max} onChange={(v) => setSel({ ...sel, max: v })} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="ghost" onClick={setFull} style={{ padding: '4px 10px', fontSize: 12 }}>Tout le build</Button>
          <span style={{ ...muted, fontSize: 11 }}>{volume(sel).toLocaleString('fr')} blocs · max {state.maxSelectionVolume.toLocaleString('fr')}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {ops.filter((o) => o.id !== 'copy' && o.id !== 'paste').map((o) => (
          <button key={o.id} type="button" onClick={() => setOpId(o.id)} style={chip(o.id === opId)}>{o.label}</button>
        ))}
      </div>

      <div style={{ ...muted, fontSize: 12, marginBottom: 8 }}>{op.description}</div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {op.params.map((p) => (
          <ParamField key={p.name} param={p} value={params[p.name]} onChange={(v) => setParams((prev) => ({ ...prev, [p.name]: v }))} />
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
