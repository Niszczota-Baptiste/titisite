import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { formatCoords } from './coords';
import { LoreMarkdown } from './markdown';
import { ACC, ACC_RGB, INK, MUTED, hexToRgb, panel } from './theme';

// Onglet 👥 Peuples : les peuples du monde, et sous chacun ses PNJ — qui sont
// des ENTRÉES de type `pnj` (pas une table parallèle : un PNJ reste une pièce
// du dossier, avec ses coordonnées, ses images et ses preuves). Chaque PNJ
// porte ses dialogues relevés en jeu, autant qu'il en faut, chacun avec un
// nom de quête optionnel en étiquette.

const PEUPLE_COLORS = ['#7be3a8', '#e8c86a', '#7bd3e8', '#e0526f', '#b79bff', '#e0913a'];

export function PeuplesTab({ user, onOpenEntry, refreshKey = 0 }) {
  const [peuples, setPeuples] = useState(null);
  const [pnjs, setPnjs] = useState([]);
  const [open, setOpen] = useState(null);     // id du peuple déplié
  const [editing, setEditing] = useState(null); // null | {} (nouveau) | peuple
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    const [ps, entries] = await Promise.all([
      api.lore.peuples.list(),
      api.lore.entries.list({ type: 'pnj' }),
    ]);
    setPeuples(ps);
    setPnjs(entries);
  }, []);

  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load, refreshKey]);

  if (peuples === null) {
    return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{err || 'Chargement…'}</p>;
  }

  const orphans = pnjs.filter((p) => !p.peupleId);

  const removePeuple = async (p) => {
    // eslint-disable-next-line no-alert -- suppression partagée, confirmation volontaire
    if (!window.confirm(`Supprimer le peuple « ${p.name} » ? Ses PNJ sont conservés, simplement détachés.`)) return;
    try { await api.lore.peuples.remove(p.id); await load(); } catch (ex) { setErr(ex.message); }
  };

  return (
    <div style={{ fontFamily: "'Inter',sans-serif" }}>
      {err && (
        <div style={{ background: 'rgba(255,100,120,0.1)', border: '1px solid rgba(255,100,120,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#ff8a9b', fontSize: 13 }}>
          {err} <button type="button" onClick={() => setErr(null)} style={{ float: 'right', background: 'none', border: 'none', color: '#ff8a9b', cursor: 'pointer' }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <button type="button" onClick={() => setEditing({})} style={{
          padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
          background: ACC, color: '#08130b', border: 'none',
        }}>+ Nouveau peuple</button>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, color: MUTED }}>
          {peuples.length} peuple{peuples.length > 1 ? 's' : ''} · {pnjs.length} PNJ
        </span>
      </div>

      {editing && (
        <PeupleEditor
          peuple={editing.id ? editing : null}
          onSaved={async () => { setEditing(null); await load(); }}
          onCancel={() => setEditing(null)}
          setErr={setErr}
        />
      )}

      {peuples.length === 0 && !editing && (
        <p style={{ color: MUTED, fontSize: 13.5 }}>
          Aucun peuple pour l'instant. Crées-en un, puis rattache-lui des PNJ depuis leur fiche
          (type « PNJ » dans l'éditeur d'entrée).
        </p>
      )}

      {peuples.map((p) => {
        const members = pnjs.filter((n) => n.peupleId === p.id);
        const isOpen = open === p.id;
        return (
          <div key={p.id} style={{
            ...panel, borderColor: `rgba(${hexToRgb(p.color)},0.35)`, marginBottom: 10, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: p.color, flexShrink: 0 }} />
              <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} style={{
                background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', flex: 1,
                fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15, color: INK,
              }}>
                {isOpen ? '▾' : '▸'} {p.name}
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 400, fontSize: 11.5, color: MUTED, marginLeft: 8 }}>
                  {members.length} PNJ
                </span>
              </button>
              <button type="button" onClick={() => setEditing(p)} title="Modifier"
                style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12.5 }}>✎</button>
              <button type="button" onClick={() => removePeuple(p)} title="Supprimer"
                style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 12 }}>✕</button>
            </div>
            {isOpen && (
              <div style={{ padding: '0 14px 12px' }}>
                {p.descriptionMd && (
                  <LoreMarkdown content={p.descriptionMd} entries={pnjs} onOpenEntry={onOpenEntry} style={{ marginBottom: 8 }} />
                )}
                {members.length === 0 && (
                  <p style={{ color: MUTED, fontSize: 12.5, margin: '4px 0' }}>
                    Aucun PNJ rattaché. Ouvre l'entrée d'un PNJ et choisis ce peuple dans son éditeur.
                  </p>
                )}
                {members.map((n) => (
                  <PnjCard key={n.id} pnj={n} color={p.color} user={user} onOpenEntry={onOpenEntry} onChanged={load} setErr={setErr} />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {orphans.length > 0 && (
        <div style={{ ...panel, borderColor: 'rgba(138,128,160,0.3)', marginTop: 14, padding: '11px 14px' }}>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, color: MUTED, marginBottom: 6 }}>
            PNJ sans peuple ({orphans.length})
          </div>
          {orphans.map((n) => (
            <PnjCard key={n.id} pnj={n} color="#8a80a0" user={user} onOpenEntry={onOpenEntry} onChanged={load} setErr={setErr} />
          ))}
        </div>
      )}
    </div>
  );
}

// Un PNJ + ses dialogues. Les dialogues sont chargés à l'ouverture (la liste
// des entrées ne les porte pas — c'est la fiche complète qui les a).
function PnjCard({ pnj, color, onOpenEntry, onChanged, setErr }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [texte, setTexte] = useState('');
  const [questName, setQuestName] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const d = await api.lore.entries.get(pnj.id);
    setDetail(d);
  }, [pnj.id]);

  useEffect(() => { if (open && !detail) reload().catch((e) => setErr(e.message)); }, [open, detail, reload, setErr]);

  const add = async (e) => {
    e.preventDefault();
    if (!texte.trim() || busy) return;
    setBusy(true);
    try {
      await api.lore.dialogues.add(pnj.id, { texte: texte.trim(), questName: questName.trim() });
      setTexte(''); setQuestName('');
      await reload();
      onChanged?.();
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  const remove = async (id) => {
    try { await api.lore.dialogues.remove(id); await reload(); onChanged?.(); }
    catch (ex) { setErr(ex.message); }
  };

  const hasCoords = pnj.x !== null && pnj.z !== null;
  const dialogues = detail?.dialogues || [];

  return (
    <div style={{
      border: `1px solid rgba(${hexToRgb(color)},0.22)`, borderRadius: 9,
      padding: '8px 11px', marginBottom: 7, background: 'rgba(9,16,14,0.45)',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setOpen((o) => !o)} style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
          fontSize: 13.5, fontWeight: 700, color: INK,
        }}>{open ? '▾' : '▸'} 🧑‍🌾 {pnj.title}</button>
        {hasCoords && (
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: MUTED }}>{formatCoords(pnj)}</span>
        )}
        <button type="button" onClick={() => onOpenEntry(pnj.id)} style={{
          marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          fontSize: 11.5, color: ACC, borderBottom: `1px solid ${ACC}44`,
        }}>fiche complète →</button>
      </div>

      {open && (
        <div style={{ marginTop: 7 }}>
          {detail === null && <p style={{ color: MUTED, fontSize: 12 }}>Chargement…</p>}
          {dialogues.length === 0 && detail !== null && (
            <p style={{ color: MUTED, fontSize: 12, margin: '2px 0 6px' }}>Aucun dialogue relevé.</p>
          )}
          {dialogues.map((d) => (
            <div key={d.id} style={{
              borderLeft: `3px solid rgba(${hexToRgb(color)},0.5)`, paddingLeft: 10, margin: '0 0 7px',
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {d.questName && (
                  <span style={{
                    padding: '1px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700,
                    color: '#e8c86a', background: 'rgba(232,200,106,0.12)', border: '1px solid rgba(232,200,106,0.45)',
                  }}>📜 {d.questName}</span>
                )}
                <button type="button" onClick={() => remove(d.id)} title="Supprimer ce dialogue"
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 11 }}>✕</button>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(214,206,230,0.92)', whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
                « {d.texte} »
              </div>
            </div>
          ))}

          <form onSubmit={add} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <input
              value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Réplique relevée en jeu…"
              style={{ ...inp, flex: '2 1 220px' }}
            />
            <input
              value={questName} onChange={(e) => setQuestName(e.target.value)} placeholder="quête (optionnel)"
              style={{ ...inp, flex: '1 1 130px' }}
            />
            <button type="submit" disabled={busy || !texte.trim()} style={{
              padding: '7px 13px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              background: `rgba(${ACC_RGB},0.15)`, color: ACC, border: `1px solid rgba(${ACC_RGB},0.5)`,
              opacity: busy || !texte.trim() ? 0.5 : 1,
            }}>+ Dialogue</button>
          </form>
        </div>
      )}
    </div>
  );
}

