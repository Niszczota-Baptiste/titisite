import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import {
  ACC, ACC_RGB, CRIMSON, GOLD, INK, LINE, MUTED, btn, input, panel,
} from './theme';

// Le référentiel : paliers, séries, panoplies… et le BARÈME de puissance.
//
// Le barème est en base et éditable ici parce que c'est ce qui rend le score
// discutable au bon endroit. Un admin qui trouve « Raccommodage » sous-évalué
// change 15 en 22 et tout le catalogue se recalcule — au lieu d'ouvrir un
// ticket contre une constante enfouie dans le code.

const SOUS_ONGLETS = [
  ['tiers', 'Paliers'],
  ['series', 'Séries'],
  ['panoplies', 'Panoplies'],
  ['bareme', 'Barème de puissance'],
];

export function RefTab({ referentiel, canEdit, onChanged }) {
  const [vue, setVue] = useState('tiers');
  const [err, setErr] = useState(null);

  const agir = async (promesse) => {
    setErr(null);
    try { await promesse; await onChanged(); } catch (e) { setErr(e.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {SOUS_ONGLETS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setVue(k)} style={btn(vue === k)}>{l}</button>
        ))}
      </div>
      {err ? (
        <p style={{
          padding: 10, borderRadius: 8, fontSize: 12.5, marginBottom: 12,
          border: `1px solid ${CRIMSON}55`, background: `${CRIMSON}14`, color: CRIMSON,
        }}>{err}</p>
      ) : null}

      {vue === 'tiers' ? <Tiers referentiel={referentiel} canEdit={canEdit} agir={agir} /> : null}
      {vue === 'series' ? <Series referentiel={referentiel} canEdit={canEdit} agir={agir} /> : null}
      {vue === 'panoplies' ? <Panoplies referentiel={referentiel} canEdit={canEdit} agir={agir} /> : null}
      {vue === 'bareme' ? <Bareme referentiel={referentiel} canEdit={canEdit} agir={agir} /> : null}
    </div>
  );
}

// ── Paliers ───────────────────────────────────────────────────────────────

function Tiers({ referentiel, canEdit, agir }) {
  const [neuf, setNeuf] = useState({ nom: '', echelle: 'standard', budget: 100, couleur: '#c9a8e8' });
  return (
    <section style={{ ...panel, padding: 14 }}>
      <Aide>
        Le budget est ce qu'un item de ce palier est censé coûter en points de puissance.
        Il ne multiplie jamais la puissance : il lui sert de repère. Plusieurs échelles peuvent
        coexister — le serveur en a déjà deux, celle des artefacts et celle des Tréfonds.
      </Aide>
      <Table entetes={['Nom', 'Échelle', 'Budget', 'Couleur', 'Items', '']}>
        {referentiel.tiers.map((t) => (
          <LigneEditable
            key={t.id} valeurs={t} canEdit={canEdit}
            champs={[
              { cle: 'nom', type: 'text' },
              { cle: 'echelle', type: 'text', largeur: 110 },
              { cle: 'budget', type: 'number', largeur: 82 },
              { cle: 'couleur', type: 'color', largeur: 52 },
            ]}
            info={`${t.items}`}
            empeche={t.items ? `${t.items} item${t.items > 1 ? 's utilisent' : ' utilise'} ce palier : ils perdraient leur budget.` : null}
            onSave={(v) => agir(api.items.tiers.update(t.id, v))}
            onDelete={() => agir(api.items.tiers.remove(t.id))}
          />
        ))}
      </Table>
      {canEdit ? (
        <Ajout
          champs={[
            ['nom', 'Nom du palier', 'text'],
            ['echelle', 'Échelle', 'text'],
            ['budget', 'Budget', 'number'],
            ['couleur', '', 'color'],
          ]}
          valeurs={neuf} setValeurs={setNeuf}
          onAdd={() => agir(api.items.tiers.create(neuf)).then(() => setNeuf({ nom: '', echelle: 'standard', budget: 100, couleur: '#c9a8e8' }))}
        />
      ) : null}
    </section>
  );
}

// ── Séries ────────────────────────────────────────────────────────────────

