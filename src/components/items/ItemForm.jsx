import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api/client';
import { CodexPicker } from '../admin/editors/minecraft/CodexPicker';
import { PowerBreakdown } from './PowerBreakdown';
import {
  ACC, CRIMSON, GOLD, INK, LINE, MUTED, btn, input, label, panel,
} from './theme';

// Le formulaire de création / édition.
//
// Deux partis pris de conception :
//   • L'aperçu de puissance est VIVANT et vient du serveur (POST /items/power).
//     Recalculer côté client irait plus vite mais ferait exister deux formules :
//     celle affichée pendant qu'on règle l'item, et celle qui décide du score
//     une fois enregistré. C'est exactement la divergence que ce module existe
//     pour éliminer.
//   • La commande /give est régénérée en même temps que l'aperçu, mais le
//     champ libre reste : le document d'origine contient des commandes qui
//     font des choses hors de portée d'un formulaire (LodestonePos de la
//     boussole piaf, couleurs de nom). On les conserve sans les interpréter.

const vide = {
  nom: '', description: '', baseItem: '', tierId: '', serieId: '', panoplieId: '',
  cmd: '', acquisition: 'craftable', ressources: '', prix: '', commande: '',
  statut: 'a_tester', responsable: '', note: '', uniqueItemId: '',
  attributs: [], enchantements: [], unbreakable: false,
};

const versFormulaire = (item) => (item ? {
  nom: item.nom, description: item.description, baseItem: item.baseItem,
  tierId: item.tierId ?? '', serieId: item.serieId ?? '', panoplieId: item.panoplieId ?? '',
  cmd: item.cmd ?? '', acquisition: item.acquisition, ressources: item.ressources,
  prix: item.prix, commande: item.commande, statut: item.statut,
  responsable: item.responsable, note: item.note, uniqueItemId: item.uniqueItemId ?? '',
  attributs: item.attributs.map((a) => ({ attribut: a.attribut, valeur: a.valeur, mode: a.mode, slot: a.slot })),
  enchantements: item.enchantements.map((e) => ({ enchant: e.enchant, niveau: e.niveau })),
  unbreakable: item.unbreakable,
} : { ...vide });

// Le corps envoyé au serveur : les identifiants vides redeviennent `null`
// (une chaîne vide ferait une clé étrangère invalide côté base).
const versApi = (f) => ({
  ...f,
  tierId: f.tierId || null,
  serieId: f.serieId || null,
  panoplieId: f.panoplieId || null,
  uniqueItemId: f.uniqueItemId || null,
  cmd: f.cmd === '' ? null : Number(f.cmd),
});