function PeupleEditor({ peuple, onSaved, onCancel, setErr }) {
  const [name, setName] = useState(peuple?.name || '');
  const [color, setColor] = useState(peuple?.color || PEUPLE_COLORS[0]);
  const [descriptionMd, setDescriptionMd] = useState(peuple?.descriptionMd || '');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), color, descriptionMd };
      if (peuple) await api.lore.peuples.update(peuple.id, body);
      else await api.lore.peuples.create(body);
      await onSaved();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={{ ...panel, padding: '13px 15px', marginBottom: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du peuple" required maxLength={120}
          style={{ ...inp, flex: '1 1 200px' }} />
        {PEUPLE_COLORS.map((c) => (
          <button key={c} type="button" onClick={() => setColor(c)} title={c} style={{
            width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer', padding: 0,
            border: color === c ? '2px solid #fff' : '2px solid transparent',
          }} />
        ))}
      </div>
      <textarea
        value={descriptionMd} onChange={(e) => setDescriptionMd(e.target.value)} rows={3}
        placeholder="Ce qu'on sait d'eux (markdown, [[Titre d'entrée]] pour citer une entrée)…"
        style={{ ...inp, width: '100%', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={{
          padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
          background: 'transparent', color: MUTED, border: '1px solid rgba(120,110,140,0.4)',
        }}>Annuler</button>
        <button type="submit" disabled={busy || !name.trim()} style={{
          padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
          background: ACC, color: '#08130b', border: 'none', opacity: busy || !name.trim() ? 0.5 : 1,
        }}>{peuple ? 'Mettre à jour' : 'Créer le peuple'}</button>
      </div>
    </form>
  );
}

const inp = {
  padding: '7px 10px', borderRadius: 7, fontFamily: "'Inter',sans-serif", fontSize: 12.5,
  background: 'rgba(9,16,14,0.7)', border: `1px solid rgba(${ACC_RGB},0.25)`, color: INK, outline: 'none',
};
