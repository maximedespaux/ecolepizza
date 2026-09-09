import { useId } from "react";

/**
 * L'étoile rouge « champ obligatoire ».
 *
 * `aria-hidden` sur l'étoile, `aria-required` sur le champ : une couleur et un symbole ne
 * disent RIEN à un lecteur d'écran, et une étoile lue telle quelle donne « Prénom étoile ».
 * L'obligation doit être portée par l'attribut, la couleur ne fait que la rappeler à l'œil.
 *
 * Elle est volontairement SÉPARÉE de l'attribut HTML `required` : la règle retenue exige ces
 * champs À LA CRÉATION seulement. Un `required` natif bloquerait aussi la modification d'une
 * ancienne fiche dont le téléphone n'a jamais été collecté — on se retrouverait incapable de
 * corriger une adresse faute d'un numéro qu'on n'a pas. L'étoile informe, le serveur tranche.
 */
export function Requis() {
  return <span className="requis" aria-hidden="true">*</span>;
}

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
export function Field({ label, className = "", id, requis = false, ...props }) {
  const auto = useId();
  const champId = id || auto;
  return (
    <div className="field">
      <label htmlFor={champId}>{label}{requis && <Requis />}</label>
      <input id={champId} className={`inp ${className}`} aria-required={requis || undefined} {...props} />
    </div>
  );
}

/** Liste déroulante étiquetée. Passer les <option> en enfants. */
export function SelectField({ label, id, children, requis = false, ...props }) {
  const auto = useId();
  const champId = id || auto;
  return (
    <div className="field">
      <label htmlFor={champId}>{label}{requis && <Requis />}</label>
      <select id={champId} aria-required={requis || undefined} {...props}>{children}</select>
    </div>
  );
}

export default Field;
