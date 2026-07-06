import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { ACC, ACC_RGB, Button, Field, Input, box, label as labelStyle } from '../ui';

// Page « Cockpit » : chaque utilisateur pilote ce que SON flux cockpit MF
// envoie à l'app Python locale — URL secrète + rappels, items perso (section
// `wanted` du flux), quêtes suivies (filtre available/deadlines), et un aperçu
// du JSON réellement servi. Réglages strictement personnels (pas de groupe).

const PRIORITIES = [
  { id: 1, label: 'Haute',   emoji: '🔥', color: '#f87171' },
  { id: 2, label: 'Moyenne', emoji: '⚡', color: '#fbbf24' },
  { id: 3, label: 'Basse',   emoji: '🌙', color: '#60a5fa' },
];
const priorityMeta = (p) => PRIORITIES.find((x) => x.id === p) ?? PRIORITIES[1];

const OCC_LABELS = {
  journaliere: '📅 Journalières',
  hebdomadaire: '🗓️ Hebdomadaires',
  mensuelle: '🌙 Mensuelles',
  simple: '⭐ Simples',
};

const muted = { color: 'rgba(180,170,200,0.6)', fontFamily: "'Inter',sans-serif" };

export function CockpitEditor() {
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <FeedSection />
      <ItemsSection />
      <FollowsSection />
      <PreviewSection />
    </div>
  );
}

