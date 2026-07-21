import { useEffect, useState } from "react";
import { Icon } from "./Icon.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { EQUIP_TYPES, FREQUENCIES, DEFAULT_EQUIPMENT, DEFAULT_CLEANING } from "../lib/hygiene.js";
import {
  getHygieneEquipment, addHygieneEquipment, deleteHygieneEquipment,
  getHygieneTasks, addHygieneTask, deleteHygieneTask,
} from "../api/apiClient.js";

/**
 * Gestion d'un référentiel hygiène : soit les points de contrôle (`mode="equipment"`),
 * soit le plan de nettoyage (`mode="task"`). Autonome — il charge, ajoute et supprime,
 * puis prévient le parent via `onChanged()` pour rafraîchir les sélecteurs.
 *
 * « Démarrage rapide » : quand la liste est vide, on propose de créer les points/tâches
 * courants d'un labo pizza en un tap — pour ne pas laisser le stagiaire devant un formulaire vide.
 */
export default function HygieneRefPanel({ mode, onChanged }) {
  const isEquip = mode === "equipment";
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const blank = isEquip
    ? { name: "", type: "FROID", target_min: "", target_max: "", unit: "°C", location: "" }
    : { zone: "", task: "", frequency: "QUOTIDIEN", product: "" };
  const [form, setForm] = useState(blank);

  const load = () =>
    (isEquip ? getHygieneEquipment(true) : getHygieneTasks(true))
      .then((r) => setItems(r.data || []))
      .catch((e) => setStatus({ type: "error", message: e.message }));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [mode]);

  const notify = () => { load(); onChanged?.(); };

  // Choisir un type d'équipement pré-remplit les seuils réglementaires (modifiables ensuite).
  const pickType = (type) => {
    const p = EQUIP_TYPES[type] || {};
    setForm((f) => ({ ...f, type, target_min: p.min ?? "", target_max: p.max ?? "" }));
  };

  async function add(e) {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      if (isEquip) {
        if (!form.name.trim()) throw new Error("Nom requis.");
        await addHygieneEquipment(form);
      } else {
        if (!form.zone.trim() || !form.task.trim()) throw new Error("Zone et tâche requises.");
        await addHygieneTask(form);
      }
      setForm(blank);
      notify();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally { setBusy(false); }
  }

  async function quickStart() {
    setBusy(true); setStatus(null);
    try {
      const presets = isEquip ? DEFAULT_EQUIPMENT : DEFAULT_CLEANING;
      for (const p of presets) await (isEquip ? addHygieneEquipment(p) : addHygieneTask(p));
      notify();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    } finally { setBusy(false); }
  }

  async function remove(id) {
    if (!window.confirm(isEquip ? "Supprimer ce point de contrôle ?" : "Supprimer cette tâche ?")) return;
    try {
      await (isEquip ? deleteHygieneEquipment(id) : deleteHygieneTask(id));
      notify();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  return (
    <div className="hs-ref">
      <StatusMessage status={status} />

      {items.length === 0 && (
        <div className="hs-ref-empty">
          <p>{isEquip ? "Aucun point de contrôle." : "Aucune tâche de nettoyage."}</p>
          <button type="button" className="btn sm primary" onClick={quickStart} disabled={busy}>
            <Icon name="plus" size={14} /> {isEquip ? "Ajouter les points courants" : "Ajouter le plan type"}
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul className="hs-ref-list">
          {items.map((it) => (
            <li key={it.id} className={it.active ? "" : "off"}>
              <span className="hs-ref-main">
                <b>{isEquip ? it.name : it.task}</b>
                <span className="hs-ref-sub">
                  {isEquip
                    ? `${EQUIP_TYPES[it.type]?.label || it.type}${seuilTxt(it)}`
                    : `${it.zone} · ${FREQUENCIES[it.frequency] || it.frequency}${it.product ? " · " + it.product : ""}`}
                </span>
              </span>
              <button type="button" className="icon-btn danger" onClick={() => remove(it.id)} aria-label="Supprimer" title="Supprimer">
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="hs-ref-form" onSubmit={add}>
        {isEquip ? (
          <>
            <input className="inp" placeholder="Nom (ex. Chambre froide 1)" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="hs-ref-row">
              <select value={form.type} onChange={(e) => pickType(e.target.value)}>
                {Object.entries(EQUIP_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <input className="inp" type="number" step="0.1" placeholder="min °C" value={form.target_min}
                onChange={(e) => setForm({ ...form, target_min: e.target.value })} style={{ maxWidth: 92 }} />
              <input className="inp" type="number" step="0.1" placeholder="max °C" value={form.target_max}
                onChange={(e) => setForm({ ...form, target_max: e.target.value })} style={{ maxWidth: 92 }} />
            </div>
          </>
        ) : (
          <>
            <div className="hs-ref-row">
              <input className="inp" placeholder="Zone (ex. Plan de travail)" value={form.zone}
                onChange={(e) => setForm({ ...form, zone: e.target.value })} />
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                {Object.entries(FREQUENCIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <input className="inp" placeholder="Tâche (ex. Nettoyer et désinfecter)" value={form.task}
              onChange={(e) => setForm({ ...form, task: e.target.value })} />
            <input className="inp" placeholder="Produit (optionnel)" value={form.product}
              onChange={(e) => setForm({ ...form, product: e.target.value })} />
          </>
        )}
        <button type="submit" className="btn sm" disabled={busy}><Icon name="plus" size={14} /> Ajouter</button>
      </form>
    </div>
  );
}

function seuilTxt(it) {
  const has = it.target_min != null || it.target_max != null;
  if (!has) return "";
  const u = it.unit || "°C";
  if (it.target_min != null && it.target_max != null) return ` · ${fmt(it.target_min)} à ${fmt(it.target_max)} ${u}`;
  if (it.target_max != null) return ` · ≤ ${fmt(it.target_max)} ${u}`;
  return ` · ≥ ${fmt(it.target_min)} ${u}`;
}
const fmt = (n) => { const v = Number(n); return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","); };
