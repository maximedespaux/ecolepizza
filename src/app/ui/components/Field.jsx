import { useId } from "react";

/**
 * Champs de formulaire étiquetés.
 *
 * L'étiquette est RELIÉE à son champ par `id`/`htmlFor`. Sans ce lien, cliquer sur le libellé
 * ne place pas le curseur dans le champ, et un lecteur d'écran annonce « zone de texte » sans
 * dire laquelle : ces deux composants portent 62 champs de l'application, et `htmlFor` ne se
 * trouvait nulle part ailleurs que sur la page de connexion.
 *
 * `useId` plutôt qu'un compteur : l'identifiant reste stable entre les rendus et ne peut pas
 * entrer en collision avec un autre champ, même si la même modale est ouverte deux fois.
 * Un `id` passé explicitement l'emporte — certains appels en ont besoin pour se désigner
 * eux-mêmes (ancre, `aria-describedby`).
 */
export function Field({ label, className = "", id, ...props }) {
  const auto = useId();
  const champId = id || auto;
  return (
    <div className="field">
      <label htmlFor={champId}>{label}</label>
      <input id={champId} className={`inp ${className}`} {...props} />
    </div>
  );
}

/** Liste déroulante étiquetée. Passer les <option> en enfants. */
export function SelectField({ label, id, children, ...props }) {
  const auto = useId();
  const champId = id || auto;
  return (
    <div className="field">
      <label htmlFor={champId}>{label}</label>
      <select id={champId} {...props}>{children}</select>
    </div>
  );
}

export default Field;
