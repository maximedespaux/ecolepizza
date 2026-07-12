import { useContext, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getSession, getStagiaires, createEnrollment, deleteEnrollment, deleteSession, getAssignableTrainers, setSessionTrainers } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Emargement from "../components/Emargement.jsx";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import SessionIntervenants from "../components/SessionIntervenants.jsx";
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
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null);
  const [notesFor, setNotesFor] = useState(null);

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
  }, [id]);

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
    return (
      <>
        <PageHead eyebrow="Session" title="Session" />
        <StatusMessage status={status} />
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

      <div className="grid cols-2">
        <Card title="Inscrire un stagiaire">
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
        </Card>

        <Card title={`Stagiaires inscrits (${enrollments.length})`}>
          {enrollments.length === 0 ? (
            <EmptyState icon="users">Aucun stagiaire inscrit.</EmptyState>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {enrollments.map((e) => (
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
              ))}
            </div>
          )}
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
                    <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, border: "1px solid var(--border-soft)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", background: on ? "var(--surface-2,#fff)" : "transparent" }}>
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
