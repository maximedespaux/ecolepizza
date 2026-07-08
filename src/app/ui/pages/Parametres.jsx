import { useContext } from "react";
import { Link } from "react-router-dom";
import { NAV, canOpen } from "../lib/nav.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";

/** Regroupe les réglages / référentiels de l'organisme (groupe « Configuration » du menu). */
function Parametres() {
  const { user } = useContext(UserContext);
  const group = NAV.find((g) => g.grp === "Configuration");
  const items = (group?.items || []).filter((it) => canOpen(user, it));

  return (
    <>
      <PageHead
        eyebrow="Organisme"
        title="Paramètres"
        lead="Réglages et référentiels de votre organisme : identité, équipe, rôles, modèles, OPCO…"
      />
      {items.length === 0 ? (
        <Card><EmptyState icon="⚙">Aucun paramètre accessible.</EmptyState></Card>
      ) : (
        <div className="grid cols-3">
          {items.map((it) => (
            <Link key={it.to} to={it.to} className="card param-card"
              style={{ textDecoration: "none", display: "flex", gap: 12, alignItems: "center", padding: 16 }}>
              <span style={{ fontSize: 22, width: 34, textAlign: "center", flex: "0 0 34px" }}>{it.ic}</span>
              <b style={{ color: "var(--text)" }}>{it.label}</b>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default Parametres;
