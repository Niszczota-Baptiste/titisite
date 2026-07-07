import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import {
  buildIconIndex, buildIdIndex, customCatalogEntries, loadMinefieldCatalog,
} from '../../data/minefieldCatalog';
import { BlockPicker, ItemIcon, WORLDS } from './Minecraft';
import { TagsInput } from './TagsInput';
import { Button, Empty, ErrorBanner, Modal, Section, Tag, card, muted } from './shared';

// Métiers vanilla, pour l'autocomplete et l'emoji des cartes (champ libre :
// un métier Minefield inconnu retombe sur 🧑).
export const PROFESSIONS = [
  { id: 'Bibliothécaire',    emoji: '📚' },
  { id: 'Prêtre',            emoji: '✨' },
  { id: 'Forgeron d\'armes', emoji: '⚔️' },
  { id: 'Forgeron d\'outils', emoji: '⛏️' },
  { id: 'Armurier',          emoji: '🛡️' },
  { id: 'Fermier',           emoji: '🌾' },
  { id: 'Boucher',           emoji: '🥩' },
  { id: 'Cartographe',       emoji: '🗺️' },
  { id: 'Pêcheur',           emoji: '🎣' },
  { id: 'Berger',            emoji: '🐑' },
  { id: 'Flécheur',          emoji: '🏹' },
  { id: 'Travailleur du cuir', emoji: '👜' },
  { id: 'Tailleur de pierre', emoji: '🪨' },
  { id: 'Sans emploi',       emoji: '🧍' },
];

export function professionEmoji(profession) {
  const p = (profession || '').toLowerCase();
  const hit = PROFESSIONS.find((x) => p.includes(x.id.toLowerCase().slice(0, 6)));
  return hit?.emoji || (p ? '🧑' : '🧑');
}

const worldEmoji = (w) => WORLDS.find((x) => x.id === w)?.emoji ?? '🗺️';
const fmtCoords = (v) => (v.x == null && v.z == null ? null : `${v.x ?? '?'} ${v.y ?? '?'} ${v.z ?? '?'}`);

