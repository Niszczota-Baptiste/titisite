import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { useConfirm } from '../../../ui/ConfirmProvider';
import { Button } from '../../admin/ui';
import { CodexPicker } from '../../admin/editors/minecraft/CodexPicker';
import { QuestMap } from '../QuestMap';
import {
  ACC, ACC_RGB, GOLD, INK, ITEM_CATEGORIES, MANUAL_SOURCE_KINDS, MUTED,
  OCCURRENCES, QUEST_CATEGORIES, hexToRgb, panel,
} from '../theme';
import { ItemTooltip } from './ItemTooltip';
import { LootTable } from './LootTable';
import { formatPrix } from './loot';

// Fiche d'un item unique : ce qu'il est (infobulle), sa table de butin s'il
// s'ouvre, TOUTES les façons de l'obtenir et tout ce à quoi il sert. Les deux
// dernières sections sont calculées par le serveur à partir des relations
// existantes — rien n'y est ressaisi.

export function ItemSheet({
  itemId, byId, itemsById, catalog, canEdit, onOpenItem, onOpenQuest, onEdit, onChanged,
}) {
  const [item, setItem] = useState(null);
  const [sources, setSources] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    const [fiche, src] = await Promise.all([
      api.quests.uniqueItems.get(itemId),
      api.quests.uniqueItems.sources(itemId),
    ]);
    setItem(fiche);
    setSources(src);
  }, [itemId]);

  useEffect(() => {
    let alive = true;
    setItem(null); setSources(null); setErr(null);
    load().catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [load]);

  if (err) return <p style={{ color: '#ff8a9b', fontFamily: "'Inter',sans-serif" }}>{err}</p>;
  if (!item) return <p style={{ color: MUTED, fontFamily: "'Inter',sans-serif" }}>Chargement…</p>;

  const cat = ITEM_CATEGORIES[item.categorie] || ITEM_CATEGORIES.autre;
  const points = (item.sourcesManuelles || [])
    .filter((s) => s.x != null || s.z != null)
    .map((s) => ({ label: s.label, role: 'autre', x: s.x ?? 0, y: s.y ?? 0, z: s.z ?? 0 }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <ItemTooltip item={item} byId={byId} />
        <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip>{cat.icon} {cat.label}</Chip>
            {item.factionNom && <Chip color={item.factionCouleur}>{item.factionNom}</Chip>}
            {item.estOuvrable && <Chip color="#7be3a8">🔓 Ouvrable</Chip>}
            {item.categorie === 'monnaie' && <Chip color={GOLD}>🪙 Sert de monnaie</Chip>}
            {item.estVendable && item.prixVente != null && (
              <Chip color={GOLD}>Revente ≈ {formatPrix(item.prixVente, item.prixUnite, itemsById)}</Chip>
            )}
          </div>
          {(item.tags || []).length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {item.tags.map((t) => (
                <span key={t} style={{
                  fontSize: 10.5, color: MUTED, border: '1px solid rgba(80,50,130,0.35)',
                  borderRadius: 999, padding: '1px 8px', fontFamily: "'Inter',sans-serif",
                }}>#{t}</span>
              ))}
            </div>
          )}
          {item.note && (
            <p style={{
              margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 13, lineHeight: 1.55,
              color: 'rgba(214,206,232,0.85)', whiteSpace: 'pre-wrap',
            }}>{item.note}</p>
          )}
          {canEdit && (
            <div><Button variant="ghost" onClick={() => onEdit?.(item)}>✎ Éditer cet item</Button></div>
          )}
        </div>
      </div>

      {item.estOuvrable && (
        <Section title="🎁 Table de butin" accent={GOLD}>
          <LootTable
            item={item} byId={byId} itemsById={itemsById}
            observations={item.observations} onOpenItem={onOpenItem}
          />
          <ObservationLogger
            item={item} byId={byId} catalog={catalog} itemsById={itemsById}
            canEdit={canEdit}
            onLogged={(fiche) => { setItem(fiche); onChanged?.(); }}
          />
        </Section>
      )}

      <Section title="📍 Où l'obtenir" accent="#7be3a8">
        <Sources sources={sources?.sources} itemsById={itemsById} byId={byId}
          onOpenQuest={onOpenQuest} onOpenItem={onOpenItem} />
      </Section>

      <Section title="🔧 À quoi ça sert" accent="#7bd3e8">
        <Usages usages={sources?.usages} onOpenQuest={onOpenQuest} />
      </Section>

      {points.length > 0 && (
        <Section title="🗺️ Points de carte">
          <QuestMap points={points} />
        </Section>
      )}
    </div>
  );
}

