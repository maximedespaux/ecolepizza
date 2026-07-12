import { Link } from "react-router-dom";
import { useCountUp } from "../lib/useCountUp.js";
import { Icon } from "./Icon.jsx";

/**
 * Tuile d'indicateur clé. Cliquable si `to` est fourni.
 *  · icon      : clé d'icône (optionnelle) affichée dans une pastille teintée.
 *  · tone      : couleur de la pastille (ember | blue | green | orange | gold).
 *  · countUp   : anime la valeur numérique de 0 → value.
 *  · format    : fonction de mise en forme (ex. euro) appliquée à la valeur.
 */
function Kpi({ label, value, sub, to, icon, tone = "ember", countUp = false, format }) {
  const isNumeric = typeof value === "number";
  const animated = useCountUp(countUp && isNumeric ? value : 0);
  const raw = countUp && isNumeric ? animated : value;
  const shown = format ? format(raw) : raw;

  const inner = (
    <>
      <div className="kpi-top">
        <div className="lbl">{label}</div>
        {icon && (
          <span className={`kpi-ic tone-${tone}`}>
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <div className="val tnum">{shown}</div>
      {sub && <div className="sub">{sub}</div>}
    </>
  );

  if (to) {
    return <Link to={to} className="kpi card hover" style={{ display: "block" }}>{inner}</Link>;
  }
  return <div className="kpi">{inner}</div>;
}

export default Kpi;
