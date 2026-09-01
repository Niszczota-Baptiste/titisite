import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useConfirm } from '../../ui/ConfirmProvider';
import { ACC, GOLD, INK, MUTED, OCCURRENCES, hexToRgb, panel } from './theme';

// "Si tu fais tout" — potential gains per cadence, sur toutes les quêtes ou sur
// un groupe (partagé ◈ ou privé 🔒 : la sélection perso « ce qu'on veut faire »).
// La projection multiplie chaque cadence sur un horizon (journalières × jours,
// hebdos × semaines, mensuelles × mois, uniques une fois).
const CARDS = [
  { key: 'journaliere',  suffix: '/ jour' },
  { key: 'hebdomadaire', suffix: '/ semaine' },
  { key: 'mensuelle',    suffix: '/ mois' },
  { key: 'simple',       suffix: '(uniques)' },
];

const HORIZONS = [7, 30, 90];

export function GainsView({ groups = [], onGroupsChanged }) {
  const confirm = useConfirm();
  const [gains, setGains] = useState(null);
  const [err, setErr] = useState(null);
  const [groupId, setGroupId] = useState(null); // null = toutes les quêtes
  const [days, setDays] = useState(30);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [picker, setPicker] = useState(null); // groupe privé dont on choisit les quêtes

  const selected = groups.find((g) => g.id === groupId) || null;
  // Le groupe sélectionné peut disparaître (suppression) → retour à « Toutes ».
  useEffect(() => {
    if (groupId != null && !groups.some((g) => g.id === groupId)) setGroupId(null);
  }, [groups, groupId]);

  useEffect(() => {
    let alive = true;
    setGains(null); setErr(null);
    api.quests.gains(groupId || undefined)
      .then((g) => { if (alive) setGains(g); })
      .catch((e) => { if (alive) setErr(e.message || 'Erreur'); });
    return () => { alive = false; };
  }, [groupId]);

  // Projection : total PA + réputations sur `days` jours.
  const projection = useMemo(() => {
    if (!gains) return null;
    const mult = {
      journaliere: days,
      hebdomadaire: Math.floor(days / 7),
      mensuelle: Math.floor(days / 30),
      simple: 1,
    };
    let pa = 0;
    const reps = new Map();
    for (const [key, m] of Object.entries(mult)) {
      const g = gains[key]; // eslint-disable-line security/detect-object-injection
      if (!g || m === 0) continue;
      pa += g.pa * m;
      for (const r of g.reputations) {
        const e = reps.get(r.factionId) || { ...r, total: 0 };
        e.total += r.total * m;
        reps.set(r.factionId, e);
      }
    }
    return { pa, reputations: [...reps.values()].sort((a, b) => b.total - a.total), mult };
  }, [gains, days]);

  const createGroup = async () => {
    const nom = newName.trim();
    if (!nom) return;
    try {
      const g = await api.quests.myGroups.create({ nom });
      setCreating(false); setNewName('');
      onGroupsChanged?.();
      setGroupId(g.id);
      setPicker(g); // enchaîne directement sur le choix des quêtes
    } catch (e) { setErr(e.message || 'Création impossible'); }
  };

  const removeGroup = async (g) => {
    const ok = await confirm({
      title: `Supprimer « ${g.nom} »`,
      message: 'Ce groupe privé sera supprimé (les quêtes elles-mêmes ne bougent pas).',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    try {
      await api.quests.myGroups.remove(g.id);
      if (groupId === g.id) setGroupId(null);
      onGroupsChanged?.();
    } catch (e) { setErr(e.message || 'Suppression impossible'); }
  };

  if (err) return <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif" }}>{err}</p>;

  const shared = groups.filter((g) => !g.prive);
  const mine = groups.filter((g) => g.prive);

  return (
    <div>
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13.5, color: MUTED, margin: '0 0 12px', lineHeight: 1.55 }}>
        Ce que tu récoltes <strong style={{ color: INK }}>si tu complètes toutes</strong> les quêtes d'une
        cadence — sur tout le journal, ou sur un groupe. Crée un <strong style={{ color: INK }}>groupe privé</strong> avec
        les quêtes que tu comptes faire pour projeter tes gains réels.
      </p>

      {/* ── Sélecteur de périmètre ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <ScopeChip active={groupId == null} color={ACC} onClick={() => setGroupId(null)}>
          🌐 Toutes les quêtes
        </ScopeChip>
        {shared.map((g) => (
          <ScopeChip key={g.id} active={groupId === g.id} color={g.couleur} onClick={() => setGroupId(g.id)}>
            ◈ {g.nom}{g.questCount != null ? ` (${g.questCount})` : ''}
          </ScopeChip>
        ))}
        {mine.map((g) => (
          <ScopeChip key={g.id} active={groupId === g.id} color={g.couleur} onClick={() => setGroupId(g.id)}>
            🔒 {g.nom}{g.questCount != null ? ` (${g.questCount})` : ''}
          </ScopeChip>
        ))}
        {creating ? (
          <form onSubmit={(e) => { e.preventDefault(); createGroup(); }}
            style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus
              placeholder="Nom du groupe privé"
              style={{
                background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.35)',
                borderRadius: 8, padding: '6px 10px', color: INK,
                fontFamily: "'Inter',sans-serif", fontSize: 12.5, outline: 'none', width: 170,
              }}
            />
            <MiniBtn type="submit" color="#7be3a8">✓</MiniBtn>
            <MiniBtn onClick={() => { setCreating(false); setNewName(''); }}>×</MiniBtn>
          </form>
        ) : (
          <ScopeChip active={false} color="#7be3a8" onClick={() => setCreating(true)}>
            ＋ Groupe privé
          </ScopeChip>
        )}
      </div>

      {/* ── Actions sur le groupe privé sélectionné ── */}
      {selected?.prive && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <MiniBtn color={ACC} onClick={() => setPicker(selected)}>📋 Choisir les quêtes</MiniBtn>
          <MiniBtn color="#ff8a9b" onClick={() => removeGroup(selected)}>🗑 Supprimer le groupe</MiniBtn>
          <span style={{ fontSize: 11.5, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
            Groupe privé — visible par toi uniquement.
          </span>
        </div>
      )}

      {!gains ? (
        <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Chargement…</p>
      ) : (
        <>
          {/* ── Cartes par cadence ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {CARDS.map(({ key, suffix }) => {
              const g = gains[key]; // eslint-disable-line security/detect-object-injection
              const occ = OCCURRENCES[key]; // eslint-disable-line security/detect-object-injection
              if (!g) return null;
              return (
                <div key={key} style={{ ...panel, padding: 16, borderTop: `3px solid ${occ.color}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
                    <span style={{ fontSize: 18 }}>{occ.icon}</span>
                    <h3 style={{ margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 800, color: INK }}>
                      {occ.label}
                    </h3>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
                      {g.questCount} quête{g.questCount > 1 ? 's' : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 26, fontWeight: 800, color: GOLD }}>
                      {g.pa}
                    </span>
                    <span style={{ fontSize: 13, color: GOLD, fontWeight: 700 }}>PA</span>
                    <span style={{ fontSize: 11, color: MUTED, marginLeft: 4 }}>{suffix}</span>
                  </div>

                  {g.reputations.length === 0 ? (
                    <p style={{ margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 12, color: MUTED }}>
                      Aucun gain de réputation.
                    </p>
                  ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 5 }}>
                      {g.reputations.map((r) => (
                        <li key={r.factionId} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: INK,
                        }}>
                          <span style={{ color: r.couleur || INK, fontWeight: 600 }}>{r.nom || 'Faction'}</span>
                          <span style={{
                            fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                            color: r.couleur || INK,
                            background: `rgba(${hexToRgb(r.couleur || '#c9a8e8')},0.12)`,
                            borderRadius: 6, padding: '1px 7px',
                          }}>+{r.total}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Projection sur un horizon ── */}
          {projection && (
            <div style={{ ...panel, padding: 16, marginTop: 16, borderTop: `3px solid ${GOLD}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 16, fontWeight: 800, color: INK }}>
                  🔮 Projection
                </h3>
                {HORIZONS.map((h) => (
                  <ScopeChip key={h} active={days === h} color={GOLD} onClick={() => setDays(h)}>
                    {h} jours
                  </ScopeChip>
                ))}
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
                  ou
                  <input
                    type="number" min={1} max={365} value={days}
                    onChange={(e) => setDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                    style={{
                      width: 64, background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.35)',
                      borderRadius: 8, padding: '5px 8px', color: INK,
                      fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, outline: 'none',
                    }}
                  />
                  jours
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 32, fontWeight: 800, color: GOLD }}>
                  {projection.pa.toLocaleString('fr-FR')}
                </span>
                <span style={{ fontSize: 14, color: GOLD, fontWeight: 700 }}>PA</span>
                <span style={{ fontSize: 12, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
                  sur {days} jour{days > 1 ? 's' : ''}
                  {selected ? ` · groupe « ${selected.nom} »` : ' · toutes les quêtes'}
                  {' '}— journalières ×{projection.mult.journaliere}, hebdos ×{projection.mult.hebdomadaire},
                  mensuelles ×{projection.mult.mensuelle}, uniques ×1
                </span>
              </div>

              {projection.reputations.length > 0 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {projection.reputations.map((r) => (
                    <span key={r.factionId} style={{
                      fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 12.5,
                      color: r.couleur || INK,
                      background: `rgba(${hexToRgb(r.couleur || '#c9a8e8')},0.12)`,
                      border: `1px solid rgba(${hexToRgb(r.couleur || '#c9a8e8')},0.4)`,
                      borderRadius: 8, padding: '3px 10px',
                    }}>
                      {r.nom || 'Faction'} +{r.total.toLocaleString('fr-FR')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {picker && (
        <QuestPicker
          group={picker}
          onClose={() => setPicker(null)}
          onSaved={() => {
            setPicker(null);
            onGroupsChanged?.();
            // Recharge les gains du groupe si c'est lui qui est affiché.
            if (groupId === picker.id) {
              api.quests.gains(picker.id).then(setGains).catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}

// Sélecteur des quêtes d'un groupe : toutes les quêtes, groupées par cadence, à
// cocher. Remplacement complet à l'enregistrement.
//
// `load`/`save` sont injectables parce que le même écran sert deux endpoints :
// les groupes PRIVÉS (sélections perso de la projection de gains) et les
// groupes PARTAGÉS de l'éditeur — dont les rotations, qu'on ne monterait pas
// en éditant les dix quêtes une par une.
// Défauts DÉFINIS AU NIVEAU MODULE, pas dans la signature : un défaut inline
// serait une fonction neuve à chaque rendu, donc une dépendance d'effet
// toujours différente — et la liste se rechargerait en boucle.
const CHARGER_GROUPE_PRIVE = (id) => api.quests.myGroups.questIds(id);
const ENREGISTRER_GROUPE_PRIVE = (id, ids) => api.quests.myGroups.setQuests(id, ids);

export function QuestPicker({
  group, onClose, onSaved,
  load = CHARGER_GROUPE_PRIVE,
  save: enregistrer = ENREGISTRER_GROUPE_PRIVE,
}) {
  const [quests, setQuests] = useState(null);
  const [checked, setChecked] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.quests.list(), load(group.id)])
      .then(([qs, m]) => {
        if (!alive) return;
        setQuests(qs);
        setChecked(new Set(m.questIds));
      })
      .catch((e) => { if (alive) setErr(e.message || 'Erreur'); });
    return () => { alive = false; };
  }, [group.id, load]);

  const toggle = (id) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      await enregistrer(group.id, [...checked]);
      onSaved();
    } catch (e) { setErr(e.message || 'Enregistrement impossible'); setSaving(false); }
  };

  const byOcc = useMemo(() => {
    const m = new Map();
    for (const q of quests || []) {
      if (!m.has(q.occurrenceType)) m.set(q.occurrenceType, []);
      m.get(q.occurrenceType).push(q);
    }
    return m;
  }, [quests]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(4,2,12,0.75)',
        backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div style={{
        ...panel, padding: 18, width: 'min(560px, 100%)', maxHeight: '82vh',
        display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3 style={{ margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 800, color: INK }}>
            📋 Quêtes de « {group.nom} »
          </h3>
          <span style={{ fontSize: 12, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
            {checked.size} sélectionnée{checked.size > 1 ? 's' : ''}
          </span>
          <button type="button" onClick={onClose} style={{
            marginLeft: 'auto', background: 'none', border: 'none', color: MUTED,
            fontSize: 18, cursor: 'pointer', padding: 4,
          }}>×</button>
        </div>

        {err && <p style={{ margin: 0, color: '#ff8a9b', fontSize: 12.5, fontFamily: "'Inter',sans-serif" }}>{err}</p>}

        <div style={{ overflowY: 'auto', display: 'grid', gap: 12, paddingRight: 4 }}>
          {!quests ? (
            <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>Chargement…</p>
          ) : (
            ['journaliere', 'hebdomadaire', 'mensuelle', 'simple'].map((occKey) => {
              const list = byOcc.get(occKey) || [];
              if (list.length === 0) return null;
              const occ = OCCURRENCES[occKey]; // eslint-disable-line security/detect-object-injection
              return (
                <div key={occKey}>
                  <div style={{
                    fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px',
                    color: occ.color, fontWeight: 700, marginBottom: 6, fontFamily: "'Inter',sans-serif",
                  }}>
                    {occ.icon} {occ.label}
                  </div>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {list.map((q) => (
                      <label key={q.id} style={{
                        display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px',
                        borderRadius: 8, cursor: 'pointer',
                        background: checked.has(q.id) ? 'rgba(201,168,232,0.1)' : 'rgba(20,14,38,0.45)',
                        border: `1px solid ${checked.has(q.id) ? 'rgba(201,168,232,0.45)' : 'rgba(80,50,130,0.22)'}`,
                        fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
                      }}>
                        <input type="checkbox" checked={checked.has(q.id)} onChange={() => toggle(q.id)}
                          style={{ accentColor: '#c9a8e8' }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.titre}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <MiniBtn onClick={onClose}>Annuler</MiniBtn>
          <button type="button" onClick={save} disabled={saving || !quests} style={{
            padding: '8px 16px', borderRadius: 9, cursor: 'pointer', border: 'none',
            background: ACC, color: '#08051a', fontFamily: "'Space Grotesk',sans-serif",
            fontSize: 13, fontWeight: 700,
          }}>
            {saving ? 'Enregistrement…' : 'Enregistrer la sélection'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScopeChip({ children, active, color, onClick }) {
  const rgb = hexToRgb(color || '#c9a8e8');
  return (
    <button type="button" onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
      fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: active ? 700 : 500,
      background: active ? `rgba(${rgb},0.16)` : 'transparent',
      color: active ? color : MUTED,
      border: `1px solid ${active ? color : 'rgba(80,50,130,0.35)'}`,
    }}>{children}</button>
  );
}

function MiniBtn({ children, onClick, color = '#ede8f8', type = 'button' }) {
  return (
    <button type={type} onClick={onClick} style={{
      padding: '6px 11px', borderRadius: 8, cursor: 'pointer',
      background: 'rgba(20,14,38,0.7)', border: '1px solid rgba(80,50,130,0.35)',
      color, fontFamily: "'Inter',sans-serif", fontSize: 12.5, fontWeight: 600,
    }}>{children}</button>
  );
}
