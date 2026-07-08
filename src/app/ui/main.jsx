import React, { useContext } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { UserProvider, UserContext } from "./context/UserContext.jsx";
import { landingPath, navAllowed, OWNER_ROLES } from "./lib/nav.js";
import "./styles/app.css";

import AppLayout from "./layouts/AppLayout.jsx";
import StudentLayout from "./layouts/StudentLayout.jsx";
import LoadingBar from "./components/LoadingBar.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Stagiaires from "./pages/Stagiaires.jsx";
import StagiaireDetail from "./pages/StagiaireDetail.jsx";
import Formations from "./pages/Formations.jsx";
import Quiz from "./pages/Quiz.jsx";
import Sessions from "./pages/Sessions.jsx";
import Pipeline from "./pages/Pipeline.jsx";
import SessionDetail from "./pages/SessionDetail.jsx";
import Suivi from "./pages/Suivi.jsx";
import Partenaires from "./pages/Partenaires.jsx";
import Ventes from "./pages/Ventes.jsx";
import Inventaire from "./pages/Inventaire.jsx";
import Factures from "./pages/Factures.jsx";
import Comptabilite from "./pages/Comptabilite.jsx";
import ProduitDivers from "./pages/ProduitDivers.jsx";
import Carte from "./pages/Carte.jsx";
import Reglages from "./pages/Reglages.jsx";
import Modeles from "./pages/Modeles.jsx";
import Opcos from "./pages/Opcos.jsx";
import TemplateEditor from "./pages/TemplateEditor.jsx";
import Equipe from "./pages/Equipe.jsx";
import Audit from "./pages/Audit.jsx";
import Notifications from "./pages/Notifications.jsx";
import Platform from "./pages/Platform.jsx";
import MonEspace from "./pages/MonEspace.jsx";
import EmargementStagiaire from "./pages/EmargementStagiaire.jsx";
import MesFormations from "./pages/MesFormations.jsx";
import StudentFormationDetail from "./pages/StudentFormationDetail.jsx";
import Atelier from "./pages/Atelier.jsx";
import NotFound from "./pages/NotFound.jsx";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/**
 * Garde de route. Deux dimensions :
 *  · rôle (sécurité de base, inchangée) pour les propriétaires ;
 *  · accès menu par utilisateur (configuré par le super admin) pour les autres.
 * `nav` = chemin du menu correspondant (pour les sous-pages, le chemin parent).
 */
function Guard({ nav, roles, children }) {
  const { user } = useContext(UserContext);
  if (!user) return null;
  if (OWNER_ROLES.includes(user.role)) {
    if (roles && !roles.includes(user.role)) return <Navigate to={landingPath(user)} replace />;
    return children;
  }
  // Utilisateur non-propriétaire : accès défini par le super administrateur.
  if (!navAllowed(user, nav)) return <Navigate to={landingPath(user)} replace />;
  return children;
}

/** Garde minimale pour l'espace plateforme (sans barre latérale organisme). */
function PlatformGate() {
  const { isConnected, isLoading } = useContext(UserContext);
  if (isLoading) return null;
  if (!isConnected) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Redirige la racine vers la page d'atterrissage de l'utilisateur. */
function IndexRedirect() {
  const { user } = useContext(UserContext);
  return <Navigate to={landingPath(user)} replace />;
}

/** Écran affiché quand aucun accès n'a encore été accordé à l'utilisateur. */
function NoAccess() {
  return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
      <h2 style={{ marginBottom: 8 }}>Aucun accès accordé</h2>
      <p>Votre compte n'a pas encore d'accès au menu. Contactez un administrateur.</p>
    </div>
  );
}

const STAFF = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"];
const SUIVI = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "AUDITEUR"];
const ADMIN = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"];
const OWNER = ["SUPER_ADMIN", "ADMIN_ORGANISME"];

