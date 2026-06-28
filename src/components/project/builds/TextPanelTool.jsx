import { useRef, useState } from 'react';
import { Button, Input } from '../../admin/ui';
import { muted } from '../shared';
import { useToast } from '../../../ui/ToastProvider';
import { useCodex } from '../../../hooks/useCodex';
import { CodexPicker } from '../../admin/editors/minecraft/CodexPicker';

const bareId = (name) => (name && name.includes(':') ? name.split(':').slice(1).join(':') : (name || ''));
const nsName = (entry, id) => `${entry?.source === 'minefield' ? 'minefield' : 'minecraft'}:${id}`;

const PRESETS = [
  ['white_marble', 'Marbre blanc (texte noir)'],
  ['black_marble', 'Marbre noir (texte blanc)'],
  ['white_clean', 'Quartz uni'],
  ['black_clean', 'Noir uni'],
];

// Générateur de panneaux : écrit du texte (coréen OK) ou une image sur un mur
// plat, texte = bloc « encre », fond = texture marbre. La sélection doit être
// PLATE (1 bloc d'épaisseur) : l'axe le plus fin devient la face du panneau.
export function TextPanelTool({ we, selection, onChanged, refreshState }) {
  const toast = useToast();
  const { catalog, byId } = useCodex();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [preset, setPreset] = useState('black_marble');
  const [ink, setInk] = useState('');
  const [invert, setInvert] = useState(false);

  const fields = () => ({
    selection, preset, invert: String(invert),
    ...(ink ? { ink: { name: ink, states: null } } : {}),
  });

  const generate = async (file) => {
    if (!selection) { toast?.error?.('Définis d’abord une sélection plate (le mur du panneau)'); return; }
    if (!file && !text.trim()) { toast?.error?.('Tape un texte ou choisis une image'); return; }
    setBusy(true);
    try {
      const r = await we.panel({ ...fields(), text: file ? '' : text }, file || undefined);
      toast?.success?.(`Panneau généré : ${r.blocksChanged.toLocaleString('fr')} bloc(s) · ${r.plane.w}×${r.plane.h}`);
      if (r.previewTruncated) toast?.info?.('Zone très grande : aperçu partiel, export .mca complet.');
      await refreshState?.(); onChanged?.();
    } catch (e) {
      const code = e?.body?.error;
      toast?.error?.(code === 'no_content' ? 'Texte ou image requis' : code === 'selection_too_large' ? 'Zone trop grande' : 'Génération impossible');
    } finally { setBusy(false); }
  };

  const onPick = (e) => {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (file) generate(file);
  };

  // Carte Minecraft (item filled_map 128×128) → télécharge map_0.dat.
  const mapFileRef = useRef(null);
  const makeMap = async (file) => {
    if (!file && !text.trim()) { toast?.error?.('Tape un texte ou choisis une image'); return; }
    setBusy(true);
    try {
      const blob = await we.mapart({ preset, invert: String(invert), text: file ? '' : text }, file || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'map_0.dat'; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast?.success?.('Carte générée (map_0.dat) — voir l’aide ci-dessous');
    } catch { toast?.error?.('Génération de carte impossible'); } finally { setBusy(false); }
  };
  const onPickMap = (e) => {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (file) makeMap(file);
  };

  return (
    <details style={box}>
      <summary style={summary}>🔤 Panneau texte / image (marbre)</summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
        <div style={{ ...muted, fontSize: 11 }}>
          Écrit le texte (coréen / latin) sur un mur <strong>plat</strong> : sélectionne une zone d’1 bloc
          d’épaisseur. L’axe le plus fin devient la face. Sauts de ligne autorisés.
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="안녕하세요 / Texte…"
          style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
        <label style={field}>
          <span style={{ ...muted, fontSize: 11 }}>Style de fond</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value)} style={inputStyle}>
            {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label style={field}>
          <span style={{ ...muted, fontSize: 11 }}>Bloc du texte (optionnel — sinon selon le style)</span>
          <CodexPicker catalog={catalog} byId={byId} value={bareId(ink)}
            onChange={(id, entry) => setInk(nsName(entry, id))} placeholder="ex. gold_block, black_concrete…" />
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} style={{ accentColor: '#c9a8e8' }} />
          <span style={{ ...muted, fontSize: 12 }}>Inverser (texte ⇄ fond)</span>
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => generate(null)} disabled={busy} style={{ padding: '6px 12px', fontSize: 12 }}>
            {busy ? 'Génération…' : '✍️ Générer le texte'}
          </Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy} style={{ padding: '6px 12px', fontSize: 12 }}>⬆ Depuis une image</Button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
        </div>

        <div style={{ borderTop: '1px solid rgba(80,50,130,0.18)', paddingTop: 8, display: 'grid', gap: 6 }}>
          <div style={{ ...muted, fontSize: 11 }}>
            <strong>Carte Minecraft</strong> (item 128×128, <code>map_&lt;n&gt;.dat</code>) — pas des blocs, l’<em>objet</em> carte.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="ghost" onClick={() => makeMap(null)} disabled={busy} style={{ padding: '6px 12px', fontSize: 12 }}>🗺️ Carte depuis le texte</Button>
            <Button variant="ghost" onClick={() => mapFileRef.current?.click()} disabled={busy} style={{ padding: '6px 12px', fontSize: 12 }}>🗺️ Carte depuis une image</Button>
            <input ref={mapFileRef} type="file" accept="image/*" onChange={onPickMap} style={{ display: 'none' }} />
          </div>
          <div style={{ ...muted, fontSize: 10 }}>
            Place <code>map_0.dat</code> dans <code>&lt;monde&gt;/data/</code>, puis en jeu :
            {' '}<code>/give @p filled_map[minecraft:map_id=0]</code> (1.21+) ou <code>filled_map{'{'}map:0{'}'}</code> (1.20−).
            Renomme en <code>map_1.dat</code>, <code>map_2.dat</code>… pour plusieurs.
          </div>
        </div>
      </div>
    </details>
  );
}

const box = { borderRadius: 8, border: '1px solid rgba(80,50,130,0.2)', background: 'rgba(14,9,28,0.35)', padding: '6px 10px', marginTop: 12 };
const summary = { cursor: 'pointer', fontSize: 13, color: '#c9a8e8', fontFamily: "'Space Grotesk',sans-serif", userSelect: 'none' };
const field = { display: 'grid', gap: 4 };
const inputStyle = {
  background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '7px 10px', color: '#ede8f8', fontSize: 13,
};
