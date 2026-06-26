import { useRef, useState } from 'react';
import { Button, Input } from '../../admin/ui';
import { muted } from '../shared';
import { useToast } from '../../../ui/ToastProvider';
import { useCodex } from '../../../hooks/useCodex';
import { CodexPicker } from '../../admin/editors/minecraft/CodexPicker';

const bareId = (name) => (name && name.includes(':') ? name.split(':').slice(1).join(':') : (name || ''));
const nsName = (entry, id) => `${entry?.source === 'minefield' ? 'minefield' : 'minecraft'}:${id}`;

// Image → relief : on envoie une image, sa luminance pilote la hauteur de chaque
// colonne de la sélection (réutilise sharp côté serveur). Replie sous <details>.
export function HeightmapTool({ we, selection, onChanged, refreshState }) {
  const toast = useToast();
  const { catalog, byId } = useCodex();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [surface, setSurface] = useState('minecraft:grass_block');
  const [under, setUnder] = useState('minecraft:dirt');
  const [mode, setMode] = useState('solid');
  const [invert, setInvert] = useState(false);

  const run = async (file) => {
    if (!selection) { toast?.error?.('Définis d’abord une sélection (la zone du relief)'); return; }
    setBusy(true);
    try {
      const r = await we.heightmap(file, {
        selection, block: { name: surface, states: null },
        under: mode === 'solid' && under ? { name: under } : '',
        mode, invert: String(invert),
      });
      toast?.success?.(`Relief généré : ${r.blocksChanged.toLocaleString('fr')} bloc(s)`);
      await refreshState?.(); onChanged?.();
    } catch (e) {
      toast?.error?.(e?.body?.error === 'selection_too_large' ? 'Zone trop grande' : 'Génération impossible');
    } finally { setBusy(false); }
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (file) run(file);
  };

  // Sort la zone sélectionnée en image heightmap (PNG niveaux de gris).
  const exportZone = async () => {
    if (!selection) { toast?.error?.('Définis d’abord une sélection'); return; }
    setBusy(true);
    try {
      const blob = await we.exportHeightmap(selection);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'heightmap.png'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast?.success?.('Heightmap exportée');
    } catch (e) {
      toast?.error?.(e?.body?.error === 'selection_too_large' ? 'Zone trop grande' : 'Export impossible');
    } finally { setBusy(false); }
  };

  return (
    <details style={box}>
      <summary style={summary}>🗺️ Image → relief (heightmap)</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        <div style={{ ...muted, fontSize: 11 }}>
          La <strong>luminance</strong> de l’image donne la hauteur de chaque colonne dans la sélection
          (blanc = haut, noir = bas). La zone XZ = ta sélection, la hauteur max = sa plage Y.
        </div>
        <Field label="Revêtement (surface)">
          <CodexPicker catalog={catalog} byId={byId} value={bareId(surface)}
            onChange={(id, entry) => setSurface(nsName(entry, id))} placeholder="ex. grass_block" />
        </Field>
        {mode === 'solid' && (
          <Field label="Sous-couche (remplissage)">
            <CodexPicker catalog={catalog} byId={byId} value={bareId(under)}
              onChange={(id, entry) => setUnder(nsName(entry, id))} placeholder="ex. dirt / stone" />
          </Field>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={lbl}>
            <span style={{ ...muted, fontSize: 12 }}>Remplissage</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)} style={sel}>
              <option value="solid">Colonne pleine</option>
              <option value="surface">Surface seule</option>
            </select>
          </label>
          <label style={{ ...lbl, flexDirection: 'row', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} style={{ accentColor: '#c9a8e8' }} />
            <span style={{ ...muted, fontSize: 12 }}>Inverser</span>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy} style={{ padding: '6px 12px', fontSize: 12 }}>
            {busy ? 'Traitement…' : '⬆ Image → relief'}
          </Button>
          <Button variant="ghost" onClick={exportZone} disabled={busy} title="Génère une image PNG en niveaux de gris depuis le relief de la sélection"
            style={{ padding: '6px 12px', fontSize: 12 }}>⬇ Zone → heightmap (PNG)</Button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
        </div>
      </div>
    </details>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ ...muted, fontSize: 11 }}>{label}</span>
      {children}
    </label>
  );
}

const box = { borderRadius: 8, border: '1px solid rgba(80,50,130,0.2)', background: 'rgba(14,9,28,0.35)', padding: '6px 10px', marginTop: 12 };
const summary = { cursor: 'pointer', fontSize: 13, color: '#c9a8e8', fontFamily: "'Space Grotesk',sans-serif", userSelect: 'none' };
const lbl = { display: 'flex', flexDirection: 'column', gap: 4 };
const sel = {
  background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '6px 10px', color: '#ede8f8', fontSize: 13, fontFamily: "'Inter',sans-serif",
};
