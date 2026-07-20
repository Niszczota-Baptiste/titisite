import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useCodex } from '../../hooks/useCodex';
import { useIsMobile } from '../../hooks/useIsMobile';
import { CodexItem, CodexPicker } from '../admin/editors/minecraft/CodexPicker';
import { CraftGrid } from '../admin/editors/minecraft/CraftGrid';
import { Button, ErrorBanner, Field, card, muted } from './shared';
import { WORLDS } from './Minecraft';

const worldEmoji = (w) => WORLDS.find((x) => x.id === w)?.emoji ?? '🗺️';

// Calculateur de craft d'un projet, calculé CÔTÉ SERVEUR (les vraies recettes
// Minefield sont confidentielles — le client ne reçoit que le plan de la
// cible) : cible + quantité → arbre développé jusqu'aux matières premières,
// croisé avec l'inventaire des coffres. Produit une « liste de préparation »
// (quoi sortir de quel coffre + crafts intermédiaires, avec grille 3×3, badge
// de station et recettes alternatives au choix) et applique le craft
// (transaction) via api.ws(slug).minecraft.craftApply.
export function CraftCalculator({ items, chests, ws, slug, onApplied, toast }) {
  const { catalog, byId } = useCodex();
  const isMobile = useIsMobile(720);

  const [targetId, setTargetId] = useState('');
  const [qty, setQty] = useState(1);
  const [choices, setChoices] = useState({});
  const [plan, setPlan] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [resultChestId, setResultChestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const chestById = useMemo(() => new Map(chests.map((c) => [c.id, c])), [chests]);

  // Plan serveur, débouncé — recalculé quand la cible, la quantité, un choix
  // d'alternative ou l'inventaire (rechargé après un craft) changent.
  const seq = useRef(0);
  useEffect(() => {
    if (!targetId) { setPlan(null); return undefined; }
    const mySeq = ++seq.current;
    setPlanning(true);
    const t = setTimeout(() => {
      api.craft.plan({ item: targetId, qty: Math.max(1, qty), workspace: slug, choices })
        .then((p) => { if (seq.current === mySeq) { setPlan(p); setErr(''); } })
        .catch((e) => { if (seq.current === mySeq) { setPlan(null); setErr(e.message || 'Calcul impossible.'); } })
        .finally(() => { if (seq.current === mySeq) setPlanning(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [targetId, qty, choices, slug, items]);

  const pickTarget = (id) => { setTargetId(id); setChoices({}); };

  const canCraft = plan && plan.known && plan.missing.length === 0
    && (plan.steps.length > 0 || plan.consume.length > 0);

  // Manquant → liste wanted : l'objectif est possédé + manquant, pour que la
  // progression (possédé / voulu) de la wishlist parte de l'inventaire actuel.
  const [addingWanted, setAddingWanted] = useState(false);
  const addMissingToWanted = async () => {
    if (!plan || plan.missing.length === 0) return;
    setAddingWanted(true);
    try {
      const list = plan.missing.map((m) => ({ name: m.name, quantity: m.owned + m.count }));
      await ws.minecraft.wanted.bulk({
        items: list,
        note: `Pour craft : ${plan.target.name}`,
      });
      toast?.success?.(`${list.length} ressource${list.length > 1 ? 's' : ''} ajoutée${list.length > 1 ? 's' : ''} aux wanted`);
    } catch (e) { setErr(e.message || 'Ajout aux wanted impossible.'); }
    finally { setAddingWanted(false); }
  };

  const apply = async () => {
    if (!plan || !canCraft) return;
    setBusy(true); setErr('');
    const consume = [];
    for (const c of plan.consume) {
      for (const part of c.from) consume.push({ id: part.rowId, delta: -part.take });
    }
    const produce = [{
      name: plan.target.name,
      quantity: plan.target.qty,
      chestId: resultChestId === '' ? null : Number(resultChestId),
    }];
    try {
      const updated = await ws.minecraft.craftApply({ consume, produce });
      toast?.success?.('Craft appliqué : coffres mis à jour');
      onApplied?.(updated);
      setTargetId(''); setChoices({}); setPlan(null);
    } catch (e) { setErr(e.message || 'Application impossible.'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <ErrorBanner error={err} onDismiss={() => setErr('')} />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ flex: '2 1 240px', minWidth: 220 }}>
          <Field label="Objet à crafter">
            <CodexPicker catalog={catalog} byId={byId} value={targetId}
              onChange={pickTarget} autoFocus />
          </Field>
        </div>
        <div style={{ flex: '0 1 110px', minWidth: 90 }}>
          <Field label="Quantité">
            <input type="number" min={1} value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              style={inp} />
          </Field>
        </div>
      </div>

      {!targetId ? (
        <p style={{ ...muted, fontSize: 13 }}>
          Choisis un objet pour développer son arbre de craft, ou explore les recettes du serveur ci-dessous.
        </p>
      ) : planning && !plan ? (
        <p style={{ ...muted, fontSize: 13 }}>Calcul du plan…</p>
      ) : plan && !plan.known && plan.steps.length === 0 ? (
        <p style={{ ...muted, fontSize: 13 }}>
          Aucune recette connue pour « {plan.target.name} » — c'est une matière première
          (à récolter ou à sortir des coffres).
        </p>
      ) : plan && (
        <PlanView
          plan={plan} byId={byId} chestById={chestById} isMobile={isMobile}
          dim={planning} choices={choices} setChoices={setChoices}
          onAddMissing={addMissingToWanted} addingMissing={addingWanted}
        />
      )}

      {plan && plan.known && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 18 }}>
          <label style={{ ...muted, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            Ranger le résultat dans
            <select value={resultChestId} onChange={(e) => setResultChestId(e.target.value)} style={inp}>
              <option value="">Non rangé</option>
              {[...chestById.values()].map((c) => (
                <option key={c.id} value={c.id}>{worldEmoji(c.world)} {c.name}</option>
              ))}
            </select>
          </label>
          <Button onClick={apply} disabled={!canCraft || busy || planning}>
            {busy ? 'Application…' : '✅ Craft effectué'}
          </Button>
          {!canCraft && plan.missing.length > 0 && (
            <span style={{ color: '#fb923c', fontSize: 13 }}>
              Il te manque des matières premières — complète l'inventaire d'abord.
            </span>
          )}
        </div>
      )}

      <RecipeBrowser byId={byId} isMobile={isMobile} onPick={pickTarget} />
    </div>
  );
}

// Badge de la station de craft (verrier, forgeron…) quand la recette ne se
// fait pas sur un établi.
function StationBadge({ station, byId }) {
  if (!station) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px',
      borderRadius: 999, fontSize: 12, color: '#c9a8e8',
      background: 'rgba(201,168,232,0.12)', border: '1px solid rgba(201,168,232,0.3)',
    }}>
      <CodexItem byId={byId} id={station.id} size={14} showName={false} />
      {station.name}
    </span>
  );
}

// Sélecteur de recette alternative pour un item du plan (le serveur envoie la
// liste triée, défaut en tête). L'option « Matière première » force l'item en
// feuille — c'est le défaut des familles cycliques (lingot ← bloc seulement).
function AltSelect({ itemId, plan, choices, setChoices }) {
  const entries = plan.alternatives?.[itemId];
  if (!entries || entries.length === 0) return null;
  const value = plan.chosen?.[itemId] || 'raw';
  const optLabel = (e) => {
    const ings = e.ingredients.map((i) => `${i.count}× ${i.name}`).join(' + ');
    const src = e.source === 'minefield' ? '' : e.source === 'admin' ? ' · admin' : ' · vanilla';
    return `${ings} → ${e.resultCount}${e.station ? ` · ${e.station.name}` : ''}${src}`;
  };
  return (
    <select
      value={value}
      onChange={(ev) => {
        const v = ev.target.value;
        setChoices({ ...choices, [itemId]: v });
      }}
      title="Choisir la recette utilisée pour cet objet"
      style={{ ...inp, padding: '4px 8px', fontSize: 12, maxWidth: '100%' }}
    >
      {entries.map((e) => <option key={e.key} value={e.key}>{optLabel(e)}</option>)}
      <option value="raw">Matière première (ne pas crafter)</option>
    </select>
  );
}

function PlanView({ plan, byId, chestById, isMobile, dim, choices, setChoices, onAddMissing, addingMissing }) {
  const targetSurplus = (() => {
    // rab dû à l'arrondi sur la cible (info seulement)
    const step = plan.steps.find((s) => s.itemId === plan.target.id);
    return step ? step.produced - plan.target.qty : 0;
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: dim ? 0.55 : 1, transition: 'opacity 0.15s' }}>
      {/* À sortir des coffres */}
      {plan.consume.length > 0 && (
        <SectionCard title="📤 À sortir des coffres">
          {plan.consume.map((c) => (
            <div key={c.id} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <CodexItem byId={byId} id={c.id} size={22} />
                <strong style={{ color: '#4dd9ac' }}>×{c.total}</strong>
              </div>
              <div style={{ ...muted, fontSize: 12, paddingLeft: 30 }}>
                {c.from.map((part, i) => {
                  const ch = part.chestId != null ? chestById.get(part.chestId) : null;
                  return (
                    <span key={i} style={{ marginRight: 12 }}>
                      {ch ? `${worldEmoji(ch.world)} ${ch.name}` : '📦 Non rangé'} : {part.take}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {/* Manquant */}
      {plan.missing.length > 0 && (
        <SectionCard title="❗ Manquant (à récolter)">
          {plan.missing.map((m) => (
            <div key={m.id} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <CodexItem byId={byId} id={m.id} size={22} />
                <strong style={{ color: '#fb923c' }}>×{m.count}</strong>
                {m.owned > 0 && <span style={{ ...muted, fontSize: 12 }}>(en stock : {m.owned})</span>}
              </div>
              {plan.alternatives?.[m.id] && (
                <div style={{ paddingLeft: 30, marginTop: 4 }}>
                  <AltSelect itemId={m.id} plan={plan} choices={choices} setChoices={setChoices} />
                </div>
              )}
            </div>
          ))}
          {onAddMissing && (
            <button type="button" onClick={onAddMissing} disabled={addingMissing}
              title="Ajoute chaque matière manquante à la liste wanted (fusionnée si déjà présente)"
              style={{
                marginTop: 8, padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                background: 'rgba(251,146,60,0.14)', border: '1px solid rgba(251,146,60,0.45)',
                color: '#fb923c', fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
              }}
            >
              {addingMissing ? 'Ajout…' : '🎯 Ajouter le manquant aux wanted'}
            </button>
          )}
        </SectionCard>
      )}

      {/* Étapes de craft */}
      {plan.steps.length > 0 && (
        <SectionCard title="🛠️ Étapes de craft (dans l'ordre)">
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {plan.steps.map((s, i) => (
              <li key={i} style={{ color: '#ede8f8', fontSize: 14 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {!s.station && (s.type === 'smelting' ? '🔥' : s.type === 'stonecutting' ? '🪚' : s.type === 'smithing' ? '🔨' : s.type === 'brewing' ? '⚗️' : '🛠️')}
                  Crafter {s.times}× <CodexItem byId={byId} id={s.itemId} size={18} />
                  <span style={muted}>(produit {s.produced})</span>
                  <StationBadge station={s.station} byId={byId} />
                </span>
                {/* Recette façonnée : grille 3×3 ; sans forme : simple liste d'ingrédients */}
                {!s.shapeless && Array.isArray(s.grid) && s.grid.some((c) => c) ? (
                  <div style={{ marginTop: 6 }}>
                    <CraftGrid grid={s.grid} byId={byId} cell={isMobile ? 22 : 26} />
                  </div>
                ) : (
                  <div style={{ ...muted, fontSize: 12, marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {s.consumed.map((c) => (
                      <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CodexItem byId={byId} id={c.id} size={16} showName={false} />
                        {c.count / s.times}× {c.name}
                      </span>
                    ))}
                  </div>
                )}
                {plan.alternatives?.[s.itemId] && (
                  <div style={{ marginTop: 5 }}>
                    <AltSelect itemId={s.itemId} plan={plan} choices={choices} setChoices={setChoices} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </SectionCard>
      )}

      <div style={{ ...muted, fontSize: 13 }}>
        Résultat : <strong style={{ color: '#ede8f8' }}>{plan.target.qty}× {plan.target.name}</strong>
        {targetSurplus > 0 && ` (tu en produiras ${targetSurplus} de plus, arrondi au craft)`}
        {plan.stations.length > 0 && (
          <span style={{ marginLeft: 10, display: 'inline-flex', gap: 6, verticalAlign: 'middle' }}>
            {plan.stations.map((st) => <StationBadge key={st.id} station={st} byId={byId} />)}
          </span>
        )}
      </div>
    </div>
  );
}

// Navigateur des recettes du serveur (recherche paginée côté back — le dump
// complet n'est jamais envoyé) : nom FR + filtre par station, clic → calcul.
function RecipeBrowser({ byId, isMobile, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [crafter, setCrafter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const seq = useRef(0);
  useEffect(() => {
    if (!open) return undefined;
    const mySeq = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      api.craft.recipes({ q, crafter, page, limit: 12 })
        .then((d) => { if (seq.current === mySeq) setData(d); })
        .catch(() => { if (seq.current === mySeq) setData(null); })
        .finally(() => { if (seq.current === mySeq) setLoading(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [open, q, crafter, page]);

  return (
    <div style={{ marginTop: 26 }}>
      <button type="button" onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          color: '#c9a8e8', fontFamily: "'Inter',sans-serif", fontSize: 13, fontWeight: 600,
        }}
      >
        {open ? '▾' : '▸'} 🔎 Recettes du serveur Minefield
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              value={q} placeholder="Rechercher une recette…"
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              style={{ ...inp, flex: '2 1 200px' }}
            />
            <select value={crafter} onChange={(e) => { setCrafter(e.target.value); setPage(1); }}
              style={{ ...inp, flex: '1 1 150px' }}>
              <option value="">Toutes les stations</option>
              {(data?.crafters || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.count})</option>
              ))}
            </select>
          </div>
          {loading && !data ? (
            <p style={{ ...muted, fontSize: 13 }}>Chargement…</p>
          ) : !data ? (
            <p style={{ ...muted, fontSize: 13 }}>Recherche impossible — réessaie.</p>
          ) : (
            <>
              <div style={{
                display: 'grid', gap: 10, opacity: loading ? 0.55 : 1, transition: 'opacity 0.15s',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(250px, 1fr))',
              }}>
                {data.recipes.map((r) => (
                  <div key={r.key} style={{ ...card, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <CodexItem byId={byId} id={r.result.id} size={22} showName={false} />
                      <strong style={{ color: '#ede8f8', fontSize: 13 }}>{r.label || r.result.name}</strong>
                      {r.resultCount > 1 && <span style={{ ...muted, fontSize: 12 }}>×{r.resultCount}</span>}
                    </div>
                    <StationBadge station={r.station} byId={byId} />
                    {!r.shapeless && r.grid.some((c) => c) ? (
                      <CraftGrid grid={r.grid} byId={byId} cell={22} />
                    ) : (
                      <div style={{ ...muted, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {r.ingredients.map((i, idx) => (
                          <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {i.id && <CodexItem byId={byId} id={i.id} size={16} showName={false} />}
                            {i.count}× {i.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => onPick(r.result.id)}
                      style={{
                        alignSelf: 'flex-start', padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
                        background: 'rgba(77,217,172,0.12)', border: '1px solid rgba(77,217,172,0.4)',
                        color: '#4dd9ac', fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600,
                      }}
                    >🧮 Calculer</button>
                  </div>
                ))}
                {data.recipes.length === 0 && (
                  <p style={{ ...muted, fontSize: 13 }}>Aucune recette ne correspond.</p>
                )}
              </div>
              {data.pages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, justifyContent: 'center' }}>
                  <Button variant="ghost" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}>‹</Button>
                  <span style={{ ...muted, fontSize: 13 }}>{data.page} / {data.pages} · {data.total} recettes</span>
                  <Button variant="ghost" onClick={() => setPage(Math.min(data.pages, page + 1))} disabled={page >= data.pages}>›</Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ ...card, padding: 14 }}>
      <div style={{
        fontSize: 12, letterSpacing: '0.4px', textTransform: 'uppercase',
        color: 'rgba(180,170,200,0.6)', marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}

const inp = {
  background: 'rgba(14,9,28,0.6)', border: '1px solid rgba(80,50,130,0.28)',
  borderRadius: 10, padding: '9px 12px', color: '#ede8f8',
  fontFamily: "'Inter',sans-serif", fontSize: 14, outline: 'none',
};
