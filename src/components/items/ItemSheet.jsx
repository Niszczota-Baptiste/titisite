import { useState } from 'react';
import { CodexItem } from '../admin/editors/minecraft/CodexPicker';
import { PowerBreakdown } from './PowerBreakdown';
import {
  ACC, ACQUISITIONS, GOLD, INK, LINE, MUTED, STATUTS, btn, panel, pts,
} from './theme';

// La fiche d'un item. Sert autant à consulter (« qu'est-ce qui a déjà été
// fait ? ») qu'à vérifier un score contesté : le détail du calcul y est
// entier, et les deux commandes /give — celle saisie et celle régénérée —
// sont montrées côte à côte plutôt que fondues, parce qu'elles disent deux
// choses différentes.

export function ItemSheet({ item, referentiel, byId, canEdit, onEdit, onDelete, onClose }) {
  if (!item) return null;
  const st = STATUTS[item.statut] || STATUTS.a_tester;
  const acq = ACQUISITIONS[item.acquisition] || ACQUISITIONS.autre;

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0,1fr)' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <CodexItem byId={byId} id={item.baseItem} size={40} showName={false} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <h2 style={{
            margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 20,
            fontWeight: 700, color: INK,
          }}>{item.nom}</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
            {item.tierNom ? <Chip couleur={item.tierCouleur}>{item.tierNom}</Chip> : null}
            {item.panoplieNom ? <Chip couleur={item.panoplieCouleur}>{item.panoplieNom}</Chip> : null}
            <Chip couleur={st.color}>{st.icon} {st.label}</Chip>
            <Chip>{acq.icon} {acq.label}</Chip>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit ? <button type="button" onClick={onEdit} style={btn(true)}>✎ Modifier</button> : null}
          {canEdit ? <button type="button" onClick={onDelete} style={btn()}>🗑</button> : null}
          {onClose ? <button type="button" onClick={onClose} style={btn()}>Fermer</button> : null}
        </div>
      </header>

      {item.description ? (
        <p style={{
          margin: 0, color: MUTED, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-line',
          fontStyle: 'italic',
        }}>{item.description}</p>
      ) : null}

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Bloc titre="Identité">
            <Ligne label="Item de base">
              <CodexItem byId={byId} id={item.baseItem} size={18} />
              <code style={{ marginLeft: 8, color: MUTED, fontSize: 11 }}>{item.baseItem || '—'}</code>
            </Ligne>
            <Ligne label="Série">{item.serieNom ? `${item.serieCode} — ${item.serieNom}` : '—'}</Ligne>
            <Ligne label="CMD">
              {item.cmd ? (
                <code style={{ color: GOLD, fontSize: 13 }}>{item.cmd}</code>
              ) : (
                <span style={{ color: MUTED }}>à attribuer</span>
              )}
            </Ligne>
            <Ligne label="Responsable">{item.responsable || '—'}</Ligne>
            {item.uniqueItemNom ? (
              <Ligne label="Item unique lié">{item.uniqueItemNom}</Ligne>
            ) : null}
          </Bloc>

          <Bloc titre="Acquisition">
            <Ligne label="Voie">{acq.icon} {acq.label}</Ligne>
            {item.ressources ? <Ligne label="Ressources">{item.ressources}</Ligne> : null}
            {item.prix ? <Ligne label="Prix">{item.prix}</Ligne> : null}
          </Bloc>

          {item.attributs.length || item.enchantements.length || item.unbreakable ? (
            <Bloc titre="Effets">
              {item.attributs.map((a) => {
                const meta = referentiel.attributs.find((x) => x.cle === a.attribut);
                const slot = referentiel.slots.find((s) => s.cle === a.slot);
                return (
                  <Ligne key={a.id} label={meta?.label || a.attribut}>
                    <strong style={{ color: a.valeur < 0 ? '#e0526f' : '#7be3a8' }}>
                      {a.valeur > 0 ? '+' : ''}{a.valeur}{a.mode === 'pourcent' ? ' %' : ''}
                    </strong>
                    {a.slot !== 'any' ? <span style={{ color: MUTED, fontSize: 11 }}> · {slot?.label}</span> : null}
                  </Ligne>
                );
              })}
              {item.enchantements.map((e) => {
                const meta = referentiel.enchantements.find((x) => x.cle === e.enchant);
                const hors = meta && e.niveau > meta.max;
                return (
                  <Ligne key={e.id} label={meta?.label || e.enchant}>
                    <strong style={{ color: INK }}>niveau {e.niveau}</strong>
                    {hors ? (
                      <span title={`Plafond vanilla : ${meta.max}`} style={{ color: GOLD, fontSize: 11 }}>
                        {' '}· au-delà du plafond vanilla ({meta.max})
                      </span>
                    ) : null}
                  </Ligne>
                );
              })}
              {item.unbreakable ? <Ligne label="Incassable">Oui</Ligne> : null}
            </Bloc>
          ) : (
            <Bloc titre="Effets">
              <p style={{ margin: 0, color: MUTED, fontSize: 12.5 }}>
                Aucun attribut ni enchantement renseigné — la fiche reste à compléter.
              </p>
            </Bloc>
          )}

          {item.note ? (
            <Bloc titre="Note">
              <p style={{ margin: 0, color: MUTED, fontSize: 12.5, lineHeight: 1.55 }}>{item.note}</p>
            </Bloc>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <PowerBreakdown puissance={item.puissance} tiers={referentiel.tiers} />

          <Bloc titre="Commande /give">
            <Commande
              titre="Régénérée depuis la fiche"
              aide="Reflète toujours les champs ci-contre : elle change dès qu'un attribut bouge."
              valeur={item.commandeGeneree}
            />
            {item.commande ? (
              <Commande
                titre="Saisie à la main"
                aide="Conservée telle quelle, jamais interprétée — elle peut faire des choses que le formulaire ne modélise pas."
                valeur={item.commande}
              />
            ) : null}
          </Bloc>
        </div>
      </div>
    </div>
  );
}

