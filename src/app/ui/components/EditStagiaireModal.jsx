import { useEffect, useState } from "react";
import { getStagiaire, createStagiaire, updateStagiaire, getOpcos, getFormations, getCompanies, createCompany } from "../api/apiClient.js";
import { Field, SelectField } from "./Field.jsx";
import { OPCOS } from "../lib/opco.js";
import { colorForLevel, setBadgeColors } from "../lib/levels.js";

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
  financing: "PARTICULIER", opco: "", levels: "", completed_levels: "", company_id: "",
  project_creation: false, project_takeover: false, project_oven: false, project_truck: false, project_job: false,
};

const BOOL_FIELDS = ["project_creation", "project_takeover", "project_oven", "project_truck", "project_job"];
const dateOnly = (v) => (v ? String(v).slice(0, 10) : "");

function toForm(d) {
  const form = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) form[k] = d[k] ?? "";
  for (const b of BOOL_FIELDS) form[b] = !!d[b];
  form.contacted_at = dateOnly(d.contacted_at);
  form.birthday = dateOnly(d.birthday);
  form.financing = d.financing || "PARTICULIER";
  form.company_id = d.company_id || (d.company && d.company.id) || "";
  return form;
}

/**
 * Modale complète d'édition/création d'un stagiaire (fiche d'expression).
 * `id` : identifiant du stagiaire à modifier, ou null/undefined pour une création.
 * Utilisée aussi bien depuis la liste des stagiaires que depuis la fiche détaillée.
 */
