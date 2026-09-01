import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../admin/ui';
import { ACC, GOLD, INK, MUTED, OCCURRENCES, fromNow, hexToRgb, panel } from './theme';
import { fiabilite, wilson } from './items/loot';

// Les ROTATIONS : « la Fédération des Marchands propose dix livraisons, mais
// une seule par jour, au hasard, chez le même PNJ ».
//
// Sans ce panneau, les dix quêtes s'affichent comme dix choses à faire — la
// liste ment sur la journée. Le groupe devient donc un rendez-vous unique dont
// on relève le tirage : on sait ce qu'il y a à faire aujourd'hui, et les
// relevés accumulés disent au passage si le tirage est vraiment uniforme.
//
// Le tirage du jour n'est PAS déduit des complétions : quelqu'un peut relever
// la quête proposée sans la faire, et la faire sans que ce soit celle du jour
// (une quête peut appartenir à une rotation et rester accessible autrement).

// « une quête par JOUR » — le nom de la période, pas l'adjectif de l'occurrence
// (« par journalière » ne se dit pas).
const PERIODE = { journaliere: 'jour', hebdomadaire: 'semaine', mensuelle: 'mois' };

export function RotationsPanel({ rotations, onChanged }) {
  if (!rotations || rotations.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
      {rotations.map((r) => <RotationCard key={r.id} rotation={r} onChanged={onChanged} />)}
    </div>
  );
}

