import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { CodexItem } from '../admin/editors/minecraft/CodexPicker';
import { CraftPanel, OffersPanel } from './CraftOffers';
import { QuestMap } from './QuestMap';
import {
  ACC, ACC_RGB, CRIMSON, GOLD, INK, MUTED, OCCURRENCES, PREREQ_KINDS, PROBA_SOURCES,
  QUEST_CATEGORIES, REWARD_KINDS, INPUT_KINDS, formatDate, fromNow, hexToRgb, panel,
} from './theme';
import { SommeBanner } from './items/LootTable';
import { esperance, sommeProbabilites } from './items/loot';

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
  // Une récompense aléatoire porte une fourchette (« 1 à 3 ») plutôt qu'une
  // quantité fixe, et sa probabilité s'affiche à droite.
  const fourchette = line.quantiteMin != null
    ? `${line.quantiteMin}${line.quantiteMax != null && line.quantiteMax !== line.quantiteMin ? `–${line.quantiteMax}` : ''}`
    : null;
  const qty = fourchette ?? (line.quantite != null ? line.quantite : null);
  const proba = line.probabilite != null ? line.probabilite : null;
  const src = proba != null ? (PROBA_SOURCES[line.probabiliteSource] || PROBA_SOURCES.estimee) : null;
  const custom = (line.kind === 'item' && line.refCode) ? byId?.get(line.refCode) : null;
  const enchants = custom?.enchantements || [];
  const stats = custom?.stats || [];
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
        {/* Nom affiché : label saisi, sinon nom codex/custom du ref_code —
            jamais le générique « Objet » quand l'item est identifiable. */}
        {line.label || (line.refCode && byId?.get(line.refCode)?.nomFr) || meta.label || line.kind}
        {faction && (
          <span style={{ color: faction.couleur, marginLeft: 6, fontWeight: 600 }}>· {faction.nom}</span>
        )}
        {enchants.length > 0 && (
          <span title={enchants.join(' · ')} style={{ color: GOLD, marginLeft: 6, fontSize: 11.5, fontWeight: 600 }}>
            ⚡ {enchants.join(' · ')}
          </span>
        )}
        {stats.length > 0 && (
          <span title={stats.join(' · ')} style={{ color: '#7bd3e8', marginLeft: 6, fontSize: 11.5, fontWeight: 600 }}>
            📊 {stats.join(' · ')}
          </span>
        )}
      </span>
      {qty != null && (
        <span style={{
          fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5, fontWeight: 700,
          color: line.kind === 'pa' ? GOLD : ACC,
        }}>×{qty}</span>
      )}
      {proba != null && (
        <span title={src.title} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '1px 8px', borderRadius: 999,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, fontWeight: 700,
          color: src.color, background: `rgba(${hexToRgb(src.color)},0.12)`,
          border: `1px solid rgba(${hexToRgb(src.color)},0.4)`, whiteSpace: 'nowrap',
        }}>{Math.round(proba * 10) / 10} %</span>
      )}
    </li>
  );
}

// Récompenses garanties d'un côté, tirage aléatoire de l'autre : mélanger les
// deux ferait lire « 3 géodes » là où on n'a que 8 % de chances d'en voir une.
function RewardLists({ rewards, byId, factions }) {
  const garanties = rewards.filter((l) => l.probabilite == null);
  const aleatoires = rewards
    .filter((l) => l.probabilite != null)
    .sort((a, b) => b.probabilite - a.probabilite);
  const somme = sommeProbabilites(aleatoires);
  // Gain moyen : mêmes règles que pour les géodes — une ligne sans prix connu
  // n'est pas comptée zéro, elle est simplement hors du total en PA.
  const enPa = aleatoires
    .filter((l) => l.kind === 'pa')
    .map((l) => ({
      resultatType: 'pa',
      probabilite: l.probabilite,
      quantiteMin: l.quantiteMin ?? l.quantite ?? 0,
      quantiteMax: l.quantiteMax ?? l.quantite ?? 0,
    }));
  const moyennePa = enPa.length > 0 ? esperance({ prixUnite: 'pa' }, enPa).valeur : 0;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {garanties.length > 0 && (
        <ul style={listStyle}>
          {garanties.map((l) => (
            <Line key={l.id} line={l} kinds={REWARD_KINDS} byId={byId} factions={factions} />
          ))}
        </ul>
      )}

      {aleatoires.length > 0 && (
        <div style={{ display: 'grid', gap: 6 }}>
          <span style={{
            fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '1px',
            color: '#7bd3e8', fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif",
          }}>🎲 Tirage aléatoire</span>
          <ul style={listStyle}>
            {aleatoires.map((l) => (
              <Line key={l.id} line={l} kinds={REWARD_KINDS} byId={byId} factions={factions} />
            ))}
          </ul>
          <SommeBanner somme={somme} manque={Math.max(0, 100 - somme)} />
          {/* « du tirage », pas « par complétion » : les lignes garanties
              listées au-dessus ne sont pas dans ce total. */}
          {moyennePa > 0 && (
            <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: MUTED }}>
              Gain moyen <strong style={{ color: 'rgba(214,206,232,0.9)' }}>du tirage</strong> :{' '}
              <strong style={{ color: GOLD }}>{Math.round(moyennePa * 10) / 10} PA</strong>
              {' '}— hors récompenses garanties et hors objets sans prix estimé.
            </span>
          )}
        </div>
      )}
    </div>
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
  const cat = QUEST_CATEGORIES[quest.categorie] || QUEST_CATEGORIES.recolte;
  const faction = quest.factionId ? factions.get(quest.factionId) : null;
  const done = quest.done;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* header */}
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <Chip color={occ.color}>{occ.icon} {occ.label}</Chip>
          {quest.categorie && quest.categorie !== 'recolte' && (
            <Chip color={cat.color} title="Famille de quête">{cat.icon} {cat.label}</Chip>
          )}
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

      {/* recette de craft : la mise en scène des entrées/récompenses ci-dessous */}
      {quest.categorie === 'craft' && (
        <Column title="⚒️ Recette" accent={GOLD}>
          <CraftPanel quest={quest} byId={byId} factions={factions} />
        </Column>
      )}

      {/* offres d'achat */}
      {(quest.categorie === 'achat' || (quest.offers || []).length > 0) && (
        <Column title="🪙 Offres" accent="#7bd3e8">
          <OffersPanel offers={quest.offers || []} byId={byId} />
        </Column>
      )}

      {/* inputs / rewards — masqués sur une quête d'achat sans ligne : son
          contenu vit dans les offres, deux colonnes vides n'apprennent rien. */}
      {!(quest.inputs.length === 0 && quest.rewards.length === 0 && (quest.offers || []).length > 0) && (
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
            <RewardLists rewards={quest.rewards} byId={byId} factions={factions} />
          )}
        </Column>
      </div>
      )}

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
