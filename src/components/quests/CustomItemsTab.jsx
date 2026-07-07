import { useState } from 'react';
import { api } from '../../api/client';
import { useConfirm } from '../../ui/ConfirmProvider';
import { Button, Field, Input, Textarea } from '../admin/ui';
import { CodexItem, CodexPicker } from '../admin/editors/minecraft/CodexPicker';
import { ACC, ACC_RGB, GOLD, INK, MUTED, panel } from './theme';

// « Items » : la liste d'objets custom du serveur — un item Minecraft/Minefield
// du codex rebaptisé (ex. « Chair de zombie » → « Chair de noyé »), avec des
// enchantements libres. Ces items sont ensuite sélectionnables dans les
// entrées / récompenses / prérequis des quêtes (refCode 'custom:<id>') et
// rapprochés des coffres des projets par leur nom custom (suivi de stock).
// `catalog`/`byId` = codex de base (sans les entrées custom : un item custom se
// base toujours sur un vrai item du jeu).
export function CustomItemsTab({ items, catalog, byId, canEdit, onChanged }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null); // 'new' | item | null

  const remove = async (it) => {
    const ok = await confirm({
      title: 'Supprimer l\'item custom', danger: true, confirmLabel: 'Supprimer',
      message: `« ${it.nom} » sera supprimé. Les lignes de quêtes qui l'utilisent gardent leur libellé mais perdent le lien.`,
    });
    if (!ok) return;
    await api.quests.deleteCustomItem(it.id);
    onChanged();
  };

  return (
    <div>
      <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: MUTED, margin: '0 0 12px', lineHeight: 1.55, maxWidth: 720 }}>
        Les objets custom du serveur : un item Minecraft ou Minefield renommé (ex. de la chair de
        zombie devenue « Chair de noyé »), avec ses enchantements. Utilise-les dans les entrées,
        récompenses et prérequis des quêtes — et range-les dans les coffres des projets sous ce
        nom pour que le suivi « Où trouver dans les coffres » les retrouve.
      </p>

      {canEdit && (
        <Button onClick={() => setEditing('new')} disabled={editing != null}>+ Item custom</Button>
      )}
      {editing === 'new' && (
        <CustomItemForm catalog={catalog} byId={byId}
          onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />
      )}

      {items.length === 0 && editing == null ? (
        <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: MUTED, marginTop: 16 }}>
          Aucun item custom pour l'instant.{canEdit ? ' Clique « + Item custom » pour créer le premier.' : ''}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {items.map((it) => (
            editing !== 'new' && editing?.id === it.id ? (
              <CustomItemForm key={it.id} item={it} catalog={catalog} byId={byId}
                onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />
            ) : (
              <CustomItemCard key={it.id} item={it} byId={byId} canEdit={canEdit}
                onEdit={() => setEditing(it)} onRemove={() => remove(it)} />
            )
          ))}
        </div>
      )}
    </div>
  );
}

