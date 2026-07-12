import { useState } from "react";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";
import { createRevenue, createContribution } from "../api/apiClient.js";
import { APPORT_TYPES, apportType } from "../lib/apports.js";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Saisie UNIFIÉE d'un apport partenaire : commission cash (→ CA, revenue_extra) OU
 * contribution en nature (matériel/équipement → suivi, partner_contribution).
 * Une seule case, une valeur TOUJOURS renseignée. `onSaved` recharge la liste.
 */
export default function ApportForm({ partners = [], onSaved }) {
  const [form, setForm] = useState({ partner_id: "", type: "COMMISSION", label: "", value: "", date: today() });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isCash = apportType(form.type).cash;

  async function submit() {
    if (!form.partner_id) return setError("Choisissez le partenaire.");
    if (!form.label.trim()) return setError("Indiquez la commission ou ce qui a été reçu.");
    if (form.value === "" || Number.isNaN(Number(form.value))) return setError("La valeur est obligatoire (même pour une contribution en nature).");
    setError(""); setSaving(true);
    try {
      if (isCash) {
        await createRevenue({ label: form.label, categorie: form.type, montant: form.value, date: form.date, partner_id: form.partner_id });
      } else {
        await createContribution({ partner_id: form.partner_id, type: form.type, label: form.label, value: form.value, date: form.date });
      }
      setForm((f) => ({ ...f, label: "", value: "", date: today() }));
      onSaved?.();
    } catch (e) {
      setError(e.message || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title={<span className="card-ttl"><Icon name="handshake" size={16} /> Enregistrer un apport (commission ou contribution)</span>}
      style={{ marginBottom: 16 }}
    >
      <p className="sub" style={{ marginTop: -4, marginBottom: 12 }}>
        Une seule saisie : une <b>commission</b> (cash → chiffre d'affaires) ou une <b>contribution en nature</b>
        (pétrin, four, farine offerte…). La <b>valeur est toujours indiquée</b>, même en nature.
      </p>

      <div className="row3" style={{ alignItems: "end" }}>
        <div className="field"><label>Partenaire <span style={{ color: "var(--ember1)" }}>*</span></label>
          <select value={form.partner_id} onChange={(e) => setForm({ ...form, partner_id: e.target.value })}>
            <option value="">— Sélectionner —</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></div>
        <div className="field"><label>Type</label>
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <optgroup label="Cash (→ chiffre d'affaires)">
              {APPORT_TYPES.filter((t) => t.cash).map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </optgroup>
            <optgroup label="En nature (suivi seul)">
              {APPORT_TYPES.filter((t) => !t.cash).map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </optgroup>
          </select></div>
        <div className="field"><label>Valeur (€) <span style={{ color: "var(--ember1)" }}>*</span></label>
          <input className="inp" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="0" /></div>
      </div>
      <div className="row3" style={{ alignItems: "end" }}>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label>{isCash ? "Libellé de la commission" : "Quoi (ce qui a été reçu)"} <span style={{ color: "var(--ember1)" }}>*</span></label>
          <input className="inp" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })}
            placeholder={isCash ? "Commission Le 5 Stagioni…" : "Pétrin 20L, four à bois, 50 kg farine T65…"} /></div>
        <div className="field"><label>Date</label>
          <input className="inp" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button className="btn primary" onClick={submit} disabled={saving}><Icon name="plus" size={15} /> {saving ? "Enregistrement…" : "Ajouter l'apport"}</button>
        <span className="hint">{isCash ? "Sera ajouté au chiffre d'affaires." : "Suivi seul (non ajouté au CA)."}</span>
        {error && <span className="hint" style={{ color: "var(--ember1)" }}>{error}</span>}
      </div>
    </Card>
  );
}
