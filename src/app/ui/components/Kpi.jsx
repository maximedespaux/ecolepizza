import { Link } from "react-router-dom";

/** Tuile d'indicateur clé. Cliquable si `to` est fourni. */
function Kpi({ label, value, sub, to }) {
  const inner = (
    <>
      <div className="lbl">{label}</div>
      <div className="val tnum">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </>
  );
  if (to) {
    return <Link to={to} className="kpi card hover" style={{ display: "block" }}>{inner}</Link>;
  }
  return <div className="kpi">{inner}</div>;
}

export default Kpi;
