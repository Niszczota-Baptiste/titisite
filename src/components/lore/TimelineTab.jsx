import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { formatCoords } from './coords';
import {
  ACC, ENTRY_TYPES, INK, MUTED, STATUSES, formatDay, hexToRgb, panel,
} from './theme';

// Timeline de l'enquête : les entrées par date de découverte, avec les
// résolutions d'hypothèses intercalées — pour retracer la progression. Une
// entrée sans date de découverte est calée sur sa date d'ajout, signalée « ≈ ».

export function TimelineTab({ entries, onOpenEntry, onOpenHypothesis, refreshKey = 0 }) {
  const [hypotheses, setHypotheses] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    api.lore.hypotheses.list()
      .then((h) => { if (alive) setHypotheses(h); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [refreshKey]);

  if (hypotheses === null) {
    return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>{err || 'Chargement…'}</p>;
  }

  const items = [
    ...entries.map((e) => ({
      kind: 'entry', date: e.discoveredAt ?? e.createdAt, dated: !!e.discoveredAt, e,
    })),
    ...hypotheses.filter((h) => h.resolvedAt).map((h) => ({
      kind: 'resolution', date: h.resolvedAt, h,
    })),
  ].sort((a, b) => a.date - b.date || (a.kind === 'entry' ? -1 : 1));

  if (items.length === 0) {
    return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif", fontSize: 13 }}>Rien à raconter encore.</p>;
  }

  let lastDay = null;
  return (
    <div style={{ maxWidth: 780, margin: '0 auto', fontFamily: "'Inter',sans-serif" }}>
      {items.map((it, i) => {
        const day = formatDay(it.date);
        const showDay = day !== lastDay;
        lastDay = day;
        return (
          <div key={i} style={{ display: 'flex', gap: 14 }}>
            {/* colonne date + fil */}
            <div style={{ width: 92, textAlign: 'right', flexShrink: 0, position: 'relative' }}>
              {showDay && (
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: ACC, paddingTop: 13 }}>
                  {day}
                </div>
              )}
            </div>
            <div style={{ position: 'relative', width: 20, flexShrink: 0 }}>
              <div style={{ position: 'absolute', left: 9, top: 0, bottom: 0, width: 2, background: 'rgba(60,130,90,0.25)' }} />
              <Dot item={it} />
            </div>
            <div style={{ flex: 1, paddingBottom: 12, minWidth: 0 }}>
              {it.kind === 'entry' ? (
                <EntryItem item={it} onOpenEntry={onOpenEntry} />
              ) : (
                <ResolutionItem h={it.h} onOpenHypothesis={onOpenHypothesis} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Dot({ item }) {
  const color = item.kind === 'entry'
    ? (ENTRY_TYPES[item.e.entryType] || ENTRY_TYPES.observation).color
    : (STATUSES[item.h.status] || STATUSES.open).color;
  return (
    <span style={{
      position: 'absolute', left: 4, top: 15, width: 12, height: 12, borderRadius: '50%',
      background: 'rgba(8,14,10,0.95)', border: `2.5px solid ${color}`, boxSizing: 'border-box',
    }} />
  );
}

function EntryItem({ item, onOpenEntry }) {
  const { e, dated } = item;
  const t = ENTRY_TYPES[e.entryType] || ENTRY_TYPES.observation;
  const hasCoords = e.x !== null && e.z !== null;
  return (
    <button type="button" onClick={() => onOpenEntry(e.id)} style={{
      ...panel, display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      padding: '9px 12px', color: INK,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span>{t.icon}</span>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13.5 }}>{e.title}</span>
        <span style={{ fontSize: 11, color: t.color }}>{t.label}</span>
        {!dated && (
          <span title="Pas de date de découverte — calée sur la date d'ajout"
            style={{ fontSize: 10.5, color: MUTED }}>≈ ajout</span>
        )}
        {hasCoords && (
          <span style={{ marginLeft: 'auto', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, color: MUTED }}>
            {formatCoords(e)}
          </span>
        )}
      </div>
    </button>
  );
}

function ResolutionItem({ h, onOpenHypothesis }) {
  const meta = STATUSES[h.status] || STATUSES.open;
  return (
    <button type="button" onClick={() => onOpenHypothesis(h.id)} style={{
      ...panel, borderColor: `rgba(${hexToRgb(meta.color)},0.4)`,
      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
      padding: '9px 12px', color: INK,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span>{meta.icon}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {meta.label}
        </span>
        <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13.5 }}>{h.title}</span>
      </div>
      {h.resolutionNote && (
        <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4 }}>{h.resolutionNote}</div>
      )}
    </button>
  );
}
