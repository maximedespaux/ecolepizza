import { Link } from "react-router-dom";
import { Icon } from "../components/Icon.jsx";

function NotFound() {
  return (
    <div className="nf-wrap">
      <div className="nf-visual nf-pizza"><Icon name="pizza" size={68} /></div>
      <div className="nf-code">404</div>
      <h1 className="nf-title">Cette part a disparu du four</h1>
      <p className="nf-text">La page que vous cherchez n'existe pas ou a été déplacée.</p>
      <Link to="/dashboard" className="btn primary">Retour au tableau de bord</Link>
    </div>
  );
}

export default NotFound;
