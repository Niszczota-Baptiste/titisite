import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { searchBlocks } from '../../data/minecraftBlocks';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import {
  ACC, ACC_RGB, Button, Empty, ErrorBanner, Field, Input, Modal, Section,
  Textarea, card, muted,
} from './shared';

export function MinecraftTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const confirm = useConfirm();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    try { setItems(await ws.minecraft.list()); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace.slug]);

  const adjust = async (id, delta) => {
    setBusyId(id);
    try {
      const updated = await ws.minecraft.adjust(id, delta);
      setItems((prev) => prev.map((r) => (r.id === id ? updated : r)));
    } catch (e) {
      setErr(e.message);
      toast.error(`Échec : ${e.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r) => {
    const ok = await confirm({
      title: `Supprimer « ${r.name} »`,
      message: 'Cette ressource sera retirée définitivement de la liste.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await ws.minecraft.remove(r.id);
      toast.success('Ressource supprimée');
      await load();
    } catch (e) {
      setErr(e.message);
      toast.error(`Échec : ${e.message}`);
    }
  };

  const totalUnits = items.reduce((sum, r) => sum + (r.quantity || 0), 0);

  return (
    <Section
      title="⛏️ Ressources Minecraft"
      actions={
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          + Nouvelle ressource
        </Button>
      }
    >
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : items.length === 0 ? (
        <Empty>Aucune ressource. Ajoute-en une pour commencer (ex. Diamants, Stone, Bois…).</Empty>
      ) : (
        <>
          <p style={{ ...muted, fontSize: 12, marginBottom: 12 }}>
            {items.length} ressource{items.length > 1 ? 's' : ''} · {totalUnits} unité{totalUnits > 1 ? 's' : ''} au total
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((r) => (
              <div key={r.id} style={{
                ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700,
                    color: '#ede8f8',
                  }}>{r.name}</div>
                  {r.notes && (
                    <div style={{ ...muted, fontSize: 12, marginTop: 4 }}>{r.notes}</div>
                  )}
                </div>

                <QuantityStepper
                  value={r.quantity}
                  busy={busyId === r.id}
                  onAdjust={(d) => adjust(r.id, d)}
                />

                <div style={{ display: 'flex', gap: 6 }}>
                  <Button variant="ghost" onClick={() => { setEditing(r); setModalOpen(true); }}>
                    Éditer
                  </Button>
                  <Button variant="danger" onClick={() => remove(r)}>Supprimer</Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <ResourceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        ws={ws}
        onSaved={async () => { setModalOpen(false); await load(); }}
        onError={(e) => setErr(e.message)}
        toast={toast}
      />
    </Section>
  );
}

function QuantityStepper({ value, busy, onAdjust }) {
  const btn = (delta, label) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => onAdjust(delta)}
      style={{
        background: `rgba(${ACC_RGB},0.12)`,
        border: `1px solid rgba(${ACC_RGB},0.4)`,
        color: ACC, borderRadius: 6,
        width: 30, height: 30,
        cursor: busy ? 'wait' : 'pointer',
        fontSize: 14, fontWeight: 700,
        fontFamily: "'Inter',sans-serif",
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        opacity: busy ? 0.5 : 1,
      }}
    >{label}</button>
  );
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'rgba(20,14,38,0.5)',
      border: '1px solid rgba(60,40,100,0.25)',
      borderRadius: 8, padding: '4px 8px',
    }}>
      {btn(-10, '−10')}
      {btn(-1, '−1')}
      <span style={{
        minWidth: 56, textAlign: 'center',
        fontFamily: 'monospace', fontSize: 16, fontWeight: 700,
        color: '#ede8f8',
      }}>{value}</span>
      {btn(+1, '+1')}
      {btn(+10, '+10')}
    </div>
  );
}

function ResourceModal({ open, onClose, editing, ws, onSaved, onError, toast }) {
  const isEdit = !!editing;
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || '');
    setQuantity(editing?.quantity ?? 0);
    setNotes(editing?.notes || '');
  }, [open, editing]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), quantity: Number(quantity) || 0, notes: notes.trim() };
      if (isEdit) {
        await ws.minecraft.update(editing.id, payload);
        toast.success('Ressource mise à jour');
      } else {
        await ws.minecraft.create(payload);
        toast.success('Ressource ajoutée');
      }
      await onSaved();
    } catch (ex) {
      onError(ex);
      toast.error(`Échec : ${ex.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier la ressource' : 'Nouvelle ressource'}
      width={520}
    >
      <form onSubmit={submit}>
        <Field label="Nom de la ressource (catalogue Minecraft 1.18.2)">
          <BlockPicker
            value={name}
            onChange={setName}
            autoFocus
          />
        </Field>
        <Field label="Quantité">
          <Input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </Field>
        <Field label="Notes (optionnel)">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Source, emplacement, usage prévu…"
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? '…' : (isEdit ? 'Mettre à jour' : 'Ajouter')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Combobox: champ texte libre + liste de suggestions filtrée à la frappe
 * depuis le catalogue de blocs Minecraft 1.18.2. L'utilisateur peut soit
 * choisir une suggestion (clic / Entrée), soit taper son propre nom.
 */
function BlockPicker({ value, onChange, autoFocus }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef(null);

  const suggestions = useMemo(() => searchBlocks(value, 60), [value]);

  useEffect(() => { setHighlight(0); }, [value]);

  // Click outside closes the menu
  useEffect(() => {
    if (!open) return;
    const fn = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const pick = (s) => {
    onChange(s.name);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && suggestions[highlight]) {
      e.preventDefault();
      pick(suggestions[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Diamant, planches en chêne, redstone…"
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        required
      />
      {open && suggestions.length > 0 && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            marginTop: 4, zIndex: 1000,
            background: '#0b0620',
            border: '1px solid rgba(80,50,130,0.35)',
            borderRadius: 10,
            boxShadow: '0 18px 36px rgba(0,0,0,0.55)',
            maxHeight: 280, overflowY: 'auto',
            padding: 4,
          }}
        >
          {suggestions.map((s, i) => {
            const active = i === highlight;
            return (
              <button
                type="button"
                key={`${s.category}-${s.name}-${i}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => e.preventDefault() /* keep input focus */}
                onClick={() => pick(s)}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: 12,
                  padding: '7px 10px', borderRadius: 6,
                  background: active ? `rgba(${ACC_RGB},0.14)` : 'transparent',
                  border: 'none', cursor: 'pointer',
                  color: active ? ACC : '#ede8f8',
                  fontFamily: "'Inter',sans-serif", fontSize: 13,
                }}
              >
                <span>{s.name}</span>
                <span style={{
                  ...muted, fontSize: 11, flexShrink: 0,
                  letterSpacing: '0.3px', textTransform: 'uppercase',
                }}>{s.category}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
