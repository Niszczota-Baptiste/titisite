import { useMemo } from 'react';
import { RotationsPanel } from './Rotations';
import {
  ACC, ACC_RGB, GOLD, INK, MUTED, OCCURRENCES, OCCURRENCE_ORDER, QUEST_CATEGORIES,
  QUEST_CATEGORY_ORDER, fromNow, hexToRgb, panel,
} from './theme';

const STATUS = [
  { key: 'all',       label: 'Toutes' },
  { key: 'todo',      label: 'À faire' },
  { key: 'done',      label: 'Faites' },
  { key: 'available', label: 'Dispo (récurrentes)' },
  { key: 'proposees', label: '🎲 Proposées' },
];

// Une quête de rotation n'est réellement proposée que si elle est le tirage de
// la période. Tant que personne ne l'a relevé (`duJour === null`), on ne sait
// pas : on la garde plutôt que de la cacher à tort.
const nonProposee = (q) => (q.rotations || []).some((r) => r.duJour === false);

function Select({ value, onChange, children, ariaLabel }) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.3)',
        borderRadius: 8, padding: '8px 10px', color: INK, fontFamily: "'Inter',sans-serif",
        fontSize: 13, outline: 'none',
      }}
    >{children}</select>
  );
}

export function QuestList({
  quests, factions, chains, groups = [], rotations = [], filters, setFilters,
  onOpen, onRotationChanged,
}) {
  const factionList = useMemo(() => [...factions.values()], [factions]);

  const shown = useMemo(() => {
    let out = quests;
    if (filters.status === 'todo') out = out.filter((q) => !q.done);
    else if (filters.status === 'done') out = out.filter((q) => q.done);
    else if (filters.status === 'available') out = out.filter((q) => !q.done && q.occurrenceType !== 'simple');
    // « Proposées » : ce qu'on peut réellement aller faire maintenant — dix
    // livraisons déclarées mais une seule tirée ne font pas dix quêtes du jour.
    else if (filters.status === 'proposees') out = out.filter((q) => !q.done && !nonProposee(q));
    return out;
  }, [quests, filters.status]);

  // Regroupement par famille, dans l'ordre de référence.
  const sections = useMemo(() => {
    const par = new Map();
    for (const q of shown) {
      const cle = QUEST_CATEGORIES[q.categorie] ? q.categorie : 'recolte';
      if (!par.has(cle)) par.set(cle, []);
      par.get(cle).push(q);
    }
    return QUEST_CATEGORY_ORDER.filter((c) => par.has(c)).map((c) => [c, par.get(c)]);
  }, [shown]);

  return (
    <div>
      <RotationsPanel rotations={rotations} onChanged={onRotationChanged} />

      {/* facets */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <Select ariaLabel="Filtrer par faction" value={filters.faction || ''} onChange={(v) => setFilters((f) => ({ ...f, faction: v }))}>
          <option value="">Toutes les factions</option>
          {factionList.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
        </Select>
        <Select ariaLabel="Filtrer par occurrence" value={filters.occurrence || ''} onChange={(v) => setFilters((f) => ({ ...f, occurrence: v }))}>
          <option value="">Toutes occurrences</option>
          {OCCURRENCE_ORDER.map((o) => <option key={o} value={o}>{OCCURRENCES[o].label}</option>)}
        </Select>
        <Select ariaLabel="Filtrer par famille" value={filters.categorie || ''} onChange={(v) => setFilters((f) => ({ ...f, categorie: v }))}>
          <option value="">Toutes familles</option>
          {QUEST_CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{QUEST_CATEGORIES[c].icon} {QUEST_CATEGORIES[c].label}</option>
          ))}
        </Select>
        <Select ariaLabel="Filtrer par chaîne" value={filters.chain || ''} onChange={(v) => setFilters((f) => ({ ...f, chain: v }))}>
          <option value="">Toutes les chaînes</option>
          {chains.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </Select>
        {groups.length > 0 && (
          <Select ariaLabel="Filtrer par groupe" value={filters.group || ''} onChange={(v) => setFilters((f) => ({ ...f, group: v }))}>
            <option value="">Tous les groupes</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.nom}</option>)}
          </Select>
        )}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {STATUS.map((s) => {
            const on = (filters.status || 'all') === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setFilters((f) => ({ ...f, status: s.key }))}
                style={{
                  padding: '7px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5,
                  fontFamily: "'Inter',sans-serif", fontWeight: 600,
                  background: on ? ACC : 'transparent', color: on ? '#08051a' : MUTED,
                  border: on ? 'none' : '1px solid rgba(80,50,130,0.3)',
                }}
              >{s.label}</button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p style={{ ...panel, padding: 24, textAlign: 'center', color: MUTED, fontFamily: "'Inter',sans-serif" }}>
          Aucune quête ne correspond à ces filtres.
        </p>
      ) : sections.length > 1 ? (
        // Plusieurs familles présentes : on les sépare, sinon la liste mélange
        // récoltes, crafts et achats sans qu'on voie ce qui est quoi.
        sections.map(([cle, liste]) => {
          const meta = QUEST_CATEGORIES[cle] || QUEST_CATEGORIES.autre;
          return (
            <div key={cle} style={{ marginBottom: 22 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
                fontFamily: "'Space Grotesk',sans-serif", fontSize: 13, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '1px', color: meta.color,
              }}>
                <span>{meta.icon} {meta.label}</span>
                <span style={{ color: MUTED, fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>
                  {liste.length}
                </span>
                <span style={{ flex: 1, height: 1, background: `rgba(${hexToRgb(meta.color)},0.25)` }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {liste.map((q) => <QuestCard key={q.id} q={q} factions={factions} onOpen={onOpen} />)}
              </div>
            </div>
          );
        })
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {shown.map((q) => <QuestCard key={q.id} q={q} factions={factions} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

function QuestCard({ q, factions, onOpen }) {
  const occ = OCCURRENCES[q.occurrenceType] || OCCURRENCES.simple;
  const faction = q.factionId ? factions.get(q.factionId) : null;
  // Rotation : la carte dit si c'est le tirage de la période. Une quête écartée
  // s'estompe au lieu de disparaître — elle reste consultable, elle n'est
  // simplement pas au menu du jour.
  const rotation = (q.rotations || [])[0] || null;
  const ecartee = rotation?.duJour === false;
  return (
    <button
      type="button"
      onClick={() => onOpen(q.id)}
      style={{
        ...panel, textAlign: 'left', cursor: 'pointer', padding: 14, position: 'relative',
        borderLeft: `3px solid ${faction ? faction.couleur : occ.color}`,
        display: 'flex', flexDirection: 'column', gap: 8, minHeight: 96,
        transition: 'border-color 0.15s, transform 0.15s',
        opacity: ecartee ? 0.5 : 1,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, color: occ.color, whiteSpace: 'nowrap',
          fontFamily: "'JetBrains Mono',monospace",
        }}>{occ.icon} {occ.short}</span>
        {rotation && (
          <span
            title={rotation.duJour === true ? 'Tirage de la période'
              : rotation.duJour === false ? "Ce n'est pas le tirage de la période"
                : 'Tirage de la période pas encore relevé'}
            style={{
              fontSize: 10, fontWeight: 700, borderRadius: 999, padding: '1px 8px',
              fontFamily: "'Inter',sans-serif", whiteSpace: 'nowrap',
              color: rotation.duJour === true ? '#7be3a8' : rotation.duJour === false ? MUTED : GOLD,
              border: `1px solid rgba(${hexToRgb(rotation.duJour === true ? '#7be3a8' : rotation.duJour === false ? '#b4aac8' : GOLD)},0.4)`,
            }}
          >
            🎲 {rotation.duJour === true ? 'du jour' : rotation.duJour === false ? 'pas tirée' : 'rotation'}
          </span>
        )}
        {q.done && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: '#7be3a8',
            background: 'rgba(123,227,168,0.14)', border: '1px solid rgba(123,227,168,0.4)',
            borderRadius: 999, padding: '1px 8px',
          }}>✓ Faite</span>
        )}
      </div>
      <div style={{
        fontFamily: "'Space Grotesk',sans-serif", fontSize: 15.5, fontWeight: 700, color: INK,
        lineHeight: 1.25,
      }}>{q.titre}</div>
      {q.groups && q.groups.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {q.groups.map((g) => (
            <span key={g.id} style={{
              fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
              color: g.couleur, background: `rgba(${hexToRgb(g.couleur)},0.14)`,
              border: `1px solid rgba(${hexToRgb(g.couleur)},0.4)`, fontFamily: "'Inter',sans-serif",
            }}>{g.nom}</span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto', alignItems: 'center' }}>
        {faction && (
          <span style={{
            fontSize: 11, color: faction.couleur, fontFamily: "'Inter',sans-serif", fontWeight: 600,
          }}>{faction.nom}</span>
        )}
        {q.chainNom && (
          <span style={{ fontSize: 11, color: '#7bd3e8', fontFamily: "'Inter',sans-serif" }}>
            ⛓ {q.chainNom}{q.chainRank ? ` ${q.chainRank}` : ''}
          </span>
        )}
        {q.nextResetAt && !q.done && (
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: GOLD, fontFamily: "'Inter',sans-serif" }}>
            ↻ {fromNow(q.nextResetAt)}
          </span>
        )}
      </div>
    </button>
  );
}
