import { useEffect, useState } from "react";
import { getOrganisation, updateOrganisation } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import LocationsManager from "../components/LocationsManager.jsx";

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
              {/* `htmlFor` : le seul champ de cette page écrit à la main plutôt qu'avec
                  `<Field>`, et donc le seul dont l'étiquette n'était pas reliée. Cliquer
                  « Code organisme » ne plaçait pas le curseur dans la case. */}
              <label htmlFor="org-code">Code organisme (connexion)</label>
              <input id="org-code" className="inp mono" value={form.code || ""} onChange={set("code")} placeholder="ex. EPB33" />
              <span className="sub" style={{ fontSize: 11 }}>
                Code court unique. Les utilisateurs le saisissent à la connexion lorsqu'une même adresse e-mail existe dans plusieurs organismes.
              </span>
            </div>

            <div className="divider" />
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Facturation / TVA</h3>
            <p className="sub" style={{ marginTop: 0 }}>Taux appliqué sur les documents — jetons {"{Prix HT}"}, {"{TVA}"}, {"{Prix TTC}"}, {"{Reste à payer}"}. Laisser à 0 si la formation est exonérée de TVA (art. 261-4-4° CGI).</p>
            <div className="row3">
              <Field label="Taux de TVA (%)" type="number" value={form.vat_rate ?? 0} onChange={set("vat_rate")} placeholder="0" />
            </div>

            <div className="divider" />
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Coordonnées bancaires (RIB)</h3>
            <p className="sub" style={{ marginTop: 0 }}>Utilisées sur les devis, conventions et factures — jetons {"{IBAN}"}, {"{BIC}"}, {"{Banque}"}.</p>
            <div className="row3">
              <Field label="IBAN" value={form.iban || ""} onChange={set("iban")} placeholder="FR76 3000 4000 0100 0001 2345 678" />
              <Field label="BIC / SWIFT" value={form.bic || ""} onChange={set("bic")} placeholder="AGRIFRPP" />
              <Field label="Domiciliation (banque)" value={form.bank_name || ""} onChange={set("bank_name")} placeholder="Crédit Agricole Aquitaine" />
            </div>
            <div className="divider" />
            <h3 style={{ fontSize: 14, margin: "0 0 8px" }}>Signature de l'organisme</h3>
            <p className="sub" style={{ marginTop: 0 }}>Image insérée automatiquement sur les documents via le jeton {"{Signature organisme}"} (PNG à fond transparent conseillé).</p>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              {form.signature_image ? (
                <img
                  src={form.signature_image}
                  alt="Signature organisme"
                  style={{ maxHeight: 70, maxWidth: 240, border: "1px solid var(--border, #ddd)", borderRadius: 6, padding: 4, background: "#fff" }}
                />
              ) : (
                <span className="sub" style={{ fontSize: 13 }}>Aucune signature enregistrée.</span>
              )}
              <label className="btn" style={{ cursor: "pointer" }}>
                {form.signature_image ? "Remplacer" : "Importer une image"}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0];
                    if (!file) return;
                    if (file.size > 1024 * 1024) { setStatus({ type: "error", message: "Image trop lourde (max 1 Mo)." }); return; }
                    const reader = new FileReader();
                    reader.onload = () => setForm((p) => ({ ...p, signature_image: reader.result }));
                    reader.readAsDataURL(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {form.signature_image && (
                <button type="button" className="btn ghost" onClick={() => setForm((p) => ({ ...p, signature_image: null }))}>
                  Retirer
                </button>
              )}
            </div>

            <div className="divider" />
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
      {form && <div style={{ marginTop: 16 }}><LocationsManager /></div>}
    </>
  );
}

export default Reglages;