function Series({ referentiel, canEdit, agir }) {
  const [neuf, setNeuf] = useState({ code: '', nom: '', couleur: '#c9a8e8', note: '' });
  return (
    <section style={{ ...panel, padding: 14 }}>
      <Aide>
        Une série est le préfixe à deux chiffres du CMD : « 01 » réserve la plage 1001–1999.
        Changer un code ne renumérote pas les items déjà attribués.
      </Aide>
      <Table entetes={['Code', 'Nom', 'Couleur', 'Note', 'Items', '']}>
        {referentiel.series.map((s) => (
          <LigneEditable
            key={s.id} valeurs={s} canEdit={canEdit}
            champs={[
              { cle: 'code', type: 'text', largeur: 56 },
              { cle: 'nom', type: 'text' },
              { cle: 'couleur', type: 'color', largeur: 52 },
              { cle: 'note', type: 'text' },
            ]}
            info={`${s.items}`}
            empeche={s.items ? `${s.items} item${s.items > 1 ? 's appartiennent' : ' appartient'} à cette série : ${s.items > 1 ? 'ils perdraient' : 'il perdrait'} sa plage de CMD.` : null}
            onSave={(v) => agir(api.items.series.update(s.id, v))}
            onDelete={() => agir(api.items.series.remove(s.id))}
          />
        ))}
      </Table>
      {canEdit ? (
        <Ajout
          champs={[['code', 'Code', 'text'], ['nom', 'Nom de la série', 'text'], ['couleur', '', 'color']]}
          valeurs={neuf} setValeurs={setNeuf}
          onAdd={() => agir(api.items.series.create(neuf)).then(() => setNeuf({ code: '', nom: '', couleur: '#c9a8e8', note: '' }))}
        />
      ) : null}
    </section>
  );
}

// ── Panoplies ─────────────────────────────────────────────────────────────

function Panoplies({ referentiel, canEdit, agir }) {
  const [neuf, setNeuf] = useState({ nom: '', taille: 0, couleur: '#c9a8e8', bonus: '' });
  return (
    <section style={{ ...panel, padding: 14 }}>
      <Aide>
        « Taille » est le nombre de pièces que la panoplie compte EN JEU. La complétude
        (« 3/5 documentées ») s'en déduit — elle ne se saisit pas.
      </Aide>
      <Table entetes={['Nom', 'Taille', 'Couleur', 'Bonus de panoplie', 'Documentées', '']}>
        {referentiel.panoplies.map((p) => (
          <LigneEditable
            key={p.id} valeurs={p} canEdit={canEdit}
            champs={[
              { cle: 'nom', type: 'text' },
              { cle: 'taille', type: 'number', largeur: 62 },
              { cle: 'couleur', type: 'color', largeur: 52 },
              { cle: 'bonus', type: 'text' },
            ]}
            info={p.taille ? `${p.membres}/${p.taille}` : `${p.membres}`}
            infoAlerte={p.taille > 0 && p.membres < p.taille}
            empeche={p.membres ? `${p.membres} pièce${p.membres > 1 ? 's sont rattachées' : ' est rattachée'} à cette panoplie.` : null}
            onSave={(v) => agir(api.items.panoplies.update(p.id, v))}
            onDelete={() => agir(api.items.panoplies.remove(p.id))}
          />
        ))}
      </Table>
      {canEdit ? (
        <Ajout
          champs={[['nom', 'Nom de la panoplie', 'text'], ['taille', 'Pièces', 'number'], ['couleur', '', 'color']]}
          valeurs={neuf} setValeurs={setNeuf}
          onAdd={() => agir(api.items.panoplies.create(neuf)).then(() => setNeuf({ nom: '', taille: 0, couleur: '#c9a8e8', bonus: '' }))}
        />
      ) : null}
    </section>
  );
}

// ── Barème ────────────────────────────────────────────────────────────────

const GENRES = [
  ['attribut', 'Attributs', 'Points par unité. « Référence » convertit un pourcentage en unité plate : MOVEMENT_SPEED −15 % vaut −0,15 × 0,1.'],
  ['enchant', 'Enchantements', 'Points par niveau. Les malédictions ont un poids négatif — elles retirent de la puissance.'],
  ['materiau', 'Matériaux', "Points de base du matériau de l'item, avant le coefficient de classe."],
  ['classe', 'Classes', "Coefficient multipliant la base du matériau : un casque vaut une fraction d'un plastron."],
  ['reglage', 'Réglages', "Forfait « incassable » et tolérance d'écart au budget avant alerte."],
];

