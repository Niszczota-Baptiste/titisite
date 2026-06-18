import { useEffect, useState } from 'react';
import { api } from '../../../../api/client';
import { useCodex } from '../../../../hooks/useCodex';
import { useConfirm } from '../../../../ui/ConfirmProvider';
import { useToast } from '../../../../ui/ToastProvider';
import { Empty, ErrorBanner } from '../../../project/shared';
import { ACC, ACC_RGB, Button, Field, Input } from '../../ui';
import { CodexItem, CodexPicker } from './CodexPicker';
import { CraftGrid } from './CraftGrid';

const TYPES = [
  { id: 'crafting', label: '🛠️ Établi' },
  { id: 'smelting', label: '🔥 Fourneau' },
];

const emptyGrid = () => Array(9).fill('');
const emptyForm = () => ({
  id: null, resultId: '', resultCount: 1, type: 'crafting', grid: emptyGrid(), note: '',
});

// Convertit une liste d'ingrédients (recettes anciennes sans grille) en cases,
// en répétant chaque item selon son count, jusqu'à 9 cases.
function gridFromIngredients(ingredients) {
  const cells = [];
  for (const it of ingredients || []) {
    for (let i = 0; i < it.count && cells.length < 9; i++) cells.push(it.item);
  }
  while (cells.length < 9) cells.push('');
  return cells.slice(0, 9);
}

// Éditeur des recettes custom Minefield (globales), avec placement sur une grille
// d'établi 3×3. Les recettes vanilla restent en lecture seule côté client.
export function RecipesEditor() {
  const { catalog, byId } = useCodex();
  const confirm = useConfirm();
  const toast = useToast();
  const [recipes, setRecipes] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.recipes.list().then(setRecipes).catch(() => setErr('Chargement impossible.'));
  useEffect(() => { load(); }, []);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.resultId) { setErr('Choisis l\'item produit.'); return; }
    if (form.grid.every((c) => !c)) { setErr('Pose au moins un ingrédient dans la grille.'); return; }
    setSaving(true); setErr('');
    try {
      const payload = {
        resultId: form.resultId,
        resultCount: form.resultCount,
        type: form.type,
        grid: form.grid,
        note: form.note,
      };
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
      grid: r.grid?.length ? Array.from({ length: 9 }, (_, i) => r.grid[i] || '') : gridFromIngredients(r.ingredients),
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
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: '#ede8f8', margin: 0 }}>
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
        Les recettes vanilla sont déjà connues du calculateur. Place ici les recettes
        Minefield sur la grille d'établi (clic sur une case pour poser un item).
      </p>

      <ErrorBanner error={err} onDismiss={() => setErr('')} />

      {form && (
        <RecipeForm form={form} catalog={catalog} byId={byId} saving={saving}
          setField={setField} onSave={save} onCancel={() => { setForm(null); setErr(''); }} />
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

function RecipeForm({ form, catalog, byId, saving, setField, onSave, onCancel }) {
  return (
    <div style={{
      background: 'rgba(20,10,42,0.6)', border: `1px solid rgba(${ACC_RGB},0.3)`,
      borderRadius: 14, padding: 18, marginBottom: 18,
    }}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {/* Grille d'établi */}
        <div>
          <div style={{ fontSize: 12, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'rgba(180,170,200,0.55)', marginBottom: 8 }}>
            Grille d'établi
          </div>
          <CraftGrid editable grid={form.grid} byId={byId} catalog={catalog}
            onChange={(g) => setField('grid', g)} />
        </div>

        {/* Paramètres */}
        <div style={{ flex: '1 1 240px', minWidth: 220, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Item produit">
            <CodexPicker catalog={catalog} byId={byId} value={form.resultId}
              onChange={(id) => setField('resultId', id)} />
          </Field>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '0 1 120px' }}>
              <Field label="Quantité produite">
                <Input type="number" min={1} value={form.resultCount}
                  onChange={(e) => setField('resultCount', Math.max(1, Number(e.target.value) || 1))} />
              </Field>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <Field label="Type">
                <div style={{ display: 'flex', gap: 6 }}>
                  {TYPES.map((t) => (
                    <button type="button" key={t.id} onClick={() => setField('type', t.id)}
                      style={{
                        flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                        fontSize: 12, fontFamily: "'Inter',sans-serif",
                        background: form.type === t.id ? `rgba(${ACC_RGB},0.2)` : 'transparent',
                        border: `1px solid ${form.type === t.id ? ACC : 'rgba(80,50,130,0.28)'}`,
                        color: form.type === t.id ? ACC : '#ede8f8',
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>
          <Field label="Note (optionnel)">
            <Input value={form.note} onChange={(e) => setField('note', e.target.value)}
              placeholder="ex. établi de menuiserie" />
          </Field>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Button onClick={onSave} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

function RecipeRow({ r, byId, onEdit, onRemove }) {
  const hasGrid = Array.isArray(r.grid) && r.grid.some((c) => c);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      background: 'rgba(20,10,42,0.5)', border: '1px solid rgba(80,50,130,0.28)',
      borderRadius: 12, padding: '12px 14px',
    }}>
      {hasGrid && <CraftGrid grid={r.grid} byId={byId} cell={26} />}
      <span style={{ color: 'rgba(180,170,200,0.45)', fontSize: 16 }}>→</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CodexItem byId={byId} id={r.resultId} size={28} />
        {r.resultCount > 1 && <span style={{ fontSize: 12, color: '#4dd9ac', fontWeight: 700 }}>×{r.resultCount}</span>}
      </div>
      <span style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 10,
        background: 'rgba(120,80,180,0.18)', border: '1px solid rgba(120,80,180,0.35)',
        color: 'rgba(200,180,240,0.85)',
      }}>
        {r.type === 'smelting' ? '🔥 Fourneau' : '🛠️ Établi'}
      </span>
      {!hasGrid && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {r.ingredients.map((ing, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
              <CodexItem byId={byId} id={ing.item} size={20} showName={false} />
              <span style={{ color: 'rgba(220,210,240,0.85)' }}>{byId.get(ing.item)?.nomFr || ing.item} ×{ing.count}</span>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
        <button type="button" onClick={onEdit} style={ghostBtn}>Modifier</button>
        <button type="button" onClick={onRemove} style={{ ...ghostBtn, color: '#f87171', borderColor: 'rgba(220,60,60,0.3)' }}>Supprimer</button>
      </div>
    </div>
  );
}

const ghostBtn = {
  padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
  background: 'transparent', border: '1px solid rgba(80,50,130,0.3)',
  color: '#ede8f8', fontFamily: "'Inter',sans-serif",
};