function EditStagiaireModal({ id, onClose, onSaved, onError, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [opcos, setOpcos] = useState([]);
  const [formations, setFormations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [newCo, setNewCo] = useState(null); // formulaire compact « nouvelle entreprise » (ou null)

  useEffect(() => { getOpcos().then((r) => setOpcos(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { getCompanies().then((r) => setCompanies(r.data || [])).catch(() => {}); }, []);
  useEffect(() => {
    getFormations().then((r) => {
      const list = r.data || [];
      setFormations(list);
      const map = {};
      for (const f of list) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
      setBadgeColors(map);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!id) { setForm(EMPTY); setLoading(false); return; }
    setLoading(true);
    getStagiaire(id).then(({ data }) => setForm(toForm(data)))
      .catch((e) => onError?.(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const opcoNames = opcos.length ? opcos.filter((o) => o.active).map((o) => o.name) : OPCOS;
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.checked }));
  const toggleLevel = (code) => setForm((p) => {
    const s = new Set((p.levels || "").split(",").map((x) => x.trim()).filter(Boolean));
    const cs = new Set((p.completed_levels || "").split(",").map((x) => x.trim()).filter(Boolean));
    if (s.has(code)) { s.delete(code); cs.delete(code); } else s.add(code); // retirer un niveau retire aussi « terminé »
    return { ...p, levels: [...s].join(","), completed_levels: [...cs].join(",") };
  });
  // Marque / démarque une formation comme TERMINÉE (indépendant de la complétion auto des docs).
  const toggleFinished = (code) => setForm((p) => {
    const cs = new Set((p.completed_levels || "").split(",").map((x) => x.trim()).filter(Boolean));
    cs.has(code) ? cs.delete(code) : cs.add(code);
    return { ...p, completed_levels: [...cs].join(",") };
  });
  async function saveNewCompany() {
    if (!newCo.name.trim()) { onError?.("Nom de l'entreprise requis."); return; }
    try {
      const r = await createCompany(newCo);
      const list = (await getCompanies()).data || [];
      setCompanies(list);
      setForm((p) => ({ ...p, company_id: r.data?.id || p.company_id }));
      setNewCo(null);
    } catch (e) { onError?.(e.message); }
  }
  const codeColor = (code) => {
    const f = formations.find((x) => x.code === code);
    return (f && f.color) || colorForLevel(code);
  };

  const isPro = form.financing === "PROFESSIONNEL";
  const isJobSeeker = form.professional_status === "Demandeur d'emploi";
  const isEmployed = form.professional_status === "En activité";

  async function handleSubmit(e) {
    e.preventDefault();
    if (!String(form.first_name).trim() || !String(form.last_name).trim()) { onError?.("Prénom et nom requis."); return; }
    setSaving(true);
    try {
      // On lie l'entreprise via sa FK (company_id) : plus de saisie dupliquée par stagiaire.
      const payload = { ...form, company_id: isPro ? (form.company_id || null) : null };
      if (id) {
        await updateStagiaire(id, payload);
        onSaved?.("Stagiaire mis à jour.");
      } else {
        const res = await createStagiaire(payload);
        onSaved?.(res && res.password
          ? `Stagiaire ajouté. Compte créé — mot de passe : ${res.password} (notez-le, il ne sera plus affiché).`
          : "Stagiaire ajouté.");
      }
    } catch (err) { onError?.(err.message); }
    finally { setSaving(false); }
  }

  const current = (form.levels || "").split(",").map((s) => s.trim()).filter(Boolean);
  const finished = (form.completed_levels || "").split(",").map((s) => s.trim()).filter(Boolean);
  const codes = [...new Set([...formations.map((f) => f.code).filter(Boolean), ...current])];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{id ? "Modifier le stagiaire" : "Nouveau stagiaire"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          {loading ? <p className="hint">Chargement…</p> : (
            <form id="stagiaire-form" onSubmit={handleSubmit}>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Prise de contact &amp; identité</h3>
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
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Statut actuel &amp; financement</h3>
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
                <SelectField label="OPCO / financeur" value={form.opco} onChange={set("opco")}>
                  <option value="">—</option>
                  {[...new Set([...(form.opco ? [form.opco] : []), ...opcoNames])].map((o) => <option key={o} value={o}>{o}</option>)}
                </SelectField>
              </div>

              <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "10px 0 6px" }}>Niveaux / accès — codes formation · cochez <b>terminé</b> quand la formation est finie</label>
              {codes.length === 0 ? (
                <p className="hint">Aucune formation. Créez-en dans « Formations ».</p>
              ) : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {codes.map((code) => {
                    const on = current.includes(code);
                    const fin = finished.includes(code);
                    return (
                      <span key={code} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 8px", border: "1px solid var(--border-soft)", borderRadius: 8, background: on ? "var(--surface2)" : "transparent" }}>
                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
                          <input type="checkbox" checked={on} onChange={() => toggleLevel(code)} />
                          <i style={{ width: 11, height: 11, borderRadius: "50%", background: codeColor(code), display: "inline-block" }} /> {code}
                        </label>
                        {on && (
                          <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12, color: fin ? "#2e9e5b" : "var(--muted)", cursor: "pointer" }}>
                            <input type="checkbox" checked={fin} onChange={() => toggleFinished(code)} /> terminé
                          </label>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="divider" />
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Votre projet</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {[["project_creation", "Création"], ["project_takeover", "Reprise"], ["project_oven", "Four"], ["project_truck", "Camion / Remorque"], ["project_job", "Cherche poste pizzaïolo(la)"]].map(([k, lab]) => (
                  <label key={k} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                    <input type="checkbox" checked={!!form[k]} onChange={toggle(k)} /> {lab}
                  </label>
                ))}
              </div>

              {isPro && (
                <>
                  <div className="divider" />
                  <h3 style={{ fontSize: 15, marginBottom: 4 }}>Entreprise</h3>
                  <p className="hint" style={{ marginTop: 0, marginBottom: 10 }}>Rattache le stagiaire à une entreprise. Ses coordonnées (SIRET, adresse, représentant, OPCO…) se gèrent dans la section <b>Entreprises</b> et servent aux documents.</p>
                  <div className="row2">
                    <SelectField label="Entreprise rattachée" value={form.company_id} onChange={set("company_id")}>
                      <option value="">— Aucune —</option>
                      {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.town ? ` · ${c.town}` : ""}</option>)}
                    </SelectField>
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      {!newCo && <button type="button" className="btn ghost" onClick={() => setNewCo({ name: "", siret: "", town: "", representative_name: "" })}>＋ Nouvelle entreprise</button>}
                    </div>
                  </div>
                  {newCo && (
                    <div className="card" style={{ padding: 12, marginTop: 4 }}>
                      <div className="row3">
                        <Field label="Nom *" value={newCo.name} onChange={(e) => setNewCo((n) => ({ ...n, name: e.target.value }))} />
                        <Field label="SIRET" value={newCo.siret} onChange={(e) => setNewCo((n) => ({ ...n, siret: e.target.value }))} />
                        <Field label="Ville" value={newCo.town} onChange={(e) => setNewCo((n) => ({ ...n, town: e.target.value }))} />
                      </div>
                      <div className="row2">
                        <Field label="Représentant (nom & prénom)" value={newCo.representative_name} onChange={(e) => setNewCo((n) => ({ ...n, representative_name: e.target.value }))} />
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button type="button" className="btn sm ghost" onClick={() => setNewCo(null)}>Annuler</button>
                        <button type="button" className="btn sm primary" onClick={saveNewCompany}>Créer &amp; rattacher</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </form>
          )}
        </div>
        <div className="mfoot" style={{ justifyContent: onDelete ? "space-between" : "flex-end" }}>
          {onDelete && <button type="button" className="btn ghost danger" onClick={onDelete}>Supprimer le stagiaire</button>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
            <button type="submit" form="stagiaire-form" className="btn primary" disabled={saving || loading}>
              {saving ? "Enregistrement…" : id ? "Enregistrer" : "Ajouter le stagiaire"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditStagiaireModal;
