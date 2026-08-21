import { useContext, useEffect, useState } from "react";
import { Outlet, Navigate, NavLink } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";
import ProfileModal from "../components/ProfileModal.jsx";
import { Icon } from "../components/Icon.jsx";
import { initials } from "../lib/format.js";
import { getAvatar, AVATAR_EVENT, hydrateProfile } from "../lib/gamification.js";

const navClass = ({ isActive }) => `btn sm ${isActive ? "primary" : "ghost"}`;
const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/** Coquille de l'espace intervenant : en-tête simple, signature d'émargement. */
function IntervenantLayout() {
  const { user, isConnected, isLoading, logout } = useContext(UserContext);
  const [pwOpen, setPwOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatar, setAvatar] = useState(() => getAvatar(user?.id));
  useEffect(() => {
    const sync = () => setAvatar(getAvatar(user?.id));
    sync();
    window.addEventListener(AVATAR_EVENT, sync);
    return () => window.removeEventListener(AVATAR_EVENT, sync);
  }, [user?.id]);
  useEffect(() => { if (user?.id) hydrateProfile(user.id); }, [user?.id]);

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="brand-splash"><img src={LOGO} alt="" /><span>Impastio</span></div>
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
            <div className="name" style={{ fontSize: 17 }}>Impastio</div>
            <div className="sub" style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>Espace intervenant</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          <NavLink to="/emargement" className={navClass}>Émargement</NavLink>
        </nav>
        <div className="spacer" />
        <ThemeToggle />
        <button className="btn sm ghost" onClick={() => setPwOpen(true)} title="Changer mon mot de passe"><Icon name="key" size={15} /> Mot de passe</button>
        <button className="avatar" title="Mon profil" onClick={() => setProfileOpen(true)}
          style={{ border: "none", cursor: "pointer", ...(avatar ? { background: avatar.color, fontSize: 18 } : null) }}>
          {avatar ? avatar.emoji : initials(user?.first_name, user?.last_name)}
        </button>
        <button className="icon-btn" onClick={logout} title="Déconnexion" aria-label="Déconnexion"><Icon name="power" size={18} /></button>
      </header>
      <main className="content" style={{ maxWidth: 900 }}>
        <Outlet />
      </main>
      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}

export default IntervenantLayout;
