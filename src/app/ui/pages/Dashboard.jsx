import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStagiaires, getFormations, getSessions, getEnrollments, getSales, getAudit, getOrganisation, getInvoices } from "../api/apiClient.js";
import Card from "../components/Card.jsx";
import DataTable from "../components/DataTable.jsx";
import Badge from "../components/Badge.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { Icon } from "../components/Icon.jsx";
import { auditLabel } from "../lib/auditLabels.js";
import StatusMessage from "../components/StatusMessage.jsx";
import { scoreBadge, euro, colorOf } from "../lib/format.js";

const frDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "-");

const QUICK = [
  ["/stagiaires", "user-plus", "Ajouter un stagiaire"],
  ["/sessions", "calendar-plus", "Planifier une session"],
  ["/ventes", "cart", "Enregistrer une vente"],
  ["/suivi", "clipboard-check", "Vérifier la conformité Qualiopi"],
];

// Le dictionnaire d'actions vivait ici EN DOUBLE, avec six entrées quand `lib/auditLabels.js`
// en compte des dizaines. C'est ce qui faisait diverger le tableau de bord du journal d'audit :
// deux sources pour la même traduction. Supprimé au profit de la seule qui fait autorité.

function Dashboard() {
  const [stats, setStats] = useState({ stagiaires: 0, formations: 0, sessions: 0, dossiers: 0, ca: 0 });
  // Ce qui APPELLE UN GESTE aujourd'hui. Un tableau de bord doit se terminer par un clic,
  // pas par une lecture : « 47 dossiers » n'apprend rien tant qu'on ignore si c'est beaucoup.
  const [todos, setTodos] = useState([]);
  const [upcoming, setUpcoming] = useState(null); // `null` = on charge, `[]` = rien à venir
  const [recent, setRecent] = useState([]);
  const [activity, setActivity] = useState([]);
  const [org, setOrg] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [s, f, se, e, v, a, o, iv] = await Promise.allSettled([
          getStagiaires(), getFormations(), getSessions(), getEnrollments(), getSales(), getAudit(), getOrganisation(),
          // La facturation n'est pas toujours accessible selon le rôle : `allSettled` la laisse
          // échouer sans emporter le reste, et la ligne « à relancer » s'efface d'elle-même.
          getInvoices(),
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

        /* CE QUI APPELLE UNE ACTION. Trois questions du matin, dans l'ordre où elles coûtent :
           l'argent qu'on attend, les dossiers qui bloqueront l'audit, ce qui démarre sous huit
           jours. Chaque entrée ne paraît QUE si elle vaut plus de zéro — un tableau de bord qui
           affiche « 0 à traiter » trois fois apprend à ignorer la zone entière. */
        const j7 = new Date(now.getTime() + 7 * 864e5);
        const j7Str = `${j7.getFullYear()}-${pad(j7.getMonth() + 1)}-${pad(j7.getDate())}`;

        const inv = val(iv, { data: [], totals: {} });
        const aRelancer = (inv.data || []).filter((i) =>
          i.status === "IMPAYEE" || (i.status === "EMISE" && i.due_date && i.due_date < todayStr));
        // Un dossier incomplet est celui qui n'atteint pas 100 : c'est le seuil de l'audit,
        // pas une moyenne à surveiller.
        const incomplets = activeEnr.filter((x) => Number(x.conformite_score) < 100);
        const imminentes = activeSessions.filter((sess) =>
          sess.start_date && sess.start_date >= todayStr && sess.start_date <= j7Str);

        setTodos([
          aRelancer.length && { n: aRelancer.length, tone: "ember", to: "/factures",
            label: aRelancer.length > 1 ? "factures à relancer" : "facture à relancer",
            sous: euro(inv.totals?.impaye || 0) + " en attente" },
          incomplets.length && { n: incomplets.length, tone: "orange", to: "/suivi",
            label: incomplets.length > 1 ? "dossiers à compléter" : "dossier à compléter",
            sous: "pièces manquantes pour Qualiopi" },
          imminentes.length && { n: imminentes.length, tone: "blue", to: "/sessions",
            label: imminentes.length > 1 ? "sessions cette semaine" : "session cette semaine",
            sous: "démarrage sous 8 jours" },
        ].filter(Boolean));

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
        <p>{org ? `${org.legal_name}, SIRET ${org.siret || "-"} · NDA ${org.nda || "-"}` : "Tableau de bord"}{org?.qualiopi ? " · Certifié Qualiopi." : ""}</p>
        <div className="badge-row">
          {org?.qualiopi && <span className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="check" size={12} /> Qualiopi actif</span>}
          <span className="pill">{stats.dossiers} dossier(s)</span>
          <span className="pill">{stats.sessions} session(s)</span>
        </div>
      </div>

      <StatusMessage status={status} />

      {/* CE QUI APPELLE UNE ACTION passe devant. La question du matin est « qu'est-ce qui
          m'attend », pas « combien j'en ai » — et quatre compteurs occupaient tout le premier
          écran pour répondre à la seconde. Quand tout est à jour, la zone le dit en une ligne
          et s'efface : c'est une information, pas un vide. */}
      {loading ? (
        <div className="todo"><Skeleton w="30%" h={13} /><Skeleton w="100%" h={62} r={12} style={{ marginTop: 10 }} /></div>
      ) : todos.length > 0 ? (
        <div className="todo">
          <div className="todo-t">À traiter</div>
          <div className="todo-row">
            {todos.map((t) => (
              <Link key={t.to} to={t.to} className={`todo-i tone-${t.tone}`}>
                <b className="tnum">{t.n}</b>
                <span className="todo-l">{t.label}<i>{t.sous}</i></span>
                <Icon name="chevron-right" size={16} aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="todo-calme">
          <Icon name="check-circle" size={17} aria-hidden="true" />
          Rien ne demande d'action : dossiers complets, factures à jour, aucune session imminente.
        </div>
      )}

      {/* Les compteurs situent, ils ne se consultent pas : une ligne suffit. Ils restent
          cliquables — c'était leur seul usage réel. */}
      <div className="compteurs">
        <Link to="/stagiaires"><b className="tnum">{stats.stagiaires}</b> stagiaires</Link><i />
        <Link to="/suivi"><b className="tnum">{stats.dossiers}</b> dossiers actifs</Link><i />
        <Link to="/sessions"><b className="tnum">{stats.sessions}</b> sessions à venir</Link><i />
        <Link to="/ventes"><b className="tnum">{euro(stats.ca)}</b> de ventes</Link>
      </div>

      <Card title="Prochaines sessions" className="fade" more={<Link to="/sessions" className="card-more">Planning <Icon name="chevron-right" size={13} aria-hidden="true" /></Link>} style={{ marginBottom: 16 }}>
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
        <Card title="Derniers dossiers" more={<Link to="/suivi" className="card-more">Suivi <Icon name="chevron-right" size={13} aria-hidden="true" /></Link>}>
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
              <span style={{ flex: 1 }}>{e.first_name} {e.last_name}, {e.program_title || "Formation"}</span>
              <Badge tone={scoreBadge(e.conformite_score)}>{e.conformite_score}</Badge>
            </div>
          ))}
        </Card>

        <Card title="Activité récente" more={<Link to="/audit" className="card-more">Journal <Icon name="chevron-right" size={13} aria-hidden="true" /></Link>}>
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
          ) : activity.map((a) => {
            /* `auditLabel` et non `ACTION_LABEL[…]` : le dictionnaire ne couvre que les actions
               NOMMÉES une à une. Pour les autres — `template.save`, `sale.checkout`… — il
               renvoyait `undefined` et le repli affichait le CODE BRUT. `auditLabel` sait, lui,
               composer « Modèle enregistré » à partir du verbe et de l'entité, avec l'accord au
               féminin. Le journal d'audit l'utilisait déjà ; le tableau de bord, non — même
               donnée, deux chemins de code, deux rendus. */
            const { label, tone } = auditLabel(a.action, a.entity);
            return (
              <div key={a.id} className="dash-act">
                {/* La pastille prend le TON de l'action : vert pour ce qui aboutit, rouge pour
                    ce qui supprime. Elle était toujours orange, donc muette. */}
                <span className={`dash-act-dot tone-${tone}`} aria-hidden="true" />
                <span style={{ flex: 1 }}>{label}</span>
                <span className="dash-act-date">{a.created_at}</span>
              </div>
            );
          })}
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