function Commande({ titre, aide, valeur }) {
  const [copie, setCopie] = useState(false);
  const copier = () => {
    navigator.clipboard?.writeText(valeur).then(() => {
      setCopie(true);
      setTimeout(() => setCopie(false), 1600);
    }).catch(() => { /* presse-papiers refusé : le texte reste sélectionnable */ });
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ color: ACC, fontSize: 11.5 }}>{titre}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={copier} style={{ ...btn(copie), padding: '3px 9px', fontSize: 11.5 }}>
          {copie ? '✓ Copiée' : '⧉ Copier'}
        </button>
      </div>
      <p style={{ margin: '0 0 5px', color: MUTED, fontSize: 11, lineHeight: 1.45 }}>{aide}</p>
      <pre style={{
        margin: 0, padding: 9, borderRadius: 8, border: `1px solid ${LINE}`,
        background: 'rgba(0,0,0,0.34)', color: INK, fontSize: 11,
        maxHeight: 168, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
      }}>{valeur}</pre>
    </div>
  );
}

function Bloc({ titre, children }) {
  return (
    <section style={{ ...panel, padding: 14 }}>
      <h3 style={{
        margin: '0 0 10px', fontFamily: "'Space Grotesk',sans-serif", fontSize: 12.5,
        fontWeight: 600, color: ACC, letterSpacing: '0.05em', textTransform: 'uppercase',
      }}>{titre}</h3>
      {children}
    </section>
  );
}

function Ligne({ label, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0',
      borderTop: `1px solid ${LINE}`, fontSize: 12.5, color: INK,
    }}>
      <span style={{ color: MUTED, minWidth: 108, flexShrink: 0 }}>{label}</span>
      <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>{children}</span>
    </div>
  );
}

function Chip({ children, couleur }) {
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 999, fontSize: 11, whiteSpace: 'nowrap',
      border: `1px solid ${couleur ? `${couleur}55` : LINE}`,
      background: couleur ? `${couleur}14` : 'rgba(255,255,255,0.03)',
      color: couleur || MUTED,
    }}>{children}</span>
  );
}
