import React, { useContext } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { UserProvider, UserContext } from "./context/UserContext.jsx";
import "./styles/app.css";

import AppLayout from "./layouts/AppLayout.jsx";
import StudentLayout from "./layouts/StudentLayout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Stagiaires from "./pages/Stagiaires.jsx";
import StagiaireDetail from "./pages/StagiaireDetail.jsx";
import Formations from "./pages/Formations.jsx";
import Sessions from "./pages/Sessions.jsx";
import SessionDetail from "./pages/SessionDetail.jsx";
import Suivi from "./pages/Suivi.jsx";
import Partenaires from "./pages/Partenaires.jsx";
import MonEspace from "./pages/MonEspace.jsx";
import MesFormations from "./pages/MesFormations.jsx";
import StudentFormationDetail from "./pages/StudentFormationDetail.jsx";
import NotFound from "./pages/NotFound.jsx";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

/** Restreint une route à certains rôles (redirige vers le dashboard sinon). */
function RoleRoute({ roles, children }) {
  const { user } = useContext(UserContext);
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

const STAFF = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR"];
const SUIVI = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT", "AUDITEUR"];

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

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {isStudent ? (
        // --- Espace stagiaire (pas de barre latérale admin) ---
        <Route path="/" element={<StudentLayout />}>
          <Route index element={<Navigate to="/mon-espace" replace />} />
          <Route path="mon-espace" element={<MonEspace />} />
          <Route path="formations" element={<MesFormations />} />
          <Route path="formations/:id" element={<StudentFormationDetail />} />
          <Route path="*" element={<Navigate to="/mon-espace" replace />} />
        </Route>
      ) : (
        // --- Application (secrétariat / administration) ---
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="stagiaires" element={<RoleRoute roles={STAFF}><Stagiaires /></RoleRoute>} />
          <Route path="stagiaires/:id" element={<RoleRoute roles={STAFF}><StagiaireDetail /></RoleRoute>} />
          <Route path="sessions" element={<RoleRoute roles={STAFF}><Sessions /></RoleRoute>} />
          <Route path="sessions/:id" element={<RoleRoute roles={STAFF}><SessionDetail /></RoleRoute>} />
          <Route path="formations" element={<RoleRoute roles={STAFF}><Formations /></RoleRoute>} />
          <Route path="partenaires" element={<RoleRoute roles={STAFF}><Partenaires /></RoleRoute>} />
          <Route path="suivi" element={<RoleRoute roles={SUIVI}><Suivi /></RoleRoute>} />
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
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </UserProvider>
    </ThemeProvider>
  </React.StrictMode>
);