export function ItemForm({ item, referentiel, catalog, byId, onSaved, onCancel }) {
  const [f, setF] = useState(() => versFormulaire(item));
  const [apercu, setApercu] = useState(item ? { puissance: item.puissance, commandeGeneree: item.commandeGeneree } : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  // Aperçu vivant, débounce 350 ms : assez court pour suivre la frappe, assez
  // long pour ne pas appeler le serveur à chaque caractère.
  const dernier = useRef(0);
  useEffect(() => {
    const jeton = ++dernier.current;
    const t = setTimeout(() => {
      api.items.power(versApi(f))
        .then((r) => { if (jeton === dernier.current) setApercu(r); })
        .catch(() => { /* l'aperçu n'est pas critique : on garde le précédent */ });
    }, 350);
    return () => clearTimeout(t);
  }, [f]);

  const enregistrer = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = versApi(f);
      const sauve = item ? await api.items.update(item.id, body) : await api.items.create(body);
      onSaved(sauve);
    } catch (e) {
      // Un CMD déjà pris n'est pas une panne : on nomme l'item qui le détient.
      setErr(e.body?.error === 'cmd_taken'
        ? `Le CMD ${e.body.cmd} est déjà pris par « ${e.body.item.nom} ».`
        : e.message);
    } finally {
      setBusy(false);
    }
  }, [f, item, onSaved]);

  const prochainCmd = async () => {
    if (!f.serieId) return;
    try {
      const r = await api.items.series.nextCmd(f.serieId);
      set('cmd', r.cmd);
    } catch (e) { setErr(e.message); }
  };

  const serie = referentiel.series.find((s) => String(s.id) === String(f.serieId));

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
      <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
        <Bloc titre="Identité">
          <Champ label="Nom">
            <input value={f.nom} onChange={(e) => set('nom', e.target.value)} style={input} autoFocus />
          </Champ>
          <Champ label="Description (le lore, une ligne par ligne du lore)">
            <textarea value={f.description} onChange={(e) => set('description', e.target.value)}
              rows={3} style={{ ...input, resize: 'vertical', fontFamily: "'Inter',sans-serif" }} />
          </Champ>
          <Champ label="Item de base">
            <CodexPicker catalog={catalog} byId={byId} value={f.baseItem}
              onChange={(id) => set('baseItem', id)} placeholder="Rechercher dans le codex…" />
            <p style={{ margin: '5px 0 0', color: MUTED, fontSize: 11 }}>
              Détermine l'icône, la base de puissance (matériau × classe) et l'item de la commande /give.
            </p>
          </Champ>
        </Bloc>

        <Bloc titre="Classement">
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
            <Champ label="Palier">
              <select value={f.tierId} onChange={(e) => set('tierId', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                <option value="">— aucun —</option>
                {referentiel.tiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.nom} · {t.echelle} · budget {t.budget}</option>
                ))}
              </select>
            </Champ>
            <Champ label="Panoplie">
              <select value={f.panoplieId} onChange={(e) => set('panoplieId', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                <option value="">— aucune —</option>
                {referentiel.panoplies.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            </Champ>
            <Champ label="Série">
              <select value={f.serieId} onChange={(e) => set('serieId', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                <option value="">— aucune —</option>
                {referentiel.series.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.nom}</option>)}
              </select>
            </Champ>
            <Champ label="CMD (Custom Model Data)">
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={f.cmd} onChange={(e) => set('cmd', e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric" placeholder="—" style={{ ...input, flex: 1 }} />
                <button type="button" onClick={prochainCmd} disabled={!f.serieId}
                  title={f.serieId ? 'Prochain numéro libre de la série' : 'Choisis d’abord une série'}
                  style={{ ...btn(), opacity: f.serieId ? 1 : 0.45, whiteSpace: 'nowrap' }}>
                  Suivant
                </button>
              </div>
              {serie ? (
                <p style={{ margin: '5px 0 0', color: MUTED, fontSize: 11 }}>
                  Plage de la série : {Number(serie.code) * 1000 + 1} – {Number(serie.code) * 1000 + 999}.
                  Le document demande de rester dans l'ordre croissant — « Suivant » s'en charge.
                </p>
              ) : null}
            </Champ>
          </div>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginTop: 10 }}>
            <Champ label="Statut">
              <select value={f.statut} onChange={(e) => set('statut', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
                {referentiel.statuts.map((s) => <option key={s.cle} value={s.cle}>{s.label}</option>)}
              </select>
            </Champ>
            <Champ label="Responsable de l'item">
              <input value={f.responsable} onChange={(e) => set('responsable', e.target.value)} style={input} />
            </Champ>
          </div>
        </Bloc>

        <Bloc titre="Acquisition">
          <Champ label="Voie">
            <select value={f.acquisition} onChange={(e) => set('acquisition', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {referentiel.acquisitions.map((a) => <option key={a.cle} value={a.cle}>{a.label}</option>)}
            </select>
          </Champ>
          <Champ label="Ressources nécessaires">
            <input value={f.ressources} onChange={(e) => set('ressources', e.target.value)}
              placeholder="3 lingots d'acier + 1 bâton (MC)" style={input} />
          </Champ>
          <Champ label="Prix">
            <input value={f.prix} onChange={(e) => set('prix', e.target.value)}
              placeholder="550 écailles" style={input} />
          </Champ>
        </Bloc>

        <AttributsEditor f={f} setF={setF} referentiel={referentiel} />
        <EnchantsEditor f={f} setF={setF} referentiel={referentiel} />

        <Bloc titre="Divers">
          <Champ label="Commande /give saisie à la main (conservée telle quelle)">
            <textarea value={f.commande} onChange={(e) => set('commande', e.target.value)} rows={3}
              placeholder="Laisse vide pour n'utiliser que la commande régénérée."
              style={{ ...input, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 11 }} />
          </Champ>
          <Champ label="Note interne">
            <textarea value={f.note} onChange={(e) => set('note', e.target.value)} rows={2}
              style={{ ...input, resize: 'vertical' }} />
          </Champ>
          <Champ label="Item unique lié (module Quêtes)">
            <select value={f.uniqueItemId} onChange={(e) => set('uniqueItemId', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="">— aucun —</option>
              {referentiel.uniqueItems.map((u) => <option key={u.id} value={u.id}>{u.nom}</option>)}
            </select>
          </Champ>
        </Bloc>
      </div>

      {/* Colonne collante : l'aperçu doit rester sous les yeux pendant qu'on
          remplit la colonne de gauche — c'est tout l'intérêt d'un aperçu vivant. */}
      <div style={{
        display: 'grid', gap: 14, alignContent: 'start',
        position: 'sticky', top: 0, alignSelf: 'start',
      }}>
        {apercu ? (
          <>
            <PowerBreakdown
              puissance={apercu.puissance} tiers={referentiel.tiers}
              onSuggest={(id) => set('tierId', String(id))}
            />
            <Bloc titre="Commande régénérée">
              <pre style={{
                margin: 0, padding: 9, borderRadius: 8, border: `1px solid ${LINE}`,
                background: 'rgba(0,0,0,0.34)', color: INK, fontSize: 11,
                maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>{apercu.commandeGeneree || '(renseigne un item de base)'}</pre>
            </Bloc>
          </>
        ) : (
          <p style={{ color: MUTED, fontSize: 12.5 }}>Calcul de l'aperçu…</p>
        )}

        {err ? (
          <p style={{
            margin: 0, padding: 10, borderRadius: 8, fontSize: 12.5,
            border: `1px solid ${CRIMSON}55`, background: `${CRIMSON}14`, color: CRIMSON,
          }}>{err}</p>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={btn()}>Annuler</button>
          <button type="button" onClick={enregistrer} disabled={busy || !f.nom.trim()}
            style={{ ...btn(true), opacity: busy || !f.nom.trim() ? 0.5 : 1 }}>
            {busy ? 'Enregistrement…' : (item ? 'Enregistrer' : 'Créer l\'item')}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttributsEditor({ f, setF, referentiel }) {
  const restants = useMemo(
    () => referentiel.attributs.filter((a) => !f.attributs.some((x) => x.attribut === a.cle)),
    [referentiel.attributs, f.attributs],
  );
  const maj = (i, k, v) => setF((p) => ({
    ...p, attributs: p.attributs.map((a, j) => (i === j ? { ...a, [k]: v } : a)),
  }));
  const ajouter = () => {
    const libre = restants[0] || referentiel.attributs[0];
    setF((p) => ({ ...p, attributs: [...p.attributs, { attribut: libre.cle, valeur: 1, mode: 'flat', slot: 'any' }] }));
  };
  const retirer = (i) => setF((p) => ({ ...p, attributs: p.attributs.filter((_, j) => j !== i) }));

  return (
    <Bloc titre="Attributs" action={<button type="button" onClick={ajouter} style={{ ...btn(), padding: '3px 9px', fontSize: 11.5 }}>+ Attribut</button>}>
      {f.attributs.length === 0 ? (
        <p style={{ margin: 0, color: MUTED, fontSize: 12 }}>Aucun modificateur d'attribut.</p>
      ) : f.attributs.map((a, i) => {
        const meta = referentiel.attributs.find((x) => x.cle === a.attribut);
        return (
          <div key={`${a.attribut}-${i}`} style={{
            display: 'grid', gap: 6, alignItems: 'center', marginBottom: 8,
            gridTemplateColumns: 'minmax(0,1.6fr) 68px 74px minmax(0,1fr) 26px',
          }}>
            <select value={a.attribut} onChange={(e) => maj(i, 'attribut', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {referentiel.attributs.map((x) => <option key={x.cle} value={x.cle}>{x.label}</option>)}
            </select>
            <input value={a.valeur} onChange={(e) => maj(i, 'valeur', e.target.value)}
              inputMode="decimal" style={{ ...input, textAlign: 'right' }} />
            <select value={a.mode} onChange={(e) => maj(i, 'mode', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              <option value="flat">{meta?.unite || 'plat'}</option>
              <option value="pourcent">%</option>
            </select>
            <select value={a.slot} onChange={(e) => maj(i, 'slot', e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {referentiel.slots.map((s) => <option key={s.cle} value={s.cle}>{s.label}</option>)}
            </select>
            <button type="button" onClick={() => retirer(i)} title="Retirer"
              style={{ ...btn(), padding: '6px 0', color: MUTED }}>×</button>
          </div>
        );
      })}
      <p style={{ margin: '6px 0 0', color: MUTED, fontSize: 11, lineHeight: 1.45 }}>
        « % » écrit un modificateur en Operation 1 (multiply_base) : c'est ce que le document
        note « −15 % ». En points, c'est un ajout brut (Operation 0).
      </p>
    </Bloc>
  );
}

function EnchantsEditor({ f, setF, referentiel }) {
  const maj = (i, k, v) => setF((p) => ({
    ...p, enchantements: p.enchantements.map((e, j) => (i === j ? { ...e, [k]: v } : e)),
  }));
  const ajouter = () => {
    const pris = new Set(f.enchantements.map((e) => e.enchant));
    const libre = referentiel.enchantements.find((e) => !pris.has(e.cle)) || referentiel.enchantements[0];
    setF((p) => ({ ...p, enchantements: [...p.enchantements, { enchant: libre.cle, niveau: 1 }] }));
  };
  const retirer = (i) => setF((p) => ({ ...p, enchantements: p.enchantements.filter((_, j) => j !== i) }));

  return (
    <Bloc titre="Enchantements" action={<button type="button" onClick={ajouter} style={{ ...btn(), padding: '3px 9px', fontSize: 11.5 }}>+ Enchantement</button>}>
      {f.enchantements.length === 0 ? (
        <p style={{ margin: 0, color: MUTED, fontSize: 12 }}>Aucun enchantement.</p>
      ) : f.enchantements.map((e, i) => {
        const meta = referentiel.enchantements.find((x) => x.cle === e.enchant);
        const horsPlafond = meta && Number(e.niveau) > meta.max;
        return (
          <div key={`${e.enchant}-${i}`} style={{
            display: 'grid', gap: 6, alignItems: 'center', marginBottom: 8,
            gridTemplateColumns: 'minmax(0,1fr) 72px minmax(0,88px) 26px',
          }}>
            <select value={e.enchant} onChange={(ev) => maj(i, 'enchant', ev.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {referentiel.enchantements.map((x) => <option key={x.cle} value={x.cle}>{x.label}</option>)}
            </select>
            <input value={e.niveau} onChange={(ev) => maj(i, 'niveau', ev.target.value.replace(/\D/g, ''))}
              inputMode="numeric" style={{ ...input, textAlign: 'right' }} />
            {/* Un niveau au-delà du plafond vanilla est LÉGAL via /give (le
                trident du document porte Impaling X) : on le signale, on ne
                le refuse pas. */}
            <span style={{ fontSize: 10.5, color: horsPlafond ? GOLD : MUTED }}>
              {horsPlafond ? `> max ${meta.max}` : `max ${meta?.max ?? '—'}`}
            </span>
            <button type="button" onClick={() => retirer(i)} title="Retirer"
              style={{ ...btn(), padding: '6px 0', color: MUTED }}>×</button>
          </div>
        );
      })}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: 12.5, color: INK }}>
        <input type="checkbox" checked={f.unbreakable} onChange={(ev) => setF((p) => ({ ...p, unbreakable: ev.target.checked }))} />
        Incassable (<code style={{ fontSize: 11, color: MUTED }}>Unbreakable:1</code>)
      </label>
    </Bloc>
  );
}

function Bloc({ titre, action, children }) {
  return (
    <section style={{ ...panel, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h3 style={{
          margin: 0, fontFamily: "'Space Grotesk',sans-serif", fontSize: 12.5, fontWeight: 600,
          color: ACC, letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>{titre}</h3>
        <span style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </section>
  );
}

function Champ({ label: l, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <span style={label}>{l}</span>
      {children}
    </div>
  );
}
