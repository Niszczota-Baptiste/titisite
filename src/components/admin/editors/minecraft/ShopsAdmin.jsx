import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../../api/client';
import { useCodex } from '../../../../hooks/useCodex';
import { useConfirm } from '../../../../ui/ConfirmProvider';
import { Empty, ErrorBanner } from '../../../project/shared';
import { ACC_RGB, Button, Field, Input, inputStyle } from '../../ui';
import { CodexItem, CodexPicker } from './CodexPicker';

const WORLD_EMOJI = { overworld: '🌳', nether: '🔥', end: '🌌' };
// Catégories pensées menuiserie (le serveur reste en texte libre).
const CATEGORIES = ['Bois', 'Meubles', 'Décoration', 'Blocs', 'Outils', 'Autre'];

// Gestion des boutiques (admin) : plusieurs shops, items en vente (prix, stock,
// unité, catégorie), valeur totale, lien optionnel vers un coffre.
export function ShopsAdmin() {
  const { catalog, byId } = useCodex();
  const confirm = useConfirm();
  const [shops, setShops] = useState(null);
  const [overview, setOverview] = useState({ projects: [], chests: [] });
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.minecraftAdmin.shops.list().then(setShops).catch(() => setErr('Chargement impossible.'));
  useEffect(() => {
    load();
    api.minecraftAdmin.overview().then((d) => setOverview({ projects: d.projects, chests: d.chests })).catch(() => {});
  }, []);

  const createShop = async (payload) => {
    try { await api.minecraftAdmin.shops.create(payload); setCreating(false); await load(); }
    catch (e) { setErr(e.message || 'Création impossible.'); }
  };
  const removeShop = async (s) => {
    const ok = await confirm({ title: 'Supprimer la boutique', message: `« ${s.name} » et ses items seront supprimés.`, confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    try { await api.minecraftAdmin.shops.remove(s.id); await load(); } catch { setErr('Suppression impossible.'); }
  };

  if (shops == null) return <p style={{ fontSize: 13, color: 'rgba(180,170,200,0.6)' }}>Chargement…</p>;

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, fontWeight: 700, color: '#ede8f8', margin: 0 }}>
          Boutiques
        </h2>
        <span style={{ fontSize: 13, color: 'rgba(180,170,200,0.6)' }}>{shops.length} boutique{shops.length > 1 ? 's' : ''}</span>
        {!creating && <Button style={{ marginLeft: 'auto' }} onClick={() => { setErr(''); setCreating(true); }}>+ Boutique</Button>}
      </header>

      <ErrorBanner error={err} onDismiss={() => setErr('')} />

      {creating && <ShopForm projects={overview.projects} onSave={createShop} onCancel={() => setCreating(false)} />}

      {shops.length === 0 && !creating ? (
        <Empty>Aucune boutique. Crée-en une pour lister tes prix (bois, meubles…).</Empty>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {shops.map((s) => (
            <ShopCard
              key={s.id} shop={s} catalog={catalog} byId={byId} chests={overview.chests}
              onChanged={load} onRemove={() => removeShop(s)} setErr={setErr}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShopForm({ projects, shop, onSave, onCancel }) {
  const [name, setName] = useState(shop?.name || '');
  const [projectId, setProjectId] = useState(shop?.projectId || '');
  const [currency, setCurrency] = useState(shop?.currency || 'émeraudes');
  const [description, setDescription] = useState(shop?.description || '');
  return (
    <div style={{ background: 'rgba(20,10,42,0.6)', border: `1px solid rgba(${ACC_RGB},0.3)`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 200px' }}><Field label="Nom"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Menuiserie du bourg" /></Field></div>
        <div style={{ flex: '1 1 160px' }}>
          <Field label="Projet (optionnel)">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inputStyle}>
              <option value="">— aucun —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: '1 1 120px' }}><Field label="Monnaie"><Input value={currency} onChange={(e) => setCurrency(e.target.value)} /></Field></div>
      </div>
      <Field label="Description (optionnel)"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <Button onClick={() => name.trim() && onSave({ name, projectId: projectId || null, currency, description })}>Enregistrer</Button>
        <Button variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

function ShopCard({ shop, catalog, byId, chests, onChanged, onRemove, setErr }) {
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();

  const byCategory = useMemo(() => {
    const m = new Map();
    for (const it of shop.items) {
      const c = it.category || 'Autre';
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(it);
    }
    return m;
  }, [shop.items]);

  const addItem = async (payload) => {
    try { await api.minecraftAdmin.shops.items.create(shop.id, payload); setAdding(false); await onChanged(); }
    catch (e) { setErr(e.message || 'Ajout impossible.'); }
  };
  const updateItem = async (id, payload) => {
    try { await api.minecraftAdmin.shops.items.update(id, payload); await onChanged(); }
    catch (e) { setErr(e.message || 'Mise à jour impossible.'); }
  };
  const removeItem = async (it) => {
    const ok = await confirm({ title: 'Retirer l\'item', message: `« ${it.itemName || it.itemId} » sera retiré de la boutique.`, confirmLabel: 'Retirer', danger: true });
    if (!ok) return;
    try { await api.minecraftAdmin.shops.items.remove(it.id); await onChanged(); } catch { setErr('Suppression impossible.'); }
  };

  return (
    <div style={{ background: 'rgba(20,10,42,0.45)', border: '1px solid rgba(80,50,130,0.28)', borderRadius: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 17, fontWeight: 700, color: '#ede8f8', margin: 0 }}>🏪 {shop.name}</h3>
        {shop.projectName && <span style={{ fontSize: 12, color: 'rgba(180,170,200,0.6)' }}>· {shop.projectName}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 14, color: '#4dd9ac', fontWeight: 700 }}>
          {shop.totalValue.toLocaleString('fr-FR')} {shop.currency}
        </span>
        <button type="button" onClick={onRemove} style={ghostBtn}>Supprimer</button>
      </div>
      {shop.description && <p style={{ fontSize: 13, color: 'rgba(180,170,200,0.6)', marginTop: 0 }}>{shop.description}</p>}

      {shop.items.length === 0 ? (
        <p style={{ fontSize: 13, color: 'rgba(180,170,200,0.55)' }}>Aucun item en vente.</p>
      ) : (
        [...byCategory.entries()].map(([cat, list]) => (
          <div key={cat} style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.4px', textTransform: 'uppercase', color: 'rgba(180,170,200,0.55)', marginBottom: 6 }}>{cat}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {list.map((it) => (
                <ShopItemRow key={it.id} it={it} byId={byId} chests={chests}
                  onUpdate={(p) => updateItem(it.id, p)} onRemove={() => removeItem(it)} />
              ))}
            </div>
          </div>
        ))
      )}

      {adding ? (
        <ItemForm catalog={catalog} byId={byId} chests={chests} onSave={addItem} onCancel={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          style={{ marginTop: 14, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', background: 'transparent', border: '1px dashed rgba(80,50,130,0.4)', color: 'rgba(200,180,240,0.8)', fontSize: 13, fontFamily: "'Inter',sans-serif" }}>
          + Item en vente
        </button>
      )}
    </div>
  );
}

function ShopItemRow({ it, byId, chests, onUpdate, onRemove }) {
  const chest = it.chestId != null ? chests.find((c) => c.id === it.chestId) : null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'rgba(14,9,28,0.5)', border: '1px solid rgba(80,50,130,0.22)', borderRadius: 10, padding: '7px 12px' }}>
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <CodexItem byId={byId} id={it.itemId} size={22} />
      </div>
      <label style={lbl}>Prix
        <input type="number" min={0} step="0.5" defaultValue={it.price} key={`p${it.id}:${it.price}`}
          onBlur={(e) => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== it.price) onUpdate({ price: v }); }}
          style={{ ...inputStyle, width: 80 }} />
      </label>
      <span style={{ fontSize: 12, color: 'rgba(180,170,200,0.6)' }}>/ {it.unit}</span>
      <label style={lbl}>Stock
        <input type="number" min={0} defaultValue={it.stock} key={`s${it.id}:${it.stock}`}
          onBlur={(e) => { const v = Math.max(0, Math.floor(Number(e.target.value) || 0)); if (v !== it.stock) onUpdate({ stock: v }); }}
          style={{ ...inputStyle, width: 80 }} />
      </label>
      {chest && (
        <span style={{ fontSize: 12, color: 'rgba(180,170,200,0.7)' }}>
          {WORLD_EMOJI[chest.world] || '🗺️'} {chest.name}
        </span>
      )}
      <button type="button" onClick={onRemove} style={{ ...ghostBtn, marginLeft: 'auto', color: '#f87171', borderColor: 'rgba(220,60,60,0.3)' }}>×</button>
    </div>
  );
}

function ItemForm({ catalog, byId, chests, onSave }) {
  const [itemId, setItemId] = useState('');
  const [category, setCategory] = useState('Bois');
  const [price, setPrice] = useState(1);
  const [unit, setUnit] = useState('unité');
  const [stock, setStock] = useState(0);
  const [chestId, setChestId] = useState('');

  const save = () => {
    if (!itemId) return;
    onSave({ itemId, itemName: byId.get(itemId)?.nomFr || itemId, category, price, unit, stock, chestId: chestId || null });
  };

  return (
    <div style={{ marginTop: 12, background: 'rgba(20,10,42,0.6)', border: `1px solid rgba(${ACC_RGB},0.3)`, borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 200px' }}><Field label="Item"><CodexPicker catalog={catalog} byId={byId} value={itemId} onChange={setItemId} /></Field></div>
        <div style={{ flex: '1 1 130px' }}>
          <Field label="Catégorie">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ flex: '0 1 90px' }}><Field label="Prix"><Input type="number" min={0} step="0.5" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} /></Field></div>
        <div style={{ flex: '0 1 100px' }}><Field label="Unité"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field></div>
        <div style={{ flex: '0 1 90px' }}><Field label="Stock"><Input type="number" min={0} value={stock} onChange={(e) => setStock(Math.max(0, Math.floor(Number(e.target.value) || 0)))} /></Field></div>
        <div style={{ flex: '1 1 160px' }}>
          <Field label="Coffre (optionnel)">
            <select value={chestId} onChange={(e) => setChestId(e.target.value)} style={inputStyle}>
              <option value="">— aucun —</option>
              {chests.map((c) => <option key={c.id} value={c.id}>{c.workspaceName} · {c.name}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <Button onClick={save} style={{ fontSize: 13 }}>Ajouter</Button>
      </div>
    </div>
  );
}

const ghostBtn = {
  padding: '5px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
  background: 'transparent', border: '1px solid rgba(80,50,130,0.3)', color: '#ede8f8',
  fontFamily: "'Inter',sans-serif",
};
const lbl = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(180,170,200,0.7)' };
