import { useContext, useEffect, useRef, useState } from "react";
import { Outlet, Navigate, NavLink, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import ThemeToggle from "../components/ThemeToggle.jsx";
import ChangePasswordModal from "../components/ChangePasswordModal.jsx";
import ProfileModal from "../components/ProfileModal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { initials } from "../lib/format.js";
import { getMyAccess } from "../api/apiClient.js";
import { getAvatar, AVATAR_EVENT, hydrateProfile } from "../lib/gamification.js";

const navClass = ({ isActive }) => `btn sm ${isActive ? "primary" : "ghost"}`;

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

// Sections débloquées seulement après avoir franchi le point d'accès (breakpoint) d'une formation.
const GATED_PATHS = ["/pizza-quest", "/empatements", "/garnitures", "/realisations", "/communaute", "/notions"];

// Menu déroulant « Outils & Communauté » : outils stagiaire + communauté (à venir).
function OutilsMenu({ locked }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const loc = useLocation();
  const active = ["/empatements", "/garnitures", "/realisations", "/communaute", "/notions"].some((p) => loc.pathname.startsWith(p));
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  if (locked) return (
    <button className="btn sm ghost" disabled title="Signez vos documents jusqu'au point d'accès pour débloquer" style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: 0.55 }}>
      <Icon name="lock" size={13} /> Outils &amp; Communauté
    </button>
  );
  return (
    <span ref={ref} style={{ position: "relative" }}>
      <button className={`btn sm ${active ? "primary" : "ghost"}`} onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        Outils &amp; Communauté <Icon name="chevron-down" size={13} />
      </button>
      {open && (
        <div className="stu-menu">
          <NavLink to="/empatements" className="stu-menu-item"><Icon name="wheat" size={15} /> Mes empâtements</NavLink>
          <NavLink to="/garnitures" className="stu-menu-item"><Icon name="list-checks" size={15} /> Mes garnitures</NavLink>
          <NavLink to="/realisations" className="stu-menu-item"><Icon name="pizza" size={15} /> Mes réalisations</NavLink>
          <NavLink to="/communaute" className="stu-menu-item"><Icon name="users" size={15} /> Communauté</NavLink>
          <NavLink to="/notions" className="stu-menu-item"><Icon name="book-open" size={15} /> Notions &amp; lexique</NavLink>
        </div>
      )}
    </span>
  );
}

/** Coquille de l'espace stagiaire : en-tête simple, pas de barre latérale. */
function StudentLayout() {
  const { user, isConnected, isLoading, logout } = useContext(UserContext);
  const loc = useLocation();
  const [pwOpen, setPwOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [unlocked, setUnlocked] = useState(true); // fail-open : débloqué par défaut
  const [avatar, setAvatar] = useState(() => getAvatar(user?.id));
  // A-t-il franchi le point d'accès (breakpoint) d'une formation ? Débloque Pizza Quest + Outils.
  useEffect(() => {
    if (!user?.id) return;
    getMyAccess().then((r) => setUnlocked(r?.data?.quest_unlocked !== false)).catch(() => setUnlocked(true));
  }, [user?.id, loc.pathname]);
  useEffect(() => {
    const sync = () => setAvatar(getAvatar(user?.id));
    sync();
    window.addEventListener(AVATAR_EVENT, sync);
    return () => window.removeEventListener(AVATAR_EVENT, sync);
  }, [user?.id]);
  // Charge le profil (avatar + progression) depuis la base et le fusionne au local.
  useEffect(() => { if (user?.id) hydrateProfile(user.id); }, [user?.id]);

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
            <div className="sub" style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>Espace stagiaire</div>
          </div>
        </div>
        <nav style={{ display: "flex", gap: 6, marginLeft: 8 }}>
          <NavLink to="/mon-espace" className={navClass}>Mon espace</NavLink>
          <NavLink to="/formations" className={navClass}>Mes documents</NavLink>
          {/* Pizza Quest verrouillé tant que les documents ne sont pas signés (feature « accès »).
              La Boutique reste accessible — elle n'est PAS dans GATED_PATHS : c'est un service,
              pas du contenu pédagogique. */}
          {unlocked
            ? <NavLink to="/pizza-quest" className={navClass}>Pizza Quest</NavLink>
            : <button className="btn sm ghost" disabled title="Signez vos documents jusqu'au point d'accès pour débloquer" style={{ display: "inline-flex", alignItems: "center", gap: 5, opacity: 0.55 }}><Icon name="lock" size={13} /> Pizza Quest</button>}
          <NavLink to="/boutique" className={navClass}>Boutique</NavLink>
          <OutilsMenu locked={!unlocked} />
          {user?.role === "INTERVENANT" && <NavLink to="/intervention" className={navClass}>Intervention</NavLink>}
          {user?.has_company && <NavLink to="/entreprise-documents" className={navClass}>Entreprise</NavLink>}
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
        {!unlocked && GATED_PATHS.some((p) => loc.pathname.startsWith(p)) ? (
          <EmptyState icon="lock">
            <b>Section verrouillée.</b><br />Signez d'abord vos documents jusqu'au <b>point d'accès</b> de votre formation pour débloquer Pizza Quest et les outils.
          </EmptyState>
        ) : (
          <Outlet />
        )}
      </main>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
    </div>
  );
}

export default StudentLayout;
