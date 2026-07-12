import { useContext, useState } from "react";
import { Outlet, Navigate, NavLink } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";
import { Icon } from "../components/Icon.jsx";
import { initials } from "../lib/format.js";

const navClass = ({ isActive }) => `btn sm ${isActive ? "primary" : "ghost"}`;
const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/** Coquille de l'espace intervenant : en-tête simple, signature d'émargement. */
function IntervenantLayout() {
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
            <div className="sub" style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>Espace intervenant</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          <NavLink to="/emargement" className={navClass}>Émargement</NavLink>
        </nav>
        <div className="spacer" />
        <ThemeToggle />
        <button className="btn sm ghost" onClick={() => setPwOpen(true)} title="Changer mon mot de passe"><Icon name="key" size={15} /> Mot de passe</button>
        <div className="avatar" title={`${user?.first_name} ${user?.last_name}`}>{initials(user?.first_name, user?.last_name)}</div>
        <button className="icon-btn" onClick={logout} title="Déconnexion" aria-label="Déconnexion"><Icon name="power" size={18} /></button>
      </header>
      <main className="content" style={{ maxWidth: 900 }}>
        <Outlet />
      </main>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

export default IntervenantLayout;
