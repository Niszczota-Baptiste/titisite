import { useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { Button, Field, Input, Textarea } from '../../admin/ui';
import { CodexPicker } from '../../admin/editors/minecraft/CodexPicker';
import {
  ACC, ACC_RGB, CRIMSON, GOLD, INK, ITEM_CATEGORIES, ITEM_CATEGORY_ORDER,
  MANUAL_SOURCE_KINDS, MUTED, PROBA_SOURCES, panel,
} from '../theme';
import { ItemTooltip } from './ItemTooltip';
import { EsperancePanel, SommeBanner } from './LootTable';
import { reliquat, sommeProbabilites } from './loot';

// Éditeur d'item unique. Deux partis pris :
//  • aperçu de l'infobulle EN DIRECT à côté du formulaire — le lore se règle à
//    l'œil, comme en jeu ;
//  • somme des probabilités et verdict « vendre ou ouvrir » recalculés à chaque
//    frappe, avec les MÊMES composants que la fiche (aucun rendu parallèle).

const selectStyle = {
  background: 'rgba(14,8,32,0.72)', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8,
  padding: '9px 10px', color: INK, fontFamily: "'Inter',sans-serif", fontSize: 13, outline: 'none',
};

const RESULT_TYPES = [
  ['item_referentiel', 'Objet du codex'],
  ['unique_item', 'Item unique'],
  ['pa', 'PA'],
  ['reputation', 'Réputation'],
  ['autre', 'Autre (texte libre)'],
];

export function ItemForm({
  item, items, rarities, sets = [], factions, quests = [], byId, catalog, onDone, onCancel,
}) {
  const [nom, setNom] = useState(item?.nom || '');
  const [refCode, setRefCode] = useState(item?.baseItemId || '');
  const [lore, setLore] = useState(item?.lore || '');
  const [rareteId, setRareteId] = useState(item?.rareteId || '');
  const [categorie, setCategorie] = useState(item?.categorie || 'autre');
  const [factionId, setFactionId] = useState(item?.factionId || '');
  const [setId, setSetId] = useState(item?.setId || '');
  const [estVendable, setEstVendable] = useState(!!item?.estVendable);
  const [prixVente, setPrixVente] = useState(item?.prixVente ?? '');
  const [prixUnite, setPrixUnite] = useState(item?.prixUnite || 'pa');
  const [estOuvrable, setEstOuvrable] = useState(!!item?.estOuvrable);
  const [enchantements, setEnchantements] = useState(item?.enchantements || []);
  const [stats, setStats] = useState(item?.stats || []);
  const [tags, setTags] = useState((item?.tags || []).join(', '));
  const [note, setNote] = useState(item?.note || '');
  const [loot, setLoot] = useState(item?.loot?.map(stripLoot) || []);
  const [sourcesManuelles, setSources] = useState(item?.sourcesManuelles?.map(stripSource) || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Les monnaies disponibles pour libeller un prix (jamais l'objet lui-même).
  const monnaies = useMemo(
    () => items.filter((i) => i.categorie === 'monnaie' && i.id !== item?.id),
    [items, item?.id],
  );
  const autresItems = useMemo(() => items.filter((i) => i.id !== item?.id), [items, item?.id]);

  // Aperçu : l'objet tel qu'il s'affichera, sans attendre l'enregistrement.
  const apercu = {
    nom: nom || 'Sans nom',
    lore,
    baseItemId: refCode || null,
    enchantements,
    stats,
    rarete: rarities.find((r) => String(r.id) === String(rareteId)) || null,
  };

  // Lignes enrichies du prix de leur cible → même calcul que sur la fiche.
  const lootCalcul = useMemo(() => loot.map((l) => {
    const cible = l.resultatType === 'unique_item' ? itemsById.get(Number(l.resultatUniqueId)) : null;
    return {
      ...l,
      label: l.labelAffiche || cible?.nom || byId?.get(l.resultatRef)?.nomFr || l.resultatRef || '(sans nom)',
      ciblePrix: cible?.prixVente ?? null,
      ciblePrixUnite: cible?.prixUnite ?? null,
    };
  }), [loot, itemsById, byId]);

  const somme = sommeProbabilites(loot);

  const setLigne = (i, patch) => setLoot((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setSource = (i, patch) => setSources((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const ajouterReliquat = () => setLoot((ls) => [...ls, {
    resultatType: 'autre', labelAffiche: 'Rien / commun',
    probabilite: Math.round(reliquat(ls) * 100) / 100,
    probabiliteSource: 'estimee', quantiteMin: 1, quantiteMax: 1,
  }]);

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = {
        nom,
        refCode: refCode || null,
        lore,
        rareteId: rareteId ? Number(rareteId) : null,
        categorie,
        factionId: factionId ? Number(factionId) : null,
        setId: setId ? Number(setId) : null,
        estVendable,
        prixVente: prixVente === '' ? null : Number(prixVente),
        prixUnite,
        estOuvrable,
        enchantements: enchantements.filter((e) => e.trim()),
        stats: stats.filter((s) => s.trim()),
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        note,
        loot: estOuvrable ? loot : [],
        sourcesManuelles,
      };
      const saved = item
        ? await api.quests.uniqueItems.update(item.id, body)
        : await api.quests.uniqueItems.create(body);
      onDone(saved);
    } catch (e) { setErr(e.body?.error || e.message); setSaving(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }}
      style={{ ...panel, padding: 18, border: `1px solid rgba(${ACC_RGB},0.4)` }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12.5 }}>Erreur : {err}</p>}

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 380px', minWidth: 280 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <Field label="Nom affiché">
              <Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Géode de taille moyenne" />
            </Field>
            <Field label="Item support (codex)">
              <CodexPicker catalog={catalog} byId={byId} value={refCode}
                onChange={(id, entry) => { setRefCode(id); if (!nom.trim()) setNom(entry?.nomFr || ''); }} />
            </Field>
          </div>

          <Field label="Lore (le texte violet en jeu — une ligne par saut de ligne)">
            <Textarea value={lore} onChange={(e) => setLore(e.target.value)} rows={2}
              placeholder="Une belle géode assez rare à trouver. Son contenu doit être intéressant !" />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Field label="Rareté">
              <select value={rareteId} onChange={(e) => setRareteId(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                <option value="">—</option>
                {rarities.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}
              </select>
            </Field>
            <Field label="Catégorie">
              <select value={categorie} onChange={(e) => setCategorie(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                {ITEM_CATEGORY_ORDER.map((k) => (
                  <option key={k} value={k}>{ITEM_CATEGORIES[k].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Faction d'origine">
              <select value={factionId} onChange={(e) => setFactionId(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                <option value="">—</option>
                {factions.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </Field>
            <Field label="Set (collection)">
              <select value={setId} onChange={(e) => setSetId(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                <option value="">—</option>
                {sets.map((se) => (
                  <option key={se.id} value={se.id}>
                    {se.nom}{se.taille ? ` (${se.taille})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', margin: '4px 0 12px' }}>
            <Check checked={estVendable} onChange={setEstVendable} label="Vendable" />
            <Check checked={estOuvrable} onChange={setEstOuvrable} label="Ouvrable (contenant)" />
          </div>

          {estVendable && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 10 }}>
              <Field label="Prix de vente estimé">
                <Input type="number" step="0.01" min="0" value={prixVente}
                  onChange={(e) => setPrixVente(e.target.value)} placeholder="120" />
              </Field>
              <Field label="Payé en">
                <select value={prixUnite} onChange={(e) => setPrixUnite(e.target.value)} style={{ ...selectStyle, width: '100%' }}>
                  <option value="pa">PA</option>
                  {monnaies.map((m) => <option key={m.id} value={`custom:${m.id}`}>{m.nom}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>

        {/* Aperçu en direct */}
        <div style={{ flex: '0 0 auto', display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: MUTED, fontWeight: 600 }}>
            Aperçu en jeu
          </span>
          <ItemTooltip item={apercu} byId={byId} />
        </div>
      </div>

      <ListeLibre titre="⚡ Enchantements" couleur={GOLD} valeurs={enchantements}
        setValeurs={setEnchantements} placeholder="Tranchant V" />
      <ListeLibre titre="📊 Stats" couleur="#7bd3e8" valeurs={stats}
        setValeurs={setStats} placeholder="Dégâts +10" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
        <Field label="Tags (séparés par des virgules)">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="pvp, event, à confirmer" />
        </Field>
      </div>
      <Field label="Notes (usages, remarques RP, incertitudes…)">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
      </Field>

      {/* ── Table de butin ── */}
      {estOuvrable && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: GOLD, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>
              🎁 Table de butin
            </span>
            <Button type="button" variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => setLoot((ls) => [...ls, {
                resultatType: 'item_referentiel', probabilite: '', probabiliteSource: 'estimee',
                quantiteMin: 1, quantiteMax: 1, labelAffiche: '',
              }])}>+ Résultat</Button>
            {somme < 100 && loot.length > 0 && (
              <Button type="button" variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={ajouterReliquat}>+ Reliquat « rien » ({Math.round(reliquat(loot) * 10) / 10} %)</Button>
            )}
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            {loot.map((l, i) => (
              <div key={i} style={{
                display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
                background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)',
                borderRadius: 8, padding: 8,
              }}>
                <select value={l.resultatType}
                  onChange={(e) => setLigne(i, { resultatType: e.target.value, resultatRef: null, resultatUniqueId: null })}
                  style={{ ...selectStyle, minWidth: 140 }} aria-label="Type de résultat">
                  {RESULT_TYPES.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
                </select>

                {l.resultatType === 'item_referentiel' && (
                  <div style={{ minWidth: 190, flex: 1 }}>
                    {/* Le picker voit le catalogue AUGMENTÉ : choisir un item
                        unique ('custom:<id>') bascule la ligne sur son type —
                        sinon elle resterait une référence texte, sans nom ni
                        prix. Le serveur normalise de la même façon. */}
                    <CodexPicker catalog={catalog} byId={byId} value={l.resultatRef || ''}
                      onChange={(id) => {
                        const uid = /^custom:(\d+)$/.exec(String(id || ''));
                        setLigne(i, uid
                          ? { resultatType: 'unique_item', resultatRef: null, resultatUniqueId: Number(uid[1]) }
                          : { resultatRef: id });
                      }} />
                  </div>
                )}
                {l.resultatType === 'unique_item' && (
                  <select value={l.resultatUniqueId || ''}
                    onChange={(e) => setLigne(i, { resultatUniqueId: Number(e.target.value) || null })}
                    style={{ ...selectStyle, minWidth: 190, flex: 1 }} aria-label="Item unique obtenu">
                    <option value="">Item unique…</option>
                    {autresItems.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                  </select>
                )}
                {l.resultatType === 'reputation' && (
                  <select value={l.factionId || ''}
                    onChange={(e) => setLigne(i, { factionId: Number(e.target.value) || null })}
                    style={{ ...selectStyle, minWidth: 150 }} aria-label="Faction">
                    <option value="">Faction…</option>
                    {factions.map((fa) => <option key={fa.id} value={fa.id}>{fa.nom}</option>)}
                  </select>
                )}

                <Input value={l.labelAffiche || ''} placeholder="Libellé affiché"
                  onChange={(e) => setLigne(i, { labelAffiche: e.target.value })}
                  style={{ minWidth: 120, flex: 1 }} />
                <Input type="number" min="1" value={l.quantiteMin ?? 1} aria-label="Quantité min"
                  onChange={(e) => setLigne(i, { quantiteMin: e.target.value })} style={{ width: 66 }} />
                <span style={{ color: MUTED, fontSize: 12 }}>à</span>
                <Input type="number" min="1" value={l.quantiteMax ?? 1} aria-label="Quantité max"
                  onChange={(e) => setLigne(i, { quantiteMax: e.target.value })} style={{ width: 66 }} />
                <Input type="number" step="0.01" min="0" max="100" value={l.probabilite ?? ''}
                  aria-label="Probabilité en %" placeholder="%"
                  onChange={(e) => setLigne(i, { probabilite: e.target.value })} style={{ width: 78 }} />
                <select value={l.probabiliteSource || 'estimee'}
                  onChange={(e) => setLigne(i, { probabiliteSource: e.target.value })}
                  style={{ ...selectStyle, minWidth: 110 }} aria-label="Source de la probabilité">
                  {Object.entries(PROBA_SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <Button type="button" variant="danger" style={{ padding: '6px 8px', marginLeft: 'auto' }}
                  onClick={() => setLoot((ls) => ls.filter((_, j) => j !== i))}>×</Button>
              </div>
            ))}
          </div>

          {loot.length > 0 && (
            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              <SommeBanner somme={somme} manque={reliquat(loot)} />
              <EsperancePanel
                item={{ prixVente: prixVente === '' ? null : Number(prixVente), prixUnite }}
                loot={lootCalcul} itemsById={itemsById}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Sources manuelles ── */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: '#7be3a8', fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>
            📍 Sources manuelles
          </span>
          <Button type="button" variant="ghost" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => setSources((ss) => [...ss, { kind: 'mob', label: '', note: '' }])}>+ Source</Button>
          <span style={{ fontSize: 11.5, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
            uniquement ce qui n'est pas déduit des quêtes, contenants et offres —
            une source peut tout de même renvoyer à la quête où on la croise
          </span>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {sourcesManuelles.map((s, i) => (
            <div key={i} style={{
              display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
              background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)',
              borderRadius: 8, padding: 8,
            }}>
              <select value={s.kind} onChange={(e) => setSource(i, { kind: e.target.value })}
                style={{ ...selectStyle, minWidth: 140 }} aria-label="Type de source">
                {Object.entries(MANUAL_SOURCE_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
              <Input value={s.label} placeholder="Golem des grottes" required
                onChange={(e) => setSource(i, { label: e.target.value })} style={{ minWidth: 140, flex: 1 }} />
              <Input value={s.note || ''} placeholder="Note (optionnel)"
                onChange={(e) => setSource(i, { note: e.target.value })} style={{ minWidth: 120, flex: 1 }} />
              {/* La quête où l'on rencontre cette source. Elle ne « donne » pas
                  l'objet — sinon la ligne serait dérivée des récompenses. */}
              <select value={s.questId || ''} aria-label="Quête liée"
                onChange={(e) => setSource(i, { questId: e.target.value ? Number(e.target.value) : null })}
                style={{ ...selectStyle, minWidth: 170, flex: 1 }}>
                <option value="">Quête liée (optionnel)…</option>
                {quests.map((q) => <option key={q.id} value={q.id}>{q.titre}</option>)}
              </select>
              <Input type="number" value={s.x ?? ''} placeholder="X" aria-label="X"
                onChange={(e) => setSource(i, { x: e.target.value })} style={{ width: 70 }} />
              <Input type="number" value={s.y ?? ''} placeholder="Y" aria-label="Y"
                onChange={(e) => setSource(i, { y: e.target.value })} style={{ width: 70 }} />
              <Input type="number" value={s.z ?? ''} placeholder="Z" aria-label="Z"
                onChange={(e) => setSource(i, { z: e.target.value })} style={{ width: 70 }} />
              <Button type="button" variant="danger" style={{ padding: '6px 8px' }}
                onClick={() => setSources((ss) => ss.filter((_, j) => j !== i))}>×</Button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={saving}>
          {saving ? '…' : (item ? 'Mettre à jour' : "Créer l'item")}
        </Button>
      </div>
    </form>
  );
}

// Les lignes reviennent du serveur avec des champs calculés (label résolu, prix
// de la cible) : on ne renvoie que ce qui est saisi.
const stripLoot = (l) => ({
  id: l.id,
  resultatType: l.resultatType,
  resultatRef: l.resultatRef,
  resultatUniqueId: l.resultatUniqueId,
  factionId: l.factionId,
  labelAffiche: l.labelAffiche,
  quantiteMin: l.quantiteMin,
  quantiteMax: l.quantiteMax,
  probabilite: l.probabilite,
  probabiliteSource: l.probabiliteSource,
});

const stripSource = (s) => ({
  kind: s.kind, label: s.label, note: s.note, mapId: s.mapId, x: s.x, y: s.y, z: s.z,
  questId: s.questId ?? null,
});

function Check({ checked, onChange, label }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer',
      fontFamily: "'Inter',sans-serif", fontSize: 13, color: INK,
    }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: ACC, width: 15, height: 15 }} />
      {label}
    </label>
  );
}

function ListeLibre({ titre, couleur, valeurs, setValeurs, placeholder }) {
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: couleur, marginBottom: 6, fontWeight: 600 }}>
        {titre}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {valeurs.map((v, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 34px', gap: 6 }}>
            <Input value={v} placeholder={placeholder}
              onChange={(e) => setValeurs((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
            <Button type="button" variant="danger" style={{ padding: '6px 8px' }}
              onClick={() => setValeurs((xs) => xs.filter((_, j) => j !== i))}>×</Button>
          </div>
        ))}
      </div>
      <Button type="button" variant="ghost" style={{ marginTop: 6 }}
        onClick={() => setValeurs((xs) => [...xs, ''])}>+ Ajouter</Button>
    </div>
  );
}

// ── Échelle de rareté ───────────────────────────────────────────────────────
// Table éditable (et non un enum figé) : de nouveaux paliers apparaissent au fil
// des découvertes en jeu. L'ordre porte le sens — il pilote le tri du catalogue.

export function RaritiesManager({ rarities, onChanged, onClose }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [nouveau, setNouveau] = useState({ nom: '', couleur: '#c9a8e8' });

  const run = async (fn) => {
    setBusy(true); setErr(null);
    try { await fn(); await onChanged(); }
    catch (e) { setErr(e.body?.error || e.message); } finally { setBusy(false); }
  };

  const deplacer = (index, delta) => {
    const ids = rarities.map((r) => r.id);
    const cible = index + delta;
    if (cible < 0 || cible >= ids.length) return;
    [ids[index], ids[cible]] = [ids[cible], ids[index]];
    run(() => api.quests.rarities.reorder(ids));
  };

  return (
    <div style={{ ...panel, padding: 16, border: `1px solid rgba(${ACC_RGB},0.4)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <strong style={{ fontFamily: "'Space Grotesk',sans-serif", color: INK, fontSize: 15 }}>
          Échelle de rareté
        </strong>
        <span style={{ fontSize: 12, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
          du plus commun au plus rare — l'ordre pilote le tri du catalogue
        </span>
        <Button variant="ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>Fermer</Button>
      </div>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12 }}>{err}</p>}

      <div style={{ display: 'grid', gap: 6 }}>
        {rarities.map((r, i) => (
          <div key={r.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)',
            borderRadius: 8, padding: 8, borderLeft: `3px solid ${r.couleur}`,
          }}>
            <span style={{ color: MUTED, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, width: 20 }}>{i + 1}</span>
            <Input value={r.nom} style={{ flex: 1, minWidth: 120 }}
              onChange={(e) => run(() => api.quests.rarities.update(r.id, { ...r, nom: e.target.value }))} />
            <input type="color" value={r.couleur} aria-label={`Couleur de ${r.nom}`}
              onChange={(e) => run(() => api.quests.rarities.update(r.id, { ...r, couleur: e.target.value }))}
              style={{ width: 44, height: 34, background: 'none', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8 }} />
            <Button type="button" variant="ghost" disabled={busy || i === 0}
              onClick={() => deplacer(i, -1)} style={{ padding: '6px 9px' }}>↑</Button>
            <Button type="button" variant="ghost" disabled={busy || i === rarities.length - 1}
              onClick={() => deplacer(i, 1)} style={{ padding: '6px 9px' }}>↓</Button>
            <Button type="button" variant="danger" disabled={busy} style={{ padding: '6px 8px' }}
              onClick={() => run(() => api.quests.rarities.remove(r.id))}>×</Button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input value={nouveau.nom} placeholder="Nouveau palier (ex. Mythique)"
          onChange={(e) => setNouveau((n) => ({ ...n, nom: e.target.value }))} style={{ flex: 1, minWidth: 160 }} />
        <input type="color" value={nouveau.couleur} aria-label="Couleur du nouveau palier"
          onChange={(e) => setNouveau((n) => ({ ...n, couleur: e.target.value }))}
          style={{ width: 44, height: 34, background: 'none', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8 }} />
        <Button type="button" disabled={busy || !nouveau.nom.trim()}
          onClick={() => run(async () => {
            await api.quests.rarities.create(nouveau);
            setNouveau({ nom: '', couleur: '#c9a8e8' });
          })}>+ Palier</Button>
      </div>
      <p style={{ margin: '10px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
        Supprimer un palier ne supprime aucun objet : ceux qui le portaient se retrouvent
        simplement sans rareté. <span style={{ color: CRIMSON }}>Les modifications sont
        enregistrées immédiatement.</span>
      </p>
    </div>
  );
}

// Gestion des sets — même esprit que l'échelle de rareté : une table éditable
// en ligne, parce que le jeu en ajoute. `taille` est ce que le set compte EN
// JEU ; le compteur à côté dit ce qui est documenté (« 3/5 »), il se dérive des
// items rattachés et ne se saisit jamais.
export function SetsManager({ sets, onChanged, onClose }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [nouveau, setNouveau] = useState({ nom: '', couleur: '#c9a8e8', taille: 5 });

  const run = async (fn) => {
    setBusy(true); setErr(null);
    try { await fn(); await onChanged(); }
    catch (e) { setErr(e.body?.error || e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ ...panel, padding: 16, border: `1px solid rgba(${ACC_RGB},0.4)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontFamily: "'Space Grotesk',sans-serif", color: INK, fontSize: 15 }}>
          Sets d'items
        </strong>
        <span style={{ fontSize: 12, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
          nom, couleur, et le nombre de pièces que le set compte en jeu
        </span>
        <Button variant="ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>Fermer</Button>
      </div>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12 }}>{err}</p>}

      <div style={{ display: 'grid', gap: 6 }}>
        {sets.map((se) => (
          <div key={se.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            background: 'rgba(20,14,38,0.5)', border: '1px solid rgba(80,50,130,0.22)',
            borderRadius: 8, padding: 8, borderLeft: `3px solid ${se.couleur}`,
          }}>
            <Input value={se.nom} style={{ flex: 1, minWidth: 130 }}
              onChange={(e) => run(() => api.quests.sets.update(se.id, { ...se, nom: e.target.value }))} />
            <input type="color" value={se.couleur} aria-label={`Couleur de ${se.nom}`}
              onChange={(e) => run(() => api.quests.sets.update(se.id, { ...se, couleur: e.target.value }))}
              style={{ width: 44, height: 34, background: 'none', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8 }} />
            <Input type="number" min="0" value={se.taille} aria-label={`Nombre de pièces de ${se.nom}`}
              onChange={(e) => run(() => api.quests.sets.update(se.id, { ...se, taille: e.target.value }))}
              style={{ width: 74 }} />
            <span style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 11.5, minWidth: 78,
              color: se.taille && se.membres >= se.taille ? '#7be3a8' : MUTED,
            }}>
              {se.membres} documenté{se.membres > 1 ? 's' : ''}
            </span>
            <Button type="button" variant="danger" disabled={busy} style={{ padding: '6px 8px' }}
              onClick={() => run(() => api.quests.sets.remove(se.id))}>×</Button>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Input value={nouveau.nom} placeholder="Nouveau set (ex. Joyaux rouges)"
          onChange={(e) => setNouveau((n) => ({ ...n, nom: e.target.value }))} style={{ flex: 1, minWidth: 160 }} />
        <input type="color" value={nouveau.couleur} aria-label="Couleur du nouveau set"
          onChange={(e) => setNouveau((n) => ({ ...n, couleur: e.target.value }))}
          style={{ width: 44, height: 34, background: 'none', border: '1px solid rgba(80,50,130,0.3)', borderRadius: 8 }} />
        <Input type="number" min="0" value={nouveau.taille} aria-label="Nombre de pièces"
          onChange={(e) => setNouveau((n) => ({ ...n, taille: e.target.value }))} style={{ width: 74 }} />
        <Button type="button" disabled={busy || !nouveau.nom.trim()}
          onClick={() => run(async () => {
            await api.quests.sets.create(nouveau);
            setNouveau({ nom: '', couleur: '#c9a8e8', taille: 5 });
          })}>+ Set</Button>
      </div>
      <p style={{ margin: '10px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 11.5, color: MUTED, lineHeight: 1.5 }}>
        Supprimer un set ne supprime aucun objet : ses membres se retrouvent simplement sans
        set. <span style={{ color: CRIMSON }}>Les modifications sont enregistrées
        immédiatement.</span>
      </p>
    </div>
  );
}