function CustomItemCard({ item, byId, canEdit, onEdit, onRemove }) {
  const base = item.refCode ? byId?.get(item.refCode) : null;
  return (
    <div style={{ ...panel, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        {base ? (
          <CodexItem byId={byId} id={item.refCode} size={30} showName={false} />
        ) : (
          <span style={{ fontSize: 26, lineHeight: 1 }}>📦</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ color: INK, fontFamily: "'Space Grotesk',sans-serif", fontSize: 15 }}>{item.nom}</strong>
          {base && (
            <span style={{ fontSize: 11.5, color: MUTED, fontFamily: "'Inter',sans-serif" }}>
              à partir de : {base.nomFr}
            </span>
          )}
        </div>
        {(item.enchantements.length > 0 || (item.stats || []).length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
            {item.enchantements.map((e, i) => (
              <span key={`e${i}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                borderRadius: 999, fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 600,
                background: 'rgba(232,200,106,0.1)', color: GOLD, border: '1px solid rgba(232,200,106,0.35)',
              }}>⚡ {e}</span>
            ))}
            {(item.stats || []).map((st, i) => (
              <span key={`s${i}`} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                borderRadius: 999, fontSize: 11, fontFamily: "'Inter',sans-serif", fontWeight: 600,
                background: 'rgba(123,211,232,0.1)', color: '#7bd3e8', border: '1px solid rgba(123,211,232,0.35)',
              }}>📊 {st}</span>
            ))}
          </div>
        )}
        {item.note && (
          <p style={{ margin: '6px 0 0', fontFamily: "'Inter',sans-serif", fontSize: 12.5, color: 'rgba(214,206,232,0.75)', whiteSpace: 'pre-wrap' }}>
            {item.note}
          </p>
        )}
      </div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <Button variant="ghost" onClick={onEdit}>Éditer</Button>
          <Button variant="danger" onClick={onRemove}>Suppr.</Button>
        </div>
      )}
    </div>
  );
}

function CustomItemForm({ item, catalog, byId, onDone, onCancel }) {
  const [nom, setNom] = useState(item?.nom || '');
  const [refCode, setRefCode] = useState(item?.refCode || '');
  const [enchantements, setEnchantements] = useState(item?.enchantements || []);
  const [stats, setStats] = useState(item?.stats || []);
  const [note, setNote] = useState(item?.note || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const setEnchant = (i, v) => setEnchantements((es) => es.map((x, j) => (j === i ? v : x)));
  const setStat = (i, v) => setStats((ss) => ss.map((x, j) => (j === i ? v : x)));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const body = {
        nom, refCode: refCode || null,
        enchantements: enchantements.filter((e) => e.trim()),
        stats: stats.filter((s) => s.trim()),
        note,
      };
      if (item) await api.quests.updateCustomItem(item.id, body);
      else await api.quests.createCustomItem(body);
      onDone();
    } catch (e) { setErr(e.body?.error || e.message); setSaving(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }}
      style={{ ...panel, padding: 16, marginTop: 10, border: `1px solid rgba(${ACC_RGB},0.4)` }}>
      {err && <p style={{ color: '#ff8a9b', fontSize: 12 }}>{err}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        <Field label="Item de base (Minecraft / Minefield)">
          <CodexPicker catalog={catalog} byId={byId} value={refCode}
            onChange={(id, entry) => { setRefCode(id); if (!nom.trim()) setNom(entry?.nomFr || ''); }} />
        </Field>
        <Field label="Nom custom">
          <Input value={nom} onChange={(e) => setNom(e.target.value)} required placeholder="Chair de noyé" />
        </Field>
      </div>

      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: GOLD, marginBottom: 6, fontWeight: 600 }}>
          ⚡ Enchantements
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {enchantements.map((e, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 34px', gap: 6 }}>
              <Input value={e} placeholder="Tranchant V" onChange={(ev) => setEnchant(i, ev.target.value)} />
              <Button type="button" variant="danger" style={{ padding: '6px 8px' }}
                onClick={() => setEnchantements((es) => es.filter((_, j) => j !== i))}>×</Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" style={{ marginTop: 6 }}
          onClick={() => setEnchantements((es) => [...es, ''])}>+ Enchantement</Button>
      </div>

      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '1px', color: '#7bd3e8', marginBottom: 6, fontWeight: 600 }}>
          📊 Stats (comme en jeu)
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {stats.map((st, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 34px', gap: 6 }}>
              <Input value={st} placeholder="Dégâts +10, Vitesse +20 %…" onChange={(ev) => setStat(i, ev.target.value)} />
              <Button type="button" variant="danger" style={{ padding: '6px 8px' }}
                onClick={() => setStats((ss) => ss.filter((_, j) => j !== i))}>×</Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" style={{ marginTop: 6 }}
          onClick={() => setStats((ss) => [...ss, ''])}>+ Stat</Button>
      </div>

      <Field label="Note (optionnel)">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
          placeholder="Où le farmer, à quoi il sert…" />
      </Field>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button>
        <Button type="submit" disabled={saving}>{saving ? '…' : (item ? 'Mettre à jour' : 'Créer l\'item')}</Button>
      </div>
    </form>
  );
}
