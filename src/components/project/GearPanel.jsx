import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { useWorkspace } from '../../hooks/useWorkspace';
import { BlockPicker, ItemIcon, WORLDS } from './Minecraft';
import { Button, muted } from './shared';

const GEAR_ACC = '#60a5fa'; // bleu « acier », distinct du violet coffres / orange wanted

// « ⚔️ Stuff » : l'équipement nommé du projet — outils/armes/armures renommés
// avec leurs enchantements, un propriétaire et un rangement. Panneau repliable
// affiché sur la page Coffres (les deux modes), même patron que WantedPanel.
export function GearPanel({ ws, slug, chests, catalog, iconIndex, idIndex, block3d, toast, confirm }) {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const [gear, setGear] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [members, setMembers] = useState([]);

  // Formulaire inline
  const [name, setName] = useState('');
  const [itemName, setItemName] = useState('');
  const [enchants, setEnchants] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [chestId, setChestId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded(false);
    ws.minecraft.gear.list()
      .then((l) => { if (alive) setGear(l); })
      .catch((e) => { if (alive) toast.error(`Stuff : ${e.message}`); })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
    /* eslint-disable-next-line */
  }, [slug]);

  useEffect(() => {
    let alive = true;
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

  const chestById = useMemo(() => new Map(chests.map((c) => [c.id, c])), [chests]);

  const openAdd = () => {
    setEditing(null); setName(''); setItemName(''); setEnchants('');
    setOwnerId(''); setChestId(''); setNote(''); setFormOpen(true);
  };
  const openEdit = (g) => {
    setEditing(g); setName(g.name); setItemName(g.itemName); setEnchants(g.enchants);
    setOwnerId(g.ownerId ? String(g.ownerId) : ''); setChestId(g.chestId ? String(g.chestId) : '');
    setNote(g.note); setFormOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(), itemName: itemName.trim(), enchants: enchants.trim(),
        ownerId: ownerId === '' ? null : Number(ownerId),
        chestId: chestId === '' ? null : Number(chestId),
        note: note.trim(),
      };
      const saved = editing
        ? await ws.minecraft.gear.update(editing.id, payload)
        : await ws.minecraft.gear.create(payload);
      setGear((prev) => (editing ? prev.map((g) => (g.id === saved.id ? saved : g)) : [...prev, saved]));
      setFormOpen(false); setEditing(null);
      toast.success(editing ? 'Équipement mis à jour' : 'Équipement ajouté');
    } catch (ex) {
      toast.error(`Échec : ${ex.message}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g) => {
    const ok = await confirm({
      title: `Supprimer « ${g.name} »`,
      message: 'Cet équipement sera retiré de la liste.',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    try {
      await ws.minecraft.gear.remove(g.id);
      setGear((prev) => prev.filter((x) => x.id !== g.id));
      toast.success('Équipement supprimé');
    } catch (ex) { toast.error(`Échec : ${ex.message}`); }
  };

  const worldEmoji = (w) => WORLDS.find((x) => x.id === w)?.emoji ?? '🗺️';

  return (
    <div style={{
      border: '1px solid rgba(96,165,250,0.3)', borderRadius: 12,
      background: 'linear-gradient(180deg, rgba(15,32,60,0.3), rgba(14,9,28,0.45))',
      overflow: 'hidden', marginBottom: 16,
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setCollapsed((v) => !v)} title={collapsed ? 'Déplier' : 'Replier'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'rgba(147,197,253,0.8)', fontSize: 12, width: 16,
          }}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span style={{ fontSize: 20 }}>⚔️</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: '#dbeafe' }}>
              Stuff nommé
            </span>
            {gear.length > 0 && (
              <span style={{
                padding: '1px 8px', borderRadius: 12, fontSize: 11,
                background: 'rgba(96,165,250,0.14)', border: '1px solid rgba(96,165,250,0.4)',
                color: GEAR_ACC, fontFamily: "'Inter',sans-serif",
              }}>
                {gear.length} pièce{gear.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ ...muted, fontSize: 11.5, marginTop: 2 }}>
            Outils, armes et armures renommés — enchants, propriétaire et rangement.
          </div>
        </div>
        <button type="button" onClick={openAdd}
          style={{
            background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.45)',
            color: GEAR_ACC, borderRadius: 8, padding: '6px 12px', cursor: 'pointer',
            fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          ＋ Stuff
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 14px 14px' }}>
          {/* ── Formulaire inline ── */}
          {formOpen && (
            <form onSubmit={submit} style={{
              display: 'flex', gap: 8, flexWrap: 'wrap',
              padding: 10, borderRadius: 10, marginBottom: 10,
              background: 'rgba(15,20,45,0.55)', border: '1px dashed rgba(96,165,250,0.4)',
            }}>
              <input
                value={name} onChange={(e) => setName(e.target.value)} autoFocus
                placeholder="Nom du stuff (ex. Silky)"
                style={{ ...inp, flex: '1 1 170px', minWidth: 150 }}
              />
              <div style={{ flex: '2 1 220px', minWidth: 200 }}>
                <BlockPicker value={itemName} onChange={setItemName} catalog={catalog} />
              </div>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} title="À qui ?"
                style={{ ...inp, maxWidth: 150 }}>
                <option value="">👥 Commun</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>🙋 {m.name || `#${m.id}`}</option>
                ))}
              </select>
              <select value={chestId} onChange={(e) => setChestId(e.target.value)} title="Rangé où ?"
                style={{ ...inp, maxWidth: 180 }}>
                <option value="">🎒 Sur soi / non rangé</option>
                {chests.map((c) => (
                  <option key={c.id} value={c.id}>{worldEmoji(c.world)} {c.name}</option>
                ))}
              </select>
              <textarea
                value={enchants} onChange={(e) => setEnchants(e.target.value)} rows={2}
                placeholder={'Enchantements (un par ligne)\nex. Efficacité V, Réparation…'}
                style={{ ...inp, flex: '1 1 100%', resize: 'vertical', fontFamily: "'Inter',sans-serif" }}
              />
              <input
                value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Note (ex. durabilité faible, à réparer)"
                style={{ ...inp, flex: '1 1 260px' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
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

          {/* ── Lignes ── */}
          {!loaded ? (
            <p style={{ ...muted, fontSize: 12.5, padding: '4px 0 2px' }}>Chargement…</p>
          ) : gear.length === 0 ? (
            !formOpen && (
              <p style={{ ...muted, fontSize: 12.5, padding: '4px 0 2px' }}>
                Aucun équipement suivi. Clique « ＋ Stuff » pour ajouter ta pioche fétiche.
              </p>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {gear.map((g) => {
                const chest = g.chestId != null ? chestById.get(g.chestId) : null;
                const mine = g.ownerId === user?.id;
                return (
                  <div key={g.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    padding: '9px 12px', borderRadius: 10,
                    background: 'rgba(15,20,45,0.55)',
                    border: '1px solid rgba(96,165,250,0.25)',
                    borderLeft: `3px solid ${GEAR_ACC}`,
                  }}>
                    <span style={{
                      width: 34, height: 34, flexShrink: 0, borderRadius: 6,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(10,15,35,0.85)',
                    }}>
                      <ItemIcon name={g.itemName || g.name} iconIndex={iconIndex} idIndex={idIndex}
                        block3d={block3d} size={24} />
                    </span>

                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap',
                        fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 700, color: '#ede8f8',
                      }}>
                        <span>« {g.name} »</span>
                        {g.itemName && <span style={{ ...muted, fontWeight: 400, fontSize: 12 }}>{g.itemName}</span>}
                      </div>
                      {g.enchants && (
                        <div style={{ color: '#c084fc', fontSize: 12, marginTop: 2, fontFamily: "'Inter',sans-serif" }}>
                          ✨ {g.enchants.split('\n').filter(Boolean).join(' · ')}
                        </div>
                      )}
                      {g.note && <div style={{ ...muted, fontSize: 11.5, marginTop: 2 }}>{g.note}</div>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                      <span title={g.ownerName ? `Appartient à ${g.ownerName}` : 'Équipement commun'} style={{
                        padding: '2px 8px', borderRadius: 10, fontSize: 11,
                        background: mine ? 'rgba(96,165,250,0.14)' : 'rgba(80,50,130,0.2)',
                        border: `1px solid ${mine ? 'rgba(96,165,250,0.55)' : 'rgba(120,80,180,0.4)'}`,
                        color: mine ? GEAR_ACC : 'rgba(200,190,220,0.85)',
                        fontFamily: "'Inter',sans-serif",
                      }}>
                        {g.ownerId == null ? '👥 Commun' : `🙋 ${mine ? 'Moi' : (g.ownerName || '?')}`}
                      </span>
                      <span title={chest ? `Rangé dans ${chest.name}` : 'Sur soi / non rangé'} style={{
                        padding: '2px 8px', borderRadius: 10, fontSize: 11,
                        background: 'rgba(20,12,40,0.6)', border: '1px solid rgba(80,50,130,0.35)',
                        color: 'rgba(200,190,220,0.85)', fontFamily: "'Inter',sans-serif",
                      }}>
                        {chest
                          ? `${worldEmoji(chest.world)} ${chest.name}${chest.x != null ? ` (${chest.x} ${chest.y ?? '?'} ${chest.z ?? '?'})` : ''}`
                          : '🎒 Sur soi'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <button type="button" onClick={() => openEdit(g)} title="Modifier"
                        style={{
                          background: 'rgba(80,50,130,0.16)', border: '1px solid rgba(80,50,130,0.3)',
                          color: '#ede8f8', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontSize: 13,
                        }}
                      >
                        ✏️
                      </button>
                      <button type="button" onClick={() => remove(g)} title="Supprimer"
                        style={{
                          background: 'rgba(200,50,50,0.1)', border: '1px solid rgba(200,50,50,0.25)',
                          color: '#f87171', borderRadius: 6, padding: '4px 7px', cursor: 'pointer', fontSize: 13,
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const inp = {
  boxSizing: 'border-box', background: 'rgba(14,9,28,0.6)',
  border: '1px solid rgba(80,50,130,0.28)', borderRadius: 8, padding: '8px 10px',
  color: '#ede8f8', fontFamily: "'Inter',sans-serif", fontSize: 13.5, outline: 'none',
};