function RotationCard({ rotation, onChanged }) {
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const occ = OCCURRENCES[rotation.occurrence] || OCCURRENCES.journaliere;
  const rgb = hexToRgb(rotation.couleur || ACC);
  const tirage = rotation.tirage;
  const stats = rotation.stats || { total: 0, parQuete: [], conflits: [] };

  const relever = async (questId) => {
    setBusy(true); setErr(null);
    try {
      await api.quests.rotations.setDraw(rotation.id, questId);
      await onChanged?.();
    } catch (e) { setErr(e.body?.error || e.message); } finally { setBusy(false); }
  };

  const annuler = async () => {
    setBusy(true); setErr(null);
    try {
      await api.quests.rotations.clearDraw(rotation.id);
      await onChanged?.();
    } catch (e) { setErr(e.body?.error || e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ ...panel, padding: 14, borderLeft: `3px solid ${rotation.couleur || ACC}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 17 }}>🎲</span>
        <strong style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 15.5, fontWeight: 800,
          color: rotation.couleur || INK,
        }}>{rotation.nom}</strong>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: MUTED }}>
          {occ.icon} 1 quête sur {rotation.quetes.length} par {PERIODE[rotation.occurrence] || 'période'}
          {rotation.pnj && ` · chez ${rotation.pnj}`}
          {!rotation.partagee && ' · tirage propre à chaque joueur'}
        </span>
        {rotation.nextResetAt && (
          <span style={{ marginLeft: 'auto', fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: GOLD }}>
            ↻ {fromNow(rotation.nextResetAt)}
          </span>
        )}
      </div>

      {err && <p style={{ margin: '8px 0 0', color: '#ff8a9b', fontSize: 12 }}>{err}</p>}

      {/* Ce qui est proposé maintenant — la question qu'on se pose en ouvrant la page. */}
      <div style={{
        marginTop: 10, padding: '9px 12px', borderRadius: 9,
        background: `rgba(${tirage ? '123,227,168' : '232,200,106'},0.08)`,
        border: `1px solid rgba(${tirage ? '123,227,168' : '232,200,106'},0.3)`,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
      }}>
        {tirage ? (
          <>
            <span style={{ color: MUTED }}>Cette période :</span>
            <strong style={{ color: '#7be3a8' }}>{tirage.titre}</strong>
            {tirage.memberName && <span style={{ color: MUTED, fontSize: 11.5 }}>relevé par {tirage.memberName}</span>}
            {tirage.desaccord && (
              <span title="Deux membres ont relevé des quêtes différentes pour cette période"
                style={{ color: GOLD, fontSize: 11.5 }}>⚠️ relevés contradictoires</span>
            )}
            <Button variant="ghost" onClick={annuler} disabled={busy}>Corriger</Button>
          </>
        ) : (
          <>
            <span style={{ color: GOLD }}>Tirage de la période pas encore relevé.</span>
            <span style={{ color: MUTED, fontSize: 11.5 }}>
              Note laquelle le PNJ propose : la liste cessera d'annoncer {rotation.quetes.length} quêtes à faire.
            </span>
          </>
        )}
      </div>

      {/* Le sélecteur reste visible même après relevé : on se trompe de ligne. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 9 }}>
        {rotation.quetes.map((q) => {
          const on = tirage?.questId === q.id;
          return (
            <button
              key={q.id} type="button" disabled={busy} onClick={() => relever(q.id)}
              title={on ? 'Déjà relevée pour cette période' : 'Relever ce tirage'}
              style={{
                padding: '5px 10px', borderRadius: 999, cursor: busy ? 'wait' : 'pointer',
                fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 600,
                background: on ? '#7be3a8' : 'transparent',
                color: on ? '#08051a' : MUTED,
                border: on ? 'none' : `1px solid rgba(${rgb},0.3)`,
              }}
            >{q.titre}</button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Inter',sans-serif", fontSize: 12, color: MUTED, flex: 1 }}>
          {stats.total > 0
            ? `${stats.total} tirage${stats.total > 1 ? 's' : ''} relevé${stats.total > 1 ? 's' : ''}${fiabilite(stats.total) === 'faible' ? ' — trop peu pour conclure quoi que ce soit' : ''}.`
            : 'Aucun historique : les fréquences apparaîtront au fil des relevés.'}
        </span>
        {stats.total > 0 && (
          <Button variant="ghost" onClick={() => setOuvert((o) => !o)}>
            {ouvert ? 'Masquer les fréquences' : '📊 Fréquences'}
          </Button>
        )}
      </div>

      {ouvert && <Frequences stats={stats} />}
    </div>
  );
}

// Ce que les relevés disent du tirage. On n'affirme rien de plus que la
// mesure : l'intervalle de Wilson montre à quel point c'est encore flou, et la
// part attendue d'un tirage uniforme donne le point de comparaison — sans lui,
// « 12 % » ne veut rien dire.
function Frequences({ stats }) {
  const attendu = stats.parQuete.length > 0 ? 100 / stats.parQuete.length : 0;
  const max = Math.max(1, ...stats.parQuete.map((q) => q.n));
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
      {stats.parQuete.map((q) => {
        const w = wilson(q.n, stats.total);
        // « Hors norme » = l'intervalle à 95 % ne contient pas la part
        // uniforme : soit la rotation n'est pas équiprobable, soit il manque
        // des relevés. Dans les deux cas, ça mérite d'être signalé.
        const horsNorme = stats.total >= 10 && (w.bas > attendu || w.haut < attendu);
        return (
          <div key={q.questId} style={{
            position: 'relative', overflow: 'hidden',
            display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px',
            background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)',
            borderRadius: 8, fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: INK,
          }}>
            <div aria-hidden style={{
              position: 'absolute', inset: 0, width: `${(q.n / max) * 100}%`,
              background: `linear-gradient(90deg, rgba(${hexToRgb(ACC)},0.18), rgba(${hexToRgb(ACC)},0.03))`,
            }} />
            <span style={{ position: 'relative', flex: 1, minWidth: 0 }}>{q.titre}</span>
            {horsNorme && (
              <span title={`Un tirage uniforme donnerait ${Math.round(attendu)} % — l'intervalle mesuré ne le contient pas`}
                style={{ position: 'relative', color: GOLD, fontSize: 11 }}>hors norme</span>
            )}
            <span style={{
              position: 'relative', fontFamily: "'JetBrains Mono',monospace", fontSize: 11,
              color: '#7bd3e8', whiteSpace: 'nowrap',
            }}>
              {q.n}/{stats.total} <span style={{ opacity: 0.6 }}>[{Math.round(w.bas)}–{Math.round(w.haut)}]</span>
            </span>
            <strong style={{
              position: 'relative', fontFamily: "'JetBrains Mono',monospace", fontSize: 12.5,
              color: ACC, minWidth: 50, textAlign: 'right',
            }}>{Math.round(q.p * 10) / 10} %</strong>
          </div>
        );
      })}
      <p style={{ margin: '4px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
        Un tirage uniforme donnerait {Math.round(attendu * 10) / 10} % à chacune. Les crochets sont
        l'intervalle de confiance à 95 % : ils se resserrent au fil des relevés.
      </p>
      {stats.conflits.length > 0 && (
        <p style={{ margin: '4px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: GOLD, lineHeight: 1.5 }}>
          ⚠️ {stats.conflits.length} période{stats.conflits.length > 1 ? 's' : ''} où des membres ont relevé
          des quêtes différentes ({stats.conflits.slice(0, 3).map((c) => c.periodKey).join(', ')}
          {stats.conflits.length > 3 ? '…' : ''}). Comptée{stats.conflits.length > 1 ? 's' : ''} pour la
          quête majoritaire — si le tirage est en fait propre à chaque joueur, change la portée du
          groupe dans l'éditeur.
        </p>
      )}
    </div>
  );
}
