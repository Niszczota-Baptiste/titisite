import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { CodexItem } from '../admin/editors/minecraft/CodexPicker';
import { QuestMap } from './QuestMap';
import {
  ACC, ACC_RGB, CRIMSON, GOLD, INK, MUTED, OCCURRENCES, PREREQ_KINDS, REWARD_KINDS,
  INPUT_KINDS, formatDate, fromNow, hexToRgb, panel,
} from './theme';

function Chip({ children, color = ACC, title }) {
  const rgb = hexToRgb(color);
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px',
      borderRadius: 999, fontSize: 11.5, fontFamily: "'Inter',sans-serif", fontWeight: 600,
      background: `rgba(${rgb},0.14)`, color, border: `1px solid rgba(${rgb},0.4)`,
    }}>{children}</span>
  );
}

// One input/reward line. Items show the codex icon; reputation shows the faction
// colour; everything else falls back to the kind emoji + label. Custom items
// (refCode 'custom:<id>', injectés dans byId par Quetes.jsx) affichent en plus
// leurs enchantements.
function Line({ line, kinds, byId, factions }) {
  const meta = kinds[line.kind] || {};
  const faction = line.factionId ? factions.get(line.factionId) : null;
  const qty = line.quantite != null ? line.quantite : null;
  const enchants = (line.kind === 'item' && line.refCode)
    ? (byId?.get(line.refCode)?.enchantements || [])
    : [];
  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
      background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)',
      borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
    }}>
      {line.kind === 'item' && line.refCode ? (
        <CodexItem byId={byId} id={line.refCode} size={22} showName={false} />
      ) : (
        <span style={{ fontSize: 17, width: 22, textAlign: 'center' }}>{meta.icon || '•'}</span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        {line.label || meta.label || line.kind}
        {faction && (
          <span style={{ color: faction.couleur, marginLeft: 6, fontWeight: 600 }}>· {faction.nom}</span>
        )}
        {enchants.length > 0 && (
          <span title={enchants.join(' · ')} style={{ color: GOLD, marginLeft: 6, fontSize: 11.5, fontWeight: 600 }}>
            ⚡ {enchants.join(' · ')}
          </span>
        )}
      </span>
      {qty != null && (
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, fontWeight: 700,
          color: line.kind === 'pa' ? GOLD : ACC,
        }}>×{qty}</span>
      )}
    </li>
  );
}

function Column({ title, children, accent = ACC }) {
  return (
    <div style={{ ...panel, padding: 14 }}>
      <h4 style={{
        margin: '0 0 10px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 13,
        letterSpacing: '0.5px', textTransform: 'uppercase', color: accent,
      }}>{title}</h4>
      {children}
    </div>
  );
}

