import { useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { useParams, useNavigate } from "react-router-dom";
import {
  getStagiaire, getLearnerDocuments, createDocument, sendDocument, deleteDocument, getTemplates, getEmargementTemplates, deleteStagiaire, sendQuizToEnrollment,
} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import EnrollmentParcours from "../components/EnrollmentParcours.jsx";
import EditStagiaireModal from "../components/EditStagiaireModal.jsx";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import { initials, euro } from "../lib/format.js";

const DOC_STATUS ={ A_FAIRE: ["Préparé", "n"], ENVOYE: ["Envoyé", "b"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé", "g"], GENERE: ["Généré", "b"], ARCHIVE: ["Archivé", "n"] };

function Row({ label, value }) {
  if (value === null || value === undefined || value === "" || value === "0.00") return null;
  return (
    <div style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <span style={{ flex: "0 0 220px", color: "var(--muted)", fontSize: 13 }}>{label}</span>
      <span style={{ flex: 1, fontWeight: 500 }}>{value}</span>
    </div>
  );
}

const d10 = (v) => (v ? String(v).slice(0, 10) : "");

// Titre de carte avec icône de tête.
const T = (icon, text) => (
  <span className="card-ttl"><Icon name={icon} size={16} /> {text}</span>
);

function StagiaireDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [l, setL] = useState(null);
  const [status, setStatus] = useState(null);
  const [docs, setDocs] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [prep, setPrep] = useState({ slug: "", title: "", enrollment_ids: [] });
  const [viewId, setViewId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [parcoursEnr, setParcoursEnr] = useState(null);
  const [parcoursRefresh, setParcoursRefresh] = useState(0); // force le rechargement du parcours après édition

  function loadLearner() {
    return getStagiaire(id).then((r) => setL(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }
  useEffect(() => {
    loadLearner();
    loadDocs();
  }, [id]);

  // Charge la liste des modèles de documents (+ feuilles d'émargement) sélectionnables.
  useEffect(() => {
    Promise.all([getTemplates().catch(() => ({ data: [] })), getEmargementTemplates().catch(() => ({ data: [] }))])
      .then(([tpl, emg]) => {
        const docs = (tpl.data || []).filter((t) => t.active);
        const emarg = (emg.data || []).filter((t) => t.active).map((t) => ({ slug: t.slug, label: `${t.name} (émargement)`, doc_type: "EMARGEMENT" }));
        const list = [...docs, ...emarg];
        setTemplates(list);
        setPrep((p) => (p.slug ? p : { ...p, slug: list[0]?.slug || "" }));
      })
      .catch(() => {});
  }, []);

  async function loadDocs() {
    try {
      const r = await getLearnerDocuments(id);
      setDocs(r.data.documents);
      setEnrollments(r.data.enrollments);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Rafraîchit documents + parcours automatiquement (signatures faites ailleurs, envois…).
  useAutoRefresh(() => { loadDocs(); setParcoursRefresh((n) => n + 1); }, { interval: 20000 });

  const toggleEnroll = (eid) => setPrep((p) => ({
    ...p,
    enrollment_ids: p.enrollment_ids.includes(eid)
      ? p.enrollment_ids.filter((x) => x !== eid)
      : [...p.enrollment_ids, eid],
  }));

  async function handlePrepare(e) {
    e.preventDefault();
    setStatus(null);
    const tpl = templates.find((t) => t.slug === prep.slug);
    if (!tpl) {
      setStatus({ type: "error", message: "Sélectionnez un modèle de document." });
      return;
    }
    if (prep.enrollment_ids.length === 0) {
      setStatus({ type: "error", message: "Sélectionnez au moins une formation." });
      return;
    }
    try {
      const type = tpl.doc_type || tpl.slug.toUpperCase().replace(/-/g, "_");
      await createDocument({ learner_id: id, type, template_slug: tpl.slug, title: prep.title, enrollment_ids: prep.enrollment_ids });
      setPrep({ slug: templates[0]?.slug || "", title: "", enrollment_ids: [] });
      setStatus({ type: "success", message: "Document généré. Vérifiez-le puis envoyez-le." });
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleSend(docId) {
    setStatus(null);
    try {
      await sendDocument(docId);
      setStatus({ type: "success", message: "Document envoyé au stagiaire." });
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleSendQuiz(quizId) {
    if (!curEnrId) { setStatus({ type: "error", message: "Sélectionnez d'abord une formation." }); return; }
    setStatus(null);
    try {
      await sendQuizToEnrollment(quizId, curEnrId);
      setStatus({ type: "success", message: "QCM envoyé au stagiaire." });
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleDelete(docId) {
    try {
      await deleteDocument(docId);
      loadDocs();
      setParcoursRefresh((n) => n + 1);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleDeleteLearner() {
    if (!window.confirm(`Supprimer définitivement le stagiaire ${l.first_name} ${l.last_name} ?\nSes dossiers et documents seront également supprimés. Cette action est irréversible.`)) return;
    try {
      await deleteStagiaire(id);
      navigate("/stagiaires");
    } catch (err) {
      setEditOpen(false);
      setStatus({ type: "error", message: err.message });
    }
  }

  if (!l) {
    return (
      <>
        <PageHead eyebrow="Stagiaire" title="Fiche stagiaire" />
        <StatusMessage status={status} />
      </>
    );
  }

  const projects = [
    l.project_creation && "Création",
    l.project_takeover && "Reprise",
    l.project_oven && "Four",
    l.project_truck && "Camion / Remorque",
    l.project_job && "Cherche poste pizzaïolo(la)",
  ].filter(Boolean).join(" · ");

  const c = l.company;

  // Verrouillage de la préparation selon l'avancement de la formation.
  const todayISO = new Date().toISOString().slice(0, 10);
  const END_TYPES = new Set(["CERTIFICAT_REALISATION", "DIPLOME", "ATTESTATION_ASSIDUITE", "EVALUATION_SATISFACTION", "ATTESTATION_HYGIENE"]);
  const DURING_TYPES = new Set(["EMARGEMENT"]);
  const selTpl = templates.find((t) => t.slug === prep.slug);
  const selEnr = enrollments.filter((e) => prep.enrollment_ids.includes(e.id));
  // Disponibilité : réglage du modèle (avail_phase) prioritaire ; sinon repli sur le
  // classement par type (rétro-compat pour les modèles non encore configurés).
  const phaseOf = (t) => t?.avail_phase || (END_TYPES.has(t?.doc_type) ? "end" : DURING_TYPES.has(t?.doc_type) ? "during" : "any");
  const phase = selTpl ? phaseOf(selTpl) : "any";
  const startedAll = selEnr.length > 0 && selEnr.every((e) => e.start_date && e.start_date <= todayISO);
  const finishedAll = selEnr.length > 0 && selEnr.every((e) => e.end_date && e.end_date <= todayISO);
  let gateReason = "";
  if (prep.enrollment_ids.length > 0) {
    if (phase === "during" && !startedAll) gateReason = "Disponible une fois la formation commencée.";
    else if (phase === "end" && !finishedAll) gateReason = "Disponible une fois la formation terminée.";
  }
  const canPrepare = enrollments.length > 0 && prep.enrollment_ids.length > 0 && !!selTpl && !gateReason;

  // Dossier dont on affiche le parcours (onglet sélectionné).
  const curEnrId = parcoursEnr || enrollments[0]?.id || null;
  // Depuis une étape du parcours : pré-remplit le modèle + le dossier courant,
  // puis descend au formulaire (le groupement de formations reste possible).
  function prepareStep(slug) {
    setPrep((p) => ({ ...p, slug, title: "", enrollment_ids: curEnrId ? [curEnrId] : p.enrollment_ids }));
    setTimeout(() => document.getElementById("sd-prepare")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  return (
    <>
      <PageHead
        eyebrow={<button className="card-more" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, WebkitTextFillColor: "var(--ember1)", display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => navigate(-1)}><Icon name="chevron-left" size={14} /> Retour</button>}
        title={`${l.civility ? l.civility + " " : ""}${l.last_name} ${l.first_name}`}
        lead={l.professional_status || ""}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn ghost" onClick={() => setEditOpen(true)}>Modifier la fiche</button>
            <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(l.first_name, l.last_name)}</span>
          </div>
        }
      />
      <StatusMessage status={status} />

      <div className="grid cols-2">
        <Card title={T("user", "Contact & identité")}>
          <Row label="Civilité" value={l.civility} />
          <Row label="Nom" value={l.last_name} />
          <Row label="Prénom" value={l.first_name} />
          <Row label="Date de naissance" value={d10(l.birthday)} />
          <Row label="Lieu de naissance" value={l.birth_place} />
          <Row label="Téléphone" value={l.phone} />
          <Row label="Email" value={l.email} />
          <Row label="Adresse" value={[l.address, l.zip_code, l.town].filter(Boolean).join(", ")} />
          <Row label="Contact le" value={d10(l.contacted_at)} />
          <Row label="Contacté par" value={l.contacted_by} />
        </Card>

        <Card title={T("graduation", "Parcours scolaire")}>
          {(l.diploma_level || l.diploma_name || l.diploma_year || l.last_experience || l.experience_value) ? (
            <>
              <Row label="Niveau du diplôme" value={l.diploma_level} />
              <Row label="Nom du diplôme" value={l.diploma_name} />
              <Row label="Année d'obtention" value={l.diploma_year} />
              <Row label="Dernière expérience" value={l.last_experience} />
              <Row label="Durée" value={[l.experience_value, l.experience_unit].filter(Boolean).join(" ")} />
            </>
          ) : (
            <p className="hint" style={{ margin: 0 }}>Aucun parcours scolaire renseigné.</p>
          )}
        </Card>

        <Card title={T("euro", "Statut & financement")}>
          <Row label="Statut" value={l.professional_status} />
          <Row label="Type de devis" value={l.financing === "PROFESSIONNEL" ? "Professionnel" : "Particulier"} />
          <Row label="OPCO / financeur" value={l.opco} />
          <Row label="Montant CPF" value={l.cpf_amount ? euro(l.cpf_amount) : null} />
          <Row label="Identifiant France Travail" value={l.france_travail_id} />
          <Row label="Contrat actuel" value={l.current_contract} />
          <Row label="N° de sécurité sociale" value={l.social_security} />
        </Card>

        <Card title={T("target", "Projet")}>
          {projects ? <p style={{ margin: 0 }}>{projects}</p> : <p className="hint" style={{ margin: 0 }}>Aucun projet renseigné.</p>}
        </Card>

        {c && (
          <Card title={T("building", "Entreprise")} className="cols-2" >
            <Row label="Nom" value={c.name} />
            <Row label="Statut juridique" value={c.legal_status} />
            <Row label="SIRET" value={c.siret} />
            <Row label="Code NAF/APE" value={c.naf_ape} />
            <Row label="Adresse" value={[c.address, c.zip_code, c.town].filter(Boolean).join(", ")} />
            <Row label="Téléphone" value={c.phone} />
            <Row label="Email" value={c.email} />
            <Row label="OPCO" value={c.opco} />
            <Row label="Représentant" value={[c.representative_civ, c.representative_name, c.representative_role && `(${c.representative_role})`].filter(Boolean).join(" ")} />
          </Card>
        )}
      </div>

      <Card title={T("file-text", "Parcours & documents")} className="fade">
        {enrollments.length > 0 && (
          <>
            {enrollments.length > 1 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                {enrollments.map((e) => {
                  const on = curEnrId === e.id;
                  return (
                    <button key={e.id} type="button" className={"btn sm " + (on ? "primary" : "ghost")} onClick={() => setParcoursEnr(e.id)}>
                      {e.program_code}{e.week ? ` · S${e.week}` : ""}
                    </button>
                  );
                })}
              </div>
            )}
            <EnrollmentParcours
              enrollmentId={curEnrId}
              refresh={parcoursRefresh}
              onOpenDoc={(docId) => setViewId(docId)}
              onPrepare={prepareStep}
              onSendQuiz={handleSendQuiz}
            />
            <div className="divider" style={{ margin: "18px 0" }} />
          </>
        )}

        <div id="sd-prepare" />
        <h3 style={{ fontSize: 15, margin: "0 0 10px" }}>Préparer un document</h3>
        <form onSubmit={handlePrepare} style={{ marginBottom: 16 }}>
          <div className="row2">
            <SelectField label="Modèle de document" value={prep.slug} onChange={(e) => setPrep((p) => ({ ...p, slug: e.target.value }))}>
              {templates.length === 0 && <option value="">— Aucun modèle disponible —</option>}
              {templates.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
            </SelectField>
            <Field label="Titre (facultatif)" value={prep.title} onChange={(e) => setPrep((p) => ({ ...p, title: e.target.value }))} placeholder="Laisser vide pour le titre par défaut" />
          </div>
          <div className="field">
            <label>Formations couvertes (regrouper plusieurs = un seul document)</label>
            {enrollments.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Ce stagiaire n'est inscrit à aucune formation. Inscrivez-le depuis une session.</p>
            ) : (
              <div className="tablewrap" style={{ border: "none" }}>
                <table className="enroll-table">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }}></th>
                      <th>Code</th>
                      <th>Formation</th>
                      <th>Semaine</th>
                      <th>Dates</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => {
                      const fr = (v) => (v ? new Date(v).toLocaleDateString("fr-FR") : "");
                      const checked = prep.enrollment_ids.includes(e.id);
                      return (
                        <tr key={e.id} className={checked ? "on" : ""} onClick={() => toggleEnroll(e.id)} style={{ cursor: "pointer" }}>
                          <td style={{ textAlign: "center" }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleEnroll(e.id)} onClick={(ev) => ev.stopPropagation()} />
                          </td>
                          <td><span className="mono" style={{ fontSize: 12 }}>{e.program_code}</span></td>
                          <td>{e.program_title}</td>
                          <td className="tnum">{e.week ? `S${e.week}${e.year ? ` · ${e.year}` : ""}` : "—"}</td>
                          <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{e.start_date ? `${fr(e.start_date)}${e.end_date ? ` → ${fr(e.end_date)}` : ""}` : "—"}</td>
                          <td style={{ fontSize: 12.5 }}>{e.financing === "PROFESSIONNEL" ? "Entreprise" : "Particulier"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button type="submit" className="btn primary" disabled={!canPrepare}>Générer le document</button>
            {gateReason && <span className="hint" style={{ color: "var(--amber, #b8860b)" }}>{gateReason}</span>}
            {!gateReason && prep.enrollment_ids.length === 0 && enrollments.length > 0 && <span className="hint">Sélectionnez au moins une formation.</span>}
          </div>
        </form>

        {docs.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>Aucun document préparé.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.map((d) => {
              const [label, tone] = DOC_STATUS[d.status] || [d.status, "n"];
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{d.title}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                      {d.formations || "—"}{d.sent_at ? ` · envoyé le ${d.sent_at}` : ""}{d.signed_at ? ` · signé le ${d.signed_at}` : ""}
                    </span>
                  </span>
                  <Badge tone={tone}>{label}</Badge>
                  <button className="iconbtn" title="Aperçu / vérifier" onClick={() => setViewId(d.id)}><Icon name="eye" size={16} /></button>
                  {d.status === "A_FAIRE" && <button className="iconbtn" title="Envoyer au stagiaire" onClick={() => handleSend(d.id)}><Icon name="send" size={16} /></button>}
                  <button className="iconbtn del" title="Supprimer" onClick={() => handleDelete(d.id)}><Icon name="trash" size={15} /></button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {viewId && (
        <DocumentViewModal id={viewId} onClose={() => setViewId(null)} onChanged={() => { loadDocs(); setParcoursRefresh((n) => n + 1); }} />
      )}

      {editOpen && (
        <EditStagiaireModal
          id={l.id}
          onClose={() => setEditOpen(false)}
          onSaved={(msg) => { setEditOpen(false); setStatus({ type: "success", message: msg || "Fiche mise à jour." }); loadLearner(); loadDocs(); setParcoursRefresh((n) => n + 1); }}
          onError={(m) => setStatus({ type: "error", message: m })}
          onDelete={handleDeleteLearner}
        />
      )}
    </>
  );
}

export default StagiaireDetail;
