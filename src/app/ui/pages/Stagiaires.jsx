import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStagiaires, getStagiaire, createStagiaire, updateStagiaire, resetStagiairePassword, deleteStagiaire, getOpcos, getFormations } from "../api/apiClient.js";
import { OPCOS } from "../lib/opco.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { initials } from "../lib/format.js";
import { LEVEL_LABEL, colorForLevel, setBadgeColors } from "../lib/levels.js";

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
  const [opcos, setOpcos] = useState([]);
  const [formations, setFormations] = useState([]);
  const [filters, setFilters] = useState({ level: "", financing: "", status: "", opco: "" });

  // Codes de formation (badges attribuables) + couleur associée.
  useEffect(() => {
    getFormations().then((r) => {
      const list = r.data || [];
      setFormations(list);
      const map = {};
      for (const f of list) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
      setBadgeColors(map);
    }).catch(() => {});
  }, []);
  const codeColor = (code) => {
    const f = formations.find((x) => x.code === code);
    return (f && f.color) || colorForLevel(code);
  };

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const clearFilters = () => setFilters({ level: "", financing: "", status: "", opco: "" });
  const activeFilters = Object.values(filters).filter(Boolean).length;

  // Filtrage local (en plus de la recherche texte serveur) sur les infos du stagiaire.
  const filtered = learners.filter((l) => {
    if (filters.level && !(l.levels || "").split(",").map((s) => s.trim()).includes(filters.level)) return false;
    if (filters.financing && (l.financing || "PARTICULIER") !== filters.financing) return false;
    if (filters.status && l.professional_status !== filters.status) return false;
    if (filters.opco && l.opco !== filters.opco) return false;
    return true;
  });

  useEffect(() => { getOpcos().then((r) => setOpcos(r.data || [])).catch(() => {}); }, []);
  const opcoNames = opcos.length ? opcos.filter((o) => o.active).map((o) => o.name) : OPCOS;


  async function removeLearner(l) {
    if (!window.confirm(`Supprimer définitivement le stagiaire ${l.first_name} ${l.last_name} ?\nSes dossiers et documents seront également supprimés. Cette action est irréversible.`)) return;
    setStatus(null);
    try {
      await deleteStagiaire(l.id);
      setStatus({ type: "success", message: "Stagiaire supprimé." });
      load(query);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function resetPassword(id) {
    setStatus(null);
    try {
      const r = await resetStagiairePassword(id);
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
        const res = await createStagiaire(payload);
        setStatus({
          type: "success",
          message: res && res.password
            ? `Stagiaire ajouté. Compte créé — mot de passe : ${res.password} (notez-le, il ne sera plus affiché).`
            : "Stagiaire ajouté.",
        });
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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "10px 0 4px" }}>
        <select className="inp" style={{ maxWidth: 190 }} value={filters.level} onChange={setFilter("level")}>
          <option value="">Tous les badges</option>
          {[...new Set([...formations.map((f) => f.code).filter(Boolean), ...learners.flatMap((l) => (l.levels || "").split(",").map((s) => s.trim()).filter(Boolean))])]
            .map((v) => <option key={v} value={v}>{LEVEL_LABEL[v] || v}</option>)}
        </select>
        <select className="inp" style={{ maxWidth: 190 }} value={filters.financing} onChange={setFilter("financing")}>
          <option value="">Tout financement</option>
          <option value="PARTICULIER">Particulier</option>
          <option value="PROFESSIONNEL">Professionnel</option>
        </select>
        <select className="inp" style={{ maxWidth: 190 }} value={filters.status} onChange={setFilter("status")}>
          <option value="">Tout statut</option>
          {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="inp" style={{ maxWidth: 190 }} value={filters.opco} onChange={setFilter("opco")}>
          <option value="">Tout OPCO</option>
          {opcoNames.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        {activeFilters > 0 && (
          <button type="button" className="btn sm ghost" onClick={clearFilters}>✕ Effacer les filtres ({activeFilters})</button>
        )}
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

          <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "10px 0 6px" }}>Niveaux / accès — codes formation (plusieurs possibles)</label>
          {(() => {
            const current = (form.levels || "").split(",").map((s) => s.trim()).filter(Boolean);
            // Codes de formation disponibles + éventuels codes déjà attribués au stagiaire.
            const codes = [...new Set([...formations.map((f) => f.code).filter(Boolean), ...current])];
            if (codes.length === 0) return <p className="hint">Aucune formation. Créez-en dans « Formations ».</p>;
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                {codes.map((code) => {
                  const on = current.includes(code);
                  return (
                    <label key={code} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 14 }}>
                      <input type="checkbox" checked={on} onChange={() => toggleLevel(code)} />
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <i style={{ width: 11, height: 11, borderRadius: "50%", background: codeColor(code), display: "inline-block" }} /> {code}
                      </span>
                    </label>
                  );
                })}
              </div>
            );
          })()}

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
                <SelectField label="OPCO / financeur" value={form.company.opco} onChange={setCompany("opco")}>
                  <option value="">— Sélectionner —</option>
                  {[...new Set([...(form.company.opco ? [form.company.opco] : []), ...opcoNames])].map((o) => <option key={o} value={o}>{o}</option>)}
                </SelectField>
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

      <Card title={`Liste (${filtered.length}${activeFilters ? ` / ${learners.length}` : ""})`}>
        {filtered.length === 0 ? (
          <EmptyState>{learners.length === 0 ? "Aucun stagiaire pour le moment." : "Aucun stagiaire ne correspond aux filtres."}</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((l) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <Link to={`/stagiaires/${l.id}`} className="rowlink" title="Ouvrir le dossier (workflow documents)"
                  style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, color: "inherit" }}>
                  <span className="avatar">{initials(l.first_name, l.last_name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.last_name} {l.first_name}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email || "—"} · {l.phone || "—"}</span>
                  </span>
                </Link>
                {(l.levels || "").split(",").map((s) => s.trim()).filter(Boolean).map((lv) => (
                  <span key={lv} className="lvl-chip" title={LEVEL_LABEL[lv] || lv} style={{ background: colorForLevel(lv) }}>
                    {(LEVEL_LABEL[lv] || lv).replace("Certifiante (RS)", "RS")}
                  </span>
                ))}
                {l.professional_status && <Badge tone="n">{l.professional_status}</Badge>}
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
                <button
                  type="button"
                  className="iconbtn del"
                  title="Supprimer le stagiaire"
                  aria-label={`Supprimer ${l.first_name} ${l.last_name}`}
                  onClick={() => removeLearner(l)}
                >
                  🗑
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
