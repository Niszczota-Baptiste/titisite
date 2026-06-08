import { EFFECTS } from '../../../writing/AmbientEffect';
import { CheckboxField, Field, Input, Textarea } from '../../ui';
import { ImageUploadField } from '../../ImageUploadField';
import { GenreTags, SelectField } from './widgets';

const STATUS = [
  { value: 'brouillon', label: 'Brouillon' },
  { value: 'wip', label: 'En cours (WIP)' },
  { value: 'termine', label: 'Terminé' },
];

export const emptyMeta = () => ({
  title: '', titleKr: '', subtitle: '', description: '',
  status: 'brouillon', accentColor: '#c9a8e8', coverImage: '', tags: [],
  ambientEffect: 'none', isPublished: false,
});

export function metaOf(x) {
  return {
    title: x.title, titleKr: x.titleKr, subtitle: x.subtitle, description: x.description,
    status: x.status, accentColor: x.accentColor, coverImage: x.coverImage,
    tags: x.tags || [], ambientEffect: x.ambientEffect || 'none', isPublished: x.isPublished,
  };
}

// Shared metadata form, used by both the project editor and the book editor.
export function MetaFields({ meta, setMeta, publishLabel = 'Publié (visible sur le site public)' }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 120px', gap: 10 }}>
        <Field label="Titre"><Input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></Field>
        <Field label="Titre coréen (optionnel)"><Input value={meta.titleKr} onChange={(e) => setMeta({ ...meta, titleKr: e.target.value })} /></Field>
        <Field label="Accent"><Input type="color" value={meta.accentColor} onChange={(e) => setMeta({ ...meta, accentColor: e.target.value })} style={{ padding: 4, height: 38 }} /></Field>
      </div>
      <Field label="Sous-titre"><Input value={meta.subtitle} onChange={(e) => setMeta({ ...meta, subtitle: e.target.value })} /></Field>
      <Field label="Description"><Textarea value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} /></Field>
      <GenreTags value={meta.tags} onChange={(tags) => setMeta({ ...meta, tags })} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <SelectField label="Statut" value={meta.status} onChange={(v) => setMeta({ ...meta, status: v })} options={STATUS} />
        <SelectField label="Effet d’ambiance (mode lecture)" value={meta.ambientEffect} onChange={(v) => setMeta({ ...meta, ambientEffect: v })} options={EFFECTS} />
      </div>
      <div style={{ marginBottom: 14, maxWidth: 320 }}>
        <ImageUploadField label="Couverture" value={meta.coverImage} onChange={(url) => setMeta({ ...meta, coverImage: url })} aspect="3/2" />
      </div>
      <CheckboxField label={publishLabel} value={meta.isPublished} onChange={(v) => setMeta({ ...meta, isPublished: v })} />
    </>
  );
}