// ── Sources dérivées ───────────────────────────────────────────────────────

function Sources({ sources, itemsById, byId, onOpenQuest, onOpenItem }) {
  if (!sources) return <p style={zero}>Chargement…</p>;
  const { recompenses = [], contenants = [], crafts = [], achats = [], manuelles = [] } = sources;
  const rien = !recompenses.length && !contenants.length && !crafts.length && !achats.length && !manuelles.length;

  if (rien) {
    return (
      <p style={{ ...zero, lineHeight: 1.55 }}>
        Aucune source connue pour l'instant. Dès qu'une quête le donne, qu'un contenant peut le
        produire ou qu'un marchand le vend, il apparaît ici <em>automatiquement</em> — sinon,
        ajoute une source manuelle depuis l'éditeur (drop de mob, coffre, événement…).
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {contenants.map((c) => (
        <Row key={`c${c.uniqueItemId}`} icon="🎁" onClick={() => onOpenItem?.(c.uniqueItemId)}>
          <strong style={{ color: c.rareteCouleur || ACC }}>{c.probabilite} %</strong>
          {' '}dans <strong>{c.nom}</strong>
          <Muted> · ×{c.quantiteMin}{c.quantiteMax !== c.quantiteMin ? `–${c.quantiteMax}` : ''}</Muted>
          <Muted> · {c.probabiliteSource}</Muted>
        </Row>
      ))}
      {crafts.map((q) => (
        <Row key={`k${q.questId}`} icon="⚒️" onClick={() => onOpenQuest?.(q.questId)}>
          <strong>{q.titre}</strong>
          <Muted> — {q.ingredients.length
            ? q.ingredients.map((i) => `${i.quantite ?? ''}× ${i.label}`).join(' + ')
            : 'recette sans ingrédient saisi'}</Muted>
        </Row>
      ))}
      {achats.map((o) => (
        <Row key={`a${o.offerId}`} icon="🪙" onClick={() => onOpenQuest?.(o.questId)}>
          <strong>{ligneEchange(o)}</strong>
          <Muted> · {o.vendeur || o.questTitre}</Muted>
          {o.stock != null && <Muted> · stock {o.stock}</Muted>}
        </Row>
      ))}
      {recompenses.map((q) => (
        <Row key={`r${q.questId}`} icon="🎯" onClick={() => onOpenQuest?.(q.questId)}>
          {/* Une récompense peut être tirée au sort : on annonce alors la
              probabilité en tête, comme pour un contenant. */}
          {q.probabilite != null && (
            <strong style={{ color: GOLD }}>{Math.round(q.probabilite * 10) / 10} % — </strong>
          )}
          <strong>{q.titre}</strong>
          {q.quantiteMin != null ? (
            <Muted> · ×{q.quantiteMin}{q.quantiteMax !== q.quantiteMin ? `–${q.quantiteMax}` : ''}</Muted>
          ) : q.quantite != null && <Muted> · ×{q.quantite}</Muted>}
          {q.factionNom && <span style={{ color: q.factionCouleur }}> · {q.factionNom}</span>}
          <Muted> · {(OCCURRENCES[q.occurrenceType] || OCCURRENCES.simple).label}</Muted>
        </Row>
      ))}
      {manuelles.map((m) => {
        const meta = MANUAL_SOURCE_KINDS[m.kind] || MANUAL_SOURCE_KINDS.autre;
        return (
          <Row key={`m${m.id}`} icon={meta.icon}>
            <strong>{m.label}</strong>
            <Muted> · {meta.label}</Muted>
            {m.note && <Muted> — {m.note}</Muted>}
            {(m.x != null || m.z != null) && (
              <Muted> · ⛏ {m.x ?? '?'} {m.y ?? '?'} {m.z ?? '?'}</Muted>
            )}
          </Row>
        );
      })}
    </div>
  );
}

function Usages({ usages, onOpenQuest }) {
  if (!usages) return <p style={zero}>Chargement…</p>;
  const { craftsConsommateurs = [], quetesEntrees = [], monnaie = [] } = usages;
  if (!craftsConsommateurs.length && !quetesEntrees.length && !monnaie.length) {
    return <p style={zero}>Aucun usage connu — il n'est demandé par aucune quête, recette ni offre.</p>;
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {craftsConsommateurs.map((q) => (
        <Row key={`kc${q.questId}`} icon="⚒️" onClick={() => onOpenQuest?.(q.questId)}>
          Ingrédient de <strong>{q.titre}</strong>
          {q.quantite != null && <Muted> · ×{q.quantite}</Muted>}
          {q.resultats?.length > 0 && <Muted> → {q.resultats.map((r) => r.label).join(', ')}</Muted>}
        </Row>
      ))}
      {monnaie.map((o) => (
        <Row key={`mo${o.offerId}`} icon="🪙" onClick={() => onOpenQuest?.(o.questId)}>
          Monnaie chez <strong>{o.vendeur || o.questTitre}</strong>
          <Muted> — {ligneEchange(o)}</Muted>
        </Row>
      ))}
      {quetesEntrees.map((q) => (
        <Row key={`qe${q.questId}`} icon="🎯" onClick={() => onOpenQuest?.(q.questId)}>
          Demandé par <strong>{q.titre}</strong>
          {q.quantite != null && <Muted> · ×{q.quantite}</Muted>}
          <Muted> · {(QUEST_CATEGORIES[q.categorie] || QUEST_CATEGORIES.autre).label}</Muted>
        </Row>
      ))}
    </div>
  );
}

// « 12 × Écaille du devin → Botte de célérité », lisible en une ligne.
function ligneEchange(offre) {
  const cote = (lignes) => (lignes || [])
    .map((l) => `${l.quantite ?? 1} × ${l.label || l.refCode || '?'}`)
    .join(' + ') || '—';
  return `${cote(offre.donne)} → ${cote(offre.recoit)}`;
}

// ── Journal d'ouvertures ───────────────────────────────────────────────────
// Ouvert à tout lecteur : c'est ce qui permet d'affiner les probabilités sans
// les deviner. Le résultat se choisit dans la table déclarée, ou librement.

function ObservationLogger({ item, byId, catalog, itemsById, canEdit, onLogged }) {
  const confirm = useConfirm();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState('');
  const [refCode, setRefCode] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [reset, setReset] = useState(null); // { ok, texte } — retour du reset

  const options = useMemo(() => (item.loot || []).map((l, i) => ({
    value: `l${i}`, label: l.label, ligne: l,
  })), [item.loot]);

  const envoyer = async () => {
    setBusy(true); setErr(null); setReset(null);
    try {
      const opt = options.find((o) => o.value === choix);
      const body = opt
        ? {
          lootEntryId: opt.ligne.id,
          resultatType: opt.ligne.resultatType,
          resultatRef: opt.ligne.resultatRef,
          resultatUniqueId: opt.ligne.resultatUniqueId,
          labelAffiche: opt.ligne.label,
          quantite: Number(quantite) || 1,
        }
        : {
          // Résultat hors table : soit un item unique, soit un item du codex.
          resultatType: /^custom:\d+$/.test(refCode) ? 'unique_item' : 'item_referentiel',
          resultatRef: refCode,
          quantite: Number(quantite) || 1,
        };
      await api.quests.uniqueItems.logObservation(item.id, body);
      const fiche = await api.quests.uniqueItems.get(item.id);
      onLogged?.(fiche);
      setChoix(''); setRefCode(''); setQuantite(1);
    } catch (e) { setErr(e.body?.error || e.message); } finally { setBusy(false); }
  };

  const total = item.observations?.total || 0;

  // Après une mise à jour du serveur de jeu, les taux relevés décrivent une
  // table qui n'existe plus : on repart de zéro plutôt que de moyenner deux
  // versions. La table de butin déclarée, elle, reste en place.
  const reinitialiser = async (scope) => {
    const ok = await confirm({
      title: 'Repartir de zéro sur les ouvertures',
      danger: true,
      confirmLabel: 'Effacer les relevés',
      message: scope === 'mine'
        ? `Tes ouvertures de « ${item.nom} » seront effacées. Les relevés des autres membres et la table de butin déclarée ne bougent pas.`
        : `Les ${total} ouverture${total > 1 ? 's' : ''} relevée${total > 1 ? 's' : ''} de « ${item.nom} », tous membres confondus, seront effacées — c'est ce qu'on fait après une mise à jour du serveur. La table de butin déclarée n'est pas touchée.`,
    });
    if (!ok) return;
    setBusy(true); setErr(null); setReset(null);
    try {
      const r = await api.quests.uniqueItems.resetObservations(item.id, scope);
      const fiche = await api.quests.uniqueItems.get(item.id);
      onLogged?.(fiche);
      setReset({
        ok: true,
        texte: r.supprimees > 0
          ? `${r.supprimees} relevé${r.supprimees > 1 ? 's' : ''} effacé${r.supprimees > 1 ? 's' : ''} — les taux repartent de zéro.`
          : 'Aucun relevé à ton nom sur ce contenant.',
      });
    } catch (e) {
      setReset({ ok: false, texte: e.body?.error || e.message });
    } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 10, borderTop: '1px solid rgba(80,50,130,0.25)', paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: MUTED,
          flex: 1, minWidth: 180,
        }}>
          {total > 0
            ? `${total} ouverture${total > 1 ? 's' : ''} relevée${total > 1 ? 's' : ''} — les taux observés s'affichent au-dessus.`
            : 'Aucune ouverture relevée. Logue ce que tu obtiens : les taux réels se calculeront tout seuls.'}
        </span>
        {total > 0 && (
          <Button variant="ghost" onClick={() => reinitialiser('mine')} disabled={busy}
            title="Efface tes propres relevés sur ce contenant">
            ↺ Mes relevés
          </Button>
        )}
        {total > 0 && canEdit && (
          <Button variant="danger" onClick={() => reinitialiser('all')} disabled={busy}
            title="Efface les relevés de tout le monde — après une mise à jour du serveur">
            ↺ Tout réinitialiser
          </Button>
        )}
        <Button variant="ghost" onClick={() => setOuvert((o) => !o)}>
          {ouvert ? 'Fermer' : "+ J'ai ouvert une géode"}
        </Button>
      </div>

      {reset && (
        <p style={{
          margin: '7px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 12,
          color: reset.ok ? '#7be3a8' : '#ff8a9b',
        }}>{reset.texte}</p>
      )}

      {ouvert && (
        <div style={{
          marginTop: 9, padding: 11, borderRadius: 9,
          background: 'rgba(20,14,38,0.6)', border: `1px solid rgba(${ACC_RGB},0.3)`,
          display: 'grid', gap: 8,
        }}>
          {err && <p style={{ margin: 0, color: '#ff8a9b', fontSize: 12 }}>{err}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={choix} onChange={(e) => { setChoix(e.target.value); setRefCode(''); }}
              aria-label="Résultat obtenu"
              style={{
                background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.3)',
                borderRadius: 8, padding: '8px 10px', color: INK,
                fontFamily: "'Inter',sans-serif", fontSize: 13, minWidth: 200,
              }}
            >
              <option value="">Autre résultat (hors table)…</option>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {!choix && (
              <div style={{ minWidth: 220, flex: 1 }}>
                <CodexPicker catalog={catalog} byId={byId} value={refCode}
                  onChange={(id) => setRefCode(id)} placeholder="Quel objet ?" />
              </div>
            )}
            <input
              type="number" min={1} value={quantite} aria-label="Quantité"
              onChange={(e) => setQuantite(e.target.value)}
              style={{
                width: 80, background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.3)',
                borderRadius: 8, padding: '8px 10px', color: INK, fontFamily: "'Inter',sans-serif", fontSize: 13,
              }}
            />
            <Button onClick={envoyer} disabled={busy || (!choix && !refCode)}>
              {busy ? '…' : 'Enregistrer'}
            </Button>
          </div>
          <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: MUTED }}>
            Une ligne = une ouverture. Les intervalles affichés sont des intervalles de confiance
            à 95 % : ils se resserrent au fil des relevés.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Petits blocs ───────────────────────────────────────────────────────────

function Section({ title, children, accent = ACC }) {
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

function Row({ icon, children, onClick }) {
  const style = {
    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', width: '100%',
    background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)',
    borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
    textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
  };
  const contenu = (
    <>
      <span style={{ fontSize: 15, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} style={style}>{contenu}</button>
    : <div style={style}>{contenu}</div>;
}

const Muted = ({ children }) => <span style={{ color: MUTED }}>{children}</span>;

function Chip({ children, color = ACC }) {
  const rgb = hexToRgb(color);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px',
      borderRadius: 999, fontSize: 11.5, fontFamily: "'Inter',sans-serif", fontWeight: 600,
      background: `rgba(${rgb},0.14)`, color, border: `1px solid rgba(${rgb},0.4)`,
    }}>{children}</span>
  );
}

const zero = { margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: MUTED };
