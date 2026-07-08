import { useContext } from "react";
import { Link } from "react-router-dom";
import { NAV, canOpen, SETTINGS_PATHS } from "../lib/nav.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";

/** Regroupe les réglages de l'organisme (Organisme, Équipe & accès, Rôles d'accès). */
function Parametres() {
  const { user } = useContext(UserContext);
  const byPath = Object.fromEntries(NAV.flatMap((g) => g.items).map((it) => [it.to, it]));
  const items = SETTINGS_PATHS.map((p) => byPath[p]).filter((it) => it && canOpen(user, it));

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
