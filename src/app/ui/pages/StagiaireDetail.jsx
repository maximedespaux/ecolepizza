import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getStagiaire, getLearnerDocuments, createDocument, sendDocument, deleteDocument, getTemplates, updateStagiaire,
} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import EnrollmentParcours from "../components/EnrollmentParcours.jsx";
import { initials, euro } from "../lib/format.js";
import { OPCOS } from "../lib/opco.js";

const CIVILITES = ["M.", "Mme"];
const STATUTS = ["En activité", "Demandeur d'emploi", "Sans activité", "Étudiant", "Retraité", "Autre"];
const UNITES = ["mois", "année(s)"];
const CONTRATS = ["CDI", "CDD", "Intérim", "Saisonnier", "Apprentissage", "Indépendant / Gérant", "Fonctionnaire", "Autre"];
const DOC_STATUS ={ A_FAIRE: ["Préparé", "n"], ENVOYE: ["Envoyé", "b"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé ✓", "g"], GENERE: ["Généré", "b"], ARCHIVE: ["Archivé", "n"] };

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

  function loadLearner() {
    return getStagiaire(id).then((r) => setL(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }
  useEffect(() => {
    loadLearner();
    loadDocs();
  }, [id]);

  // Charge la liste des modèles de documents (choix par nom du document).
  useEffect(() => {
    getTemplates()
      .then((r) => {
        const list = (r.data || []).filter((t) => t.active);
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
      setStatus({ type: "success", message: "Document préparé. Vérifiez-le puis envoyez-le." });
      loadDocs();
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
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function handleDelete(docId) {
    try {
      await deleteDocument(docId);
      loadDocs();
    } catch (err) {
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
  const phase = selTpl ? (END_TYPES.has(selTpl.doc_type) ? "end" : DURING_TYPES.has(selTpl.doc_type) ? "during" : "any") : "any";
  const startedAll = selEnr.length > 0 && selEnr.every((e) => e.start_date && e.start_date <= todayISO);
  const finishedAll = selEnr.length > 0 && selEnr.every((e) => e.end_date && e.end_date <= todayISO);
  let gateReason = "";
  if (prep.enrollment_ids.length > 0) {
    if (phase === "during" && !startedAll) gateReason = "Disponible une fois la formation commencée.";
    else if (phase === "end" && !finishedAll) gateReason = "Disponible une fois la formation terminée.";
  }
  const canPrepare = enrollments.length > 0 && prep.enrollment_ids.length > 0 && !!selTpl && !gateReason;

  return (
    <>
      <PageHead
        eyebrow={<button className="card-more" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, WebkitTextFillColor: "var(--ember1)" }} onClick={() => navigate(-1)}>← Retour</button>}
        title={`${l.civility ? l.civility + " " : ""}${l.last_name} ${l.first_name}`}
        lead={l.professional_status || ""}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="btn ghost" onClick={() => setEditOpen(true)}>✎ Modifier la fiche</button>
            <span className="avatar" style={{ width: 44, height: 44, fontSize: 15 }}>{initials(l.first_name, l.last_name)}</span>
          </div>
        }
      />
      <StatusMessage status={status} />

      <div className="grid cols-2">
        <Card title="Contact & identité">
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

        <Card title="Parcours scolaire">
          <Row label="Niveau du diplôme" value={l.diploma_level} />
          <Row label="Nom du diplôme" value={l.diploma_name} />
          <Row label="Année d'obtention" value={l.diploma_year} />
          <Row label="Dernière expérience" value={l.last_experience} />
          <Row label="Durée" value={[l.experience_value, l.experience_unit].filter(Boolean).join(" ")} />
        </Card>

        <Card title="Statut & financement">
          <Row label="Statut" value={l.professional_status} />
          <Row label="Type de devis" value={l.financing === "PROFESSIONNEL" ? "Professionnel" : "Particulier"} />
          <Row label="OPCO / financeur" value={l.opco} />
          <Row label="Montant CPF" value={l.cpf_amount ? euro(l.cpf_amount) : null} />
          <Row label="Identifiant France Travail" value={l.france_travail_id} />
          <Row label="Contrat actuel" value={l.current_contract} />
          <Row label="N° de sécurité sociale" value={l.social_security} />
        </Card>

        <Card title="Projet">
          {projects ? <p style={{ margin: 0 }}>{projects}</p> : <p className="hint" style={{ margin: 0 }}>Aucun projet renseigné.</p>}
        </Card>

        {c && (
          <Card title="Entreprise" className="cols-2" >
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

      {enrollments.length > 0 && (
        <Card title="Parcours d'inscription" className="fade">
          {enrollments.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {enrollments.map((e) => {
                const on = (parcoursEnr || enrollments[0].id) === e.id;
                return (
                  <button key={e.id} type="button" className={"btn sm " + (on ? "primary" : "ghost")} onClick={() => setParcoursEnr(e.id)}>
                    {e.program_code}{e.week ? ` · S${e.week}` : ""}
                  </button>
                );
              })}
            </div>
          )}
          <EnrollmentParcours
            enrollmentId={parcoursEnr || enrollments[0].id}
            onOpenDoc={(docId) => setViewId(docId)}
            onGoto={() => document.getElementById("sd-documents")?.scrollIntoView({ behavior: "smooth" })}
          />
        </Card>
      )}

      <div id="sd-documents" />
      <Card title="Documents" className="fade">
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
            <button type="submit" className="btn primary" disabled={!canPrepare}>Préparer le document</button>
            {gateReason && <span className="hint" style={{ color: "var(--amber, #b8860b)" }}>🔒 {gateReason}</span>}
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
                  <button className="iconbtn" title="Aperçu / vérifier" onClick={() => setViewId(d.id)}>👁</button>
                  {d.status === "A_FAIRE" && <button className="iconbtn" title="Envoyer au stagiaire" onClick={() => handleSend(d.id)}>📤</button>}
                  <button className="iconbtn del" title="Supprimer" onClick={() => handleDelete(d.id)}>🗑</button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {viewId && (
        <DocumentViewModal id={viewId} onClose={() => setViewId(null)} onChanged={loadDocs} />
      )}

      {editOpen && (
        <EditLearnerModal
          learner={l}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); setStatus({ type: "success", message: "Fiche mise à jour." }); loadLearner(); }}
          onError={(m) => setStatus({ type: "error", message: m })}
        />
      )}
    </>
  );
}

const EDIT_FIELDS = [
  "civility", "first_name", "last_name", "birthday", "birth_place", "phone", "email",
  "address", "zip_code", "town", "contacted_at", "contacted_by",
  "diploma_level", "diploma_name", "diploma_year", "last_experience", "experience_value", "experience_unit",
  "professional_status", "financing", "opco", "cpf_amount", "france_travail_id", "current_contract", "social_security",
];
const BOOLS = ["project_creation", "project_takeover", "project_oven", "project_truck", "project_job"];

function EditLearnerModal({ learner, onClose, onSaved, onError }) {
  const [form, setForm] = useState(() => {
    const f = {};
    for (const k of EDIT_FIELDS) f[k] = learner[k] ?? "";
    f.birthday = f.birthday ? String(f.birthday).slice(0, 10) : "";
    f.contacted_at = f.contacted_at ? String(f.contacted_at).slice(0, 10) : "";
    f.financing = learner.financing || "PARTICULIER";
    for (const b of BOOLS) f[b] = !!learner[b];
    return f;
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const chk = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked }));

  async function save() {
    if (!String(form.first_name).trim() || !String(form.last_name).trim()) { onError("Prénom et nom requis."); return; }
    setSaving(true);
    try { await updateStagiaire(learner.id, form); onSaved(); }
    catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h3>Modifier la fiche stagiaire</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button></div>
        <div className="mbody">
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Identité & contact</h3>
          <div className="row3">
            <SelectField label="Civilité" value={form.civility} onChange={set("civility")}>
              <option value="">—</option>{CIVILITES.map((c) => <option key={c} value={c}>{c}</option>)}
            </SelectField>
            <Field label="Prénom" value={form.first_name} onChange={set("first_name")} />
            <Field label="Nom" value={form.last_name} onChange={set("last_name")} />
          </div>
          <div className="row2">
            <Field label="Date de naissance" type="date" value={form.birthday} onChange={set("birthday")} />
            <Field label="Lieu de naissance" value={form.birth_place} onChange={set("birth_place")} />
          </div>
          <div className="row2">
            <Field label="Téléphone" value={form.phone} onChange={set("phone")} />
            <Field label="Email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div className="row3">
            <Field label="Adresse" value={form.address} onChange={set("address")} />
            <Field label="Code postal" value={form.zip_code} onChange={set("zip_code")} />
            <Field label="Ville" value={form.town} onChange={set("town")} />
          </div>
          <div className="row2">
            <Field label="Contact le" type="date" value={form.contacted_at} onChange={set("contacted_at")} />
            <Field label="Contacté par" value={form.contacted_by} onChange={set("contacted_by")} />
          </div>

          <div className="divider" />
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Parcours scolaire</h3>
          <div className="row3">
            <Field label="Niveau du diplôme" value={form.diploma_level} onChange={set("diploma_level")} />
            <Field label="Nom du diplôme" value={form.diploma_name} onChange={set("diploma_name")} />
            <Field label="Année d'obtention" value={form.diploma_year} onChange={set("diploma_year")} />
          </div>
          <div className="row3">
            <Field label="Dernière expérience" value={form.last_experience} onChange={set("last_experience")} />
            <Field label="Durée (nombre)" value={form.experience_value} onChange={set("experience_value")} />
            <SelectField label="Durée (unité)" value={form.experience_unit} onChange={set("experience_unit")}>
              <option value="">—</option>{UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
            </SelectField>
          </div>

          <div className="divider" />
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Statut & financement</h3>
          <div className="row3">
            <SelectField label="Statut" value={form.professional_status} onChange={set("professional_status")}>
              <option value="">—</option>{STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </SelectField>
            <SelectField label="Type de devis" value={form.financing} onChange={set("financing")}>
              <option value="PARTICULIER">Particulier</option>
              <option value="PROFESSIONNEL">Professionnel</option>
            </SelectField>
            <SelectField label="OPCO / financeur" value={form.opco} onChange={set("opco")}>
              <option value="">—</option>
              {OPCOS.map((o) => <option key={o} value={o}>{o}</option>)}
            </SelectField>
          </div>
          <div className="row2">
            <Field label="Montant CPF (€)" type="number" step="0.01" value={form.cpf_amount} onChange={set("cpf_amount")} />
          </div>
          <div className="row3">
            <Field label="Identifiant France Travail" value={form.france_travail_id} onChange={set("france_travail_id")} />
            <SelectField label="Contrat actuel" value={form.current_contract} onChange={set("current_contract")}>
              <option value="">—</option>{CONTRATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </SelectField>
            <Field label="N° de sécurité sociale" value={form.social_security} onChange={set("social_security")} />
          </div>

          <div className="divider" />
          <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Projet</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
            {[["project_creation", "Création"], ["project_takeover", "Reprise"], ["project_oven", "Four"], ["project_truck", "Camion / Remorque"], ["project_job", "Cherche poste"]].map(([k, lab]) => (
              <label key={k} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                <input type="checkbox" checked={!!form[k]} onChange={chk(k)} /> {lab}
              </label>
            ))}
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

export default StagiaireDetail;