function Bareme({ referentiel, canEdit, agir }) {
  const [genre, setGenre] = useState('attribut');
  const [confirmerReset, setConfirmerReset] = useState(false);

  const libelles = useMemo(() => {
    const m = new Map();
    for (const a of referentiel.attributs) m.set(`attribut:${a.cle}`, a.label);
    for (const e of referentiel.enchantements) m.set(`enchant:${e.cle}`, e.label);
    for (const c of referentiel.classes) m.set(`classe:${c.cle}`, c.label);
    return m;
  }, [referentiel]);

  const lignes = referentiel.weights.filter((w) => w.genre === genre);
  const aide = GENRES.find(([k]) => k === genre)?.[2];

  return (
    <section style={{ ...panel, padding: 14 }}>
      <Aide>
        Ces poids décident du score de tous les items. La fiche d'un item montre le calcul
        ligne à ligne : quand un score sonne faux, c'est ici qu'on corrige — pas dans l'item.
      </Aide>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '12px 0' }}>
        {GENRES.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setGenre(k)}
            style={{ ...btn(genre === k), padding: '4px 10px', fontSize: 12 }}>{l}</button>
        ))}
        <span style={{ flex: 1 }} />
        {canEdit ? (
          confirmerReset ? (
            <>
              <span style={{ color: GOLD, fontSize: 12, alignSelf: 'center' }}>Tout remettre par défaut ?</span>
              <button type="button" onClick={() => { setConfirmerReset(false); agir(api.items.weights.reset()); }}
                style={{ ...btn(true), padding: '4px 10px', fontSize: 12, color: CRIMSON }}>Oui</button>
              <button type="button" onClick={() => setConfirmerReset(false)} style={{ ...btn(), padding: '4px 10px', fontSize: 12 }}>Non</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmerReset(true)} style={{ ...btn(), padding: '4px 10px', fontSize: 12 }}>
              ↺ Barème par défaut
            </button>
          )
        ) : null}
      </div>

      <p style={{ margin: '0 0 10px', color: MUTED, fontSize: 11.5, lineHeight: 1.5 }}>{aide}</p>

      <Table entetes={genre === 'attribut' ? ['Clé', 'Poids', 'Référence', ''] : ['Clé', 'Poids', '']}>
        {lignes.map((w) => (
          <LignePoids
            key={w.cle} poids={w} libelle={libelles.get(w.cle)} canEdit={canEdit}
            avecReference={genre === 'attribut'}
            onSave={(v) => agir(api.items.weights.update(w.cle, v))}
          />
        ))}
      </Table>
    </section>
  );
}

function LignePoids({ poids, libelle, canEdit, avecReference, onSave }) {
  const [p, setP] = useState(poids.poids);
  const [r, setR] = useState(poids.reference);
  const modifie = Number(p) !== poids.poids || (avecReference && Number(r) !== poids.reference);
  return (
    <tr style={{ borderTop: `1px solid ${LINE}` }}>
      <td style={td}>
        <span style={{ color: INK }}>{libelle || poids.cle.split(':')[1]}</span>
        <code style={{ color: MUTED, fontSize: 10.5, marginLeft: 8 }}>{poids.cle}</code>
        {poids.note ? (
          <div style={{ color: MUTED, fontSize: 10.5, marginTop: 2 }}>{poids.note}</div>
        ) : null}
      </td>
      <td style={{ ...td, width: 96 }}>
        <input value={p} onChange={(e) => setP(e.target.value)} disabled={!canEdit}
          inputMode="decimal" style={{ ...input, textAlign: 'right', padding: '5px 8px' }} />
      </td>
      {avecReference ? (
        <td style={{ ...td, width: 96 }}>
          <input value={r} onChange={(e) => setR(e.target.value)} disabled={!canEdit}
            inputMode="decimal" style={{ ...input, textAlign: 'right', padding: '5px 8px' }} />
        </td>
      ) : null}
      <td style={{ ...td, width: 84 }}>
        {canEdit && modifie ? (
          <button type="button" onClick={() => onSave({ poids: Number(p), reference: Number(r) })}
            style={{ ...btn(true), padding: '4px 10px', fontSize: 11.5 }}>Appliquer</button>
        ) : null}
      </td>
    </tr>
  );
}

