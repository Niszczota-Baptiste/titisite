// Petites briques propres aux écrans téléphone.

// Champ de formulaire avec un vrai <label> : le lecteur d'écran annonce le
// libellé, et toucher le libellé place le curseur dans le champ.
export function FormField({ label, hint, children }) {
  return (
    <label className="au-field am-field">
      <span className="au-field-label">{label}</span>
      {children}
      {hint && <span className="au-field-hint">{hint}</span>}
    </label>
  );
}
