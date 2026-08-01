import { CodexItem } from '../../admin/editors/minecraft/CodexPicker';
import { GOLD, MUTED, hexToRgb } from '../theme';

// Infobulle façon Minecraft : fond sombre, bordure violette, nom coloré par la
// rareté, lore en italique violet, id namespacé en gris — la lecture que tu as
// en jeu, pour reconnaître l'objet d'un coup d'œil.
//
// `item` = fiche d'item unique (API /quests/unique-items).
// `byId` = index du codex (pour l'icône de l'item support).

const LORE_VIOLET = '#a887d8';

export function ItemTooltip({ item, byId, compact = false, style }) {
  if (!item) return null;
  const couleur = item.rarete?.couleur || '#ede8f8';
  const rgb = hexToRgb(couleur);
  const lignes = String(item.lore || '').split('\n').filter((l) => l.trim());

  return (
    <div style={{
      display: 'inline-block', minWidth: compact ? 0 : 240, maxWidth: '100%',
      background: 'rgba(6,3,16,0.94)',
      border: '2px solid rgba(120,60,190,0.55)',
      outline: '1px solid rgba(20,10,40,0.9)',
      borderRadius: 4,
      padding: compact ? '8px 10px' : '10px 14px',
      fontFamily: "'Inter',sans-serif",
      boxShadow: `0 8px 28px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(${rgb},0.08)`,
      ...style,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {item.baseItemId && (
          <CodexItem byId={byId} id={item.baseItemId} size={compact ? 20 : 26} showName={false} />
        )}
        {!item.baseItemId && <span style={{ fontSize: compact ? 18 : 24, lineHeight: 1 }}>📦</span>}
        <span style={{
          color: couleur, fontWeight: 700, fontSize: compact ? 14 : 16,
          fontFamily: "'Space Grotesk',sans-serif", textShadow: `0 0 14px rgba(${rgb},0.35)`,
        }}>{item.nom}</span>
      </div>

      {lignes.length > 0 && (
        <div style={{ marginTop: 7, display: 'grid', gap: 2 }}>
          {lignes.map((l, i) => (
            <span key={i} style={{
              color: LORE_VIOLET, fontStyle: 'italic', fontSize: compact ? 11.5 : 12.5, lineHeight: 1.45,
            }}>{l}</span>
          ))}
        </div>
      )}

      {(item.enchantements?.length > 0 || item.stats?.length > 0) && (
        <div style={{ marginTop: 7, display: 'grid', gap: 2 }}>
          {(item.enchantements || []).map((e, i) => (
            <span key={`e${i}`} style={{ color: GOLD, fontSize: 11.5 }}>⚡ {e}</span>
          ))}
          {(item.stats || []).map((s, i) => (
            <span key={`s${i}`} style={{ color: '#7bd3e8', fontSize: 11.5 }}>📊 {s}</span>
          ))}
        </div>
      )}

      {/* L'identité technique, discrète mais toujours lisible : c'est elle qui
          permet de retrouver l'objet dans le codex ou dans un coffre. */}
      {(item.baseItemId || item.rarete) && (
        <div style={{
          marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(80,50,130,0.3)',
          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          {item.rarete && (
            <span style={{ color: couleur, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              {item.rarete.nom}
            </span>
          )}
          {item.baseItemId && (
            <span style={{ color: MUTED, fontSize: 10.5, fontFamily: "'JetBrains Mono',monospace" }}>
              {item.baseItemId}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