// ── Briques communes ──────────────────────────────────────────────────────

function LigneEditable({ valeurs, champs, canEdit, info, infoAlerte, empeche, onSave, onDelete }) {
  const [v, setV] = useState(valeurs);
  const [confirmer, setConfirmer] = useState(false);
  const modifie = champs.some((c) => String(v[c.cle] ?? '') !== String(valeurs[c.cle] ?? ''));
  return (
    <tr style={{ borderTop: `1px solid ${LINE}` }}>
      {champs.map((c) => (
        <td key={c.cle} style={{ ...td, width: c.largeur }}>
          <input
            type={c.type === 'color' ? 'color' : 'text'}
            value={v[c.cle] ?? ''} disabled={!canEdit}
            onChange={(e) => setV((p) => ({ ...p, [c.cle]: e.target.value }))}
            inputMode={c.type === 'number' ? 'decimal' : undefined}
            style={{ ...input, padding: c.type === 'color' ? 2 : '5px 8px', height: c.type === 'color' ? 30 : undefined }}
          />
        </td>
      ))}
      <td style={{ ...td, textAlign: 'right', color: infoAlerte ? GOLD : MUTED, fontSize: 12 }}>{info}</td>
      <td style={{ ...td, width: 118, textAlign: 'right' }}>
        {canEdit && modifie ? (
          <button type="button" onClick={() => onSave(v)} style={{ ...btn(true), padding: '4px 9px', fontSize: 11.5 }}>Appliquer</button>
        ) : null}
        {/* La colonne référencée est en ON DELETE SET NULL : supprimer un palier
            encore utilisé ne bloquerait rien, il viderait silencieusement le
            palier de ses items — qui perdraient leur budget, donc leur verdict.
            On désactive plutôt, en disant pourquoi. */}
        {canEdit && !modifie && empeche ? (
          <button type="button" disabled title={empeche}
            style={{ ...btn(), padding: '4px 9px', fontSize: 11.5, color: MUTED, cursor: 'not-allowed', opacity: 0.45 }}>🗑</button>
        ) : null}
        {canEdit && !modifie && !empeche ? (
          confirmer ? (
            <>
              <button type="button" onClick={() => { setConfirmer(false); onDelete(); }}
                style={{ ...btn(), padding: '4px 8px', fontSize: 11.5, color: CRIMSON }}>Supprimer</button>
              <button type="button" onClick={() => setConfirmer(false)} style={{ ...btn(), padding: '4px 8px', fontSize: 11.5 }}>×</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmer(true)} style={{ ...btn(), padding: '4px 9px', fontSize: 11.5, color: MUTED }}>🗑</button>
          )
        ) : null}
      </td>
    </tr>
  );
}

function Ajout({ champs, valeurs, setValeurs, onAdd }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
      {champs.map(([cle, ph, type]) => (
        <input
          key={cle} type={type === 'color' ? 'color' : 'text'} placeholder={ph}
          value={valeurs[cle] ?? ''} onChange={(e) => setValeurs((p) => ({ ...p, [cle]: e.target.value }))}
          inputMode={type === 'number' ? 'decimal' : undefined}
          style={{ ...input, width: type === 'color' ? 46 : (type === 'number' ? 90 : 170), padding: type === 'color' ? 2 : '7px 9px' }}
        />
      ))}
      <button type="button" onClick={onAdd} disabled={!valeurs.nom && !valeurs.code} style={btn(true)}>+ Ajouter</button>
    </div>
  );
}

function Table({ entetes, children }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 520 }}>
        <thead>
          <tr style={{ color: MUTED, textAlign: 'left' }}>
            {entetes.map((h, i) => (
              <th key={h || i} style={{ padding: '6px 8px', fontWeight: 500, fontSize: 11 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Aide({ children }) {
  return (
    <p style={{
      margin: 0, padding: '9px 11px', borderRadius: 8, color: MUTED, fontSize: 11.5,
      lineHeight: 1.55, border: `1px solid ${LINE}`, background: `rgba(${ACC_RGB},0.05)`,
    }}>{children}</p>
  );
}

const td = { padding: '6px 8px' };
