import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStagiaires, getStagiaire, createStagiaire, updateStagiaire, resetStagiairePassword } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { initials } from "../lib/format.js";
import { LEVELS, LEVEL_LABEL, colorForLevel } from "../lib/levels.js";

// --- Options (reprises de la fiche d'expression du stagiaire) ---
const CIVILITES = ["M.", "Mme"];
const STATUTS = ["En activité", "Demandeur d'emploi", "Sans activité", "Étudiant", "Retraité", "Autre"];
const UNITES = ["mois", "année(s)"];
const CONTRATS = ["CDI", "CDD", "Intérim", "Saisonnier", "Apprentissage", "Indépendant / Gérant", "Fonctionnaire", "Autre"];
const STATUTS_ENTREPRISE = ["SARL", "SAS", "SASU", "EURL", "EI", "Auto-entrepreneur", "EIRL", "SA", "Autre"];

const EMPTY = {
  contacted_at: "", contacted_by: "", civility: "", first_name: "", last_name: "",
  email: "", phone: "", birthday: "", birth_place: "", address: "", zip_code: "", town: "",
  diploma_level: "", diploma_name: "", diploma_year: "", last_experience: "",
  experience_value: "", experience_unit: "", professional_status: "", cpf_amount: "",
  france_travail_id: "", current_contract: "", social_security: "",
  financing: "PARTICULIER", levels: "",
  project_creation: false, project_takeover: false, project_oven: false, project_truck: false, project_job: false,
  company: {
    name: "", legal_status: "", siret: "", naf_ape: "", address: "", zip_code: "", town: "",
    email: "", phone: "", opco: "", representative_civ: "", representative_name: "", representative_role: "",
  },
};

const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");
const BOOL_FIELDS = ["project_creation", "project_takeover", "project_oven", "project_truck", "project_job"];

// Transforme le dossier renvoyé par l'API en état de formulaire.
function toForm(d) {
  const form = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) {
    if (k === "company") continue;
    form[k] = d[k] ?? "";
  }
  for (const b of BOOL_FIELDS) form[b] = !!d[b];
  form.contacted_at = dateOnly(d.contacted_at);
  form.birthday = dateOnly(d.birthday);
  form.financing = d.financing || "PARTICULIER";
  if (d.company) {
    for (const k of Object.keys(EMPTY.company)) form.company[k] = d.company[k] ?? "";
  }
  return form;
}