/** Choisit l'application selon le rôle : espace stagiaire vs application admin. */
function AppRoutes() {
  const { user, isLoading } = useContext(UserContext);

  if (isLoading) {
    return (
      <div className="app-loading">
        <div className="brand-splash"><img src={LOGO} alt="" /><span>Impasto</span></div>
      </div>
    );
  }

  const isStudent = user?.role === "STAGIAIRE";
  const isPlatform = user?.role === "PLATFORM_OWNER";

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {isPlatform ? (
        // --- Console plateforme (revente : gestion des organismes) ---
        <Route path="/" element={<PlatformGate />}>
          <Route index element={<Navigate to="/organisations" replace />} />
          <Route path="organisations" element={<Platform />} />
          <Route path="*" element={<Navigate to="/organisations" replace />} />
        </Route>
      ) : isStudent ? (
        // --- Espace stagiaire (pas de barre latérale admin) ---
        <Route path="/" element={<StudentLayout />}>
          <Route index element={<Navigate to="/mon-espace" replace />} />
          <Route path="mon-espace" element={<MonEspace />} />
          <Route path="emargement" element={<EmargementStagiaire />} />
          <Route path="formations" element={<MesFormations />} />
          <Route path="formations/:id" element={<StudentFormationDetail />} />
          <Route path="atelier" element={<Atelier />} />
          <Route path="*" element={<Navigate to="/mon-espace" replace />} />
        </Route>
      ) : (
        // --- Application (secrétariat / administration) ---
        <Route path="/" element={<AppLayout />}>
          <Route index element={<IndexRedirect />} />
          <Route path="aucun-acces" element={<NoAccess />} />
          <Route path="dashboard" element={<Guard nav="/dashboard" roles={STAFF}><Dashboard /></Guard>} />
          <Route path="stagiaires" element={<Guard nav="/stagiaires" roles={STAFF}><Stagiaires /></Guard>} />
          <Route path="stagiaires/:id" element={<Guard nav="/stagiaires" roles={STAFF}><StagiaireDetail /></Guard>} />
          <Route path="pipeline" element={<Guard nav="/pipeline" roles={ADMIN}><Pipeline /></Guard>} />
          <Route path="sessions" element={<Guard nav="/sessions" roles={STAFF}><Sessions /></Guard>} />
          <Route path="sessions/:id" element={<Guard nav="/sessions" roles={STAFF}><SessionDetail /></Guard>} />
          <Route path="formations" element={<Guard nav="/formations" roles={STAFF}><Formations /></Guard>} />
          <Route path="qcm" element={<Guard nav="/qcm" roles={ADMIN}><Quiz /></Guard>} />
          <Route path="opcos" element={<Guard nav="/opcos" roles={ADMIN}><Opcos /></Guard>} />
          <Route path="partenaires" element={<Guard nav="/partenaires" roles={STAFF}><Partenaires /></Guard>} />
          <Route path="ventes" element={<Guard nav="/ventes" roles={ADMIN}><Ventes /></Guard>} />
          <Route path="inventaire" element={<Guard nav="/ventes" roles={ADMIN}><Inventaire /></Guard>} />
          <Route path="factures" element={<Guard nav="/factures" roles={ADMIN}><Factures /></Guard>} />
          <Route path="comptabilite" element={<Guard nav="/comptabilite" roles={ADMIN}><Comptabilite /></Guard>} />
          <Route path="produit-divers" element={<Guard nav="/produit-divers" roles={STAFF}><ProduitDivers /></Guard>} />
          <Route path="carte" element={<Guard nav="/carte" roles={ADMIN}><Carte /></Guard>} />
          <Route path="reglages" element={<Guard nav="/reglages" roles={ADMIN}><Reglages /></Guard>} />
          <Route path="modeles" element={<Guard nav="/modeles" roles={ADMIN}><Modeles /></Guard>} />
          <Route path="modeles/:slug/editeur" element={<Guard nav="/modeles" roles={ADMIN}><TemplateEditor /></Guard>} />
          <Route path="equipe" element={<Guard nav="/equipe" roles={OWNER}><Equipe /></Guard>} />
          <Route path="audit" element={<Guard nav="/audit" roles={SUIVI}><Audit /></Guard>} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="suivi" element={<Guard nav="/suivi" roles={SUIVI}><Suivi /></Guard>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      )}
    </Routes>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <UserProvider>
        <LoadingBar />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </UserProvider>
    </ThemeProvider>
  </React.StrictMode>
);
