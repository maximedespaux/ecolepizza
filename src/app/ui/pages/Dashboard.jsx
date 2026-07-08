import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStagiaires, getFormations, getSessions, getEnrollments, getSales, getAudit, getOrganisation } from "../api/apiClient.js";
import Kpi from "../components/Kpi.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { scoreBadge, euro, colorOf } from "../lib/format.js";

const frDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const QUICK = [
  ["/stagiaires", "☺ Ajouter un stagiaire"],
  ["/sessions", "▦ Planifier une session"],
  ["/ventes", "Enregistrer une vente"],
  ["/suivi", "▤ Vérifier la conformité Qualiopi"],
];

const ACTION_LABEL = {
  "document.send": "Document envoyé", "document.sign": "Document signé", "document.create": "Document préparé",
  "sale.create": "Vente enregistrée", "attendance.generate": "Émargement généré", "organization.update": "Organisme modifié",
};

function Dashboard() {
  const [stats, setStats] = useState({ stagiaires: 0, formations: 0, sessions: 0, dossiers: 0, ca: 0 });
  const [upcoming, setUpcoming] = useState([]);
  const [recent, setRecent] = useState([]);
  const [activity, setActivity] = useState([]);
  const [org, setOrg] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    async function load() {
      const [s, f, se, e, v, a, o] = await Promise.allSettled([
        getStagiaires(), getFormations(), getSessions(), getEnrollments(), getSales(), getAudit(), getOrganisation(),
      ]);
      const val = (r, def) => (r.status === "fulfilled" ? r.value : def);

      // On ne compte que les formations à venir / en cours : une session est
      // « passée » si sa date de fin (ou de début à défaut) est antérieure à
      // aujourd'hui. Les dossiers rattachés à une session passée sont exclus.
      const pad = (n) => String(n).padStart(2, "0");
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const isPast = (sess) => {
        const d = sess.end_date || sess.start_date;
        return d ? d < todayStr : false; // sans date → on garde (indéterminé)
      };

      const sessions = val(se, { data: [] }).data;
      const activeSessions = sessions.filter((sess) => !isPast(sess));
      const activeIds = new Set(activeSessions.map((sess) => sess.id));

      // Prochaines sessions : à venir/en cours, triées par date de début.
      const nextSessions = [...activeSessions].sort((a, b) =>
        String(a.start_date || "9999").localeCompare(String(b.start_date || "9999"))
      );
      setUpcoming(nextSessions.slice(0, 6));

      const enr = val(e, { data: [] }).data;
      const activeEnr = enr.filter((x) => activeIds.has(x.session_id));

      setStats({
        stagiaires: val(s, { data: [] }).data.length,
        formations: val(f, { data: [] }).data.length,
        sessions: activeSessions.length,
        dossiers: activeEnr.length,
        ca: val(v, { total: 0 }).total || 0,
      });
      setRecent(activeEnr.slice(0, 5));
      setActivity(val(a, { data: [] }).data.slice(0, 6));
      setOrg(val(o, { data: null }).data);
      if ([s, f, se, e].every((r) => r.status === "rejected")) {
        setStatus({ type: "error", message: "Impossible de charger les données (API / session)." });
      }
    }
    load();
  }, []);

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Secrétariat · {org?.short_name || "École Pizza"}</div>
        <h1>Bonjour</h1>
        <p>{org ? `${org.legal_name} — SIRET ${org.siret || "—"} · NDA ${org.nda || "—"}` : "Tableau de bord"}{org?.qualiopi ? " · Certifié Qualiopi." : ""}</p>
        <div className="badge-row">
          {org?.qualiopi && <span className="pill">✓ Qualiopi actif</span>}
          <span className="pill">{stats.dossiers} dossier(s)</span>
          <span className="pill">{stats.sessions} session(s)</span>
        </div>
      </div>

      <StatusMessage status={status} />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Kpi label="Stagiaires" value={stats.stagiaires} sub="Voir →" to="/stagiaires" />
        <Kpi label="Dossiers actifs" value={stats.dossiers} sub="Hors formations passées →" to="/suivi" />
        <Kpi label="Sessions à venir" value={stats.sessions} sub="Hors formations passées →" to="/sessions" />
        <Kpi label="Ventes (CA)" value={euro(stats.ca)} sub="Voir →" to="/ventes" />
      </div>

      <Card title="Prochaines sessions" className="fade" more={<Link to="/sessions" className="card-more">Planning →</Link>} style={{ marginBottom: 16 }}>
        {upcoming.length === 0 ? (
          <p className="lead" style={{ margin: 0 }}>Aucune session à venir.</p>
        ) : (
          <div className="tablewrap" style={{ border: "none" }}>
            <table>
              <thead>
                <tr>
                  <th>Formation</th>
                  <th style={{ textAlign: "center" }}>Inscrits</th>
                  <th>Date</th>
                  <th style={{ textAlign: "center" }}>Semaine</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/sessions/${s.id}`} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 999, background: colorOf(s.program_code), flex: "0 0 9px" }} />
                        {s.program_title || s.program_code || "Formation"}
                      </Link>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="pill" style={{ fontSize: 12 }}>{s.stagiaires ?? 0}</span>
                    </td>
                    <td className="tnum" style={{ whiteSpace: "nowrap" }}>{frDate(s.start_date)}</td>
                    <td className="tnum" style={{ textAlign: "center", color: "var(--muted)" }}>S{s.week} · {s.year}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid cols-2">
        <Card title="Derniers dossiers" more={<Link to="/suivi" className="card-more">Suivi →</Link>}>
          {recent.length === 0 ? (
            <p className="lead" style={{ margin: 0 }}>Aucun dossier pour le moment.</p>
          ) : recent.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span style={{ flex: 1 }}>{e.first_name} {e.last_name} — {e.program_title || "Formation"}</span>
              <Badge tone={scoreBadge(e.conformite_score)}>{e.conformite_score}</Badge>
            </div>
          ))}
        </Card>

        <Card title="Activité récente" more={<Link to="/audit" className="card-more">Journal →</Link>}>
          {activity.length === 0 ? (
            <p className="lead" style={{ margin: 0 }}>Aucune activité récente.</p>
          ) : activity.map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-soft)", fontSize: 13 }}>
              <span className="dash-act-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--grad-ember)", flex: "0 0 8px" }} />
              <span style={{ flex: 1 }}>{ACTION_LABEL[a.action] || a.action}</span>
              <span style={{ fontSize: 12, color: "var(--dim)" }}>{a.created_at}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Accès rapides" className="fade" >
        <div className="grid cols-4" style={{ gap: 10 }}>
          {QUICK.map(([to, label]) => (
            <Link key={to} to={to} className="btn" style={{ justifyContent: "flex-start" }}>{label}</Link>
          ))}
        </div>
      </Card>
    </>
  );
}

export default Dashboard;
