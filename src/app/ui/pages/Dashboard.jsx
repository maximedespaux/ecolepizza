import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStagiaires, getFormations, getSessions, getEnrollments, getSales, getAudit, getOrganisation } from "../api/apiClient.js";
import Kpi from "../components/Kpi.jsx";
import Card from "../components/Card.jsx";
import DataTable from "../components/DataTable.jsx";
import Badge from "../components/Badge.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { Icon } from "../components/Icon.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { scoreBadge, euro, colorOf } from "../lib/format.js";

const frDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—");

const QUICK = [
  ["/stagiaires", "user-plus", "Ajouter un stagiaire"],
  ["/sessions", "calendar-plus", "Planifier une session"],
  ["/ventes", "cart", "Enregistrer une vente"],
  ["/suivi", "clipboard-check", "Vérifier la conformité Qualiopi"],
];

const ACTION_LABEL = {
  "document.send": "Document envoyé", "document.sign": "Document signé", "document.create": "Document préparé",
  "sale.create": "Vente enregistrée", "attendance.generate": "Émargement généré", "organization.update": "Organisme modifié",
};

function Dashboard() {
  const [stats, setStats] = useState({ stagiaires: 0, formations: 0, sessions: 0, dossiers: 0, ca: 0 });
  const [upcoming, setUpcoming] = useState(null); // `null` = on charge, `[]` = rien à venir
  const [recent, setRecent] = useState([]);
  const [activity, setActivity] = useState([]);
  const [org, setOrg] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
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
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <>
      <div className="hero">
        <Icon name="pizza" size={210} strokeWidth={1.1} className="hero-motif" style={{ zIndex: 0 }} />
        <div className="eyebrow">Secrétariat · {org?.short_name || "École Pizza"}</div>
        <h1>Bonjour</h1>
        <p>{org ? `${org.legal_name} — SIRET ${org.siret || "—"} · NDA ${org.nda || "—"}` : "Tableau de bord"}{org?.qualiopi ? " · Certifié Qualiopi." : ""}</p>
        <div className="badge-row">
          {org?.qualiopi && <span className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="check" size={12} /> Qualiopi actif</span>}
          <span className="pill">{stats.dossiers} dossier(s)</span>
          <span className="pill">{stats.sessions} session(s)</span>
        </div>
      </div>

      <StatusMessage status={status} />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        {loading ? (
          [0, 1, 2, 3].map((i) => (
            <div className="kpi" key={i}>
              <div className="kpi-top">
                <Skeleton w="52%" h={12} />
                <Skeleton w={34} h={34} r={10} />
              </div>
              <Skeleton w="60%" h={30} style={{ marginTop: 12 }} />
              <Skeleton w="40%" h={11} style={{ marginTop: 12 }} />
            </div>
          ))
        ) : (
          <>
            <Kpi label="Stagiaires" value={stats.stagiaires} sub="Voir →" to="/stagiaires" icon="users" tone="blue" countUp />
            <Kpi label="Dossiers actifs" value={stats.dossiers} sub="Hors formations passées →" to="/suivi" icon="folder-check" tone="green" countUp />
            <Kpi label="Sessions à venir" value={stats.sessions} sub="Hors formations passées →" to="/sessions" icon="calendar" tone="orange" countUp />
            <Kpi label="Ventes (CA)" value={stats.ca} format={euro} sub="Voir →" to="/ventes" icon="euro" tone="ember" countUp />
          </>
        )}
      </div>

      <Card title="Prochaines sessions" className="fade" more={<Link to="/sessions" className="card-more">Planning →</Link>} style={{ marginBottom: 16 }}>
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0" }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Skeleton w={9} h={9} round />
                <Skeleton w="45%" h={14} />
                <Skeleton w={40} h={20} r={99} style={{ marginLeft: "auto" }} />
                <Skeleton w={80} h={13} />
              </div>
            ))}
          </div>
        ) : (
          <DataTable
            rows={upcoming}
            vide={<p className="lead" style={{ margin: 0 }}>Aucune session à venir.</p>}
            rowKey={(s) => s.id}
            cols={[
              { k: "formation", t: "Formation", principal: true,
                cell: (s) => (
                  <Link to={`/sessions/${s.id}`} style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: colorOf(s.program_code), flex: "0 0 9px" }} />
                    {s.program_title || s.program_code || "Formation"}
                  </Link>
                ) },
              { k: "inscrits", t: "Inscrits", th: { textAlign: "center" }, td: { textAlign: "center" },
                cell: (s) => <span className="pill" style={{ fontSize: 12 }}>{s.stagiaires ?? 0}</span> },
              { k: "date", t: "Date", td: { whiteSpace: "nowrap" }, cell: (s) => <span className="tnum">{frDate(s.start_date)}</span> },
              { k: "semaine", t: "Semaine", th: { textAlign: "center" }, td: { textAlign: "center", color: "var(--muted)" },
                cell: (s) => <span className="tnum">S{s.week} · {s.year}</span> },
            ]}
          />
        )}
      </Card>

      <div className="grid cols-2">
        <Card title="Derniers dossiers" more={<Link to="/suivi" className="card-more">Suivi →</Link>}>
          {loading ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <Skeleton w={`${65 - i * 6}%`} h={14} />
                <Skeleton w={34} h={20} r={99} style={{ marginLeft: "auto" }} />
              </div>
            ))
          ) : recent.length === 0 ? (
            <p className="lead" style={{ margin: 0 }}>Aucun dossier pour le moment.</p>
          ) : recent.map((e) => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
              <span style={{ flex: 1 }}>{e.first_name} {e.last_name} — {e.program_title || "Formation"}</span>
              <Badge tone={scoreBadge(e.conformite_score)}>{e.conformite_score}</Badge>
            </div>
          ))}
        </Card>

        <Card title="Activité récente" more={<Link to="/audit" className="card-more">Journal →</Link>}>
          {loading ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <Skeleton w={8} h={8} round />
                <Skeleton w={`${60 - i * 5}%`} h={13} />
                <Skeleton w={54} h={11} style={{ marginLeft: "auto" }} />
              </div>
            ))
          ) : activity.length === 0 ? (
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

      <Card title="Accès rapides" className="fade">
        <div className="grid cols-4" style={{ gap: 10 }}>
          {QUICK.map(([to, icon, label]) => (
            <Link key={to} to={to} className="btn quick-btn" style={{ justifyContent: "flex-start" }}>
              <span className="quick-ic"><Icon name={icon} size={17} /></span>
              {label}
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}

export default Dashboard;
