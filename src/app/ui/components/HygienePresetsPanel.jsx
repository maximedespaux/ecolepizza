import { useEffect, useState } from "react";
import { Icon } from "./Icon.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { getHygienePresets, addHygienePreset, deleteHygienePreset } from "../api/apiClient.js";

/**
 * Préréglages : les fournisseurs (`kind="SUPPLIER"`) ou les produits fréquents (`kind="PRODUCT"`).
 * On les saisit UNE fois ici ; ensuite ils s'auto-complètent à la réception et sur les étiquettes,
 * et pour un produit sa DLC secondaire par défaut se reporte toute seule. Fini les questions répétées.
 */
const NATURE = [["FABRICATION", "Fabrication"], ["OUVERTURE", "Ouverture"], ["DECONGELATION", "Décongélation"]];
const natureLabel = (t) => ({ FABRICATION: "Fabrication", OUVERTURE: "Ouverture", DECONGELATION: "Décongélation" }[t] || "");

export default function HygienePresetsPanel({ kind, onChanged }) {
  const isProduct = kind === "PRODUCT";
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const blank = isProduct ? { label: "", dlc_days: "", type: "FABRICATION" } : { label: "" };
  const [form, setForm] = useState(blank);

  const load = () =>
    getHygienePresets(kind, true).then((r) => setItems(r.data || [])).catch((e) => setStatus({ type: "error", message: e.message }));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [kind]);
  const notify = () => { load(); onChanged?.(); };

  async function add(e) {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      if (!form.label.trim()) throw new Error("Libellé requis.");
      const payload = isProduct
        ? { kind, label: form.label, dlc_days: form.dlc_days, meta: { type: form.type } }
        : { kind, label: form.label };
      await addHygienePreset(payload);
      setForm(blank);
      notify();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
    finally { setBusy(false); }
  }

  async function remove(id) {
    if (!window.confirm("Supprimer ce préréglage ?")) return;
    try { await deleteHygienePreset(id); notify(); }
    catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  return (
    <div className="hs-ref">
      <StatusMessage status={status} />
      {items.length > 0 && (
        <ul className="hs-ref-list">
          {items.map((it) => (
            <li key={it.id}>
              <span className="hs-ref-main">
                <b>{it.label}</b>
                {isProduct && (
                  <span className="hs-ref-sub">
                    {it.dlc_days != null ? `DLC +${it.dlc_days} j` : "sans DLC par défaut"}
                    {it.meta?.type ? ` · ${natureLabel(it.meta.type)}` : ""}
                  </span>
                )}
              </span>
              <button type="button" className="icon-btn danger" onClick={() => remove(it.id)} aria-label="Supprimer" title="Supprimer">
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="hs-ref-form" onSubmit={add}>
        <input className="inp" placeholder={isProduct ? "Produit (ex. Sauce tomate maison)" : "Fournisseur (ex. Metro)"}
          value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        {isProduct && (
          <div className="hs-ref-row">
            <input className="inp" type="number" step="1" placeholder="DLC (jours)"
              value={form.dlc_days} onChange={(e) => setForm({ ...form, dlc_days: e.target.value })} />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {NATURE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )}
        <button type="submit" className="btn sm" disabled={busy}><Icon name="plus" size={14} /> Ajouter</button>
      </form>
    </div>
  );
}
