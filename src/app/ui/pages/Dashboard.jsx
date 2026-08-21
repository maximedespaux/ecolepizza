import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getStagiaires, getFormations, getSessions, getEnrollments, getSales, getAudit, getOrganisation, getInvoices, getPartenaires } from "../api/apiClient.js";
import Card from "../components/Card.jsx";
import DataTable from "../components/DataTable.jsx";
import Badge from "../components/Badge.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { Icon } from "../components/Icon.jsx";
import { etatContrat, frISO, BIENTOT_JOURS } from "../lib/contrat.js";
import { auditLabel } from "../lib/auditLabels.js";
import StatusMessage from "../components/StatusMessage.jsx";
import MoneyToggle from "../components/MoneyToggle.jsx";
import { scoreBadge, euro, colorOf, dateHeure } from "../lib/format.js";

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
  // La caisse est fermée au formateur : son appel échoue, et le CA ne doit alors pas
  // s'afficher du tout — surtout pas replié sur zéro. Cf. la ligne des compteurs.
  const [caConnu, setCaConnu] = useState(false);
  // Ce qui APPELLE UN GESTE aujourd'hui. Un tableau de bord doit se terminer par un clic,
  // pas par une lecture : « 47 dossiers » n'apprend rien tant qu'on ignore si c'est beaucoup.
  const [todos, setTodos] = useState([]);
  const [upcoming, setUpcoming] = useState(null); // `null` = on charge, `[]` = rien à venir
  const [recent, setRecent] = useState([]);
  const [activity, setActivity] = useState([]);
  const [org, setOrg] = useState(null);
  const [partenaires, setPartenaires] = useState(null);   // `null` = on charge
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  /* LE RÉCAPITULATIF PARTENAIRES, calculé à part de l'affichage. `etatContrat` fait de
     l'arithmétique de dates : le refaire à chaque rendu recalculerait vingt-deux échéances à
     chaque frappe ailleurs sur la page. */
  const recapPartenaires = useMemo(() => {
    if (!partenaires) return null;
    const suivis = partenaires.map((p) => ({ p, c: etatContrat(p) })).filter((x) => x.c.suivi);
    const echus = suivis.filter((x) => x.c.actif === false)
      .sort((a, b) => a.c.jours - b.c.jours);           // le plus anciennement échu d'abord
    const bientot = suivis.filter((x) => x.c.actif && !x.c.incomplet && x.c.jours <= BIENTOT_JOURS)
      .sort((a, b) => a.c.jours - b.c.jours);           // le plus urgent d'abord
    return {
      total: partenaires.length,
      suivis: suivis.length,
      /* SANS CONTRAT ≠ CONTRAT EXPIRÉ, et la nuance compte : ne pas suivre d'échéance est un
         choix légitime (un fournisseur de passage, une remise sans convention). Les confondre
         ferait apparaître dix-huit « problèmes » sur une page qui doit n'en signaler aucun. */
      sansContrat: partenaires.length - suivis.length,
      incomplets: suivis.filter((x) => x.c.incomplet).length,
      echus, bientot,
    };
  }, [partenaires]);

  useEffect(() => {
    async function load() {
      try {
        const [s, f, se, e, v, a, o, iv, pa] = await Promise.allSettled([
          getStagiaires(), getFormations(), getSessions(), getEnrollments(), getSales(), getAudit(), getOrganisation(),
          // La facturation n'est pas toujours accessible selon le rôle : `allSettled` la laisse
          // échouer sans emporter le reste, et la ligne « à relancer » s'efface d'elle-même.
          getInvoices(),
          /* L'annuaire des partenaires : `allSettled` là aussi, pour que le formateur — qui y a
             accès en lecture — ne perde pas tout le tableau de bord si la route lui est fermée
             un jour. */
          getPartenaires(),
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

        setCaConnu(v.status === "fulfilled");
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

        /* LES CONTRATS PARTENAIRES ARRIVÉS À TERME OU SUR LE POINT DE L'ÊTRE.
           Une convention qui s'achève ne se manifeste par RIEN — ni erreur, ni alerte : elle
           cesse simplement d'exister, pendant que les offres du partenaire disparaissent de la
           boutique sans que personne ne comprenne pourquoi. C'est précisément le genre
           d'échéance qu'un tableau de bord doit rattraper. */
        const partenairesData = val(pa, { data: [] }).data || [];
        setPartenaires(partenairesData);
        const contrats = partenairesData.map((x) => ({ p: x, c: etatContrat(x) })).filter((x) => x.c.suivi);
        const echus = contrats.filter((x) => x.c.actif === false);
        const bientot = contrats.filter((x) => x.c.actif && !x.c.incomplet && x.c.jours <= BIENTOT_JOURS);

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
          /* ÉCHU en premier, et en rouge : le partenaire ne reçoit plus rien et ses offres ont
             déjà quitté la boutique. « Bientôt » est encore rattrapable, d'où l'orange. */
          echus.length && { n: echus.length, tone: "ember", to: "/partenaires",
            label: echus.length > 1 ? "contrats partenaires terminés" : "contrat partenaire terminé",
            sous: "offres retirées de la boutique" },
          bientot.length && { n: bientot.length, tone: "orange", to: "/partenaires",
            label: bientot.length > 1 ? "contrats à renouveler" : "contrat à renouveler",
            sous: `échéance sous ${BIENTOT_JOURS} jours` },
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
              /* CLÉ SUR LE LIBELLÉ, PAS SUR LA DESTINATION. Deux entrées peuvent viser la même
                 page — « contrats terminés » et « contrats à renouveler » pointent toutes deux
                 vers /partenaires — et React n'en afficherait qu'une, en silence. */
              <Link key={t.label} to={t.to} className={`todo-i tone-${t.tone}`}>
                <b className="chiffres">{t.n}</b>
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
        <Link to="/stagiaires"><b className="chiffres">{stats.stagiaires}</b> stagiaires</Link><i />
        <Link to="/suivi"><b className="chiffres">{stats.dossiers}</b> dossiers actifs</Link><i />
        <Link to="/sessions"><b className="chiffres">{stats.sessions}</b> sessions à venir</Link><i />
        {/* LE CA NE S'AFFICHE QUE S'IL A ÉTÉ REÇU. La caisse est fermée au formateur : son appel
            partait en 403 et le repli de `allSettled` retombait sur 0, donc son tableau de bord
            annonçait « 0,00 € de ventes » — un chiffre inventé, présenté comme un vrai, qui dit
            que l'école n'a rien vendu. Mieux vaut ne rien dire que dire zéro. */}
        {caConnu && (
          <>
            <Link to="/ventes"><b className="tnum">{euro(stats.ca)}</b> de ventes</Link><i />
            <MoneyToggle sm />
          </>
        )}
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
              { k: "date", t: "Date", td: { whiteSpace: "nowrap" }, cell: (s) => <span className="chiffres">{frDate(s.start_date)}</span> },
              { k: "semaine", t: "Semaine", th: { textAlign: "center" }, td: { textAlign: "center", color: "var(--muted)" },
                cell: (s) => <span className="chiffres">S{s.week} · {s.year}</span> },
            ]}
          />
        )}
      </Card>

      {/* `.grid` porte un `gap` ENTRE SES COLONNES, pas sous elle : une grille posée dans un
          empilement se colle donc au bloc suivant. C'est ce qui collait « Partenaires » à
          « Derniers dossiers » — 0 px là où tout le reste de la page respire de 16. */}
      <div className="grid cols-2" style={{ marginBottom: 16 }}>
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
                <span className="dash-act-date">{dateHeure(a.created_at)}</span>
              </div>
            );
          })}
        </Card>
      </div>

      {/* LES PARTENAIRES SUR LE TABLEAU DE BORD, parce qu'une échéance de contrat ne se
          manifeste NULLE PART ailleurs : elle ne provoque ni erreur ni alerte, et le jour venu
          les offres du partenaire disparaissent simplement de la boutique. C'est exactement le
          genre de date qu'on ne va pas chercher — donc qu'il faut apporter. */}
      <Card title="Partenaires" className="fade" style={{ marginBottom: 16 }}
        more={<Link to="/partenaires" className="card-more">Annuaire <Icon name="chevron-right" size={13} aria-hidden="true" /></Link>}>
        {recapPartenaires === null ? (
          <Skeleton w="60%" h={14} />
        ) : recapPartenaires.total === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Aucun partenaire enregistré.</p>
        ) : (
          <>
            <div className="compteurs" style={{ marginBottom: recapPartenaires.echus.length || recapPartenaires.bientot.length ? 12 : 0 }}>
              <span><b className="chiffres">{recapPartenaires.total}</b> au total</span><i />
              <span><b className="chiffres">{recapPartenaires.suivis}</b> sous contrat</span><i />
              <span><b className="chiffres">{recapPartenaires.sansContrat}</b> sans échéance suivie</span>
            </div>

            {recapPartenaires.echus.map(({ p, c }) => (
              <div key={p.id} className="reca-ligne ton-r">
                <Icon name="alert-triangle" size={13} />
                <b>{p.name}</b>
                <span className="hint">
                  contrat terminé le {frISO(c.fin)}
                  {c.jours < -1 ? ` · il y a ${Math.abs(c.jours)} jours` : ""}
                </span>
              </div>
            ))}
            {recapPartenaires.bientot.map(({ p, c }) => (
              <div key={p.id} className="reca-ligne ton-o">
                <Icon name="calendar" size={13} />
                <b>{p.name}</b>
                <span className="hint">
                  jusqu'au {frISO(c.fin)} · {c.jours === 0 ? "dernier jour" : `${c.jours} jour${c.jours > 1 ? "s" : ""}`}
                </span>
              </div>
            ))}
            {recapPartenaires.incomplets > 0 && (
              <div className="reca-ligne ton-n">
                <Icon name="help" size={13} />
                <span className="hint">
                  {recapPartenaires.incomplets} contrat{recapPartenaires.incomplets > 1 ? "s" : ""} sans
                  date de début ou durée : l'échéance ne peut pas être suivie.
                </span>
              </div>
            )}
            {!recapPartenaires.echus.length && !recapPartenaires.bientot.length && !recapPartenaires.incomplets && (
              <p className="hint" style={{ margin: 0 }}>
                <Icon name="check-circle" size={13} style={{ verticalAlign: "-2px" }} /> Aucune
                échéance dans les {BIENTOT_JOURS} prochains jours.
              </p>
            )}
          </>
        )}
      </Card>

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
