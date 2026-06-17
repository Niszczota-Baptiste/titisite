import { useState } from 'react';
import { ACC, ACC_RGB } from '../../ui';
import { RecipesEditor } from './RecipesEditor';
import { ChestsAdmin } from './ChestsAdmin';
import { ShopsAdmin } from './ShopsAdmin';

const SUBTABS = [
  { key: 'recipes', label: '🛠️ Recettes', Comp: RecipesEditor },
  { key: 'chests',  label: '📦 Coffres (tous projets)', Comp: ChestsAdmin },
  { key: 'shops',   label: '🏪 Boutiques', Comp: ShopsAdmin },
];

// Onglet admin central « Coffres & Shops » : recettes custom, vue cross-projets
// des coffres, et gestion des boutiques. Tout est admin-only (mount derrière
// requireRole('admin') côté serveur).
export function MinecraftAdminEditor() {
  const [sub, setSub] = useState('recipes');
  const Active = SUBTABS.find((t) => t.key === sub).Comp;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
        {SUBTABS.map((t) => (
          <button type="button" key={t.key}
            onClick={() => setSub(t.key)}
            style={{
              padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
              fontFamily: "'Inter',sans-serif", fontSize: 14,
              fontWeight: sub === t.key ? 600 : 400,
              background: sub === t.key ? `rgba(${ACC_RGB},0.2)` : 'rgba(14,9,28,0.5)',
              border: `1px solid ${sub === t.key ? ACC : 'rgba(80,50,130,0.28)'}`,
              color: sub === t.key ? ACC : 'rgba(200,190,220,0.75)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Active />
    </div>
  );
}