function SectionBox({ title, subtitle, actions, children }) {
  return (
    <section style={{ ...box, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{
            margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 16,
            fontWeight: 700, color: '#ede8f8',
          }}>{title}</h3>
          {subtitle && <p style={{ ...muted, fontSize: 12.5, margin: '4px 0 0', lineHeight: 1.5 }}>{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// ── 1. URL du flux + rappels ──────────────────────────────────────────────────

function FeedSection() {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.cockpitInfo().then(setInfo).catch((e) => setErr(e.message));
  }, []);

  const rotate = async () => {
    setBusy(true); setErr(null);
    try { setInfo(await api.rotateCockpit()); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const toggleReminders = async (enabled) => {
    setBusy(true); setErr(null);
    try {
      const out = await api.setQuestReminders(enabled);
      setInfo((p) => ({ ...p, wantsReminders: out.wantsReminders }));
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const copy = () => {
    if (!info?.feedUrl) return;
    navigator.clipboard?.writeText(info.feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <SectionBox
      title="🛰️ Flux cockpit"
      subtitle="Ton app cockpit (sur ton PC) interroge cette URL secrète. Ne la partage pas — en cas de fuite, régénère le jeton."
    >
      {err && <p style={{ color: '#ff8a9b', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>{err}</p>}
      {!info ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input
              readOnly
              value={info.feedUrl}
              onFocus={(e) => e.target.select()}
              style={{
                flex: '1 1 280px', background: 'rgba(14,8,32,0.72)', border: `1px solid rgba(${ACC_RGB},0.3)`,
                borderRadius: 8, padding: '9px 11px', color: '#ede8f8',
                fontFamily: "'JetBrains Mono',monospace", fontSize: 12, outline: 'none',
              }}
            />
            <Button type="button" onClick={copy}>{copied ? 'Copié ✓' : 'Copier'}</Button>
            <Button type="button" variant="ghost" onClick={rotate} disabled={busy}>Régénérer</Button>
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            cursor: busy ? 'wait' : 'pointer', fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: '#ede8f8',
          }}>
            <input
              type="checkbox"
              checked={!!info.wantsReminders}
              disabled={busy}
              onChange={(e) => toggleReminders(e.target.checked)}
              style={{ accentColor: ACC, width: 16, height: 16 }}
            />
            <span>Recevoir les <strong>rappels</strong> dans le cockpit
              <span style={{ ...muted, fontSize: 11.5, marginLeft: 6 }}>
                (décoché : le flux ne renvoie que les gains — quêtes et items perso sont vidés)
              </span>
            </span>
          </label>
        </>
      )}
    </SectionBox>
  );
}

// ── 2. Items perso (section `wanted` du flux) ─────────────────────────────────

function ItemsSection() {
  const [items, setItems] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // Champs du formulaire
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [priority, setPriority] = useState(2);
  const [note, setNote] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [cx, setCx] = useState(''); const [cy, setCy] = useState(''); const [cz, setCz] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.cockpit.items.list(), api.workspaces.list().catch(() => [])])
      .then(([its, ws]) => { setItems(its); setWorkspaces(ws); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const openAdd = () => {
    setEditing(null); setName(''); setQuantity(1); setPriority(2); setNote('');
    setWorkspaceId(''); setCx(''); setCy(''); setCz(''); setFormOpen(true);
  };
  const openEdit = (it) => {
    setEditing(it); setName(it.name); setQuantity(it.quantity); setPriority(it.priority);
    setNote(it.note); setWorkspaceId(it.workspaceId ?? '');
    setCx(it.x ?? ''); setCy(it.y ?? ''); setCz(it.z ?? ''); setFormOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setErr(null);
    try {
      const payload = {
        name: name.trim(),
        quantity: Math.max(1, Number(quantity) || 1),
        priority,
        note: note.trim(),
        workspaceId: workspaceId === '' ? null : Number(workspaceId),
        x: cx === '' ? null : Number(cx),
        y: cy === '' ? null : Number(cy),
        z: cz === '' ? null : Number(cz),
      };
      const saved = editing
        ? await api.cockpit.items.update(editing.id, payload)
        : await api.cockpit.items.create(payload);
      setItems((prev) => (editing ? prev.map((i) => (i.id === saved.id ? saved : i)) : [...prev, saved]));
      setFormOpen(false); setEditing(null);
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const toggleDone = async (it) => {
    try {
      const updated = await api.cockpit.items.toggleDone(it.id);
      setItems((prev) => prev.map((i) => (i.id === it.id ? updated : i)));
    } catch (ex) { setErr(ex.message); }
  };

  const remove = async (it) => {
    try {
      await api.cockpit.items.remove(it.id);
      setItems((prev) => prev.filter((i) => i.id !== it.id));
    } catch (ex) { setErr(ex.message); }
  };

  const sorted = useMemo(() => [...items].sort((a, b) => (
    (a.done - b.done) || (a.priority - b.priority) || (a.position - b.position) || (a.id - b.id)
  )), [items]);
  const remaining = items.filter((i) => !i.done).length;

  return (
    <SectionBox
      title="🎯 Mes items wanted"
      subtitle={`Ta liste perso envoyée dans la section « wanted » du flux (les items cochés ne partent pas). ${remaining} à récupérer.`}
      actions={<Button type="button" onClick={openAdd}>＋ Item</Button>}
    >
      {err && <p style={{ color: '#ff8a9b', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>{err}</p>}

      {formOpen && (
        <form onSubmit={submit} style={{
          padding: 12, borderRadius: 10, marginBottom: 12,
          background: 'rgba(20,10,42,0.55)', border: `1px dashed rgba(${ACC_RGB},0.4)`,
        }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 200px' }}>
              <Field label="Item">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diamant, Perle de l'Ender…" autoFocus required />
              </Field>
            </div>
            <div style={{ flex: '0 1 110px' }}>
              <Field label="Quantité">
                <Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </Field>
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <Field label="Projet lié (optionnel)">
                <select
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value === '' ? '' : Number(e.target.value))}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: 'rgba(14,9,28,0.6)',
                    border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8, padding: '9px 12px',
                    color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 14, outline: 'none',
                  }}
                >
                  <option value="">— Aucun —</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
          <Field label="Priorité">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PRIORITIES.map((p) => {
                const active = priority === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => setPriority(p.id)}
                    style={{
                      padding: '6px 12px', borderRadius: 16,
                      background: active ? `${p.color}22` : 'rgba(20,12,40,0.6)',
                      border: `1px solid ${active ? p.color : 'rgba(80,50,130,0.3)'}`,
                      color: active ? p.color : 'rgba(180,170,200,0.7)',
                      fontFamily: "'Inter',sans-serif", fontSize: 13,
                      fontWeight: active ? 600 : 400, cursor: 'pointer',
                    }}
                  >
                    {p.emoji} {p.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '2 1 220px' }}>
              <Field label="Note (optionnel)">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="pour la beacon, ferme du nord…" />
              </Field>
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <Field label="Coordonnées X / Y / Z (optionnel)">
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input type="number" value={cx} onChange={(e) => setCx(e.target.value)} placeholder="X" />
                  <Input type="number" value={cy} onChange={(e) => setCy(e.target.value)} placeholder="Y" />
                  <Input type="number" value={cz} onChange={(e) => setCz(e.target.value)} placeholder="Z" />
                </div>
              </Field>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? '…' : (editing ? 'Enregistrer' : 'Ajouter')}
            </Button>
            <Button type="button" variant="ghost" disabled={saving}
              onClick={() => { setFormOpen(false); setEditing(null); }}>
              Annuler
            </Button>
          </div>
        </form>
      )}

      {!loaded ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : sorted.length === 0 ? (
        !formOpen && <p style={{ ...muted, fontSize: 13 }}>Aucun item. Clique « ＋ Item » pour en ajouter un.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map((it) => {
            const p = priorityMeta(it.priority);
            return (
              <div key={it.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '9px 12px', borderRadius: 10,
                background: it.done ? 'rgba(14,9,28,0.35)' : 'rgba(20,10,42,0.6)',
                border: `1px solid ${it.done ? 'rgba(80,50,130,0.18)' : `${p.color}44`}`,
                borderLeft: `3px solid ${it.done ? 'rgba(80,50,130,0.3)' : p.color}`,
                opacity: it.done ? 0.55 : 1,
              }}>
                <button type="button" onClick={() => toggleDone(it)}
                  title={it.done ? 'Décocher' : 'Cocher : récupéré'}
                  style={{
                    width: 22, height: 22, flexShrink: 0, borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: it.done ? 'rgba(74,222,128,0.18)' : 'rgba(14,9,28,0.6)',
                    border: `1px solid ${it.done ? '#4ade80' : 'rgba(120,80,180,0.45)'}`,
                    color: '#4ade80', fontSize: 13, lineHeight: 1, padding: 0,
                  }}
                >
                  {it.done ? '✓' : ''}
                </button>
                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                  <span style={{
                    fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700,
                    color: it.done ? 'rgba(180,170,200,0.6)' : '#ede8f8',
                    textDecoration: it.done ? 'line-through' : 'none',
                  }}>
                    {it.name} <span style={{ color: ACC }}>×{it.quantity}</span>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '1px 7px', borderRadius: 10, fontSize: 10,
                      background: `${p.color}1a`, border: `1px solid ${p.color}55`,
                      color: p.color, fontFamily: "'Inter',sans-serif",
                    }}>{p.emoji} {p.label}</span>
                    {it.workspaceName && (
                      <span style={{
                        padding: '1px 7px', borderRadius: 10, fontSize: 10,
                        background: 'rgba(120,80,180,0.18)', border: '1px solid rgba(120,80,180,0.35)',
                        color: 'rgba(200,180,240,0.85)', fontFamily: "'Inter',sans-serif",
                      }}>📁 {it.workspaceName}</span>
                    )}
                    {(it.x != null || it.y != null || it.z != null) && (
                      <span style={{ ...muted, fontSize: 10.5, fontFamily: 'monospace' }}>
                        ⛏ {it.x ?? '?'} {it.y ?? '?'} {it.z ?? '?'}
                      </span>
                    )}
                    {it.note && <span style={{ ...muted, fontSize: 11, fontStyle: 'italic' }}>💬 {it.note}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  <button type="button" onClick={() => openEdit(it)} title="Modifier"
                    style={{
                      background: 'rgba(80,50,130,0.16)', border: '1px solid rgba(80,50,130,0.3)',
                      color: '#ede8f8', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontSize: 13,
                    }}
                  >✏️</button>
                  <button type="button" onClick={() => remove(it)} title="Supprimer"
                    style={{
                      background: 'rgba(200,50,50,0.1)', border: '1px solid rgba(200,50,50,0.25)',
                      color: '#f87171', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontSize: 13,
                    }}
                  >🗑️</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionBox>
  );
}

// ── 3. Quêtes suivies ─────────────────────────────────────────────────────────

function FollowsSection() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api.cockpit.quests().then(setData).catch((e) => setErr(e.message));
  }, []);

  const toggle = async (q) => {
    setBusyId(q.id);
    try {
      const out = await api.cockpit.setFollow(q.id, !q.followed);
      setData((prev) => ({
        followedCount: out.followedCount,
        quests: prev.quests.map((x) => (x.id === q.id ? { ...x, followed: out.followed } : x)),
      }));
    } catch (ex) { setErr(ex.message); }
    finally { setBusyId(null); }
  };

  const grouped = useMemo(() => {
    const g = new Map();
    for (const q of data?.quests || []) {
      if (!g.has(q.occurrenceType)) g.set(q.occurrenceType, []);
      g.get(q.occurrenceType).push(q);
    }
    return g;
  }, [data]);

  const allSent = (data?.followedCount || 0) === 0;

  return (
    <SectionBox
      title="📡 Quêtes envoyées au cockpit"
      subtitle="Suis une ou plusieurs quêtes pour filtrer le flux. Tant que rien n'est suivi, toutes les quêtes sont envoyées."
    >
      {err && <p style={{ color: '#ff8a9b', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>{err}</p>}
      {!data ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : (
        <>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 14,
            padding: '6px 12px', borderRadius: 10, fontSize: 12.5, fontFamily: "'Inter',sans-serif",
            background: allSent ? 'rgba(74,222,128,0.1)' : `rgba(${ACC_RGB},0.1)`,
            border: `1px solid ${allSent ? 'rgba(74,222,128,0.4)' : `rgba(${ACC_RGB},0.35)`}`,
            color: allSent ? '#4ade80' : ACC,
          }}>
            {allSent
              ? '✅ Mode par défaut : tout est envoyé au cockpit'
              : `🎯 Mode filtré : seules ${data.followedCount} quête${data.followedCount > 1 ? 's' : ''} suivie${data.followedCount > 1 ? 's' : ''} ${data.followedCount > 1 ? 'sont envoyées' : 'est envoyée'}`}
          </div>
          {data.quests.length === 0 ? (
            <p style={{ ...muted, fontSize: 13 }}>Aucune quête définie pour l'instant.</p>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {[...grouped.entries()].map(([occ, quests]) => (
                <div key={occ}>
                  <div style={{ ...labelStyle, marginBottom: 6 }}>{OCC_LABELS[occ] || occ}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {quests.map((q) => (
                      <label key={q.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 11px',
                        borderRadius: 8, cursor: busyId === q.id ? 'wait' : 'pointer',
                        background: q.followed ? `rgba(${ACC_RGB},0.1)` : 'rgba(20,10,42,0.45)',
                        border: `1px solid ${q.followed ? `rgba(${ACC_RGB},0.4)` : 'rgba(80,50,130,0.22)'}`,
                      }}>
                        <input
                          type="checkbox"
                          checked={q.followed}
                          disabled={busyId === q.id}
                          onChange={() => toggle(q)}
                          style={{ accentColor: ACC, width: 15, height: 15, flexShrink: 0 }}
                        />
                        <span style={{
                          flex: 1, minWidth: 0, fontFamily: "'Inter',sans-serif", fontSize: 13.5,
                          color: '#ede8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{q.titre}</span>
                        {q.factionNom && (
                          <span style={{
                            padding: '1px 8px', borderRadius: 10, fontSize: 10.5, flexShrink: 0,
                            background: `${q.factionCouleur || '#c9a8e8'}1a`,
                            border: `1px solid ${q.factionCouleur || '#c9a8e8'}55`,
                            color: q.factionCouleur || '#c9a8e8', fontFamily: "'Inter',sans-serif",
                          }}>{q.factionNom}</span>
                        )}
                        <span title="Envoyer au cockpit" style={{
                          fontSize: 11, flexShrink: 0,
                          color: q.followed ? ACC : 'rgba(180,170,200,0.4)',
                          fontFamily: "'Inter',sans-serif",
                        }}>🛰️</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </SectionBox>
  );
}

// ── 4. Aperçu du flux ─────────────────────────────────────────────────────────

function PreviewSection() {
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true); setErr(null);
    try {
      const info = await api.cockpitInfo();
      const res = await fetch(info.feedUrl, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPreview(await res.json());
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <SectionBox
      title="👁️ Aperçu du flux"
      subtitle="Le JSON exactement tel que ton cockpit va le recevoir (avec ton jeton)."
      actions={<Button type="button" variant="ghost" onClick={refresh} disabled={busy}>{busy ? '…' : 'Rafraîchir'}</Button>}
    >
      {err && <p style={{ color: '#ff8a9b', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>{err}</p>}
      {preview ? (
        <pre style={{
          margin: 0, padding: 14, borderRadius: 10, maxHeight: 420, overflow: 'auto',
          background: 'rgba(8,5,20,0.85)', border: '1px solid rgba(80,50,130,0.3)',
          color: '#b9e8c9', fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, lineHeight: 1.5,
        }}>{JSON.stringify(preview, null, 2)}</pre>
      ) : (
        <p style={{ ...muted, fontSize: 13 }}>Clique « Rafraîchir » pour interroger le flux avec ton jeton.</p>
      )}
    </SectionBox>
  );
}
