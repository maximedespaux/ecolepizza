import { useContext, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import { modeForPath } from "../lib/nav.js";
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
  const location = useLocation();
  const readOnly = user ? modeForPath(user, location.pathname) === "read" : false;

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
              <span>🔒</span> Lecture seule — vous pouvez consulter cette rubrique mais pas la modifier.
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
