import { useEffect, useState } from 'react';
import { api } from '../../../../api/client';
import { useCodex } from '../../../../hooks/useCodex';
import { useConfirm } from '../../../../ui/ConfirmProvider';
import { useToast } from '../../../../ui/ToastProvider';
import { Empty, ErrorBanner } from '../../../project/shared';
import { ACC, ACC_RGB, Button, Field, Input, inputStyle } from '../../ui';
import { CodexItem, CodexPicker } from './CodexPicker';

const TYPES = [
  { id: 'crafting', label: '🛠️ Établi' },
  { id: 'smelting', label: '🔥 Fourneau' },
];

const emptyForm = () => ({
  id: null, resultId: '', resultCount: 1, type: 'crafting',
  ingredients: [{ item: '', count: 1 }], note: '',
});

// Éditeur des recettes custom Minefield (globales). Les recettes vanilla restent
// en lecture seule côté client ; ici on ne saisit que ce qui manque, avec
// autocomplétion sur le codex.
export function RecipesEditor() {
  const { catalog, byId } = useCodex();
  const confirm = useConfirm();
  const toast = useToast();
  const [recipes, setRecipes] = useState(null);
  const [form, setForm] = useState(null); // null = pas d'édition en cours
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.recipes.list().then(setRecipes).catch(() => setErr('Chargement impossible.'));
  useEffect(() => { load(); }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setIng = (i, patch) => setForm((f) => ({
    ...f, ingredients: f.ingredients.map((it, j) => (j === i ? { ...it, ...patch } : it)),
  }));
  const addIng = () => setForm((f) => ({ ...f, ingredients: [...f.ingredients, { item: '', count: 1 }] }));
  const removeIng = (i) => setForm((f) => ({
    ...f, ingredients: f.ingredients.filter((_, j) => j !== i),
  }));

  const save = async () => {
    const ingredients = form.ingredients.filter((it) => it.item);
    if (!form.resultId) { setErr('Choisis l\'item produit.'); return; }
    if (ingredients.length === 0) { setErr('Ajoute au moins un ingrédient.'); return; }
    setSaving(true); setErr('');
    const payload = {
      resultId: form.resultId,
      resultCount: form.resultCount,
      type: form.type,
      ingredients,
      note: form.note,
    };
    try {
      if (form.id) await api.recipes.update(form.id, payload);
      else await api.recipes.create(payload);
      toast?.success?.('Recette enregistrée.');
      setForm(null);
      await load();
    } catch (e) { setErr(e.message || 'Enregistrement impossible.'); }
    finally { setSaving(false); }
  };

  const edit = (r) => {
    setErr('');
    setForm({
      id: r.id, resultId: r.resultId, resultCount: r.resultCount, type: r.type,
      ingredients: r.ingredients.length ? r.ingredients.map((i) => ({ ...i })) : [{ item: '', count: 1 }],
      note: r.note || '',
    });
  };

  const remove = async (r) => {
    const ok = await confirm({
      title: 'Supprimer la recette',
      message: `La recette de « ${byId.get(r.resultId)?.nomFr || r.resultId} » sera supprimée.`,
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    try { await api.recipes.remove(r.id); await load(); }
    catch { setErr('Suppression impossible.'); }
  };

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h2 style={{
          fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700,
          color: '#ede8f8', letterSpacing: '-0.3px', margin: 0,
        }}>
          Recettes custom
        </h2>
        {recipes && (
          <span style={{ fontSize: 13, color: 'rgba(180,170,200,0.6)' }}>
            {recipes.length} recette{recipes.length > 1 ? 's' : ''}
          </span>
        )}
        {!form && (
          <Button style={{ marginLeft: 'auto' }} onClick={() => { setErr(''); setForm(emptyForm()); }}>
            + Nouvelle recette
          </Button>
        )}
      </header>
      <p style={{ fontSize: 13, color: 'rgba(180,170,200,0.55)', marginTop: 0, marginBottom: 18 }}>
        Les recettes vanilla sont déjà connues du calculateur. Ajoute ici uniquement
        les recettes Minefield (meubles, blocs custom…).
      </p>

      <ErrorBanner error={err} onDismiss={() => setErr('')} />

      {form && (
        <RecipeForm
          form={form} catalog={catalog} byId={byId} saving={saving}
          setField={setField} setIng={setIng} addIng={addIng} removeIng={removeIng}
          onSave={save} onCancel={() => { setForm(null); setErr(''); }}
        />
      )}

      {recipes == null ? (
        <p style={{ fontSize: 13, color: 'rgba(180,170,200,0.6)' }}>Chargement…</p>
      ) : recipes.length === 0 ? (
        <Empty>Aucune recette custom pour l'instant.</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {recipes.map((r) => (
            <RecipeRow key={r.id} r={r} byId={byId} onEdit={() => edit(r)} onRemove={() => remove(r)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecipeForm({ form, catalog, byId, saving, setField, setIng, addIng, removeIng, onSave, onCancel }) {
  return (
    <div style={{
      background: 'rgba(20,10,42,0.6)', border: `1px solid rgba(${ACC_RGB},0.3)`,
      borderRadius: 14, padding: 18, marginBottom: 18,
    }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: '2 1 240px', minWidth: 220 }}>
          <Field label="Item produit">
            <CodexPicker catalog={catalog} byId={byId} value={form.resultId}
              onChange={(id) => setField('resultId', id)} />
          </Field>
        </div>
        <div style={{ flex: '0 1 110px', minWidth: 90 }}>
          <Field label="Quantité produite">
            <Input type="number" min={1} value={form.resultCount}
              onChange={(e) => setField('resultCount', Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        </div>
        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
          <Field label="Type">
            <div style={{ display: 'flex', gap: 6 }}>
              {TYPES.map((t) => (
                <button type="button" key={t.id}
                  onClick={() => setField('type', t.id)}
                  style={{
                    flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                    fontSize: 12, fontFamily: "'Inter',sans-serif",
                    background: form.type === t.id ? `rgba(${ACC_RGB},0.2)` : 'transparent',
                    border: `1px solid ${form.type === t.id ? ACC : 'rgba(80,50,130,0.28)'}`,
                    color: form.type === t.id ? ACC : '#ede8f8',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </div>

      <div style={{ fontSize: 12, letterSpacing: '0.4px', textTransform: 'uppercase',
        color: 'rgba(180,170,200,0.55)', marginBottom: 8 }}>
        Ingrédients
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {form.ingredients.map((ing, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <CodexPicker catalog={catalog} byId={byId} value={ing.item}
                onChange={(id) => setIng(i, { item: id })} placeholder="Ingrédient…" />
            </div>
            <input type="number" min={1} value={ing.count}
              onChange={(e) => setIng(i, { count: Math.max(1, Number(e.target.value) || 1) })}
              style={{ ...inputStyle, width: 72, flexShrink: 0 }} />
            <button type="button" onClick={() => removeIng(i)}
              title="Retirer"
              style={{
                flexShrink: 0, width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
                background: 'rgba(220,60,60,0.12)', border: '1px solid rgba(220,60,60,0.3)',
                color: '#f87171', fontSize: 16,
              }}
            >×</button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addIng}
        style={{
          marginTop: 10, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
          background: 'transparent', border: '1px dashed rgba(80,50,130,0.4)',
          color: 'rgba(200,180,240,0.8)', fontSize: 13, fontFamily: "'Inter',sans-serif",
        }}
      >+ Ingrédient</button>

      <div style={{ marginTop: 14 }}>
        <Field label="Note (optionnel)">
          <Input value={form.note} onChange={(e) => setField('note', e.target.value)}
            placeholder="ex. établi de menuiserie" />
        </Field>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Button onClick={onSave} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

function RecipeRow({ r, byId, onEdit, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      background: 'rgba(20,10,42,0.5)', border: '1px solid rgba(80,50,130,0.28)',
      borderRadius: 12, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
        <CodexItem byId={byId} id={r.resultId} size={28} />
        {r.resultCount > 1 && (
          <span style={{ fontSize: 12, color: '#4dd9ac', fontWeight: 700 }}>×{r.resultCount}</span>
        )}
      </div>
      <span style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 10,
        background: 'rgba(120,80,180,0.18)', border: '1px solid rgba(120,80,180,0.35)',
        color: 'rgba(200,180,240,0.85)',
      }}>
        {r.type === 'smelting' ? '🔥 Fourneau' : '🛠️ Établi'}
      </span>
      <span style={{ color: 'rgba(180,170,200,0.45)', fontSize: 13 }}>←</span>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
        {r.ingredients.map((ing, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
            <CodexItem byId={byId} id={ing.item} size={20} showName={false} />
            <span style={{ color: 'rgba(220,210,240,0.85)' }}>
              {byId.get(ing.item)?.nomFr || ing.item} ×{ing.count}
            </span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button type="button" onClick={onEdit}
          style={ghostBtn}>Modifier</button>
        <button type="button" onClick={onRemove}
          style={{ ...ghostBtn, color: '#f87171', borderColor: 'rgba(220,60,60,0.3)' }}>Supprimer</button>
      </div>
    </div>
  );
}

const ghostBtn = {
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
  background: 'transparent', border: '1px solid rgba(80,50,130,0.3)',
  color: '#ede8f8', fontFamily: "'Inter',sans-serif",
};