// « 🧑‍🌾 Villageois » : le trading hall du projet — qui vend quoi, où, à quel
// prix, et qui de nous deux a le prix réduit (réduction par joueur en jeu).
export function VillagersTab() {
  const { workspace } = useWorkspace();
  const ws = api.ws(workspace.slug);
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();

  const [villagers, setVillagers] = useState([]);
  const [members, setMembers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState(''); // '' = tous

  const iconIndex = useMemo(() => buildIconIndex(catalog), [catalog]);
  const idIndex = useMemo(() => buildIdIndex(catalog), [catalog]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    ws.minecraft.villagers.list()
      .then((l) => { if (alive) setVillagers(l); })
      .catch((e) => { if (alive) setErr(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    /* eslint-disable-next-line */
  }, [workspace.slug]);

  useEffect(() => {
    let alive = true;
    Promise.all([loadMinefieldCatalog(), api.quests.customItems().catch(() => [])])
      .then(([c, custom]) => { if (alive) setCatalog([...customCatalogEntries(custom, c), ...c]); });
    api.users()
      .then((us) => {
        if (!alive) return;
        const ids = new Set(workspace?.memberIds || []);
        setMembers(us.filter((u) => u.role === 'admin' || ids.has(u.id)));
      })
      .catch(() => {});
    return () => { alive = false; };
    /* eslint-disable-next-line */
  }, [workspace?.id]);

  // Tags en usage (dédupliqués, insensible à la casse) pour la rangée de filtres.
  const allTags = useMemo(() => {
    const seen = new Map();
    for (const v of villagers) {
      for (const t of v.tags || []) {
        const k = t.toLowerCase();
        if (!seen.has(k)) seen.set(k, t);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [villagers]);

  const displayed = useMemo(() => {
    let list = villagers;
    if (tagFilter) {
      list = list.filter((v) => (v.tags || []).some((t) => t.toLowerCase() === tagFilter.toLowerCase()));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((v) => (
        v.name.toLowerCase().includes(q)
        || (v.profession || '').toLowerCase().includes(q)
        || (v.tags || []).some((t) => t.toLowerCase().includes(q))
        || v.trades.some((t) => t.itemName.toLowerCase().includes(q))
      ));
    }
    return list;
  }, [villagers, search, tagFilter]);

  const replaceVillager = (saved) => setVillagers((prev) => (
    prev.some((v) => v.id === saved.id)
      ? prev.map((v) => (v.id === saved.id ? { ...saved, trades: saved.trades ?? v.trades } : v))
      : [...prev, saved]
  ));

  const removeVillager = async (v) => {
    const ok = await confirm({
      title: `Supprimer « ${v.name} »`,
      message: 'Le villageois et ses trades seront supprimés.',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    try {
      await ws.minecraft.villagers.remove(v.id);
      setVillagers((prev) => prev.filter((x) => x.id !== v.id));
      toast.success('Villageois supprimé');
    } catch (e) { toast.error(`Échec : ${e.message}`); }
  };

  const setTrades = (villagerId, fn) => setVillagers((prev) => prev.map((v) => (
    v.id === villagerId ? { ...v, trades: fn(v.trades) } : v
  )));

  return (
    <Section
      title="🧑‍🌾 Villageois & trades"
      actions={
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>+ Villageois</Button>
      }
    >
      <ErrorBanner error={err} onDismiss={() => setErr(null)} />
      <p style={{ ...muted, fontSize: 13, marginTop: -8, marginBottom: 14 }}>
        Le trading hall du projet : qui vend quoi, où, et qui de nous a le prix réduit.
      </p>

      {villagers.length > 3 && (
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Rechercher un villageois, un métier, un tag, un item…"
          style={{
            width: '100%', maxWidth: 420, boxSizing: 'border-box', marginBottom: 10,
            background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.28)',
            borderRadius: 10, padding: '9px 12px', color: '#ede8f8',
            fontFamily: "'Inter',sans-serif", fontSize: 14, outline: 'none',
          }}
        />
      )}

      {/* Filtre par tag (union des tags posés sur les villageois) */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {['', ...allTags].map((t) => {
            const active = tagFilter.toLowerCase() === t.toLowerCase();
            return (
              <button key={t || '__all'} type="button" onClick={() => setTagFilter(active && t ? '' : t)}
                style={{
                  padding: '4px 11px', borderRadius: 12, cursor: 'pointer',
                  background: active ? 'rgba(201,168,232,0.16)' : 'rgba(20,12,40,0.5)',
                  border: `1px solid ${active ? '#c9a8e8' : 'rgba(80,50,130,0.3)'}`,
                  color: active ? '#c9a8e8' : 'rgba(180,170,200,0.7)',
                  fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: active ? 600 : 400,
                }}
              >
                {t === '' ? 'Tous' : `# ${t}`}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
      ) : villagers.length === 0 ? (
        <Empty>
          Aucun villageois suivi. Ajoute ton bibliothécaire à Réparation ou ton
          fermier à carottes — avec ses coordonnées et ses meilleurs trades.
        </Empty>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {displayed.map((v) => (
            <VillagerCard
              key={v.id} v={v} ws={ws} user={user} members={members} catalog={catalog}
              iconIndex={iconIndex} idIndex={idIndex} toast={toast} confirm={confirm}
              onEdit={() => { setEditing(v); setModalOpen(true); }}
              onRemove={() => removeVillager(v)}
              onTrades={(fn) => setTrades(v.id, fn)}
            />
          ))}
        </div>
      )}

      <VillagerModal
        open={modalOpen} onClose={() => setModalOpen(false)} editing={editing}
        ws={ws} toast={toast} onSaved={(saved) => { setModalOpen(false); replaceVillager(saved); }}
      />
    </Section>
  );
}

function VillagerCard({ v, ws, user, members, catalog, iconIndex, idIndex, toast, confirm, onEdit, onRemove, onTrades }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState(null);
  const coords = fmtCoords(v);

  return (
    <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* En-tête : nom, métier, coords */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          width: 40, height: 40, flexShrink: 0, borderRadius: 10, fontSize: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(20,10,42,0.85)', border: '1px solid rgba(80,50,130,0.3)',
        }}>
          {professionEmoji(v.profession)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Space Grotesk',sans-serif", fontSize: 15.5, fontWeight: 700, color: '#ede8f8',
          }}>
            {v.name}
          </div>
          <div style={{ ...muted, fontSize: 12, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {v.profession && <span>{v.profession}</span>}
            <span>
              {worldEmoji(v.world)} {coords ? (
                <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{coords}</span>
              ) : 'coords ?'}
            </span>
          </div>
          {v.note && <div style={{ ...muted, fontSize: 11.5, marginTop: 3 }}>{v.note}</div>}
          {(v.tags || []).length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
              {v.tags.map((t) => <Tag key={t} name={t} />)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button type="button" onClick={onEdit} title="Modifier" style={iconBtn}>✏️</button>
          <button type="button" onClick={onRemove} title="Supprimer" style={{ ...iconBtn, color: '#f87171', borderColor: 'rgba(200,50,50,0.25)', background: 'rgba(200,50,50,0.1)' }}>🗑️</button>
        </div>
      </div>

      {/* Trades */}
      <div style={{ borderTop: '1px solid rgba(80,50,130,0.2)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {v.trades.length === 0 && !formOpen && (
          <p style={{ ...muted, fontSize: 12, margin: 0 }}>Aucun trade noté.</p>
        )}
        {v.trades.map((t) => (
          editingTrade?.id === t.id ? (
            <TradeForm
              key={t.id} v={v} ws={ws} members={members} catalog={catalog} toast={toast} trade={t}
              onDone={(saved) => { setEditingTrade(null); onTrades((ts) => ts.map((x) => (x.id === saved.id ? saved : x))); }}
              onCancel={() => setEditingTrade(null)}
            />
          ) : (
            <TradeRow
              key={t.id} t={t} user={user} iconIndex={iconIndex} idIndex={idIndex}
              onEdit={() => { setFormOpen(false); setEditingTrade(t); }}
              onRemove={async () => {
                const ok = await confirm({
                  title: 'Retirer ce trade',
                  message: `« ${t.itemName} » sera retiré de ${v.name}.`,
                  confirmLabel: 'Retirer', danger: true,
                });
                if (!ok) return;
                try {
                  await ws.minecraft.villagers.trades.remove(v.id, t.id);
                  onTrades((ts) => ts.filter((x) => x.id !== t.id));
                } catch (e) { toast.error(`Échec : ${e.message}`); }
              }}
            />
          )
        ))}

        {formOpen ? (
          <TradeForm
            v={v} ws={ws} members={members} catalog={catalog} toast={toast}
            onDone={(saved) => { setFormOpen(false); onTrades((ts) => [...ts, saved]); }}
            onCancel={() => setFormOpen(false)}
          />
        ) : (
          <button type="button" onClick={() => { setEditingTrade(null); setFormOpen(true); }}
            style={{
              alignSelf: 'flex-start', padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
              background: 'transparent', border: '1px dashed rgba(80,50,130,0.45)',
              color: 'rgba(200,180,240,0.8)', fontFamily: "'Inter',sans-serif", fontSize: 12.5,
            }}
          >
            + Trade
          </button>
        )}
      </div>
    </div>
  );
}

function TradeRow({ t, user, iconIndex, idIndex, onEdit, onRemove }) {
  const mine = t.discountUserId === user?.id;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '6px 8px', borderRadius: 8, background: 'rgba(14,9,28,0.5)',
      border: '1px solid rgba(80,50,130,0.2)',
    }}>
      <ItemIcon name={t.itemName} iconIndex={iconIndex} idIndex={idIndex} size={20} />
      <span style={{
        flex: '1 1 110px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 13,
      }}>
        {t.itemName}
        {t.note && <span style={{ ...muted, fontSize: 11 }}> — {t.note}</span>}
      </span>
      {t.price && (
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 12, whiteSpace: 'nowrap',
          color: t.discountUserId != null ? 'rgba(180,170,200,0.55)' : '#4dd9ac',
          textDecoration: t.discountUserId != null && t.discountPrice ? 'line-through' : 'none',
        }}>
          💚 {t.price}
        </span>
      )}
      {t.discountUserId != null && (
        <span title={`Prix réduit pour ${t.discountUserName || '?'}`} style={{
          padding: '1px 7px', borderRadius: 10, fontSize: 11, whiteSpace: 'nowrap',
          background: mine ? 'rgba(74,222,128,0.14)' : 'rgba(96,165,250,0.12)',
          border: `1px solid ${mine ? 'rgba(74,222,128,0.55)' : 'rgba(96,165,250,0.45)'}`,
          color: mine ? '#4ade80' : '#60a5fa', fontFamily: "'Inter',sans-serif",
        }}>
          🤝 {mine ? 'Moi' : (t.discountUserName || '?')}{t.discountPrice ? ` : ${t.discountPrice}` : ''}
        </span>
      )}
      <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button type="button" onClick={onEdit} title="Modifier" style={{ ...iconBtn, padding: '2px 6px', fontSize: 12 }}>✏️</button>
        <button type="button" onClick={onRemove} title="Retirer" style={{ ...iconBtn, padding: '2px 6px', fontSize: 12, color: '#f87171', borderColor: 'rgba(200,50,50,0.25)', background: 'rgba(200,50,50,0.1)' }}>🗑️</button>
      </span>
    </div>
  );
}

// Formulaire de trade (ajout / édition inline) : item, prix, réduction par joueur.
function TradeForm({ v, ws, members, catalog, toast, trade = null, onDone, onCancel }) {
  const [itemName, setItemName] = useState(trade?.itemName || '');
  const [price, setPrice] = useState(trade?.price || '');
  const [discountUserId, setDiscountUserId] = useState(trade?.discountUserId ? String(trade.discountUserId) : '');
  const [discountPrice, setDiscountPrice] = useState(trade?.discountPrice || '');
  const [note, setNote] = useState(trade?.note || '');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!itemName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        itemName: itemName.trim(), price: price.trim(),
        discountUserId: discountUserId === '' ? null : Number(discountUserId),
        discountPrice: discountUserId === '' ? '' : discountPrice.trim(),
        note: note.trim(),
      };
      const saved = trade
        ? await ws.minecraft.villagers.trades.update(v.id, trade.id, payload)
        : await ws.minecraft.villagers.trades.create(v.id, payload);
      onDone(saved);
    } catch (ex) {
      toast.error(`Échec : ${ex.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={{
      display: 'flex', gap: 6, flexWrap: 'wrap',
      padding: 8, borderRadius: 8,
      background: 'rgba(20,10,42,0.55)', border: '1px dashed rgba(80,50,130,0.4)',
    }}>
      <div style={{ flex: '1 1 100%', minWidth: 0 }}>
        <BlockPicker value={itemName} onChange={setItemName} catalog={catalog} autoFocus={!trade} />
      </div>
      <input value={price} onChange={(e) => setPrice(e.target.value)}
        placeholder="Prix (ex. 12 émeraudes)" style={{ ...inp, flex: '1 1 130px' }} />
      <select value={discountUserId} onChange={(e) => setDiscountUserId(e.target.value)}
        title="Qui a le prix réduit ?" style={{ ...inp, maxWidth: 140 }}>
        <option value="">🤝 Pas de réduc</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>🤝 {m.name || `#${m.id}`}</option>
        ))}
      </select>
      {discountUserId !== '' && (
        <input value={discountPrice} onChange={(e) => setDiscountPrice(e.target.value)}
          placeholder="Prix réduit (ex. 1 émeraude)" style={{ ...inp, flex: '1 1 130px' }} />
      )}
      <input value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="Note (ex. niveau maître)" style={{ ...inp, flex: '1 1 130px' }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <Button type="submit" disabled={saving || !itemName.trim()}>
          {saving ? '…' : (trade ? 'Enregistrer' : 'Ajouter')}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>Annuler</Button>
      </div>
    </form>
  );
}

// Modal villageois (nom, métier, monde + coords, note).
function VillagerModal({ open, onClose, editing, ws, toast, onSaved }) {
  const [name, setName] = useState('');
  const [profession, setProfession] = useState('');
  const [world, setWorld] = useState('overworld');
  const [x, setX] = useState(''); const [y, setY] = useState(''); const [z, setZ] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name || '');
    setProfession(editing?.profession || '');
    setWorld(editing?.world || 'overworld');
    setX(editing?.x ?? ''); setY(editing?.y ?? ''); setZ(editing?.z ?? '');
    setNote(editing?.note || '');
    setTags(editing?.tags || []);
  }, [open, editing]);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), profession: profession.trim(), world, x, y, z, note: note.trim(), tags };
      const saved = editing
        ? await ws.minecraft.villagers.update(editing.id, payload)
        : await ws.minecraft.villagers.create(payload);
      toast.success(editing ? 'Villageois mis à jour' : 'Villageois ajouté');
      onSaved(saved);
    } catch (ex) {
      toast.error(`Échec : ${ex.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <Modal open onClose={onClose} title={editing ? `Modifier « ${editing.name} »` : 'Nouveau villageois'} width={520}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
          placeholder="Nom (ex. Bob le biblio)" style={inp} />
        <input value={profession} onChange={(e) => setProfession(e.target.value)}
          placeholder="Métier (ex. Bibliothécaire)" list="mc-professions" style={inp} />
        <datalist id="mc-professions">
          {PROFESSIONS.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.id}</option>)}
        </datalist>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={world} onChange={(e) => setWorld(e.target.value)} style={{ ...inp, flex: '1 1 130px' }}>
            {WORLDS.map((w) => <option key={w.id} value={w.id}>{w.emoji} {w.label}</option>)}
          </select>
          <input value={x} onChange={(e) => setX(e.target.value)} placeholder="X" type="number" style={{ ...inp, width: 84 }} />
          <input value={y} onChange={(e) => setY(e.target.value)} placeholder="Y" type="number" style={{ ...inp, width: 84 }} />
          <input value={z} onChange={(e) => setZ(e.target.value)} placeholder="Z" type="number" style={{ ...inp, width: 84 }} />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Note (ex. dans le hall, cellule 3)" style={inp} />
        <TagsInput value={tags} onChange={setTags} placeholder="Tags (ex. hall, spawn…), puis Entrée" />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Enregistrement…' : (editing ? 'Enregistrer' : 'Ajouter')}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Annuler</Button>
        </div>
      </form>
    </Modal>
  );
}

const inp = {
  boxSizing: 'border-box', background: 'rgba(14,9,28,0.6)',
  border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8, padding: '8px 10px',
  color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
};

const iconBtn = {
  background: 'rgba(80,50,130,0.16)', border: '1px solid rgba(80,50,130,0.3)',
  color: '#ede8f8', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontSize: 13,
};
