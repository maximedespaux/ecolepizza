import { useContext, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";
import { Icon } from "../components/Icon.jsx";
import { initials } from "../lib/format.js";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/** Coquille de l'espace représentant d'entreprise : en-tête simple, signature des documents entreprise. */
function RepresentantLayout() {
  const { user, isConnected, isLoading, logout } = useContext(UserContext);
  const [pwOpen, setPwOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="brand-splash"><img src={LOGO} alt="" /><span>Impasto</span></div>
      </div>
    );
  }
  if (!isConnected) return <Navigate to="/login" replace />;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header className="topbar" style={{ justifyContent: "space-between" }}>
        <div className="brand" style={{ padding: 0, gap: 10 }}>
          <img src={LOGO} alt="École Pizza" style={{ width: 36, height: 36, borderRadius: 9, background: "#fff", padding: 3, objectFit: "contain" }} />
          <div>
            <div className="name" style={{ fontSize: 17 }}>Impasto</div>
            <div className="sub" style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>Espace entreprise</div>
          </div>
        </div>
        <div className="spacer" />
        <ThemeToggle />
        <button className="btn sm ghost" onClick={() => setPwOpen(true)} title="Changer mon mot de passe"><Icon name="key" size={15} /> Mot de passe</button>
        <span className="avatar" title="Représentant">{initials(user?.first_name, user?.last_name)}</span>
        <button className="icon-btn" onClick={logout} title="Déconnexion" aria-label="Déconnexion"><Icon name="power" size={18} /></button>
      </header>
      <main className="content" style={{ maxWidth: 900 }}>
        <Outlet />
      </main>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

export default RepresentantLayout;
