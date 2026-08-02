import { useContext, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getSession, getStagiaires, createEnrollment, deleteEnrollment, deleteSession, getAssignableTrainers, setSessionTrainers, getLocations, updateSession, getCompanies, getCompany, registerCompanyStagiaires } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Squelette } from "../components/Squelette.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Emargement from "../components/Emargement.jsx";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import SessionIntervenants from "../components/SessionIntervenants.jsx";
import SessionRetraits from "../components/SessionRetraits.jsx";
import NotesModal from "../components/NotesModal.jsx";
import { colorOf, initials, scoreBadge } from "../lib/format.js";

function SessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const isAdmin = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"].includes(user?.role);
  const [session, setSession] = useState(null);
  const [allLearners, setAllLearners] = useState([]);
  const [team, setTeam] = useState([]);
  const [locations, setLocations] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null);
  const [notesFor, setNotesFor] = useState(null);
  // Inscription : « individuel » (recherche nominative) ou « entreprise » (on choisit
  // l'entreprise, puis les stagiaires parmi les SIENS). Deux façons de peupler la même session.
  const [mode, setMode] = useState("individuel");
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState("");
  const [companyLearners, setCompanyLearners] = useState(null); // null = pas encore chargé
  const [picked, setPicked] = useState(() => new Set());
  const [registering, setRegistering] = useState(false);

  async function load() {
    try {
      const r = await getSession(id);
      setSession(r.data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }
  useAutoRefresh(load, { interval: 20000 });

  useEffect(() => {
    load();
    getStagiaires().then((r) => setAllLearners(r.data)).catch(() => {});
    getAssignableTrainers().then((r) => setTeam(r.data)).catch(() => {});
    getLocations().then((r) => setLocations(r.data || [])).catch(() => {});
    getCompanies().then((r) => setCompanies(r.data || [])).catch(() => {});
  }, [id]);

  // Stagiaires de l'entreprise choisie. Chargés à la demande : la liste des entreprises ne
  // porte qu'un COMPTE (learner_count), pas les stagiaires eux-mêmes.
  useEffect(() => {
    if (!companyId) { setCompanyLearners(null); setPicked(new Set()); return; }
    let vivant = true;
    setCompanyLearners(null);
    setPicked(new Set());
    getCompany(companyId)
      .then((r) => { if (vivant) setCompanyLearners(r.data?.learners || []); })
      .catch((e) => { if (vivant) { setCompanyLearners([]); setStatus({ type: "error", message: e.message }); } });
    return () => { vivant = false; };
  }, [companyId]);

  async function changeLocation(location_id) {
    setSession((s) => ({ ...s, location_id }));
    try { await updateSession(id, { location_id: location_id || null }); }
    catch (err) { setStatus({ type: "error", message: err.message }); load(); }
  }

  async function toggleTrainer(uid) {
    const current = (session.trainers || []).map((t) => t.id);
    const next = current.includes(uid) ? current.filter((x) => x !== uid) : [...current, uid];
    try { await setSessionTrainers(id, next); load(); }
    catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  // Stagiaires pas encore inscrits à cette session.
  const available = useMemo(() => {
    if (!session) return [];
    const enrolled = new Set((session.enrollments || []).map((e) => e.learner_id));
    return allLearners.filter((l) => !enrolled.has(l.id));
  }, [session, allLearners]);

  // Filtre par la recherche (nom, prénom, email). La liste ne se déploie QUE si
  // quelque chose est saisi (sinon rien affiché, pour ne pas dérouler tout le fichier).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return available
      .filter((l) => `${l.first_name} ${l.last_name} ${l.email || ""}`.toLowerCase().includes(q))
      .slice(0, 10);
  }, [available, query]);

  async function addStagiaire(learnerId) {
    setStatus(null);
    try {
      await createEnrollment({ learner_id: learnerId, session_id: id, crm_stage: "INSCRIT" });
      setStatus({ type: "success", message: "Stagiaire inscrit." });
      load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Qui est déjà dans la session ? Sert à barrer les stagiaires déjà inscrits plutôt qu'à les
  // masquer : les voir grisés dit « c'est déjà fait », alors que les cacher laisse croire que
  // l'entreprise n'a que trois salariés.
  const dejaInscrits = useMemo(
    () => new Set((session?.enrollments || []).map((e) => e.learner_id)),
    [session]
  );
  const inscriptibles = useMemo(
    () => (companyLearners || []).filter((l) => !dejaInscrits.has(l.id)),
    [companyLearners, dejaInscrits]
  );
  const nomEntreprise = useMemo(
    () => companies.find((c) => c.id === companyId)?.name || "",
    [companies, companyId]
  );

  /* Seules les entreprises AYANT au moins un stagiaire rattaché sont proposées.
   *
   * Sur les données réelles, le fichier compte environ quatre cents entreprises dont cinq
   * seulement ont un stagiaire : dérouler les quatre cents, c'est faire défiler une page entière
   * d'impasses pour trouver les rares lignes utiles. Et une entreprise sans stagiaire ne PEUT
   * rien apporter à cette session — la choisir ne mènerait qu'à un panneau vide.
   * Le compte des autres est affiché quand même : masquer sans le dire ferait croire à un bug
   * (« mon entreprise n'est pas dans la liste »). */
  const entreprisesAvecStagiaires = useMemo(
    () => companies.filter((c) => Number(c.learner_count) > 0),
    [companies]
  );
  const nbSansStagiaire = companies.length - entreprisesAvecStagiaires.length;

  function bascule(learnerId) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(learnerId)) n.delete(learnerId); else n.add(learnerId);
      return n;
    });
  }
  const tousCoches = inscriptibles.length > 0 && inscriptibles.every((l) => picked.has(l.id));
  function toutBasculer() {
    setPicked(tousCoches ? new Set() : new Set(inscriptibles.map((l) => l.id)));
  }

  async function inscrireDepuisEntreprise() {
    const ids = [...picked];
    if (!ids.length) return;
    setRegistering(true); setStatus(null);
    try {
      // Même route que la fiche entreprise : elle pose `company_id` et le financement
      // PROFESSIONNEL sur l'inscription, ce qu'une inscription individuelle ne fait pas — c'est
      // ce rattachement qui regroupe ensuite les stagiaires sous leur entreprise, ici et sur les
      // documents de groupe.
      const r = await registerCompanyStagiaires(companyId, { session_id: id, learner_ids: ids });
      const n = (r.data?.created || []).filter((c) => c.enrolled).length;
      setStatus({
        type: "success",
        message: n
          ? `${n} stagiaire${n > 1 ? "s" : ""} inscrit${n > 1 ? "s" : ""} pour ${nomEntreprise || "l'entreprise"}.`
          : "Aucun nouveau stagiaire à inscrire (déjà inscrits).",
      });
      setPicked(new Set());
      load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setRegistering(false);
    }
  }

  async function removeStagiaire(enrollmentId) {
    setStatus(null);
    try {
      await deleteEnrollment(enrollmentId);
      load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function removeSession() {
    const n = session?.enrollments?.length || 0;
    const msg = n > 0
      ? `Supprimer cette session ? ${n} inscription(s) seront également retirées.`
      : "Supprimer cette session ?";
    if (!window.confirm(msg)) return;
    try {
      await deleteSession(id);
      navigate("/sessions");
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  if (!session) {
    // Même défaut que la fiche stagiaire : page blanche sous le titre, sans distinction entre
    // « ça charge », « c'est vide » et « ça a échoué ».
    return (
      <>
        <PageHead eyebrow="Session" title="Session" />
        <StatusMessage status={status} />
        {!status && <Squelette lignes={3} h={96} />}
      </>
    );
  }

  const enrollments = session.enrollments || [];

  return (
    <>
      <PageHead
        eyebrow={<Link to="/sessions" className="card-more" style={{ WebkitTextFillColor: "var(--ember1)" }}>← Retour au calendrier</Link>}
        title={session.program_title}
        lead={`Semaine ${session.week} · ${session.year} · du ${session.start_date} au ${session.end_date} · ${session.program_hours} h`}
        actions={
          <>
            <span className="badge n" style={{ background: colorOf(session.program_code), color: "#fff", borderColor: "transparent" }}>
              {session.program_code}
            </span>
            <button className="btn danger" onClick={removeSession}>Supprimer la session</button>
          </>
        }
      />
      <StatusMessage status={status} />

      {locations.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 14px", flexWrap: "wrap" }}>
          <span className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="map" size={13} /> Lieu de formation :</span>
          <select className="inp" style={{ maxWidth: 320 }} value={session.location_id || ""} onChange={(e) => changeLocation(e.target.value)}>
            <option value="">— Aucun / à définir —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.town ? ` — ${l.town}` : ""}</option>)}
          </select>
        </div>
      )}

      <div className="grid cols-2">
        <Card title="Inscrire des stagiaires">
          <div className="tabs" role="tablist" style={{ margin: "0 0 14px" }}>
            <button type="button" role="tab" aria-selected={mode === "individuel"}
              className={"tab" + (mode === "individuel" ? " on" : "")}
              onClick={() => setMode("individuel")}>
              Un stagiaire
            </button>
            <button type="button" role="tab" aria-selected={mode === "entreprise"}
              className={"tab" + (mode === "entreprise" ? " on" : "")}
              onClick={() => setMode("entreprise")}>
              Via une entreprise
            </button>
          </div>

          {mode === "entreprise" ? (
            <>
              <select className="inp" style={{ marginBottom: 8 }} aria-label="Entreprise"
                value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
                <option value="">— Choisir une entreprise —</option>
                {entreprisesAvecStagiaires.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.learner_count})</option>
                ))}
              </select>

              {!companyId ? (
                <p className="hint" style={{ margin: 0 }}>
                  {entreprisesAvecStagiaires.length === 0 ? (
                    <>Aucune entreprise n'a de stagiaire rattaché.{" "}
                      <Link to="/entreprises" className="card-more">Rattacher des stagiaires →</Link></>
                  ) : (
                    <>Choisissez une entreprise pour voir ses stagiaires.
                      {nbSansStagiaire > 0 && (
                        <> {nbSansStagiaire} entreprise{nbSansStagiaire > 1 ? "s" : ""} sans stagiaire rattaché
                          {nbSansStagiaire > 1 ? " ne sont pas listées" : " n'est pas listée"}.</>
                      )}
                    </>
                  )}
                </p>
              ) : companyLearners === null ? (
                <Squelette lignes={3} h={38} />
              ) : companyLearners.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  Cette entreprise n'a aucun stagiaire rattaché.{" "}
                  <Link to={`/entreprises/${companyId}`} className="card-more">Ouvrir sa fiche →</Link>
                </p>
              ) : inscriptibles.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  Tous les stagiaires de {nomEntreprise} sont déjà inscrits à cette session.
                </p>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={tousCoches} onChange={toutBasculer} />
                      Tout sélectionner
                    </label>
                    <span className="hint">{picked.size} sélectionné{picked.size > 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflowY: "auto" }}>
                    {companyLearners.map((l) => {
                      const dedans = dejaInscrits.has(l.id);
                      return (
                        <label key={l.id}
                          title={dedans ? "Déjà inscrit à cette session" : undefined}
                          style={{
                            display: "flex", alignItems: "center", gap: 10, padding: "6px 0",
                            borderBottom: "1px solid var(--border-soft)",
                            cursor: dedans ? "default" : "pointer", opacity: dedans ? 0.5 : 1,
                          }}>
                          <input type="checkbox" disabled={dedans}
                            checked={dedans || picked.has(l.id)}
                            onChange={() => bascule(l.id)} />
                          <span className="avatar" style={{ width: 30, height: 30, fontSize: 11, flex: "0 0 30px" }}>
                            {initials(l.first_name, l.last_name)}
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <b>{l.last_name} {l.first_name}</b>
                            <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email || "—"}</span>
                          </span>
                          {dedans && <Badge tone="ok">Déjà inscrit</Badge>}
                        </label>
                      );
                    })}
                  </div>
                  <button type="button" className="btn primary" style={{ marginTop: 12 }}
                    disabled={picked.size === 0 || registering}
                    onClick={inscrireDepuisEntreprise}>
                    {registering ? "Inscription…" : `Inscrire ${picked.size || ""} stagiaire${picked.size > 1 ? "s" : ""}`.trim()}
                  </button>
                </>
              )}
            </>
          ) : (
          <>
          <input
            className="inp"
            placeholder="Rechercher un stagiaire (nom, prénom ou email)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          {matches.length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>
              {available.length === 0
                ? "Tous les stagiaires sont déjà inscrits."
                : !query.trim()
                  ? "Tapez un nom, prénom ou email pour rechercher un stagiaire à inscrire."
                  : "Aucun stagiaire ne correspond."}{" "}
              <Link to="/stagiaires" className="card-more">Créer un stagiaire →</Link>
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {matches.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span className="avatar" style={{ width: 30, height: 30, fontSize: 11, flex: "0 0 30px" }}>{initials(l.first_name, l.last_name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.last_name} {l.first_name}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email || "—"}</span>
                  </span>
                  <button type="button" className="btn sm primary" onClick={() => addStagiaire(l.id)}>＋ Ajouter</button>
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </Card>

        <Card title={`Stagiaires inscrits (${enrollments.length})`}>
          {enrollments.length === 0 ? (
            <EmptyState icon="users">Aucun stagiaire inscrit.</EmptyState>
          ) : (() => {
            // Regroupe les stagiaires envoyés par une entreprise sous le nom de l'entreprise ;
            // les stagiaires individuels (sans entreprise) restent listés à plat en dessous.
            const enrollRow = (e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <span className="avatar">{initials(e.first_name, e.last_name)}</span>
                <button
                  type="button"
                  onClick={() => navigate(`/stagiaires/${e.learner_id}`)}
                  style={{ flex: 1, textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                  title="Voir la fiche du stagiaire"
                >
                  <b style={{ color: "var(--text)" }}>{e.last_name} {e.first_name}</b>
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{e.email || "—"}</span>
                </button>
                <Badge tone={scoreBadge(e.conformite_score)}>{e.conformite_score}</Badge>
                <button className="iconbtn" title="Notes de suivi" onClick={() => setNotesFor({ id: e.id, name: `${e.last_name} ${e.first_name}` })}><Icon name="pencil" size={15} /></button>
                <button className="iconbtn del" title="Retirer de la session" onClick={() => removeStagiaire(e.id)}><Icon name="trash" size={15} /></button>
              </div>
            );
            const companies = new Map();
            const solo = [];
            for (const e of enrollments) {
              if (e.company_id) {
                if (!companies.has(e.company_id)) companies.set(e.company_id, { name: e.company_name, list: [] });
                companies.get(e.company_id).list.push(e);
              } else solo.push(e);
            }
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...companies.entries()].map(([cid, g]) => (
                  <div key={cid} className="sess-comp">
                    <div className="sess-comp-hd"><Icon name="building" size={14} /> {g.name || "Entreprise"} <span className="arch-count">{g.list.length}</span></div>
                    {g.list.map(enrollRow)}
                  </div>
                ))}
                {solo.length > 0 && companies.size > 0 && (
                  <div className="sess-comp-hd" style={{ marginTop: 4 }}><Icon name="user" size={14} /> Individuels <span className="arch-count">{solo.length}</span></div>
                )}
                {solo.map(enrollRow)}
              </div>
            );
          })()}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title={`Formateurs (${(session.trainers || []).length})`}>
          {isAdmin ? (
            team.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Aucun membre d'équipe. Ajoutez des formateurs depuis Équipe & accès.</p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {team.map((t) => {
                  const on = (session.trainers || []).some((x) => x.id === t.id);
                  return (
                    <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, border: "1px solid var(--border-soft)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", background: on ? "var(--surface2)" : "transparent" }}>
                      <input type="checkbox" checked={on} onChange={() => toggleTrainer(t.id)} />
                      {t.first_name} {t.last_name}
                    </label>
                  );
                })}
              </div>
            )
          ) : (session.trainers || []).length === 0 ? (
            <p className="hint" style={{ margin: 0 }}>Aucun formateur affecté.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {session.trainers.map((t) => <Badge key={t.id} tone="b">{t.first_name} {t.last_name}</Badge>)}
            </div>
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <SessionRetraits startDate={session.start_date} endDate={session.end_date} />
        <SessionIntervenants sessionId={id} startDate={session.start_date} endDate={session.end_date} canEdit={isAdmin} />
      </div>

      <div style={{ marginTop: 16 }}>
        <Emargement sessionId={id} />
      </div>

      {notesFor && (
        <NotesModal enrollmentId={notesFor.id} name={notesFor.name} onClose={() => setNotesFor(null)} />
      )}
    </>
  );
}

export default SessionDetail;
