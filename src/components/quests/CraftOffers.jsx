import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../admin/ui';
import { CodexItem, CodexPicker } from '../admin/editors/minecraft/CodexPicker';
import { CraftGrid } from '../admin/editors/minecraft/CraftGrid';
import { QuestMap } from './QuestMap';
import { ACC, ACC_RGB, GOLD, INK, MUTED } from './theme';

// Rendu des deux familles de quêtes ajoutées au module : la recette d'une quête
// de craft, et les offres d'une quête d'achat. Les deux vivent dans la fiche de
// quête (QuestDetail).

// ── Craft ───────────────────────────────────────────────────────────────────
// Grille 3×3 quand la recette est « shaped », simple liste d'ingrédients sinon.
// Les ingrédients sont les ENTRÉES de la quête et le résultat sa RÉCOMPENSE :
// rien n'est dupliqué ici, on ne fait que les mettre en scène.

export function CraftPanel({ quest, byId, factions }) {
  const craft = quest.craft || {};
  const grid = (craft.grid || []).filter(Boolean);
  const ingredients = (quest.inputs || []).filter((l) => l.kind === 'item');
  const resultats = (quest.rewards || []).filter((l) => l.kind === 'item');
  const maitrise = craft.maitriseFactionId ? factions.get(craft.maitriseFactionId) : null;
  const palier = maitrise?.tiers?.find((t) => t.id === craft.maitriseTierId);
  const sansGrille = grid.length === 0 || craft.shapeless;

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {!sansGrille && (
        <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
          <CraftGrid grid={craft.grid} byId={byId} catalog={[]} cell={44} />
          {craft.station && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5,
              color: MUTED, fontFamily: "'Inter',sans-serif",
            }}>
              <CodexItem byId={byId} id={craft.station} size={16} showName={false} />
              {byId?.get(craft.station)?.nomFr || craft.station}
            </span>
          )}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 10 }}>
        {sansGrille && craft.station && (
          <span style={{ fontSize: 12, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
            Poste de craft : <strong style={{ color: INK }}>{byId?.get(craft.station)?.nomFr || craft.station}</strong>
            {craft.shapeless && ' · recette sans disposition'}
          </span>
        )}

        {/* Grille quand la recette a une disposition, liste d'ingrédients sinon
            — les redonner en liste sous la grille ferait doublon avec les
            colonnes Entrées / Récompenses juste en dessous. */}
        {sansGrille && (
          <>
            <Liste titre="Ingrédients" lignes={ingredients} byId={byId} accent={ACC} vide="Aucun ingrédient saisi." />
            <Liste titre="Donne" lignes={resultats} byId={byId} accent={GOLD} vide="Résultat non saisi." />
          </>
        )}

        {maitrise && (
          <span style={{ fontSize: 12, fontFamily: "'Inter',sans-serif", color: MUTED }}>
            Maîtrise requise :{' '}
            <strong style={{ color: maitrise.couleur }}>
              {maitrise.nom}{palier ? ` · ${palier.nomPalier}` : ''}
            </strong>
          </span>
        )}
      </div>
    </div>
  );
}