function Stagiaires() {
  const [learners, setLearners] = useState([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [revealed, setRevealed] = useState({}); // DEV : ids dont le mot de passe est affiché

  const toggleReveal = (id) => setRevealed((r) => ({ ...r, [id]: !r[id] }));

  async function resetPassword(id) {
    setStatus(null);
    try {
      const r = await resetStagiairePassword(id);
      setRevealed((prev) => ({ ...prev, [id]: true }));
      setStatus({ type: "success", message: `Nouveau mot de passe : ${r.password}` });
      load(query);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function load(q = "") {
    try {
      const response = await getStagiaires(q);
      setLearners(response.data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Recherche en direct (debounce) — relance à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  function openNew() {
    setEditingId(null);
    setForm(EMPTY);
    setStatus(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY);
  }

  async function openEdit(id) {
    setStatus(null);
    try {
      const { data } = await getStagiaire(id);
      setForm(toForm(data));
      setEditingId(id);
      setShowForm(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));
  const toggle = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.checked }));
  // Ajoute/retire un code niveau dans la liste CSV form.levels.
  const toggleLevel = (code) => setForm((p) => {
    const set = new Set((p.levels || "").split(",").map((s) => s.trim()).filter(Boolean));
    set.has(code) ? set.delete(code) : set.add(code);
    return { ...p, levels: [...set].join(",") };
  });
  const setCompany = (field) => (e) =>
    setForm((p) => ({ ...p, company: { ...p.company, [field]: e.target.value } }));

  const isPro = form.financing === "PROFESSIONNEL";
  const isJobSeeker = form.professional_status === "Demandeur d'emploi";
  const isEmployed = form.professional_status === "En activité";

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      const { company, ...learner } = form;
      const payload = { ...learner };
      if (isPro && company.name) payload.company = company;
      if (editingId) {
        await updateStagiaire(editingId, payload);
        setStatus({ type: "success", message: "Stagiaire mis à jour." });
      } else {
        await createStagiaire(payload);
        setStatus({ type: "success", message: "Stagiaire ajouté." });
      }
      closeForm();
      load(query);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="CRM"
        title="Stagiaires"
        lead="Fiche d'expression du stagiaire : contact, parcours, statut, projet."
        actions={
          <button className="btn primary" onClick={() => (showForm ? closeForm() : openNew())}>
            {showForm ? "✕ Fermer" : "＋ Nouveau stagiaire"}
          </button>
        }
      />
      <StatusMessage status={status} />

      <div className="searchbar">
        <input
          className="inp"
          placeholder="Rechercher un stagiaire (nom, prénom ou email)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {showForm && (
      <Card
        title={editingId ? "Modifier le stagiaire" : "Nouveau stagiaire"}
        className="fade"
        more={<button type="button" className="btn sm ghost" onClick={closeForm}>✕ Fermer</button>}
      >
        <form onSubmit={handleSubmit}>
          {/* Prise de contact & identité */}
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Prise de contact & identité</h3>
          <div className="row2">
            <Field label="Contact le" type="date" value={form.contacted_at} onChange={set("contacted_at")} />
            <Field label="Contacté par" value={form.contacted_by} onChange={set("contacted_by")} />
          </div>
          <div className="row3">
            <SelectField label="Civilité" value={form.civility} onChange={set("civility")}>
              <option value="">—</option>
              {CIVILITES.map((c) => <option key={c} value={c}>{c}</option>)}
            </SelectField>
            <Field label="Prénom" value={form.first_name} onChange={set("first_name")} required />
            <Field label="Nom" value={form.last_name} onChange={set("last_name")} required />
          </div>
          <div className="row2">
            <Field label="Date de naissance" type="date" value={form.birthday} onChange={set("birthday")} />
            <Field label="Lieu de naissance" value={form.birth_place} onChange={set("birth_place")} />
          </div>
          <div className="row2">
            <Field label="Téléphone" value={form.phone} onChange={set("phone")} />
            <Field label="Adresse email" type="email" value={form.email} onChange={set("email")} />
          </div>
          <div className="row3">
            <Field label="Adresse" value={form.address} onChange={set("address")} />
            <Field label="Code postal" value={form.zip_code} onChange={set("zip_code")} />
            <Field label="Ville" value={form.town} onChange={set("town")} />
          </div>

          <div className="divider" />

          {/* Parcours scolaire */}
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Parcours scolaire</h3>
          <div className="row3">
            <Field label="Niveau du diplôme le plus élevé" value={form.diploma_level} onChange={set("diploma_level")} />
            <Field label="Nom du diplôme" value={form.diploma_name} onChange={set("diploma_name")} />
            <Field label="Année d'obtention" value={form.diploma_year} onChange={set("diploma_year")} />
          </div>
          <div className="row3">
            <Field label="Dernière expérience professionnelle" value={form.last_experience} onChange={set("last_experience")} />
            <Field label="Durée (nombre)" value={form.experience_value} onChange={set("experience_value")} />
            <SelectField label="Durée (unité)" value={form.experience_unit} onChange={set("experience_unit")}>
              <option value="">—</option>
              {UNITES.map((u) => <option key={u} value={u}>{u}</option>)}
            </SelectField>
          </div>

          <div className="divider" />

          {/* Statut actuel & financement */}
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Statut actuel & financement</h3>
          <div className="row3">
            <SelectField label="Êtes-vous ?" value={form.professional_status} onChange={set("professional_status")}>
              <option value="">—</option>
              {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </SelectField>
            <Field label="Montant CPF (€)" type="number" step="0.01" value={form.cpf_amount} onChange={set("cpf_amount")} />
            <Field label="N° de sécurité sociale" value={form.social_security} onChange={set("social_security")} />
          </div>
          {isJobSeeker && (
            <div className="row2">
              <Field label="Identifiant France Travail (Pôle emploi)" value={form.france_travail_id} onChange={set("france_travail_id")} />
            </div>
          )}
          {isEmployed && (
            <div className="row2">
              <SelectField label="Votre contrat actuel" value={form.current_contract} onChange={set("current_contract")}>
                <option value="">—</option>
                {CONTRATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectField>
            </div>
          )}
          <div className="row2">
            <SelectField label="Type de devis" value={form.financing} onChange={set("financing")}>
              <option value="PARTICULIER">Personnel (particulier)</option>
              <option value="PROFESSIONNEL">Professionnel (entreprise)</option>
            </SelectField>
          </div>

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "10px 0 6px" }}>Niveaux / accès (plusieurs possibles)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {LEVELS.map((l) => {
              const on = (form.levels || "").split(",").map((s) => s.trim()).includes(l.v);
              return (
                <label key={l.v} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                  <input type="checkbox" checked={on} onChange={() => toggleLevel(l.v)} />
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <i style={{ width: 11, height: 11, borderRadius: "50%", background: l.color, display: "inline-block" }} /> {l.label}
                  </span>
                </label>
              );
            })}
          </div>

          <div className="divider" />

          {/* Projet */}
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Votre projet</h3>
          <div className="row3">
            <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={form.project_creation} onChange={toggle("project_creation")} /> Création
            </label>
            <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={form.project_takeover} onChange={toggle("project_takeover")} /> Reprise
            </label>
            <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={form.project_oven} onChange={toggle("project_oven")} /> Four
            </label>
            <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={form.project_truck} onChange={toggle("project_truck")} /> Camion / Remorque
            </label>
            <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={form.project_job} onChange={toggle("project_job")} /> Cherche poste pizzaïolo(la)
            </label>
          </div>

          {/* Entreprise (si devis professionnel) */}
          {isPro && (
            <>
              <div className="divider" />
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Informations entreprise</h3>
              <div className="row3">
                <Field label="Nom de l'entreprise" value={form.company.name} onChange={setCompany("name")} />
                <SelectField label="Statut d'entreprise" value={form.company.legal_status} onChange={setCompany("legal_status")}>
                  <option value="">—</option>
                  {STATUTS_ENTREPRISE.map((s) => <option key={s} value={s}>{s}</option>)}
                </SelectField>
                <Field label="SIRET" value={form.company.siret} onChange={setCompany("siret")} />
              </div>
              <div className="row3">
                <Field label="Adresse" value={form.company.address} onChange={setCompany("address")} />
                <Field label="Code postal" value={form.company.zip_code} onChange={setCompany("zip_code")} />
                <Field label="Ville" value={form.company.town} onChange={setCompany("town")} />
              </div>
              <div className="row3">
                <Field label="Téléphone" value={form.company.phone} onChange={setCompany("phone")} />
                <Field label="Email" type="email" value={form.company.email} onChange={setCompany("email")} />
                <Field label="Code NAF/APE" value={form.company.naf_ape} onChange={setCompany("naf_ape")} />
              </div>
              <div className="row3">
                <SelectField label="Représentant (civilité)" value={form.company.representative_civ} onChange={setCompany("representative_civ")}>
                  <option value="">—</option>
                  {CIVILITES.map((c) => <option key={c} value={c}>{c}</option>)}
                </SelectField>
                <Field label="Représentant (nom & prénom)" value={form.company.representative_name} onChange={setCompany("representative_name")} />
                <Field label="Fonction" value={form.company.representative_role} onChange={setCompany("representative_role")} />
              </div>
              <div className="row2">
                <Field label="OPCO" value={form.company.opco} onChange={setCompany("opco")} />
              </div>
            </>
          )}

          <div style={{ marginTop: 14 }}>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Enregistrement…" : editingId ? "Enregistrer les modifications" : "Ajouter le stagiaire"}
            </button>
          </div>
        </form>
      </Card>
      )}

      <Card title={`Liste (${learners.length})`}>
        {learners.length === 0 ? (
          <EmptyState>Aucun stagiaire pour le moment.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {learners.map((l) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <Link to={`/stagiaires/${l.id}`} className="rowlink" title="Ouvrir le dossier (workflow documents)"
                  style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, color: "inherit" }}>
                  <span className="avatar">{initials(l.first_name, l.last_name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.last_name} {l.first_name}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email || "—"} · {l.phone || "—"}</span>
                  </span>
                </Link>
                {l.has_account && (
                  <span className="pwcell" title={revealed[l.id] ? "Cliquez pour sélectionner, puis copiez" : "Cliquez sur 👁 pour afficher"}>
                    <span className="mono pw" onClick={(e) => { if (revealed[l.id]) { const r = document.createRange(); r.selectNodeContents(e.currentTarget); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } }}>
                      {revealed[l.id] ? (l.account_password || "—") : "••••••••"}
                    </span>
                  </span>
                )}
                {(l.levels || "").split(",").map((s) => s.trim()).filter(Boolean).map((lv) => (
                  <span key={lv} className="lvl-chip" title={LEVEL_LABEL[lv] || lv} style={{ background: colorForLevel(lv) }}>
                    {(LEVEL_LABEL[lv] || lv).replace("Certifiante (RS)", "RS")}
                  </span>
                ))}
                {l.professional_status && <Badge tone="n">{l.professional_status}</Badge>}
                {l.has_account && (
                  <button
                    type="button"
                    className="iconbtn"
                    title={revealed[l.id] ? "Masquer le mot de passe" : "Afficher le mot de passe (dev)"}
                    onClick={() => toggleReveal(l.id)}
                  >
                    {revealed[l.id] ? "🙈" : "👁"}
                  </button>
                )}
                <button
                  type="button"
                  className="iconbtn"
                  title="Réinitialiser le mot de passe"
                  onClick={() => resetPassword(l.id)}
                >
                  🔑
                </button>
                <button
                  type="button"
                  className="iconbtn"
                  title="Modifier le stagiaire"
                  aria-label={`Modifier ${l.first_name} ${l.last_name}`}
                  onClick={() => openEdit(l.id)}
                >
                  ✎
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export default Stagiaires;
