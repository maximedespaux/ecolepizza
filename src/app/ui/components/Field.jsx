/** Champ de formulaire étiqueté (input). */
export function Field({ label, className = "", ...props }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className={`inp ${className}`} {...props} />
    </div>
  );
}

/** Liste déroulante étiquetée. Passer les <option> en enfants. */
export function SelectField({ label, children, ...props }) {
  return (
    <div className="field">
      <label>{label}</label>
      <select {...props}>{children}</select>
    </div>
  );
}

export default Field;