function Liste({ titre, lignes, byId, accent, vide }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '1px',
        color: accent, fontWeight: 700, marginBottom: 5,
      }}>{titre}</div>
      {lignes.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontFamily: "'Inter',sans-serif" }}>{vide}</p>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {lignes.map((l) => (
            <span key={l.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px',
              background: 'rgba(20,14,38,0.6)', border: '1px solid rgba(80,50,130,0.25)',
              borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: INK,
            }}>
              {l.refCode && <CodexItem byId={byId} id={l.refCode} size={18} showName={false} />}
              {l.label || byId?.get(l.refCode)?.nomFr || l.refCode}
              {l.quantite != null && (
                <strong style={{ fontFamily: "'JetBrains Mono',monospace", color: accent }}>×{l.quantite}</strong>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Achat ───────────────────────────────────────────────────────────────────
// Une offre se lit en UNE ligne : « 12 × Écaille du devin → Botte de célérité ».

export function OffersPanel({ offers = [], byId }) {
  if (offers.length === 0) {
    return <p style={{ margin: 0, fontSize: 12.5, color: MUTED, fontFamily: "'Inter',sans-serif" }}>Aucune offre saisie.</p>;
  }
  const points = offers
    .filter((o) => o.x != null || o.z != null)
    .map((o) => ({ label: o.vendeur || 'Marchand', role: 'pnj', x: o.x ?? 0, y: o.y ?? 0, z: o.z ?? 0 }));

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {offers.map((o) => (
        <div key={o.id} style={{
          padding: '9px 11px', borderRadius: 8, background: 'rgba(20,14,38,0.5)',
          border: '1px solid rgba(80,50,130,0.22)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Cote lignes={o.donne} byId={byId} couleur={ACC} />
            <span style={{ color: GOLD, fontSize: 16, lineHeight: 1 }}>→</span>
            <Cote lignes={o.recoit} byId={byId} couleur={GOLD} />
          </div>
          <div style={{
            marginTop: 5, display: 'flex', gap: 10, flexWrap: 'wrap',
            fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: MUTED,
          }}>
            {o.vendeur && <span>🧑‍🌾 {o.vendeur}</span>}
            {o.stock != null && <span>📦 stock {o.stock}</span>}
            {o.limite && <span>⏳ {o.limite}</span>}
            {(o.x != null || o.z != null) && (
              <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>
                ⛏ {o.x ?? '?'} {o.y ?? '?'} {o.z ?? '?'}
              </span>
            )}
            {o.note && <span>— {o.note}</span>}
          </div>
        </div>
      ))}
      {points.length > 0 && <QuestMap points={points} />}
    </div>
  );
}

function Cote({ lignes = [], byId, couleur }) {
  if (lignes.length === 0) return <span style={{ color: MUTED }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {lignes.map((l, i) => (
        <span key={l.id ?? i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
        }}>
          {i > 0 && <span style={{ color: MUTED }}>+</span>}
          <strong style={{ fontFamily: "'JetBrains Mono',monospace", color: couleur }}>{l.quantite ?? 1} ×</strong>
          {l.kind === 'item' && l.refCode && <CodexItem byId={byId} id={l.refCode} size={18} showName={false} />}
          {l.kind === 'pa' ? (l.label || 'PA') : (l.label || byId?.get(l.refCode)?.nomFr || l.refCode || '?')}
        </span>
      ))}
    </span>
  );
}

// ── Éditeur : recette ───────────────────────────────────────────────────────
// Les ingrédients/résultat restent édités dans les sections Entrées et
// Récompenses du formulaire de quête ; ici on règle la mise en scène. Le
// bouton de pré-remplissage interroge le vrai référentiel de recettes du
// serveur (/api/craft/recipe/:item) et propose sa grille + sa station.

export function CraftEditor({ craft, setCraft, resultRefCode, factions, byId, catalog, onPrefill }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const maitrise = craft.maitriseFactionId ? factions.find((f) => f.id === Number(craft.maitriseFactionId)) : null;

  const prefill = async () => {
    setBusy(true); setMsg(null);
    try {
      const cible = resultRefCode;
      if (!cible) { setMsg('Renseigne d\'abord la récompense (le résultat du craft).'); return; }
      // Un item unique n'a pas de recette serveur : on part de son item support.
      const r = await api.craft.recipe(cible);
      const recette = r.recipes?.[0];
      if (!recette) { setMsg('Aucune recette connue pour cet objet — saisis-la à la main.'); return; }
      setCraft({
        ...craft,
        grid: recette.grid || [],
        station: recette.station?.id || '',
        shapeless: !!recette.shapeless,
      });
      onPrefill?.(recette);
      setMsg(`Recette « ${recette.result?.name || cible} » chargée — ajuste-la si besoin.`);
    } catch (e) {
      setMsg(e.body?.error === 'unknown_item' ? 'Objet inconnu du référentiel.' : (e.body?.error || e.message));
    } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: GOLD,
          fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif",
        }}>⚒️ Recette</span>
        <Button type="button" variant="ghost" onClick={prefill} disabled={busy}
          style={{ padding: '4px 10px', fontSize: 12 }}>
          {busy ? '…' : 'Pré-remplir depuis le référentiel'}
        </Button>
        <span style={{ fontSize: 11.5, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
          les ingrédients se saisissent dans « Entrées », le résultat dans « Récompenses »
        </span>
      </div>
      {msg && (
        <p style={{
          margin: '0 0 8px', fontFamily: "'Inter',sans-serif", fontSize: 12,
          color: msg.startsWith('Recette') ? '#7be3a8' : GOLD,
        }}>{msg}</p>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
          <CraftGrid
            grid={craft.grid || []} byId={byId} catalog={catalog} editable
            onChange={(grid) => setCraft({ ...craft, grid })} cell={46}
          />
          <span style={{ fontSize: 11, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
            clic : poser · clic droit : vider
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 10 }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
          }}>
            <input type="checkbox" checked={!!craft.shapeless}
              onChange={(e) => setCraft({ ...craft, shapeless: e.target.checked })}
              style={{ accentColor: ACC, width: 15, height: 15 }} />
            Sans disposition (shapeless) — la grille n'est plus affichée
          </label>

          <div>
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 5, fontFamily: "'Inter',sans-serif" }}>
              Poste de craft
            </div>
            <div style={{ maxWidth: 280 }}>
              <StationPicker value={craft.station || ''} byId={byId} catalog={catalog}
                onChange={(id) => setCraft({ ...craft, station: id })} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 5, fontFamily: "'Inter',sans-serif" }}>
                Maîtrise requise
              </div>
              <select
                value={craft.maitriseFactionId || ''} aria-label="Maîtrise requise"
                onChange={(e) => setCraft({
                  ...craft,
                  maitriseFactionId: e.target.value ? Number(e.target.value) : null,
                  maitriseTierId: null,
                })}
                style={selectStyle}
              >
                <option value="">—</option>
                {factions.filter((f) => f.type === 'maitrise').map((f) => (
                  <option key={f.id} value={f.id}>{f.nom}</option>
                ))}
              </select>
            </div>
            {maitrise && (
              <div>
                <div style={{ fontSize: 11, color: MUTED, marginBottom: 5, fontFamily: "'Inter',sans-serif" }}>
                  Palier
                </div>
                <select
                  value={craft.maitriseTierId || ''} aria-label="Palier de maîtrise"
                  onChange={(e) => setCraft({ ...craft, maitriseTierId: e.target.value ? Number(e.target.value) : null })}
                  style={selectStyle}
                >
                  <option value="">—</option>
                  {(maitrise.tiers || []).map((t) => (
                    <option key={t.id} value={t.id}>{t.nomPalier}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Petit sélecteur de station : les postes de craft sont des items du codex.
function StationPicker({ value, byId, catalog, onChange }) {
  return <CodexPicker catalog={catalog} byId={byId} value={value} onChange={onChange} placeholder="Établi, forge…" />;
}

// ── Éditeur : offres ────────────────────────────────────────────────────────

export function OffersEditor({ offers, setOffers, byId, catalog, maps = [] }) {
  const setOffre = (i, patch) => setOffers((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: '#7bd3e8',
          fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif",
        }}>🪙 Offres</span>
        <Button type="button" variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }}
          onClick={() => setOffers((os) => [...os, { vendeur: '', donne: [], recoit: [] }])}>
          + Offre
        </Button>
        <span style={{ fontSize: 11.5, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
          un marchand peut proposer plusieurs échanges — payables en PA ou en items
        </span>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {offers.map((o, i) => (
          <div key={i} style={{
            background: 'rgba(20,14,38,0.5)', border: `1px solid rgba(${ACC_RGB},0.22)`,
            borderRadius: 9, padding: 11, display: 'grid', gap: 9,
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={o.vendeur || ''} placeholder="Vendeur / PNJ" aria-label="Vendeur"
                onChange={(e) => setOffre(i, { vendeur: e.target.value })}
                style={{ ...inputStyle, minWidth: 150, flex: 1 }} />
              <input type="number" min="0" value={o.stock ?? ''} placeholder="Stock" aria-label="Stock"
                onChange={(e) => setOffre(i, { stock: e.target.value })} style={{ ...inputStyle, width: 90 }} />
              <input value={o.limite || ''} placeholder="Limite (1 par semaine…)" aria-label="Limite"
                onChange={(e) => setOffre(i, { limite: e.target.value })} style={{ ...inputStyle, minWidth: 140, flex: 1 }} />
              <Button type="button" variant="danger" style={{ padding: '6px 8px' }}
                onClick={() => setOffers((os) => os.filter((_, j) => j !== i))}>×</Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              <OfferSide titre="On donne" couleur={ACC} lignes={o.donne || []} byId={byId} catalog={catalog}
                setLignes={(fn) => setOffre(i, { donne: fn(o.donne || []) })} />
              <OfferSide titre="On reçoit" couleur={GOLD} lignes={o.recoit || []} byId={byId} catalog={catalog}
                setLignes={(fn) => setOffre(i, { recoit: fn(o.recoit || []) })} />
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: MUTED, fontFamily: "'Inter',sans-serif" }}>Point de carte</span>
              <input type="number" value={o.x ?? ''} placeholder="X" aria-label="X"
                onChange={(e) => setOffre(i, { x: e.target.value })} style={{ ...inputStyle, width: 76 }} />
              <input type="number" value={o.y ?? ''} placeholder="Y" aria-label="Y"
                onChange={(e) => setOffre(i, { y: e.target.value })} style={{ ...inputStyle, width: 76 }} />
              <input type="number" value={o.z ?? ''} placeholder="Z" aria-label="Z"
                onChange={(e) => setOffre(i, { z: e.target.value })} style={{ ...inputStyle, width: 76 }} />
              {maps.length > 1 && (
                <select value={o.mapId ?? ''} aria-label="Carte" style={selectStyle}
                  onChange={(e) => setOffre(i, { mapId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Carte par défaut</option>
                  {maps.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
                </select>
              )}
              <input value={o.note || ''} placeholder="Note" aria-label="Note"
                onChange={(e) => setOffre(i, { note: e.target.value })} style={{ ...inputStyle, minWidth: 140, flex: 1 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function OfferSide({ titre, couleur, lignes, setLignes, byId, catalog }) {
  const set = (i, patch) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div>
      <div style={{
        fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '1px',
        color: couleur, fontWeight: 700, marginBottom: 5,
      }}>{titre}</div>
      <div style={{ display: 'grid', gap: 5 }}>
        {lignes.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={l.kind || 'item'} aria-label="Nature"
              onChange={(e) => set(i, { kind: e.target.value, refCode: null })}
              style={{ ...selectStyle, minWidth: 80 }}>
              <option value="item">Objet</option>
              <option value="pa">PA</option>
              <option value="autre">Autre</option>
            </select>
            {l.kind === 'item' ? (
              <div style={{ minWidth: 150, flex: 1 }}>
                <CodexPicker catalog={catalog} byId={byId} value={l.refCode || ''}
                  onChange={(id, entry) => set(i, { refCode: id, label: l.label || entry?.nomFr || '' })} />
              </div>
            ) : (
              <input value={l.label || ''} placeholder="Libellé" aria-label="Libellé"
                onChange={(e) => set(i, { label: e.target.value })} style={{ ...inputStyle, minWidth: 120, flex: 1 }} />
            )}
            <input type="number" min="1" value={l.quantite ?? 1} aria-label="Quantité"
              onChange={(e) => set(i, { quantite: e.target.value })} style={{ ...inputStyle, width: 70 }} />
            <Button type="button" variant="danger" style={{ padding: '5px 7px' }}
              onClick={() => setLignes((ls) => ls.filter((_, j) => j !== i))}>×</Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" style={{ marginTop: 5, padding: '4px 10px', fontSize: 12 }}
        onClick={() => setLignes((ls) => [...ls, { kind: 'item', quantite: 1, label: '' }])}>+ Ligne</Button>
    </div>
  );
}

const selectStyle = {
  background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8,
  padding: '9px 10px', color: INK, fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none',
};

const inputStyle = {
  background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.24)', borderRadius: 8,
  padding: '9px 10px', color: INK, fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none',
};
