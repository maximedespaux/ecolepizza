import { useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { PAGE_TITLES } from "../lib/nav.js";
import { getNotifications } from "../api/apiClient.js";
import ThemeToggle from "./ThemeToggle.jsx";

/** Barre supérieure : fil d'Ariane, notifications, thème, déconnexion. */
function Topbar({ onMenu }) {
  const { logout } = useContext(UserContext);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = PAGE_TITLES[pathname] || "";
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => getNotifications().then((r) => { if (active) setUnread(r.unread || 0); }).catch(() => {});
    load();
    const t = setInterval(load, 60000); // rafraîchit toutes les minutes
    return () => { active = false; clearInterval(t); };
  }, [pathname]);

  return (
    <header className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label="Ouvrir le menu">☰</button>
      <div className="crumbs">
        Impasto <span style={{ opacity: 0.4 }}>/</span> <b>{title}</b>
      </div>
      <div className="spacer" />
      <button
        className="icon-btn"
        style={{ position: "relative" }}
        onClick={() => navigate("/notifications")}
        title="Notifications"
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{ position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 99, background: "var(--ember1)", color: "#fff", fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center" }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      <ThemeToggle />
      <button className="icon-btn" onClick={logout} title="Déconnexion" aria-label="Déconnexion">⏻</button>
    </header>
  );
}

export default Topbar;
