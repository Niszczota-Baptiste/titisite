import { useMemo } from 'react';
import { CodexItem } from '../admin/editors/minecraft/CodexPicker';
import { ACC, GOLD, INK, LINE, MUTED, panel } from './theme';

// Le registre des CMD — le second objectif écrit dans le document source :
// « garder un œil sur les CMD pour pouvoir ajouter des nouveaux assets
// graphiques ». C'est la vue de celui qui fabrique le resource pack.
//
// Le document demande de « rester dans l'ordre croissant » ; un tableur ne
// peut que le demander. Ici les TROUS sont affichés : un numéro sauté n'est
// pas un détail, c'est une texture qui n'existera jamais dans le pack.

export function CmdTab({ items, referentiel, byId, onOpen }) {
  const parSerie = useMemo(() => referentiel.series.map((s) => {
    const membres = items
      .filter((i) => i.serieId === s.id)
      .sort((a, b) => (a.cmd ?? Infinity) - (b.cmd ?? Infinity));
    const avecCmd = membres.filter((i) => i.cmd != null);
    const base = Number(s.code) * 1000;

    // Trous = numéros absents entre le premier et le dernier CMD attribué.
    const pris = new Set(avecCmd.map((i) => i.cmd));
    const trous = [];
    if (avecCmd.length > 1) {
      for (let n = avecCmd[0].cmd; n < avecCmd[avecCmd.length - 1].cmd; n += 1) {
        if (!pris.has(n)) trous.push(n);
      }
    }
    return {
      serie: s, membres, avecCmd,
      sansCmd: membres.filter((i) => i.cmd == null),
      trous, plage: [base + 1, base + 999],
      prochain: avecCmd.length ? avecCmd[avecCmd.length - 1].cmd + 1 : base + 1,
    };
  }), [items, referentiel.series]);

  const orphelins = items.filter((i) => !i.serieId);

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, color: MUTED, fontSize: 12.5, lineHeight: 1.6 }}>
        Le CMD (Custom Model Data) est un nombre à 5 chiffres : les deux premiers désignent la
        série, les suivants le modèle. C'est la clé que le resource pack utilise pour remplacer
        le visuel d'un item — deux items ne peuvent donc pas partager le même, et le serveur
        refuse un doublon.
      </p>

      {parSerie.map(({ serie, avecCmd, sansCmd, trous, plage, prochain }) => (
        <section key={serie.id} style={{ ...panel, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <h3 style={{
              margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
              fontWeight: 600, color: serie.couleur || ACC,
            }}>{serie.code} — {serie.nom}</h3>
            <span style={{ color: MUTED, fontSize: 11.5 }}>
              plage {plage[0]}–{plage[1]} · {avecCmd.length} attribué{avecCmd.length > 1 ? 's' : ''}
              {sansCmd.length ? ` · ${sansCmd.length} sans CMD` : ''}
              {' · '}prochain libre <strong style={{ color: GOLD }}>{prochain}</strong>
            </span>
          </div>
          {serie.note ? (
            <p style={{ margin: '0 0 10px', color: GOLD, fontSize: 11.5 }}>⚠ {serie.note}</p>
          ) : null}

          {avecCmd.length === 0 && sansCmd.length === 0 ? (
            <p style={{ margin: 0, color: MUTED, fontSize: 12.5 }}>Aucun item dans cette série.</p>
          ) : null}

          {avecCmd.length ? (
            <div style={{ display: 'grid', gap: 4 }}>
              {avecCmd.map((i) => (
                <Rangee key={i.id} item={i} byId={byId} onOpen={onOpen} />
              ))}
            </div>
          ) : null}

          {trous.length ? (
            <p style={{ margin: '10px 0 0', color: GOLD, fontSize: 11.5, lineHeight: 1.5 }}>
              Trous dans la numérotation : {trous.slice(0, 24).join(', ')}
              {trous.length > 24 ? ` … (+${trous.length - 24})` : ''}.
              Un numéro sauté est un modèle que le resource pack n'aura jamais.
            </p>
          ) : null}

          {sansCmd.length ? (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}` }}>
              <span style={{ color: MUTED, fontSize: 11.5 }}>Sans CMD attribué</span>
              <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                {sansCmd.map((i) => <Rangee key={i.id} item={i} byId={byId} onOpen={onOpen} />)}
              </div>
            </div>
          ) : null}
        </section>
      ))}

      {orphelins.length ? (
        <section style={{ ...panel, padding: 14 }}>
          <h3 style={{
            margin: '0 0 4px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
            fontWeight: 600, color: MUTED,
          }}>Hors série</h3>
          <p style={{ margin: '0 0 10px', color: MUTED, fontSize: 11.5 }}>
            Ces items n'appartiennent à aucune série : ils ne peuvent pas recevoir de CMD cohérent
            tant qu'on ne leur en attribue pas une.
          </p>
          <div style={{ display: 'grid', gap: 4 }}>
            {orphelins.map((i) => <Rangee key={i.id} item={i} byId={byId} onOpen={onOpen} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Rangee({ item, byId, onOpen }) {
  return (
    <button type="button" onClick={() => onOpen(item.id)} style={{
      display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left',
      padding: '5px 8px', borderRadius: 7, cursor: 'pointer',
      border: `1px solid ${LINE}`, background: 'rgba(255,255,255,0.02)',
    }}>
      <code style={{
        color: item.cmd ? GOLD : MUTED, fontSize: 12, minWidth: 46,
        fontFamily: 'ui-monospace, monospace',
      }}>{item.cmd ?? '—'}</code>
      <CodexItem byId={byId} id={item.baseItem} size={18} showName={false} />
      <span style={{
        flex: 1, minWidth: 0, color: INK, fontSize: 12.5,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{item.nom}</span>
      <code style={{ color: MUTED, fontSize: 10.5 }}>{item.baseItem}</code>
    </button>
  );
}
