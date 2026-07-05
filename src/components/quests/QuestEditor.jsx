import { useState } from 'react';
import { api } from '../../api/client';
import { useConfirm } from '../../ui/ConfirmProvider';
import { Button, Field, Input, Textarea } from '../admin/ui';
import { CodexPicker } from '../admin/editors/minecraft/CodexPicker';
import { QuestMap } from './QuestMap';
import {
  ACC, ACC_RGB, CRIMSON, GOLD, INK, MUTED, OCCURRENCE_ORDER, OCCURRENCES,
  POINT_ROLES, panel,
} from './theme';

const selectStyle = {
  background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8,
  padding: '9px 10px', color: INK, fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none',
};

const EDITOR_TABS = [
  ['quetes', 'Quêtes'],
  ['factions', 'Factions & paliers'],
  ['chaines', 'Chaînes'],
  ['groupes', 'Groupes'],
];

export function QuestEditor({ factions, chains, groups = [], quests, byId, catalog, onChanged }) {
  const [tab, setTab] = useState('quetes');
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {EDITOR_TABS.map(([k, l]) => (
          <button
            key={k} type="button" onClick={() => setTab(k)}
            style={{
              padding: '7px 13px', borderRadius: 8, cursor: 'pointer', fontFamily: "'Inter',sans-serif",
              fontSize: 13, fontWeight: 600,
              background: tab === k ? ACC : 'transparent', color: tab === k ? '#08051a' : MUTED,
              border: tab === k ? 'none' : '1px solid rgba(80,50,130,0.3)',
            }}
          >{l}</button>
        ))}
      </div>

      {tab === 'factions' && <FactionsManager factions={factions} onChanged={onChanged} />}
      {tab === 'chaines' && <ChainsManager chains={chains} factions={factions} onChanged={onChanged} />}
      {tab === 'groupes' && <GroupsManager groups={groups} onChanged={onChanged} />}
      {tab === 'quetes' && (
        <QuestsManager
          quests={quests} factions={factions} chains={chains} groups={groups}
          byId={byId} catalog={catalog} onChanged={onChanged}
        />
      )}
    </div>
  );
}

