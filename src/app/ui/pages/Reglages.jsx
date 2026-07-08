import { useEffect, useState } from "react";
import { getOrganisation, updateOrganisation } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

const FIELDS = [
  ["legal_name", "Raison sociale"], ["short_name", "Sigle"], ["manager", "Responsable"],
  ["siret", "SIRET"], ["vat_number", "N° TVA intracommunautaire"], ["nda", "N° de déclaration d'activité"], ["naf_ape", "Code NAF/APE"],
  ["address", "Adresse"], ["zip_code", "Code postal"], ["town", "Ville"],
  ["phone", "Téléphone"], ["email", "Email"],
];

function Reglages() {
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getOrganisation().then((r) => setForm(r.data)).catch((e) => setStatus({ type: "error", message: e.message }));
  }, []);

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      await updateOrganisation(form);
      setStatus({ type: "success", message: "Organisme enregistré." });
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHead eyebrow="Système" title="Organisme" lead="Les informations utilisées dans les documents générés." />
      <StatusMessage status={status} />
      {form && (
        <Card title="Identité de l'organisme">
          <form onSubmit={save}>
            <div className="row2">
              {FIELDS.map(([k, label]) => (
                <Field key={k} label={label} value={form[k] || ""} onChange={set(k)} />
              ))}
            </div>
            <div className="field" style={{ marginTop: 4 }}>
              <label>Code organisme (connexion)</label>
              <input className="inp mono" value={form.code || ""} onChange={set("code")} placeholder="ex. EPB33" />
              <span className="sub" style={{ fontSize: 11 }}>
                Code court unique. Les utilisateurs le saisissent à la connexion lorsqu'une même adresse e-mail existe dans plusieurs organismes.
              </span>
            </div>

            <div className="divider" />
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Coordonnées bancaires (RIB)</h3>
            <p className="sub" style={{ marginTop: 0 }}>Utilisées sur les devis, conventions et factures — jetons {"{IBAN}"}, {"{BIC}"}, {"{Banque}"}.</p>
            <div className="row3">
              <Field label="IBAN" value={form.iban || ""} onChange={set("iban")} placeholder="FR76 3000 4000 0100 0001 2345 678" />
              <Field label="BIC / SWIFT" value={form.bic || ""} onChange={set("bic")} placeholder="AGRIFRPP" />
              <Field label="Domiciliation (banque)" value={form.bank_name || ""} onChange={set("bank_name")} placeholder="Crédit Agricole Aquitaine" />
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "10px 0 14px", fontSize: 14 }}>
              <input type="checkbox" checked={!!form.qualiopi} onChange={(e) => setForm((p) => ({ ...p, qualiopi: e.target.checked ? 1 : 0 }))} />
              Certifié Qualiopi
            </label>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </form>
        </Card>
      )}
    </>
  );
}

export default Reglages;
