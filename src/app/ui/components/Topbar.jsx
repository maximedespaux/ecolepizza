import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { PAGE_TITLES } from "../lib/nav.js";
import { getNotifications } from "../api/apiClient.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import { playNotif, isNotifMuted, setNotifMuted } from "../lib/notifSound.js";
import { Icon } from "./Icon.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import SpaceSwitcher from "./SpaceSwitcher.jsx";

/** Barre supérieure : fil d'Ariane, notifications, thème, déconnexion. */
function Topbar({ onMenu }) {
  const { logout } = useContext(UserContext);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = PAGE_TITLES[pathname] || "";
  const [unread, setUnread] = useState(0);
  const [muted, setMuted] = useState(isNotifMuted());
  const [ringing, setRinging] = useState(false);
  const prevUnread = useRef(null); // null = premier chargement (pas de son)

  const loadNotifs = () =>
    getNotifications()
      .then((r) => {
        const n = r.unread || 0;
        setUnread(n);
        // Nouvelle notification (hausse du compteur, hors chargement initial) → son + secousse.
        if (prevUnread.current !== null && n > prevUnread.current) {
          playNotif();
          setRinging(true);
          setTimeout(() => setRinging(false), 820);
        }
        prevUnread.current = n;
      })
      .catch(() => {});

  useEffect(() => { loadNotifs(); }, [pathname]);
  // Rafraîchit le compteur automatiquement (toutes les 25 s + au retour sur l'onglet).
  useAutoRefresh(loadNotifs, { interval: 25000 });

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setNotifMuted(next);
    if (!next) playNotif(); // aperçu sonore à la réactivation
  };

  return (
    <header className="topbar">
      <button className="menu-btn icon-btn" onClick={onMenu} aria-label="Ouvrir le menu">
        <Icon name="menu" size={20} />
      </button>
      <div className="crumbs">
        Impastio <span style={{ opacity: 0.4 }}>/</span> <b>{title}</b>
      </div>
      <div className="spacer" />
      <SpaceSwitcher />

      <button
        className="icon-btn"
        onClick={toggleMute}
        title={muted ? "Activer le son des notifications" : "Couper le son des notifications"}
        aria-label={muted ? "Activer le son des notifications" : "Couper le son des notifications"}
        aria-pressed={muted}
      >
        <Icon name={muted ? "volume-off" : "volume"} size={17} />
      </button>

      <button
        className={"icon-btn bell" + (ringing ? " ring" : "")}
        style={{ position: "relative" }}
        onClick={() => navigate("/notifications")}
        title="Notifications"
        aria-label={unread > 0 ? `Notifications (${unread} non lues)` : "Notifications"}
      >
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="notif-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>

      <ThemeToggle />
      <button className="icon-btn" onClick={logout} title="Déconnexion" aria-label="Déconnexion">
        <Icon name="power" size={18} />
      </button>
    </header>
  );
}

export default Topbar;
