import { useMemo } from 'react';
import { ACC, GOLD, INK, MUTED, hexToRgb } from '../theme';
import { comparerRachats, monnaieLabel, rachatVise } from './rachat';

// « Où revendre ce joyau, et vaut-il mieux le garder pour compléter le set ? »
//
// Le jeu propose deux axes qui se croisent — à l'unité ou en lot, contre des PA
// chez un PNJ ou contre de la réputation chez un autre. L'écran ne fait que
// poser les deux côte à côte par MONNAIE : additionner des PA et des points de
// réputation n'aurait aucun sens, et aucun taux de change n'est inventé (même
// règle que le « vendre ou ouvrir ? » des contenants).

const VERDICTS = {
  lot:         { icon: '📦', label: 'Garde-les pour le lot', color: '#7be3a8' },
  unite:       { icon: '🪙', label: "Vends-les à l'unité",   color: GOLD },
  equivalent:  { icon: '⚖️', label: 'Même résultat',          color: ACC },
};

const nb = (v) => Math.round((Number(v) || 0) * 100) / 100;

export function RachatPanel({ rachats, taille, itemId, itemsById, onOpenQuest }) {
  // Sur une fiche d'objet, seuls les barèmes qui le visent comptent ; sur le
  // set entier (itemId absent), on les montre tous.
  const applicables = useMemo(
    () => (rachats || []).filter((r) => (itemId == null ? true : rachatVise(r, itemId))),
    [rachats, itemId],
  );
  const monnaies = useMemo(
    () => comparerRachats(applicables, taille),
    [applicables, taille],
  );

  if (monnaies.length === 0) {
    return (
      <p style={{ ...zero, lineHeight: 1.55 }}>
        Aucun barème de rachat renseigné pour ce set. Ajoute-les depuis
        « Sets » → 💰 : ce que le PNJ donne pour une pièce, et pour le set complet.
      </p>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {monnaies.map((m) => (
        <MonnaieBloc key={m.key} m={m} itemsById={itemsById} onOpenQuest={onOpenQuest} />
      ))}
    </div>
  );
}

function MonnaieBloc({ m, itemsById, onOpenQuest }) {
  const unite = monnaieLabel(m, itemsById);
  const meta = m.verdict ? VERDICTS[m.verdict] : null;
  const couleur = meta?.color || (m.paiement === 'reputation' ? '#b79bff' : GOLD);
  const rgb = hexToRgb(couleur);

  return (
    <div style={{
      borderRadius: 9, overflow: 'hidden',
      border: `1px solid rgba(${rgb},0.3)`, background: `rgba(${rgb},0.05)`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        padding: '7px 11px', borderBottom: `1px solid rgba(${rgb},0.2)`,
        fontFamily: "'Inter',sans-serif", fontSize: 12, fontWeight: 700, color: couleur,
        textTransform: 'uppercase', letterSpacing: '0.6px',
      }}>
        {m.paiement === 'reputation' ? '⚜️' : m.paiement === 'item' ? '📦' : '🪙'} payé en {unite}
      </div>

      <div style={{ display: 'grid', gap: 4, padding: '8px 11px' }}>
        <Ligne
          label="À l'unité" offre={m.unite} unite={unite} onOpenQuest={onOpenQuest}
          suffixe={m.totalUnite != null
            ? `→ ${nb(m.totalUnite)} ${unite} pour les ${m.taille} pièces`
            : null}
        />
        <Ligne
          label={m.taille > 0 ? `Le set complet (${m.taille})` : 'Le set complet'}
          offre={m.lot} unite={unite} onOpenQuest={onOpenQuest}
        />
      </div>

      <div style={{
        padding: '7px 11px', borderTop: `1px solid rgba(${rgb},0.2)`,
        fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(214,206,232,0.85)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        {meta ? (
          <>
            <span style={{ fontSize: 15 }}>{meta.icon}</span>
            <strong style={{ color: meta.color }}>{meta.label}</strong>
            {m.verdict === 'equivalent' ? (
              <span>— le lot rapporte exactement la somme des pièces.</span>
            ) : (
              <span>
                — {m.verdict === 'lot' ? 'le lot rapporte' : "l'unité rapporte"}{' '}
                <strong style={{ color: INK }}>{nb(Math.abs(m.ecart))} {unite}</strong> de plus
                {m.pct != null && ` (${m.ecart > 0 ? '+' : ''}${Math.round(m.pct)} %)`}.
              </span>
            )}
          </>
        ) : (
          // Pas de verdict : on dit POURQUOI plutôt que d'afficher un blanc.
          <span style={{ color: MUTED }}>
            {m.unite == null ? "Barème à l'unité inconnu"
              : m.lot == null ? 'Barème du lot inconnu'
                : 'Taille du set inconnue'}
            {' '}— pas de comparaison possible
            {m.taille === 0 && m.unite && m.lot
              ? " tant que le nombre de pièces en jeu n'est pas renseigné sur le set."
              : '.'}
          </span>
        )}
      </div>
    </div>
  );
}

function Ligne({ label, offre, unite, suffixe, onOpenQuest }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap',
      fontFamily: "'Inter',sans-serif", fontSize: 13,
      color: offre ? INK : MUTED,
    }}>
      <span style={{ minWidth: 132 }}>{label}</span>
      {offre ? (
        <>
          <strong style={{ fontFamily: "'JetBrains Mono',monospace", color: GOLD }}>
            {nb(offre.montant)} {unite}
          </strong>
          {offre.pnj && <span style={{ color: MUTED }}>chez {offre.pnj}</span>}
          {offre.questId && onOpenQuest && (
            <button type="button" onClick={() => onOpenQuest(offre.questId)} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: ACC,
              fontSize: 12, fontFamily: "'Inter',sans-serif",
              textDecoration: 'underline', textDecorationStyle: 'dotted',
            }}>📜 la quête</button>
          )}
          {suffixe && <span style={{ color: MUTED, fontSize: 12 }}>{suffixe}</span>}
          {offre.note && <span style={{ color: MUTED, fontSize: 12 }}>— {offre.note}</span>}
        </>
      ) : (
        <span style={{ fontSize: 12.5 }}>non renseigné</span>
      )}
    </div>
  );
}

const zero = { margin: 0, fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: MUTED };
