import { useState } from "react";
import Card from "./Card.jsx";
import { Icon } from "./Icon.jsx";
import { APPORT_TYPES, apportType } from "../lib/apports.js";

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Saisie UNIFIÉE d'un apport partenaire (commission cash OU contribution en nature).
 * Une seule case, une valeur TOUJOURS renseignée. Remonte l'apport via `onAdd`.
 * MAQUETTE : l'enregistrement réel (CA + suivi) se branchera en base ensuite.
 */
export default function ApportForm({ partners = [], onAdd }) {
  const [form, setForm] = useState({ partner_id: "", type: "COMMISSION", label: "", value: "", date: today() });
  const [error, setError] = useState("");
  const isCash = apportType(form.type).cash;

  function add() {
    if (!form.partner_id) return setError("Choisissez le partenaire.");
    if (!form.label.trim()) return setError("Indiquez la commission ou ce qui a été reçu.");
    if (form.value === "" || Number.isNaN(Number(form.value))) return setError("La valeur est obligatoire (même pour une contribution en nature).");
    setError("");
    onAdd?.({ id: uid(), ...form, value: Number(form.value) || 0 });
    setForm((f) => ({ ...f, label: "", value: "", date: today() }));
  }

  return (
    <Card
      title={<span className="card-ttl"><Icon name="handshake" size={16} /> Enregistrer un apport (commission ou contribution)</span>}
      more={<span className="badge a" title="Prototype à données locales — pas encore enregistré en base">Maquette</span>}
      style={{ marginBottom: 16 }}
    >
      <p className="sub" style={{ marginTop: -4, marginBottom: 12 }}>
        Une seule saisie : une <b>commission</b> (cash → CA) ou une <b>contribution en nature</b>
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
        <button className="btn primary" onClick={add}><Icon name="plus" size={15} /> Ajouter l'apport</button>
        <span className="hint">{isCash ? "Sera ajouté au chiffre d'affaires." : "Suivi seul (non ajouté au CA)."}</span>
        {error && <span className="hint" style={{ color: "var(--ember1)" }}>{error}</span>}
      </div>
    </Card>
  );
}
