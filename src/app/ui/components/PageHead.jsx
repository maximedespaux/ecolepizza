import { useLocation } from "react-router-dom";
import { Icon } from "./Icon.jsx";
import { sectionDe } from "../lib/nav.js";

/**
 * En-tête de page : icône de rubrique + surtitre + titre + accroche, actions à droite.
 *
 * L'ICÔNE ET LA COULEUR VIENNENT DE LA NAVIGATION, pas d'une prop. Chaque page les aurait
 * sinon déclarées à la main — trente occasions de diverger, et trente oublis à venir. Elles
 * sont déduites du chemin courant : une page nouvelle est habillée dès qu'elle entre dans le
 * menu, sans qu'on y pense.
 *
 * POURQUOI UNE COULEUR PAR RUBRIQUE. Trente pages identiques se confondent : au bout de trois
 * clics on ne sait plus dans quelle partie de l'application on est. Le ton est attaché au
 * DOMAINE et non à l'écran — deux pages de la même rubrique se ressemblent volontairement,
 * c'est ce qui les range ensemble.
 *
 * `eyebrow` reste prioritaire : certaines pages disent mieux d'où elles viennent que leur
 * rubrique (« Boutique » plutôt que « Ventes & Finance »).
 */
function PageHead({ eyebrow, title, lead, actions, icon, tone }) {
  const { pathname } = useLocation();
  const sec = sectionDe(pathname);
  const ic = icon || sec?.ic;
  const ton = tone || sec?.ton || "blue";
  const surtitre = eyebrow || sec?.grp;

  return (
    <div className={`pagehead tone-${ton}`}>
      {ic && (
        <span className="pagehead-ic" aria-hidden="true">
          <Icon name={ic} size={22} />
        </span>
      )}
      <div className="pagehead-txt">
        {surtitre && <div className="eyebrow">{surtitre}</div>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className="pagehead-actions">{actions}</div>}
    </div>
  );
}

export default PageHead;
