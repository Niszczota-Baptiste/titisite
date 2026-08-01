import { useMemo, useState } from 'react';
import { CodexItem } from '../../admin/editors/minecraft/CodexPicker';
import { Button } from '../../admin/ui';
import {
  ACC, ACC_RGB, GOLD, INK, ITEM_CATEGORIES, ITEM_CATEGORY_ORDER, MUTED, hexToRgb, panel,
} from '../theme';
import { formatPrix } from './loot';

// Le catalogue : toutes les façons de retrouver un objet quand on ne se
// souvient que d'un bout — son nom, sa couleur de rareté, sa catégorie, ou le
// fait qu'on n'a encore documenté aucune source pour lui.

const normalise = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const FLAGS = [
  { key: 'ouvrable', label: '🔓 Ouvrables', test: (i) => i.estOuvrable },
  { key: 'monnaie', label: '🪙 Monnaies', test: (i) => i.categorie === 'monnaie' },
  { key: 'orphelins', label: '❓ Sans source connue', test: (i) => (i.counts?.sources || 0) === 0 },
];

export function ItemsCatalog({
  items, rarities, factions, byId, canEdit, onOpen, onCreate, onEditRarities,
}) {
  const [q, setQ] = useState('');
  const [rarete, setRarete] = useState('');
  const [categorie, setCategorie] = useState('');
  const [faction, setFaction] = useState('');
  const [flags, setFlags] = useState([]);
  const [dense, setDense] = useState(false);

  const toggleFlag = (k) => setFlags((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const shown = useMemo(() => {
    const tokens = normalise(q).split(/\s+/).filter(Boolean);
    return items.filter((i) => {
      if (rarete && String(i.rareteId ?? '') !== String(rarete)) return false;
      if (categorie && i.categorie !== categorie) return false;
      if (faction && String(i.factionId ?? '') !== String(faction)) return false;
      for (const k of flags) {
        const f = FLAGS.find((x) => x.key === k);
        if (f && !f.test(i)) return false;
      }
      if (tokens.length === 0) return true;
      // Recherche sur nom + lore + tags (et le nom de l'item support, pratique
      // quand on ne se rappelle que « la géode en chorus »).
      const foin = normalise([i.nom, i.lore, (i.tags || []).join(' '), i.baseNom, i.baseItemId].join(' '));
      return tokens.every((t) => foin.includes(t));
    });
  }, [items, q, rarete, categorie, faction, flags]);

  // Tri : rareté décroissante puis nom — les objets remarquables en tête.
  const triees = useMemo(() => [...shown].sort((a, b) => {
    const ra = a.rarete?.ordre ?? 0;
    const rb = b.rarete?.ordre ?? 0;
    if (ra !== rb) return rb - ra;
    return a.nom.localeCompare(b.nom, 'fr');
  }), [shown]);

  return (
    <div>
      <p style={{
        fontFamily: "'Inter',sans-serif", fontSize: 13, color: MUTED, margin: '0 0 12px',
        lineHeight: 1.55, maxWidth: 760,
      }}>
        Le catalogue des objets du serveur : géodes, monnaies, équipement renommé… Chaque fiche
        montre <strong style={{ color: 'rgba(214,206,232,0.9)' }}>toutes les façons de l'obtenir</strong>,
        calculées à partir des quêtes, des tables de butin et des offres — plus ce à quoi il sert.
      </p>

      {/* filtres */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (nom, lore, tag…)" aria-label="Rechercher un item"
          style={{
            background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.3)',
            borderRadius: 8, padding: '8px 12px', color: INK, fontFamily: "'Inter',sans-serif",
            fontSize: 13, outline: 'none', minWidth: 200, flex: '1 1 200px', maxWidth: 320,
          }}
        />
        <Select value={rarete} onChange={setRarete} ariaLabel="Filtrer par rareté">
          <option value="">Toutes raretés</option>
          {rarities.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
        </Select>
        <Select value={categorie} onChange={setCategorie} ariaLabel="Filtrer par catégorie">
          <option value="">Toutes catégories</option>
          {ITEM_CATEGORY_ORDER.map((k) => (
            <option key={k} value={k}>{ITEM_CATEGORIES[k].label}</option>
          ))}
        </Select>
        {factions.length > 0 && (
          <Select value={faction} onChange={setFaction} ariaLabel="Filtrer par faction">
            <option value="">Toutes factions</option>
            {factions.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </Select>
        )}
        {FLAGS.map((f) => {
          const on = flags.includes(f.key);
          return (
            <button
              key={f.key} type="button" onClick={() => toggleFlag(f.key)}
              style={{
                padding: '7px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5,
                fontFamily: "'Inter',sans-serif", fontWeight: 600,
                background: on ? ACC : 'transparent', color: on ? '#08051a' : MUTED,
                border: on ? 'none' : '1px solid rgba(80,50,130,0.3)',
              }}
            >{f.label}</button>
          );
        })}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <Button variant="ghost" onClick={() => setDense((d) => !d)}>
            {dense ? '▦ Grille' : '☰ Liste'}
          </Button>
          {canEdit && <Button variant="ghost" onClick={onEditRarities}>Raretés</Button>}
          {canEdit && <Button onClick={onCreate}>+ Item unique</Button>}
        </div>
      </div>

      <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: MUTED, marginBottom: 10 }}>
        {triees.length} objet{triees.length > 1 ? 's' : ''}
        {triees.length !== items.length && ` sur ${items.length}`}
        {flags.includes('orphelins') && triees.length > 0 && ' — autant de trous à documenter.'}
      </div>

      {triees.length === 0 ? (
        <p style={{ ...panel, padding: 24, textAlign: 'center', color: MUTED, fontFamily: "'Inter',sans-serif" }}>
          {items.length === 0
            ? `Aucun item unique pour l'instant.${canEdit ? ' Clique « + Item unique » pour créer le premier.' : ''}`
            : 'Aucun objet ne correspond à ces filtres.'}
        </p>
      ) : dense ? (
        <DenseList items={triees} byId={byId} onOpen={onOpen} />
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12,
        }}>
          {triees.map((i) => <ItemCard key={i.id} item={i} byId={byId} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

function ItemCard({ item, byId, onOpen }) {
  const couleur = item.rarete?.couleur || ACC;
  const rgb = hexToRgb(couleur);
  const cat = ITEM_CATEGORIES[item.categorie] || ITEM_CATEGORIES.autre;
  const sources = item.counts?.sources || 0;

  return (
    <button
      type="button" onClick={() => onOpen(item.id)}
      style={{
        ...panel, textAlign: 'left', cursor: 'pointer', padding: 13,
        borderLeft: `3px solid ${couleur}`, display: 'flex', flexDirection: 'column', gap: 8,
        minHeight: 118, transition: 'transform 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {item.baseItemId
          ? <CodexItem byId={byId} id={item.baseItemId} size={26} showName={false} />
          : <span style={{ fontSize: 22, lineHeight: 1 }}>📦</span>}
        <span style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 14.5, fontWeight: 700,
          color: couleur, lineHeight: 1.2, textShadow: `0 0 12px rgba(${rgb},0.25)`,
        }}>{item.nom}</span>
      </div>

      {item.lore && (
        <span style={{
          fontFamily: "'Inter',sans-serif", fontSize: 11.5, fontStyle: 'italic',
          color: '#a887d8', lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{item.lore}</span>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 'auto' }}>
        <span style={{ fontSize: 11, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
          {cat.icon} {cat.label}
        </span>
        {item.estOuvrable && (
          <span style={{ fontSize: 11, color: '#7be3a8', fontFamily: "'Inter',sans-serif" }}>
            🔓 {item.counts?.loot || 0} résultat{(item.counts?.loot || 0) > 1 ? 's' : ''}
          </span>
        )}
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontFamily: "'Inter',sans-serif",
          color: sources > 0 ? GOLD : 'rgba(255,138,155,0.8)',
        }}>
          {sources > 0 ? `${sources} source${sources > 1 ? 's' : ''}` : 'aucune source'}
        </span>
      </div>
    </button>
  );
}

function DenseList({ items, byId, onOpen }) {
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      {items.map((i) => {
        const couleur = i.rarete?.couleur || ACC;
        const cat = ITEM_CATEGORIES[i.categorie] || ITEM_CATEGORIES.autre;
        return (
          <button
            key={i.id} type="button" onClick={() => onOpen(i.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', width: '100%',
              background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.2)',
              borderLeft: `3px solid ${couleur}`, borderRadius: 7, cursor: 'pointer',
              textAlign: 'left', fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
            }}
          >
            {i.baseItemId
              ? <CodexItem byId={byId} id={i.baseItemId} size={18} showName={false} />
              : <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>📦</span>}
            <span style={{ color: couleur, fontWeight: 600, minWidth: 0, flex: '1 1 160px' }}>{i.nom}</span>
            <span style={{ color: MUTED, fontSize: 11.5, whiteSpace: 'nowrap' }}>{cat.label}</span>
            {i.rarete && (
              <span style={{ color: i.rarete.couleur, fontSize: 11, whiteSpace: 'nowrap' }}>{i.rarete.nom}</span>
            )}
            {i.estVendable && i.prixVente != null && (
              <span style={{ color: GOLD, fontSize: 11, whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono',monospace" }}>
                {formatPrix(i.prixVente, i.prixUnite, new Map(items.map((x) => [x.id, x])))}
              </span>
            )}
            <span style={{
              fontSize: 11, whiteSpace: 'nowrap', minWidth: 66, textAlign: 'right',
              color: (i.counts?.sources || 0) > 0 ? GOLD : 'rgba(255,138,155,0.8)',
            }}>{i.counts?.sources || 0} source{(i.counts?.sources || 0) > 1 ? 's' : ''}</span>
          </button>
        );
      })}
    </div>
  );
}

function Select({ value, onChange, children, ariaLabel }) {
  return (
    <select
      aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'rgba(14,8,32,0.72)', border: `1px solid rgba(${ACC_RGB},0.22)`,
        borderRadius: 8, padding: '8px 10px', color: INK, fontFamily: "'Inter',sans-serif",
        fontSize: 13, outline: 'none',
      }}
    >{children}</select>
  );
}
