import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStagiaires, getFormations, getSessions, getEnrollments } from "../api/apiClient.js";
import Kpi from "../components/Kpi.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { scoreBadge } from "../lib/format.js";

const QUICK = [
  ["/stagiaires", "☺ Ajouter un stagiaire"],
  ["/sessions", "▦ Planifier une session"],
  ["/formations", "◍ Consulter le catalogue"],
  ["/partenaires", "🤝 Gérer les partenaires"],
  ["/suivi", "▤ Vérifier la conformité Qualiopi"],
];

function Dashboard() {
  const [stats, setStats] = useState({ stagiaires: 0, formations: 0, sessions: 0, dossiers: 0 });
  const [recent, setRecent] = useState([]);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [s, f, se, e] = await Promise.all([
          getStagiaires(), getFormations(), getSessions(), getEnrollments(),
        ]);
        setStats({
          stagiaires: s.data.length,
          formations: f.data.length,
          sessions: se.data.length,
          dossiers: e.data.length,
        });
        setRecent(e.data.slice(0, 5));
      } catch (err) {
        setStatus({ type: "error", message: err.message });
      }
    }
    load();
  }, []);

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Secrétariat · École Pizza</div>
        <h1>Bonjour 👋</h1>
        <p>ECOLE PIZZAIOLO Jean-Jacques Despaux — SIRET 879 955 136 00012 · Certifié Qualiopi.</p>
        <div className="badge-row">
          <span className="pill">✓ Qualiopi actif</span>
          <span className="pill">{stats.dossiers} dossier(s)</span>
          <span className="pill">{stats.sessions} session(s)</span>
        </div>
      </div>

      <StatusMessage status={status} />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Kpi label="Stagiaires" value={stats.stagiaires} sub="Voir →" to="/stagiaires" />
        <Kpi label="Dossiers" value={stats.dossiers} sub="Voir →" to="/suivi" />
        <Kpi label="Sessions" value={stats.sessions} sub="Voir →" to="/sessions" />
        <Kpi label="Formations" value={stats.formations} sub="Voir →" to="/formations" />
      </div>

      <div className="grid cols-2">
        <Card title="Derniers dossiers" more={<Link to="/suivi" className="card-more">Suivi →</Link>}>
          {recent.length === 0 ? (
            <p className="lead" style={{ margin: 0 }}>Aucun dossier pour le moment.</p>
          ) : recent.map((e) => (
            <div key={e.id} className="dash-sess" style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span style={{ flex: 1 }}>{e.first_name} {e.last_name} — {e.program_title || "Formation"}</span>
              <Badge tone={scoreBadge(e.conformite_score)}>{e.conformite_score}</Badge>
            </div>
          ))}
        </Card>

        <Card title="Accès rapides">
          <div className="grid" style={{ gap: 10 }}>
            {QUICK.map(([to, label]) => (
              <Link key={to} to={to} className="btn" style={{ justifyContent: "flex-start" }}>{label}</Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

export default Dashboard;
