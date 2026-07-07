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