// ── Factions ────────────────────────────────────────────────────────────────
function FactionsManager({ factions, onChanged }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const list = [...factions.values()];

  const remove = async (f) => {
    const ok = await confirm({
      title: 'Supprimer la faction', danger: true, confirmLabel: 'Supprimer',
      message: `« ${f.nom} » et ses paliers seront supprimés. Les quêtes gardent leur contenu mais perdent le lien.`,
    });
    if (!ok) return;
    await api.quests.deleteFaction(f.id); onChanged();
  };

  return (
    <div>
      <Button onClick={() => setEditing('new')} disabled={editing != null}>+ Nouvelle faction</Button>
      {editing === 'new' && <FactionForm onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {list.map((f) => (
          editing?.id === f.id ? (
            <FactionForm key={f.id} faction={f} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />
          ) : (
            <div key={f.id} style={{ ...panel, padding: 12, display: 'flex', alignItems: 'center', gap: 10, borderLeft: `3px solid ${f.couleur}` }}>
              <strong style={{ color: INK, fontFamily: "'Space Grotesk',sans-serif" }}>{f.nom}</strong>
              <span style={{ fontSize: 11, color: MUTED }}>{f.type === 'maitrise' ? 'Maîtrise' : 'Faction'} · {f.tiers.length} palier(s)</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <Button variant="ghost" onClick={() => setEditing(f)}>Éditer</Button>
                <Button variant="danger" onClick={() => remove(f)}>Suppr.</Button>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

function FactionForm({ faction, onDone, onCancel }) {
  const [nom, setNom] = useState(faction?.nom || '');
  const [type, setType] = useState(faction?.type || 'faction');
  const [couleur, setCouleur] = useState(faction?.couleur || '#c9a8e8');
  const [description, setDescription] = useState(faction?.description || '');
  const [tiers, setTiers] = useState(faction?.tiers?.map((t) => ({ nomPalier: t.nomPalier, seuil: t.seuil })) || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = { nom, type, couleur, description, tiers };
      if (faction) await api.quests.updateFaction(faction.id, body);
      else await api.quests.createFaction(body);
      onDone();
    } catch (e) { setErr(e.body?.error || e.message); setSaving(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ ...panel, padding: 16, marginTop: 10, border: `1px solid rgba(${ACC_RGB},0.4)` }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12 }}>{err}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 80px', gap: 10 }}>
        <Field label="Nom"><Input value={nom} onChange={(e) => setNom(e.target.value)} required /></Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            <option value="faction">Faction</option>
            <option value="maitrise">Maîtrise</option>
          </select>
        </Field>
        <Field label="Couleur">
          <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)}
            style={{ width: '100%', height: 38, background: 'none', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8 }} />
        </Field>
      </div>
      <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>

      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: MUTED, marginBottom: 6, fontWeight: 600 }}>
          Paliers (nom + seuil)
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {tiers.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 34px', gap: 6 }}>
              <Input value={t.nomPalier} placeholder="Néophyte maladroit" onChange={(e) => setTiers((ts) => ts.map((x, j) => j === i ? { ...x, nomPalier: e.target.value } : x))} />
              <Input type="number" value={t.seuil} placeholder="Seuil" onChange={(e) => setTiers((ts) => ts.map((x, j) => j === i ? { ...x, seuil: e.target.value } : x))} />
              <Button type="button" variant="danger" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} style={{ padding: '6px 8px' }}>×</Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" onClick={() => setTiers((ts) => [...ts, { nomPalier: '', seuil: 0 }])} style={{ marginTop: 6 }}>
          + Palier
        </Button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
      </div>
    </form>
  );
}

// ── Chains ──────────────────────────────────────────────────────────────────
function ChainsManager({ chains, factions, onChanged }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);

  const remove = async (c) => {
    const ok = await confirm({ title: 'Supprimer la chaîne', danger: true, confirmLabel: 'Supprimer', message: `« ${c.nom} » sera supprimée. Les quêtes gardent leur contenu.` });
    if (!ok) return;
    await api.quests.deleteChain(c.id); onChanged();
  };

  return (
    <div>
      <Button onClick={() => setEditing('new')} disabled={editing != null}>+ Nouvelle chaîne</Button>
      {editing === 'new' && <ChainForm factions={factions} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {chains.map((c) => (
          editing?.id === c.id ? (
            <ChainForm key={c.id} chain={c} factions={factions} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />
          ) : (
            <div key={c.id} style={{ ...panel, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ color: INK, fontFamily: "'Space Grotesk',sans-serif" }}>⛓ {c.nom}</strong>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <Button variant="ghost" onClick={() => setEditing(c)}>Éditer</Button>
                <Button variant="danger" onClick={() => remove(c)}>Suppr.</Button>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

function ChainForm({ chain, factions, onDone, onCancel }) {
  const [nom, setNom] = useState(chain?.nom || '');
  const [factionId, setFactionId] = useState(chain?.factionId || '');
  const [description, setDescription] = useState(chain?.description || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = { nom, factionId: factionId ? Number(factionId) : null, description };
      if (chain) await api.quests.updateChain(chain.id, body);
      else await api.quests.createChain(body);
      onDone();
    } catch (e) { setErr(e.body?.error || e.message); setSaving(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ ...panel, padding: 16, marginTop: 10, border: `1px solid rgba(${ACC_RGB},0.4)` }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12 }}>{err}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <Field label="Nom"><Input value={nom} onChange={(e) => setNom(e.target.value)} required /></Field>
        <Field label="Faction (optionnel)">
          <select value={factionId} onChange={(e) => setFactionId(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            <option value="">—</option>
            {[...factions.values()].map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
      </div>
    </form>
  );
}

// ── Groups ──────────────────────────────────────────────────────────────────
function GroupsManager({ groups, onChanged }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);

  const remove = async (g) => {
    const ok = await confirm({ title: 'Supprimer le groupe', danger: true, confirmLabel: 'Supprimer', message: `« ${g.nom} » sera supprimé. Les quêtes ne sont pas supprimées, elles perdent juste ce groupe.` });
    if (!ok) return;
    await api.quests.deleteGroup(g.id); onChanged();
  };

  return (
    <div>
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>
        Tes propres groupes pour ranger les quêtes comme tu veux (« Prioritaire », « Event de Noël »…),
        en plus des factions et des chaînes. Une quête peut appartenir à plusieurs groupes.
      </p>
      <Button onClick={() => setEditing('new')} disabled={editing != null}>+ Nouveau groupe</Button>
      {editing === 'new' && <GroupForm onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />}
      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        {groups.map((g) => (
          editing?.id === g.id ? (
            <GroupForm key={g.id} group={g} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />
          ) : (
            <div key={g.id} style={{ ...panel, padding: 12, display: 'flex', alignItems: 'center', gap: 10, borderLeft: `3px solid ${g.couleur}` }}>
              <strong style={{ color: INK, fontFamily: "'Space Grotesk',sans-serif" }}>◈ {g.nom}</strong>
              <span style={{ fontSize: 11, color: MUTED }}>{g.questCount ?? 0} quête(s)</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <Button variant="ghost" onClick={() => setEditing(g)}>Éditer</Button>
                <Button variant="danger" onClick={() => remove(g)}>Suppr.</Button>
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
}

function GroupForm({ group, onDone, onCancel }) {
  const [nom, setNom] = useState(group?.nom || '');
  const [couleur, setCouleur] = useState(group?.couleur || '#c9a8e8');
  const [description, setDescription] = useState(group?.description || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = { nom, couleur, description };
      if (group) await api.quests.updateGroup(group.id, body);
      else await api.quests.createGroup(body);
      onDone();
    } catch (e) { setErr(e.body?.error || e.message); setSaving(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ ...panel, padding: 16, marginTop: 10, border: `1px solid rgba(${ACC_RGB},0.4)` }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12 }}>{err}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px', gap: 10 }}>
        <Field label="Nom"><Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Prioritaire" /></Field>
        <Field label="Couleur">
          <input type="color" value={couleur} onChange={(e) => setCouleur(e.target.value)}
            style={{ width: '100%', height: 38, background: 'none', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8 }} />
        </Field>
      </div>
      <Field label="Description (optionnel)"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={saving}>{saving ? '…' : 'Enregistrer'}</Button>
      </div>
    </form>
  );
}

// ── Quests ──────────────────────────────────────────────────────────────────
function QuestsManager({ quests, factions, chains, groups, byId, catalog, onChanged }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null); // 'new' | quest summary | null

  const openEdit = async (q) => {
    const full = await api.quests.get(q.id);
    setEditing(full);
  };
  const remove = async (q) => {
    const ok = await confirm({ title: 'Supprimer la quête', danger: true, confirmLabel: 'Supprimer', message: `« ${q.titre} » sera supprimée.` });
    if (!ok) return;
    await api.quests.deleteQuest(q.id); onChanged();
  };

  if (editing) {
    return (
      <QuestForm
        quest={editing === 'new' ? null : editing}
        factions={factions} chains={chains} groups={groups} quests={quests} byId={byId} catalog={catalog}
        onDone={() => { setEditing(null); onChanged(); }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <Button onClick={() => setEditing('new')}>+ Nouvelle quête</Button>
      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        {quests.map((q) => {
          const occ = OCCURRENCES[q.occurrenceType] || OCCURRENCES.simple;
          return (
            <div key={q.id} style={{ ...panel, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: occ.color, fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{occ.icon} {occ.short}</span>
              <strong style={{ color: INK, fontFamily: "'Space Grotesk',sans-serif", fontSize: 14 }}>{q.titre}</strong>
              {q.factionNom && <span style={{ fontSize: 11, color: q.factionCouleur }}>{q.factionNom}</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <Button variant="ghost" onClick={() => openEdit(q)}>Éditer</Button>
                <Button variant="danger" onClick={() => remove(q)}>Suppr.</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const toDatetimeLocal = (unix) => {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function QuestForm({ quest, factions, chains, groups = [], quests, byId, catalog, onDone, onCancel }) {
  const [titre, setTitre] = useState(quest?.titre || '');
  const [description, setDescription] = useState(quest?.description || '');
  const [occurrenceType, setOccurrenceType] = useState(quest?.occurrenceType || 'simple');
  const [factionId, setFactionId] = useState(quest?.factionId || '');
  const [chainId, setChainId] = useState(quest?.chainId || '');
  const [chainRank, setChainRank] = useState(quest?.chainRank || 0);
  const [dueDate, setDueDate] = useState(toDatetimeLocal(quest?.dueDate));
  const [inputs, setInputs] = useState(quest?.inputs?.map(strip) || []);
  const [rewards, setRewards] = useState(quest?.rewards?.map(strip) || []);
  const [prerequisites, setPrereqs] = useState(quest?.prerequisites?.map(strip) || []);
  const [mapPoints, setMapPoints] = useState(quest?.mapPoints?.map((p) => ({ label: p.label, role: p.role, x: p.x, y: p.y, z: p.z })) || []);
  const [groupIds, setGroupIds] = useState(quest?.groups?.map((g) => g.id) || []);
  const [activePoint, setActivePoint] = useState(null);
  const toggleGroup = (id) => setGroupIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const factionArr = [...factions.values()];
  const otherQuests = quests.filter((q) => !quest || q.id !== quest.id);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = {
        titre, description, occurrenceType,
        factionId: factionId ? Number(factionId) : null,
        chainId: chainId ? Number(chainId) : null,
        chainRank: Number(chainRank) || 0,
        dueDate: dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : null,
        inputs, rewards, prerequisites, mapPoints, groupIds,
      };
      if (quest) await api.quests.updateQuest(quest.id, body);
      else await api.quests.createQuest(body);
      onDone();
    } catch (e) { setErr(e.body?.error || e.message); setSaving(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ ...panel, padding: 18, border: `1px solid rgba(${ACC_RGB},0.4)` }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12.5 }}>Erreur : {err}</p>}

      <Field label="Titre"><Input value={titre} onChange={(e) => setTitre(e.target.value)} required /></Field>
      <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <Field label="Occurrence">
          <select value={occurrenceType} onChange={(e) => setOccurrenceType(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            {OCCURRENCE_ORDER.map((o) => <option key={o} value={o}>{OCCURRENCES[o].label}</option>)}
          </select>
        </Field>
        <Field label="Faction d'origine">
          <select value={factionId} onChange={(e) => setFactionId(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            <option value="">—</option>
            {factionArr.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
        </Field>
        <Field label="Chaîne">
          <select value={chainId} onChange={(e) => setChainId(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
            <option value="">—</option>
            {chains.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select>
        </Field>
        <Field label="Rang dans la chaîne"><Input type="number" value={chainRank} onChange={(e) => setChainRank(e.target.value)} /></Field>
        <Field label="Échéance (optionnel)"><Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>

      <div style={{ marginTop: 4, marginBottom: 8 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: MUTED, marginBottom: 6, fontWeight: 600 }}>
          Groupes
        </div>
        {groups.length === 0 ? (
          <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: MUTED, margin: 0 }}>
            Aucun groupe. Crée-en dans l'onglet « Groupes ».
          </p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {groups.map((g) => {
              const on = groupIds.includes(g.id);
              return (
                <button
                  key={g.id} type="button" onClick={() => toggleGroup(g.id)}
                  style={{
                    cursor: 'pointer', padding: '5px 11px', borderRadius: 999,
                    fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600,
                    color: on ? '#08051a' : g.couleur,
                    background: on ? g.couleur : `rgba(${'201,168,232'},0.06)`,
                    border: `1px solid ${g.couleur}`,
                  }}
                >{on ? '✓ ' : ''}{g.nom}</button>
              );
            })}
          </div>
        )}
      </div>

      <LineSection
        title="Entrées" accent={CRIMSON} rows={inputs} setRows={setInputs}
        kinds={['item', 'pa', 'reputation', 'pnj', 'autre']} factionArr={factionArr}
        byId={byId} catalog={catalog}
      />
      <LineSection
        title="Récompenses" accent={GOLD} rows={rewards} setRows={setRewards}
        kinds={['item', 'pa', 'reputation', 'deblocage', 'autre']} factionArr={factionArr}
        byId={byId} catalog={catalog} otherQuests={otherQuests}
      />
      <PrereqSection rows={prerequisites} setRows={setPrereqs} factionArr={factionArr} otherQuests={otherQuests} byId={byId} catalog={catalog} />
      <PointsSection points={mapPoints} setPoints={setMapPoints} active={activePoint} setActive={setActivePoint} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={saving}>{saving ? '…' : (quest ? 'Mettre à jour' : 'Créer la quête')}</Button>
      </div>
    </form>
  );
}

const strip = (l) => ({
  kind: l.kind, refCode: l.refCode, factionId: l.factionId, quantite: l.quantite,
  unlockQuestId: l.unlockQuestId, label: l.label, icon: l.icon,
});

function SectionShell({ title, accent, children, onAdd, addLabel }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: accent, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{title}</span>
        <Button type="button" variant="ghost" onClick={onAdd} style={{ padding: '4px 10px', fontSize: 12 }}>{addLabel}</Button>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>{children}</div>
    </div>
  );
}

function RowShell({ onRemove, children }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)', borderRadius: 8, padding: 8 }}>
      {children}
      <Button type="button" variant="danger" onClick={onRemove} style={{ padding: '6px 8px', marginLeft: 'auto' }}>×</Button>
    </div>
  );
}

function LineSection({ title, accent, rows, setRows, kinds, factionArr, byId, catalog, otherQuests }) {
  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, { kind: kinds[0], label: '', quantite: '' }]);
  return (
    <SectionShell title={title} accent={accent} onAdd={add} addLabel="+ Ligne">
      {rows.map((r, i) => (
        <RowShell key={i} onRemove={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
          <select value={r.kind} onChange={(e) => set(i, { kind: e.target.value })} style={{ ...selectStyle, minWidth: 120 }}>
            {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>

          {r.kind === 'item' && (
            <div style={{ minWidth: 200, flex: 1 }}>
              <CodexPicker catalog={catalog} byId={byId} value={r.refCode || ''} onChange={(id, entry) => set(i, { refCode: id, label: r.label || entry?.nomFr || '' })} />
            </div>
          )}
          {r.kind === 'reputation' && (
            <select value={r.factionId || ''} onChange={(e) => set(i, { factionId: e.target.value ? Number(e.target.value) : null })} style={{ ...selectStyle, minWidth: 140 }}>
              <option value="">Faction…</option>
              {factionArr.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
            </select>
          )}
          {r.kind === 'deblocage' && otherQuests && (
            <select value={r.unlockQuestId || ''} onChange={(e) => set(i, { unlockQuestId: e.target.value ? Number(e.target.value) : null })} style={{ ...selectStyle, minWidth: 180, flex: 1 }}>
              <option value="">Quête à débloquer…</option>
              {otherQuests.map((q) => <option key={q.id} value={q.id}>{q.titre}</option>)}
            </select>
          )}

          <Input value={r.label || ''} placeholder="Libellé affiché" onChange={(e) => set(i, { label: e.target.value })} style={{ minWidth: 130, flex: 1 }} />
          {r.kind !== 'deblocage' && (
            <Input type="number" value={r.quantite ?? ''} placeholder="Qté" onChange={(e) => set(i, { quantite: e.target.value === '' ? null : Number(e.target.value) })} style={{ width: 80 }} />
          )}
        </RowShell>
      ))}
    </SectionShell>
  );
}

function PrereqSection({ rows, setRows, factionArr, otherQuests, byId, catalog }) {
  const KINDS = ['quete_terminee', 'reputation_min', 'item_possede', 'maitrise_min', 'autre'];
  const set = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, { kind: 'quete_terminee', label: '' }]);
  const tiersOf = (fid) => (factionArr.find((f) => f.id === Number(fid))?.tiers || []);
  return (
    <SectionShell title="Prérequis" accent="#7bd3e8" onAdd={add} addLabel="+ Prérequis">
      {rows.map((r, i) => (
        <RowShell key={i} onRemove={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
          <select value={r.kind} onChange={(e) => set(i, { kind: e.target.value })} style={{ ...selectStyle, minWidth: 150 }}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {r.kind === 'quete_terminee' && (
            <select value={r.refQuestId || ''} onChange={(e) => set(i, { refQuestId: e.target.value ? Number(e.target.value) : null })} style={{ ...selectStyle, minWidth: 180, flex: 1 }}>
              <option value="">Quête…</option>
              {otherQuests.map((q) => <option key={q.id} value={q.id}>{q.titre}</option>)}
            </select>
          )}
          {(r.kind === 'reputation_min' || r.kind === 'maitrise_min') && (
            <>
              <select value={r.factionId || ''} onChange={(e) => set(i, { factionId: e.target.value ? Number(e.target.value) : null, tierId: null })} style={{ ...selectStyle, minWidth: 130 }}>
                <option value="">Faction…</option>
                {factionArr.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
              <select value={r.tierId || ''} onChange={(e) => set(i, { tierId: e.target.value ? Number(e.target.value) : null })} style={{ ...selectStyle, minWidth: 130 }}>
                <option value="">Palier…</option>
                {tiersOf(r.factionId).map((t) => <option key={t.id} value={t.id}>{t.nomPalier}</option>)}
              </select>
            </>
          )}
          {r.kind === 'item_possede' && (
            <div style={{ minWidth: 200, flex: 1 }}>
              <CodexPicker catalog={catalog} byId={byId} value={r.refCode || ''} onChange={(id, entry) => set(i, { refCode: id, label: r.label || entry?.nomFr || '' })} />
            </div>
          )}
          <Input value={r.label || ''} placeholder="Libellé" onChange={(e) => set(i, { label: e.target.value })} style={{ minWidth: 120, flex: 1 }} />
        </RowShell>
      ))}
    </SectionShell>
  );
}

function PointsSection({ points, setPoints, active, setActive }) {
  const set = (i, patch) => setPoints((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const add = () => {
    if (points.length >= 2) return;
    setPoints((ps) => [...ps, { label: '', role: 'recuperation', x: 0, y: 64, z: 0 }]);
    setActive(points.length);
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: ACC, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>Points de carte (max 2)</span>
        <Button type="button" variant="ghost" onClick={add} disabled={points.length >= 2} style={{ padding: '4px 10px', fontSize: 12 }}>+ Point</Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          {points.map((p, i) => (
            <div key={i} onFocusCapture={() => setActive(i)} style={{
              background: active === i ? 'rgba(201,168,232,0.1)' : 'rgba(20,14,38,0.5)',
              border: `1px solid ${active === i ? ACC : 'rgba(80,50,130,0.22)'}`, borderRadius: 8, padding: 8, display: 'grid', gap: 6,
            }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <Input value={p.label} placeholder="Autel estival" onChange={(e) => set(i, { label: e.target.value })} style={{ flex: 1 }} />
                <select value={p.role} onChange={(e) => set(i, { role: e.target.value })} style={{ ...selectStyle }}>
                  {Object.entries(POINT_ROLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 34px', gap: 6 }}>
                <Input type="number" value={p.x} placeholder="X" onChange={(e) => set(i, { x: Number(e.target.value) })} />
                <Input type="number" value={p.y} placeholder="Y" onChange={(e) => set(i, { y: Number(e.target.value) })} />
                <Input type="number" value={p.z} placeholder="Z" onChange={(e) => set(i, { z: Number(e.target.value) })} />
                <Button type="button" variant="danger" onClick={() => { setPoints((ps) => ps.filter((_, j) => j !== i)); setActive(null); }} style={{ padding: '6px 8px' }}>×</Button>
              </div>
              <span style={{ fontSize: 11, color: MUTED }}>Sélectionne cette ligne puis clique la grille pour poser X/Z.</span>
            </div>
          ))}
        </div>
        <QuestMap
          points={points} editable active={active} selected={active}
          onSelect={setActive}
          onPlace={(idx, x, z) => set(idx, { x, z })}
        />
      </div>
    </div>
  );
}
