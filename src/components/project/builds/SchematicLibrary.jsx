import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '../../admin/ui';
import { muted } from '../shared';
import { useToast } from '../../../ui/ToastProvider';

// Bibliothèque de schematics (presse-papier persistés, scope workspace) + import/
// export Sponge `.schem` / Litematica `.litematic`. `we` = client worldedit du
// build (api.ws(slug).blueprints.worldedit(id) ou api.worldeditShared(token)).
// `clipboard` = { sx, sy, sz } courant (pour le bouton « Sauver »).
export function SchematicLibrary({ we, clipboard, onLoaded }) {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const fileRef = useRef(null);

  const refresh = () => we.schematics().then(setList).catch(() => setList([]));
  useEffect(() => { if (open && list === null) refresh(); /* eslint-disable-next-line */ }, [open]);

  const save = async () => {
    if (!clipboard) { toast?.error?.('Copie d’abord une sélection (presse-papier vide)'); return; }
    setBusy(true);
    try {
      await we.saveSchematic({ name: name || 'schematic' });
      toast?.success?.('Schematic sauvegardée');
      setName(''); refresh();
    } catch (e) {
      toast?.error?.(e?.body?.error === 'library_full' ? 'Bibliothèque pleine' : 'Sauvegarde impossible');
    } finally { setBusy(false); }
  };

  const load = async (sid) => {
    setBusy(true);
    try {
      const r = await we.loadSchematic(sid);
      toast?.success?.(`Chargée dans le presse-papier (${r.clipboard.sx}×${r.clipboard.sy}×${r.clipboard.sz}) — utilise « paste »`);
      onLoaded?.(r.clipboard);
    } catch { toast?.error?.('Chargement impossible'); } finally { setBusy(false); }
  };

  const remove = async (sid) => {
    setBusy(true);
    try { await we.deleteSchematic(sid); refresh(); } catch { toast?.error?.('Suppression impossible'); } finally { setBusy(false); }
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const r = await we.importSchematic(file, { save: 'true', name: file.name.replace(/\.[^.]+$/, '') });
      toast?.success?.(`Importée (${r.clipboard.sx}×${r.clipboard.sy}×${r.clipboard.sz}) → presse-papier + bibliothèque`);
      onLoaded?.(r.clipboard); refresh();
    } catch (err) {
      toast?.error?.(['bad_schematic', 'bad_litematic'].includes(err?.body?.error) ? 'Fichier illisible' : 'Import impossible');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(80,50,130,0.18)', paddingTop: 10 }}>
      <button type="button" onClick={() => setOpen((v) => !v)} style={headBtn}>
        {open ? '▾' : '▸'} 📚 Bibliothèque de schematics {list?.length ? `(${list.length})` : ''}
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de la schematic" style={{ flex: 1, minWidth: 140 }} />
            <Button variant="ghost" onClick={save} disabled={busy} title="Sauver le presse-papier actuel (copie/coupe une sélection avant)"
              style={{ padding: '6px 12px', fontSize: 12 }}>💾 Sauver le presse-papier</Button>
            <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy} style={{ padding: '6px 12px', fontSize: 12 }}>⬆ Importer .schem/.litematic</Button>
            <input ref={fileRef} type="file" accept=".schem,.schematic,.litematic" onChange={onImport} style={{ display: 'none' }} />
          </div>
          {!clipboard && <div style={{ ...muted, fontSize: 11 }}>Presse-papier vide — utilise l’opération « copy » sur une sélection pour pouvoir sauvegarder.</div>}
          {list === null && <div style={{ ...muted, fontSize: 12 }}>Chargement…</div>}
          {list && list.length === 0 && <div style={{ ...muted, fontSize: 12 }}>Aucune schematic. Sauve un presse-papier ou importe un fichier.</div>}
          {list && list.map((s) => (
            <div key={s.id} style={row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                <div style={{ ...muted, fontSize: 11 }}>{s.sx}×{s.sy}×{s.sz} · {s.blockCount.toLocaleString('fr')} blocs</div>
              </div>
              <Button variant="ghost" onClick={() => load(s.id)} disabled={busy} style={miniBtn} title="Charge dans le presse-papier (puis « paste »)">📋 Charger</Button>
              <a href={we.schematicExportUrl(s.id, 'schem')} style={dlLink} title="Télécharger au format Sponge .schem">.schem</a>
              <a href={we.schematicExportUrl(s.id, 'litematic')} style={dlLink} title="Télécharger au format Litematica">.litematic</a>
              <button type="button" onClick={() => remove(s.id)} disabled={busy} style={delBtn} title="Supprimer">🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const headBtn = {
  background: 'transparent', border: 'none', color: '#c9a8e8', cursor: 'pointer',
  fontSize: 13, fontFamily: "'Space Grotesk',sans-serif", padding: 0,
};
const row = {
  display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
  padding: '6px 8px', borderRadius: 8, background: 'rgba(14,9,28,0.5)', border: '1px solid rgba(80,50,130,0.2)',
};
const miniBtn = { padding: '4px 10px', fontSize: 12 };
const dlLink = {
  padding: '4px 8px', borderRadius: 6, fontSize: 11, textDecoration: 'none',
  color: 'rgba(232,228,248,0.75)', border: '1px solid rgba(80,50,130,0.32)', whiteSpace: 'nowrap',
};
const delBtn = {
  padding: '4px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
  background: 'transparent', border: '1px solid rgba(120,40,40,0.4)', color: '#fb923c',
};
