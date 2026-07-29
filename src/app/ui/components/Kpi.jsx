import { Link } from "react-router-dom";
import { useCountUp } from "../lib/useCountUp.js";
import { Icon } from "./Icon.jsx";

/**
 * Tuile d'indicateur clé.
 *
 * L'ORDRE DE LECTURE EST LE SUJET. La version précédente posait un libellé gris, puis le
 * nombre, puis un lien « Voir → » minuscule : on lisait « Stagiaires » avant « 1069 », alors
 * que c'est le nombre qu'on vient chercher. Le libellé passe en SURTITRE — plus petit, en
 * capitales espacées, comme une légende — et le nombre prend toute la place.
 *
 * `to` rend la TUILE ENTIÈRE cliquable, ce qui était déjà le cas, mais rien ne le disait :
 * le seul indice était un « Voir → » de la couleur du texte secondaire. La flèche avance
 * maintenant au survol, et la tuile se soulève — deux signaux qui coûtent zéro pixel de
 * hauteur, contrairement à une ligne de lien.
 *
 *  · icon    : clé d'icône, dans une pastille teintée.
 *  · tone    : couleur de la pastille (ember | blue | green | orange | gold).
 *  · countUp : anime la valeur de 0 → value.
 *  · format  : mise en forme appliquée à la valeur (ex. euro).
 */
function Kpi({ label, value, sub, to, icon, tone = "ember", countUp = false, format }) {
  const isNumeric = typeof value === "number";
  const animated = useCountUp(countUp && isNumeric ? value : 0);
  const raw = countUp && isNumeric ? animated : value;
  const shown = format ? format(raw) : raw;

  const inner = (
    <>
      {/* Le filet teinté du haut porte la couleur du `tone` : c'est ce qui différencie quatre
          tuiles autrement identiques, à la vitesse du coup d'œil, sans lire un mot. */}
      <span className={`kpi-accent tone-${tone}`} aria-hidden="true" />
      <div className="kpi-top">
        <div className="lbl">{label}</div>
        {icon && (
          <span className={`kpi-ic tone-${tone}`}>
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <div className="val tnum">{shown}</div>
      {sub && (
        <div className="sub kpi-sub">
          <span>{sub}</span>
          {to && <Icon name="chevron-right" size={14} className="kpi-fleche" aria-hidden="true" />}
        </div>
      )}
    </>
  );

  if (to) {
    return <Link to={to} className={`kpi kpi-lien tone-${tone}`}>{inner}</Link>;
  }
  return <div className={`kpi tone-${tone}`}>{inner}</div>;
}

export default Kpi;
