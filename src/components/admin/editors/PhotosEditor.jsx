import { Field, Input } from '../ui';
import { ImageUploadField } from '../ImageUploadField';
import { ItemList } from '../ItemList';

const EMPTY = () => ({ url: '', category: '', alt: '', w: 0, h: 0 });

export function PhotosEditor() {
  return (
    <ItemList
      title="Photographies"
      collection="photos"
      emptyDraft={EMPTY}
      renderPreview={(p) => (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
          <div style={{
            width: 64, height: 48, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
            border: '1px solid rgba(80,50,130,0.3)', background: 'rgba(14,8,32,0.6)',
          }}>
            {p.url && (
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            )}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 14, fontWeight: 600,
              color: '#ede8f8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {p.alt || p.url?.split('/').pop() || '—'}
            </div>
            <div style={{
              fontFamily: "'Inter',sans-serif", fontSize: 11.5,
              color: 'rgba(180,170,200,0.6)', marginTop: 2,
            }}>
              {p.category || 'Sans catégorie'}
              {p.w > 0 && p.h > 0 && (
                <span style={{ fontFamily: 'monospace', marginLeft: 8 }}>{p.w}×{p.h}</span>
              )}
            </div>
          </div>
        </div>
      )}
      renderForm={(d, set) => (
        <>
          <ImageUploadField
            label="Photo"
            value={d.url}
            aspect="4/3"
            onChange={(url) => {
              if (!url) return set((prev) => ({ ...prev, url: '', w: 0, h: 0 }));
              // Mesure les dimensions natives : la grille publique réserve
              // l'espace exact (aucun layout shift au chargement).
              set((prev) => ({ ...prev, url }));
              const img = new Image();
              img.onload = () => set((prev) => ({ ...prev, w: img.naturalWidth, h: img.naturalHeight }));
              img.src = url;
            }}
          />
          <Field label="Catégorie (pill de filtre — ex : Paysage, Portrait, Urbain)">
            <Input
              value={d.category || ''}
              onChange={(e) => set({ ...d, category: e.target.value })}
              placeholder="Paysage"
            />
          </Field>
          <Field label="Texte alternatif (accessibilité / SEO — jamais affiché sur la photo)">
            <Input
              value={d.alt || ''}
              onChange={(e) => set({ ...d, alt: e.target.value })}
              placeholder="Coucher de soleil sur la baie de Somme"
            />
          </Field>
        </>
      )}
    />
  );
}
