import { useMemo, useState } from 'react';
import { CodexItem } from '../admin/editors/minecraft/CodexPicker';
import { ACC, GOLD, GREEN, INK, LINE, MUTED, STATUTS, panel } from './theme';

// Le registre des CMD — le second objectif écrit dans le document source :
// « garder un œil sur les CMD pour pouvoir ajouter des nouveaux assets
// graphiques ». C'est la vue de celui qui fabrique le resource pack.
//
// Le document demande de « rester dans l'ordre croissant » ; un tableur ne
// peut que le demander. Ici les TROUS sont affichés : un numéro sauté n'est
// pas un détail, c'est une texture qui n'existera jamais dans le pack.

export function CmdTab({ items, referentiel, byId, onOpen }) {
  // Celui qui prépare le pack ne cherche pas « tous les items » mais « ceux
  // qu'il reste à numéroter » : la case les isole sans toucher aux compteurs,
  // qui continuent de porter sur la population entière.
  const [seulementLibres, setSeulementLibres] = useState(false);

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
  const attribues = items.filter((i) => i.cmd != null).length;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, color: MUTED, fontSize: 12.5, lineHeight: 1.6 }}>
        Le CMD (Custom Model Data) préfixe le numéro du modèle par le code de la série :
        « 01 » réserve 1001–1999, « 99 » réserve 99001–99999. C'est la clé que le resource
        pack utilise pour remplacer le visuel d'un item — deux items ne peuvent donc pas
        partager le même. Ici la base le garantit : la colonne porte un index unique, donc
        cette page n'a pas de doublons à signaler — un CMD déjà pris est refusé à la saisie,
        en nommant l'item qui le détient.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: MUTED, fontSize: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={seulementLibres} onChange={(e) => setSeulementLibres(e.target.checked)} />
          Ne montrer que les items sans CMD
        </label>
        <span style={{ flex: 1 }} />
        <span style={{ color: MUTED, fontSize: 11.5, fontVariantNumeric: 'tabular-nums' }}>
          <strong style={{ color: INK, fontWeight: 600 }}>{attribues}</strong> attribué{attribues > 1 ? 's' : ''}
          {' · '}
          <strong style={{ color: items.length - attribues ? GOLD : INK, fontWeight: 600 }}>
            {items.length - attribues}
          </strong> sans CMD
        </span>
      </div>

      {parSerie.map(({ serie, avecCmd, sansCmd, trous, plage, prochain }) => (
        seulementLibres && sansCmd.length === 0 ? null : (
        <section key={serie.id} style={{
          ...panel, padding: 14,
          // Une série vide reste affichée : c'est une plage de CMD réservée,
          // pas un oubli. Estompée, elle ne réclame pas l'attention pour autant.
          opacity: avecCmd.length + sansCmd.length === 0 ? 0.6 : 1,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <h3 style={{
              margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 14,
              fontWeight: 600, color: serie.couleur || ACC,
            }}>{serie.code} — {serie.nom}</h3>
            <span style={{ color: MUTED, fontSize: 11.5 }}>
              plage {plage[0]}–{plage[1]} · {avecCmd.length} attribué{avecCmd.length > 1 ? 's' : ''}
              {sansCmd.length ? ` · ${sansCmd.length} sans CMD` : ''}
            </span>
            <span style={{
              marginLeft: 'auto', padding: '3px 10px', borderRadius: 999,
              border: `1px solid ${GREEN}44`, background: `${GREEN}14`,
              color: GREEN, fontSize: 11, whiteSpace: 'nowrap',
            }}>
              prochain libre <strong style={{ fontWeight: 700 }}>{prochain}</strong>
            </span>
          </div>
          {serie.note ? (
            <p style={{ margin: '0 0 10px', color: GOLD, fontSize: 11.5 }}>⚠ {serie.note}</p>
          ) : null}

          {avecCmd.length === 0 && sansCmd.length === 0 ? (
            <p style={{ margin: 0, color: MUTED, fontSize: 12.5 }}>Aucun item dans cette série.</p>
          ) : null}

          {avecCmd.length && !seulementLibres ? (
            <>
              <p style={sousTitre}>CMD attribué</p>
              <div style={{ display: 'grid', gap: 4 }}>
                {avecCmd.map((i) => (
                  <Rangee key={i.id} item={i} byId={byId} onOpen={onOpen} />
                ))}
              </div>
            </>
          ) : null}

          {trous.length && !seulementLibres ? (
            <p style={{ margin: '10px 0 0', color: GOLD, fontSize: 11.5, lineHeight: 1.5 }}>
              Trous dans la numérotation : {trous.slice(0, 24).join(', ')}
              {trous.length > 24 ? ` … (+${trous.length - 24})` : ''}.
              Un numéro sauté est un modèle que le resource pack n'aura jamais.
            </p>
          ) : null}

          {sansCmd.length ? (
            <div style={avecCmd.length && !seulementLibres
              ? { marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}` } : null}>
              <p style={sousTitre}>Sans CMD attribué</p>
              <div style={{ display: 'grid', gap: 4 }}>
                {sansCmd.map((i) => <Rangee key={i.id} item={i} byId={byId} onOpen={onOpen} />)}
              </div>
            </div>
          ) : null}
        </section>
        )
      ))}

      {orphelins.length && !(seulementLibres && orphelins.every((i) => i.cmd != null)) ? (
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
      <span title={(STATUTS[item.statut] || STATUTS.a_tester).label} style={{ fontSize: 11 }}>
        {(STATUTS[item.statut] || STATUTS.a_tester).icon}
      </span>
      <code style={{ color: MUTED, fontSize: 10.5 }}>{item.baseItem}</code>
    </button>
  );
}

const sousTitre = {
  margin: '0 0 6px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: MUTED,
};