export function QuestDetail({ quest, byId, factions, onComplete, onUncomplete, onOpenQuest, busy }) {
  const occ = OCCURRENCES[quest.occurrenceType] || OCCURRENCES.simple;
  const faction = quest.factionId ? factions.get(quest.factionId) : null;
  const done = quest.done;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* header */}
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <Chip color={occ.color}>{occ.icon} {occ.label}</Chip>
          {faction && <Chip color={faction.couleur} title="Faction d'origine">{faction.nom}</Chip>}
          {quest.chainNom && (
            <Chip color="#7bd3e8">⛓ {quest.chainNom}{quest.chainRank ? ` · étape ${quest.chainRank}` : ''}</Chip>
          )}
          {quest.nextResetAt && (
            <Chip color={GOLD} title={formatDate(quest.nextResetAt)}>↻ reset {fromNow(quest.nextResetAt)}</Chip>
          )}
          {quest.dueDate && (
            <Chip color={CRIMSON} title={formatDate(quest.dueDate)}>⏳ échéance {fromNow(quest.dueDate)}</Chip>
          )}
          {(quest.groups || []).map((g) => (
            <Chip key={g.id} color={g.couleur} title="Groupe">◈ {g.nom}</Chip>
          ))}
        </div>
        <h2 style={{
          margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 24, fontWeight: 800,
          color: INK, letterSpacing: '-0.3px',
        }}>{quest.titre}</h2>
        {quest.description && (
          <p style={{
            margin: '8px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 14, lineHeight: 1.6,
            color: 'rgba(214,206,232,0.9)', whiteSpace: 'pre-wrap',
          }}>{quest.description}</p>
        )}
      </div>

      {/* complete toggle */}
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={() => (done ? onUncomplete(quest) : onComplete(quest))}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            borderRadius: 10, cursor: busy ? 'wait' : 'pointer', fontWeight: 700, fontSize: 14,
            fontFamily: "'Space Grotesk',sans-serif",
            border: done ? '1px solid rgba(123,227,168,0.5)' : 'none',
            background: done ? 'rgba(123,227,168,0.14)' : ACC,
            color: done ? '#7be3a8' : '#08051a',
          }}
        >
          {done ? '✓ Complétée ' : 'Marquer comme complétée'}
          {done && quest.occurrenceType !== 'simple' && (
            <span style={{ fontWeight: 500, opacity: 0.8 }}>· cette période</span>
          )}
        </button>
        {done && <span style={{ marginLeft: 10, fontSize: 12, color: MUTED }}>Clique pour décocher.</span>}
      </div>

      {/* inputs / rewards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <Column title="Entrées" accent={CRIMSON}>
          {quest.inputs.length === 0 ? (
            <p style={{ ...zero }}>Aucune entrée.</p>
          ) : (
            <ul style={listStyle}>
              {quest.inputs.map((l) => <Line key={l.id} line={l} kinds={INPUT_KINDS} byId={byId} factions={factions} />)}
            </ul>
          )}
        </Column>
        <Column title="Récompenses" accent={GOLD}>
          {quest.rewards.length === 0 ? (
            <p style={{ ...zero }}>Aucune récompense.</p>
          ) : (
            <ul style={listStyle}>
              {quest.rewards.map((l) => (
                <Line key={l.id} line={l} kinds={REWARD_KINDS} byId={byId} factions={factions} />
              ))}
            </ul>
          )}
        </Column>
      </div>

      {/* où trouver les entrées dans les coffres des projets */}
      {quest.inputs.some((l) => l.kind === 'item') && <StockPanel questId={quest.id} />}

      {/* prerequisites */}
      {quest.prerequisites.length > 0 && (
        <Column title="Prérequis" accent="#7bd3e8">
          <ul style={listStyle}>
            {quest.prerequisites.map((p) => {
              const meta = PREREQ_KINDS[p.kind] || {};
              const faction2 = p.factionId ? factions.get(p.factionId) : null;
              return (
                <li key={p.id} style={{
                  display: 'flex', gap: 8, padding: '6px 10px', background: 'rgba(20,14,38,0.5)',
                  border: '1px solid rgba(80,50,130,0.22)', borderRadius: 8,
                  fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
                }}>
                  <span style={{ color: '#7bd3e8', fontWeight: 600, whiteSpace: 'nowrap' }}>{meta.label || p.kind}</span>
                  <span style={{ color: 'rgba(214,206,232,0.85)' }}>
                    {p.label}
                    {faction2 && <span style={{ color: faction2.couleur }}> · {faction2.nom}</span>}
                    {p.valeur != null && <span style={{ color: MUTED }}> (≥ {p.valeur})</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </Column>
      )}

      {/* map */}
      {quest.mapPoints.length > 0 && (
        <Column title="Points de carte">
          <QuestMap points={quest.mapPoints} />
        </Column>
      )}

      {/* chain navigation */}
      {(quest.prevQuests.length > 0 || quest.nextQuests.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <NavList title="Débloquée par" items={quest.prevQuests} onOpenQuest={onOpenQuest} />
          <NavList title="Débloque" items={quest.nextQuests} onOpenQuest={onOpenQuest} />
        </div>
      )}

      {/* my history */}
      {quest.history && quest.history.length > 0 && (
        <Column title="Mon historique">
          <ul style={{ ...listStyle, maxHeight: 160, overflowY: 'auto' }}>
            {quest.history.map((h) => (
              <li key={h.id} style={{
                display: 'flex', justifyContent: 'space-between', padding: '5px 10px',
                background: 'rgba(20,14,38,0.4)', borderRadius: 7,
                fontFamily: "'Inter',sans-serif", fontSize: 12, color: 'rgba(214,206,232,0.85)',
              }}>
                <span>{formatDate(h.completedAt)}</span>
                <span style={{ color: MUTED, fontFamily: "'JetBrains Mono',monospace" }}>{h.periodKey}</span>
              </li>
            ))}
          </ul>
        </Column>
      )}
    </div>
  );
}

// « Où trouver » : pour chaque entrée `item` de la quête, les lignes d'inventaire
// Minecraft correspondantes dans les projets accessibles (coffre + monde +
// coordonnées + quantités), via GET /quests/:id/stock. Rapproché par nom
// normalisé (label de l'entrée et/ou nom codex du ref_code) côté serveur.
function StockPanel({ questId }) {
  const [stock, setStock] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setStock(null); setErr(null);
    api.quests.stock(questId)
      .then((s) => { if (alive) setStock(s); })
      .catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [questId]);

  if (err) return null; // discret : la fiche reste lisible sans le stock
  const inputs = stock?.inputs || [];

  return (
    <Column title="📦 Où trouver dans les coffres" accent="#7be3a8">
      {!stock ? (
        <p style={zero}>Recherche dans les projets…</p>
      ) : inputs.length === 0 ? (
        <p style={zero}>Aucune entrée de type item.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {inputs.map((input) => {
            const enough = input.needed != null && input.totalHave >= input.needed;
            return (
              <div key={input.inputId} style={{
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
                }}>
                  <span style={{ fontWeight: 600 }}>{input.label || input.refCode}</span>
                  <span style={{
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700,
                    color: enough ? '#7be3a8' : (input.totalHave > 0 ? GOLD : MUTED),
                  }}>
                    {input.totalHave}{input.needed != null ? ` / ${input.needed}` : ''}
                  </span>
                  {enough && (
                    <span style={{
                      padding: '1px 7px', borderRadius: 10, fontSize: 10.5,
                      background: 'rgba(123,227,168,0.12)', border: '1px solid rgba(123,227,168,0.45)',
                      color: '#7be3a8',
                    }}>✅ en stock</span>
                  )}
                </div>
                {input.locations.length === 0 ? (
                  <p style={{ ...zero, marginTop: 5 }}>Introuvable dans les coffres des projets.</p>
                ) : (
                  <ul style={{ ...listStyle, marginTop: 7 }}>
                    {input.locations.map((loc, i) => (
                      <li key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                        padding: '5px 9px', borderRadius: 7,
                        background: 'rgba(14,9,28,0.5)',
                        fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(214,206,232,0.9)',
                      }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                          color: '#7be3a8', minWidth: 38, textAlign: 'right',
                        }}>×{loc.quantity}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {loc.chest ? (
                            <>🧰 {loc.chest.name}
                              {loc.chest.world && <span style={{ color: MUTED }}> · {loc.chest.world}</span>}
                              {(loc.chest.x != null || loc.chest.z != null) && (
                                <span style={{ color: MUTED, fontFamily: 'monospace', fontSize: 11.5 }}>
                                  {' '}⛏ {loc.chest.x ?? '?'} {loc.chest.y ?? '?'} {loc.chest.z ?? '?'}
                                </span>
                              )}
                            </>
                          ) : '📦 Non rangé'}
                        </span>
                        <a
                          href={`/project/${loc.workspaceSlug}/minecraft`}
                          style={{
                            color: ACC, textDecoration: 'none', fontSize: 11.5, flexShrink: 0,
                            border: `1px solid rgba(${ACC_RGB},0.35)`, borderRadius: 8, padding: '2px 8px',
                          }}
                        >📁 {loc.workspaceName}</a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Column>
  );
}

function NavList({ title, items, onOpenQuest }) {
  if (items.length === 0) return <div />;
  return (
    <Column title={title} accent="#b79bff">
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((q) => (
          <button
            key={q.id}
            type="button"
            onClick={() => onOpenQuest?.(q.id)}
            style={{
              textAlign: 'left', cursor: 'pointer', padding: '6px 10px', borderRadius: 7,
              background: `rgba(${ACC_RGB},0.08)`, border: `1px solid rgba(${ACC_RGB},0.25)`,
              color: INK, fontFamily: "'Inter',sans-serif", fontSize: 13,
            }}
          >
            {(OCCURRENCES[q.occurrenceType] || OCCURRENCES.simple).icon} {q.titre}
          </button>
        ))}
      </div>
    </Column>
  );
}

const listStyle = { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 };
const zero = { margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: MUTED };
