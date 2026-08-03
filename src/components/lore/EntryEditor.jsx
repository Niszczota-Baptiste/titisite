import { useRef, useState } from 'react';
import { api } from '../../api/client';
import { parseCoords } from './coords';
import { LoreMarkdown } from './markdown';
import {
  ACC, ACC_RGB, CRIMSON, DIMENSIONS, ENTRY_TYPES, ENTRY_TYPE_ORDER, INK, MUTED,
} from './theme';

// Éditeur d'entrée (création + édition) : markdown avec preview et
// autocomplétion [[Titre]], champ coordonnées à parsing intelligent (coller
// depuis F3 marche), images en drag & drop multi-fichiers — uploadées après le
// save (une pièce jointe a besoin de l'id de l'entrée).

const ACCEPTED = 'image/png,image/jpeg,image/webp';

// `initial` : préremplissage à la création — coordonnées + dimension du clic
// « ➕ Point » sur la carte.
export function EntryEditor({ entry, entries, initial, onSaved, onCancel }) {
  const [title, setTitle] = useState(entry?.title || '');
  const [entryType, setEntryType] = useState(entry?.entryType || 'observation');
  const [dimension, setDimension] = useState(entry?.dimension || initial?.dimension || 'overworld');
  const [x, setX] = useState(entry?.x ?? initial?.x ?? '');
  const [y, setY] = useState(entry?.y ?? '');
  const [z, setZ] = useState(entry?.z ?? initial?.z ?? '');
  const [pasteMsg, setPasteMsg] = useState(null);
  const [discoveredAt, setDiscoveredAt] = useState(
    entry?.discoveredAt ? new Date(entry.discoveredAt * 1000).toISOString().slice(0, 10) : '',
  );
  const [isCanon, setIsCanon] = useState(entry?.isCanon || false);
  const [tagsText, setTagsText] = useState((entry?.tags || []).map((t) => t.name).join(', '));
  const [bodyMd, setBodyMd] = useState(entry?.bodyMd || '');
  const [preview, setPreview] = useState(false);
  const [media, setMedia] = useState(entry?.media || []);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [sug, setSug] = useState(null); // { list, start } — autocomplétion [[
  const taRef = useRef(null);

  // ── Coordonnées : collage intelligent ──
  const onPaste = (raw) => {
    const parsed = parseCoords(raw);
    if (!parsed) { setPasteMsg(raw.trim() ? '❓ Format non reconnu' : null); return; }
    setX(parsed.x); setZ(parsed.z);
    if (parsed.y !== null) setY(parsed.y);
    setPasteMsg(`✓ X ${parsed.x}${parsed.y !== null ? ` · Y ${parsed.y}` : ''} · Z ${parsed.z}`);
  };

  // ── Autocomplétion [[Titre d'entrée]] ──
  const onBodyChange = (e) => {
    const value = e.target.value;
    setBodyMd(value);
    const pos = e.target.selectionStart;
    const m = value.slice(0, pos).match(/\[\[([^\]\n|]*)$/);
    if (!m) { setSug(null); return; }
    const q = m[1].toLowerCase();
    const list = (entries || [])
      .filter((en) => en.id !== entry?.id && en.title.toLowerCase().includes(q))
      .slice(0, 8);
    setSug(list.length ? { list, start: pos - m[1].length } : null);
  };

  const pickSuggestion = (picked) => {
    const el = taRef.current;
    const pos = el ? el.selectionStart : sug.start;
    const next = `${bodyMd.slice(0, sug.start)}${picked.title}]]${bodyMd.slice(pos)}`;
    setBodyMd(next);
    setSug(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const p = sug.start + picked.title.length + 2;
      el.setSelectionRange(p, p);
    });
  };

  // ── Fichiers (drag & drop + sélecteur) ──
  const addFiles = (fileList) => {
    const ok = [...fileList].filter((f) => ACCEPTED.split(',').includes(f.type));
    if (ok.length) setPendingFiles((p) => [...p, ...ok]);
  };

  const removeExistingMedia = async (id) => {
    try {
      await api.lore.media.remove(id);
      setMedia((m) => m.filter((x2) => x2.id !== id));
    } catch (ex) { setErr(ex.message); }
  };

  // ── Save ──
  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setErr(null);
    try {
      const coord = (v) => (v === '' || v === null ? null : Math.round(Number(v)));
      const payload = {
        title: title.trim(),
        entryType,
        dimension,
        isCanon,
        bodyMd,
        x: coord(x), y: coord(y), z: coord(z),
        discoveredAt: discoveredAt ? Math.floor(new Date(`${discoveredAt}T12:00:00`).getTime() / 1000) : null,
        tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean),
      };
      const saved = entry
        ? await api.lore.entries.update(entry.id, payload)
        : await api.lore.entries.create(payload);
      for (const f of pendingFiles) {
        const fd = new FormData();
        fd.append('image', f);
        fd.append('entryId', String(saved.id));
        await api.lore.media.upload(fd);
      }
      onSaved(saved.id);
    } catch (ex) {
      setErr(humanize(ex));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ fontFamily: "'Inter',sans-serif" }}>
      {err && <p style={{ color: CRIMSON, fontSize: 13, marginTop: 0 }}>{err}</p>}

      <Field label="Titre">
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} style={input} />
      </Field>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Field label="Type" style={{ flex: '1 1 140px' }}>
          <select value={entryType} onChange={(e) => setEntryType(e.target.value)} style={input}>
            {ENTRY_TYPE_ORDER.map((t) => <option key={t} value={t}>{ENTRY_TYPES[t].icon} {ENTRY_TYPES[t].label}</option>)}
          </select>
        </Field>
        <Field label="Dimension" style={{ flex: '1 1 130px' }}>
          <select value={dimension} onChange={(e) => setDimension(e.target.value)} style={input}>
            {Object.entries(DIMENSIONS).map(([k, d]) => <option key={k} value={k}>{d.icon} {d.label}</option>)}
          </select>
        </Field>
        <Field label="Découverte le" style={{ flex: '1 1 140px' }}>
          <input type="date" value={discoveredAt} onChange={(e) => setDiscoveredAt(e.target.value)} style={input} />
        </Field>
      </div>

      <Field label="Coordonnées — colle depuis F3, « x z », « x, y, z » ou « x=… z=… »">
        <input
          placeholder="XYZ: -353.500 / 64.00000 / -5636.500"
          onChange={(e) => { onPaste(e.target.value); }}
          style={{ ...input, fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }}
        />
        {pasteMsg && <div style={{ fontSize: 11.5, color: pasteMsg.startsWith('✓') ? ACC : MUTED, marginTop: 3 }}>{pasteMsg}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {[['X', x, setX], ['Y', y, setY], ['Z', z, setZ]].map(([label, val, set]) => (
            <label key={label} style={{ flex: 1, fontSize: 11.5, color: MUTED }}>
              {label}
              <input
                type="number" value={val} onChange={(e) => set(e.target.value)}
                style={{ ...input, marginTop: 2, fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5 }}
              />
            </label>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <Field label="Tags (séparés par des virgules)" style={{ flex: '1 1 240px' }}>
          <input value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="fort, tour-des-vents…" style={input} />
        </Field>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: INK, paddingBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={isCanon} onChange={(e) => setIsCanon(e.target.checked)} style={{ accentColor: ACC, width: 15, height: 15 }} />
          Canon <span style={{ color: MUTED, fontSize: 11 }}>(placé par la modération, pas une interprétation)</span>
        </label>
      </div>

      <Field label={(
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          Corps (markdown — <code style={{ fontSize: 11 }}>[[Titre d'entrée]]</code> pour un lien interne)
          <button type="button" onClick={() => setPreview((p) => !p)} style={{
            marginLeft: 'auto', padding: '3px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5,
            background: preview ? ACC : 'transparent', color: preview ? '#08130b' : ACC,
            border: `1px solid ${ACC}`, fontWeight: 600,
          }}>{preview ? '✎ Éditer' : '👁 Preview'}</button>
        </span>
      )}>
        {preview ? (
          <div style={{ ...input, minHeight: 180, overflowY: 'auto', maxHeight: 380 }}>
            <LoreMarkdown content={bodyMd} entries={entries} />
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <textarea
              ref={taRef} value={bodyMd} onChange={onBodyChange}
              onKeyDown={(e) => { if (e.key === 'Escape' && sug) { e.preventDefault(); setSug(null); } }}
              onBlur={() => setTimeout(() => setSug(null), 200)}
              rows={10} style={{ ...input, resize: 'vertical', lineHeight: 1.6 }}
            />
            {sug && (
              <div style={{
                position: 'absolute', left: 10, bottom: 8, zIndex: 5, maxWidth: '90%',
                background: 'rgba(9,16,14,0.97)', border: `1px solid rgba(${ACC_RGB},0.4)`,
                borderRadius: 8, overflow: 'hidden', boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
              }}>
                {sug.list.map((s) => (
                  <button
                    key={s.id} type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '6px 12px',
                      background: 'none', border: 'none', color: INK, cursor: 'pointer', fontSize: 12.5,
                    }}
                  >{ENTRY_TYPES[s.entryType]?.icon} {s.title}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </Field>

      {/* images */}
      <Field label="Images (PNG/JPEG/WebP, 10 Mo max — recompressées en WebP)">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          style={{
            border: `1px dashed rgba(${ACC_RGB},0.4)`, borderRadius: 10, padding: 14,
            textAlign: 'center', color: MUTED, fontSize: 12.5,
          }}
        >
          Glisse des captures ici, ou{' '}
          <label style={{ color: ACC, cursor: 'pointer', textDecoration: 'underline' }}>
            choisis des fichiers
            <input type="file" multiple accept={ACCEPTED} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
          </label>
          {pendingFiles.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {pendingFiles.map((f, i) => (
                <span key={`${f.name}-${i}`} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
                  background: `rgba(${ACC_RGB},0.12)`, border: `1px solid rgba(${ACC_RGB},0.4)`, color: ACC, fontSize: 11.5,
                }}>
                  🖼 {f.name}
                  <button type="button" onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', color: ACC, cursor: 'pointer', padding: 0 }}>✕</button>
                </span>
              ))}
              <span style={{ width: '100%', fontSize: 10.5, color: MUTED }}>uploadées à l'enregistrement</span>
            </div>
          )}
        </div>
        {media.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {media.map((m) => (
              <div key={m.id} style={{ position: 'relative' }}>
                <img src={m.thumbUrl || m.url} alt={m.caption || m.originalName}
                  style={{ height: 64, borderRadius: 8, border: '1px solid rgba(60,130,90,0.3)', display: 'block' }} />
                <button type="button" title="Supprimer cette image" onClick={() => removeExistingMedia(m.id)}
                  style={{
                    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%',
                    background: CRIMSON, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: '20px', padding: 0,
                  }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </Field>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onCancel} disabled={saving} style={{
          padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          background: 'transparent', color: MUTED, border: '1px solid rgba(120,110,140,0.4)',
        }}>Annuler</button>
        <button type="submit" disabled={saving || !title.trim()} style={{
          padding: '9px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
          background: ACC, color: '#08130b', border: 'none', opacity: saving || !title.trim() ? 0.5 : 1,
        }}>{saving ? 'Enregistrement…' : (entry ? 'Mettre à jour' : 'Créer l\'entrée')}</button>
      </div>
    </form>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const input = {
  width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
  fontFamily: "'Inter',sans-serif", fontSize: 13.5,
  background: 'rgba(9,16,14,0.7)', border: '1px solid rgba(60,130,90,0.3)', color: INK, outline: 'none',
};

function humanize(ex) {
  const map = {
    missing_title: 'Le titre est obligatoire.',
    invalid_coords: 'Coordonnées invalides — X et Z vont ensemble.',
    invalid_entry_type: 'Type d\'entrée inconnu.',
    file_too_large: 'Fichier trop lourd (10 Mo max).',
    not_an_image: 'Ce fichier n\'est pas une image lisible.',
    mime_not_allowed: 'Format non accepté (PNG, JPEG ou WebP).',
    extension_not_allowed: 'Format non accepté (PNG, JPEG ou WebP).',
    rate_limited: 'Trop de requêtes — attends une minute.',
  };
  return map[ex.message] || ex.message;
}
