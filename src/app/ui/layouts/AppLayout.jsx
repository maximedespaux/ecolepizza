import { useContext, useEffect, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { modeForPath } from "../lib/nav.js";
import { getFormations } from "../api/apiClient.js";
import { setBadgeColors } from "../lib/levels.js";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";

// Blocage best-effort des actions de modification en mode lecture seule.
// L'autorité reste le serveur (middleware enforceSectionMode) ; ceci est l'UX.
function blockMutations(e) {
  const el = e.target.closest?.(".btn.primary, .btn.danger, .danger, [type=submit]");
  if (el) { e.preventDefault(); e.stopPropagation(); }
}

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/**
 * Coquille des pages authentifiées : barre latérale + barre supérieure + contenu.
 * Redirige vers /login si l'utilisateur n'est pas connecté.
 */
function AppLayout() {
  const { user, isConnected, isLoading } = useContext(UserContext);
  const [open, setOpen] = useState(false);
  const [, bumpColors] = useState(0);
  const location = useLocation();
  const readOnly = user ? modeForPath(user, location.pathname) === "read" : false;

  // Charge une fois les couleurs personnalisées des formations pour que les
  // badges (formation / stagiaire / session) soient cohérents partout.
  useEffect(() => {
    if (!isConnected) return;
    getFormations().then((r) => {
      const map = {};
      for (const f of r.data || []) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
      if (Object.keys(map).length) { setBadgeColors(map); bumpColors((v) => v + 1); }
    }).catch(() => {});
  }, [isConnected]);

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="brand-splash">
          <img src={LOGO} alt="" />
          <span>Impasto</span>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="app">
      <Sidebar open={open} />
      <div className={"scrim" + (open ? " show" : "")} onClick={() => setOpen(false)} />
      <div className="main">
        <Topbar onMenu={() => setOpen(true)} />
        <main className="content">
          {readOnly && (
            <div style={{
              margin: "0 0 14px", padding: "8px 12px", borderRadius: 8,
              background: "rgba(230,160,30,.12)", border: "1px solid rgba(230,160,30,.35)",
              color: "var(--muted)", fontSize: 13, display: "flex", gap: 8, alignItems: "center",
            }}>
              Lecture seule — vous pouvez consulter cette rubrique mais pas la modifier.
            </div>
          )}
          <div
            onClickCapture={readOnly ? blockMutations : undefined}
            onSubmitCapture={readOnly ? ((e) => { e.preventDefault(); e.stopPropagation(); }) : undefined}
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
