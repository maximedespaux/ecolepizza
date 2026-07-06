import { useContext } from "react";
import { useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { PAGE_TITLES } from "../lib/nav.js";
import ThemeToggle from "./ThemeToggle.jsx";

/** Barre supérieure : bouton menu (mobile), fil d'Ariane, thème, déconnexion. */
function Topbar({ onMenu }) {
  const { logout } = useContext(UserContext);
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] || "";

  return (
    <header className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label="Ouvrir le menu">☰</button>
      <div className="crumbs">
        Impasto <span style={{ opacity: 0.4 }}>/</span> <b>{title}</b>
      </div>
      <div className="spacer" />
      <ThemeToggle />
      <button className="icon-btn" onClick={logout} title="Déconnexion" aria-label="Déconnexion">⏻</button>
    </header>
  );
}

export default Topbar;
