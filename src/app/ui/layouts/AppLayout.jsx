import { useContext, useState } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { UserContext } from "../context/UserContext.jsx";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/**
 * Coquille des pages authentifiées : barre latérale + barre supérieure + contenu.
 * Redirige vers /login si l'utilisateur n'est pas connecté.
 */
function AppLayout() {
  const { isConnected, isLoading } = useContext(UserContext);
  const [open, setOpen] = useState(false);
  const location = useLocation();

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
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
