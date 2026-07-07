import { useEffect, useState } from "react";
import { getInventory, createItem, adjustItem, sellItem, deleteItem, updateItem } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import Badge from "../components/Badge.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { euro } from "../lib/format.js";
import { bumpBadges } from "../lib/events.js";

const CATEGORIES = ["Four", "Pétrin", "Matière première", "Accessoire", "Livre", "Autre"];
const TVA_RATES = ["20", "10", "5.5", "2.1", "0"];
const EMPTY = { name: "", category: "", sku: "", quantity: 0, unit_price: "", tax_rate: "20", threshold: 0 };

const ttc = (ht, rate) => Number(ht || 0) * (1 + Number(rate || 0) / 100);

function stockState(item) {
  if (item.quantity <= 0) return { tone: "r", label: "Rupture", color: "var(--ember1)" };
  if (item.quantity <= item.threshold) return { tone: "a", label: "Stock bas", color: "#e8a13a" };
  return { tone: "g", label: "En stock", color: "var(--green)" };
}

function Inventaire({ embedded = false }) {
  const [items, setItems] = useState([]);
  const [totals, setTotals] = useState({ items: 0, units: 0, value: 0, low: 0 });
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // { id, ...fields } en cours d'édition

  async function load() {
    try {
      const r = await getInventory();
      setItems(r.data);
      setTotals(r.totals);
      bumpBadges();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    setStatus(null);
    try {
      await createItem(form);
      setForm(EMPTY);
      setShowForm(false);
      load();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  // Ajustement optimiste (+/-).
  async function adjust(item, delta) {
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)));
    try { await adjustItem(item.id, delta); load(); } catch (err) { setStatus({ type: "error", message: err.message }); load(); }
  }

  async function sell(item) {
    const q = window.prompt(`Vendre combien d'unités de « ${item.name} » ? (stock : ${item.quantity})`, "1");
    if (q === null) return;
    setStatus(null);
    try { await sellItem(item.id, q); setStatus({ type: "success", message: "Vente enregistrée." }); load(); }
    catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  async function remove(item) {
    if (!window.confirm(`Supprimer « ${item.name} » de l'inventaire ?`)) return;
    try { await deleteItem(item.id); load(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  function openEdit(item) {
    setEditing({
      id: item.id, name: item.name, category: item.category || "", sku: item.sku || "",
      quantity: item.quantity, unit_price: item.unit_price ?? "", tax_rate: item.tax_rate ?? "20", threshold: item.threshold,
    });
  }
  const setEdit = (f) => (e) => setEditing((p) => ({ ...p, [f]: e.target.value }));
  async function saveEdit(e) {
    e.preventDefault();
    setStatus(null);
    try {
      const { id, ...fields } = editing;
      await updateItem(id, fields);
      setEditing(null);
      setStatus({ type: "success", message: "Article mis à jour." });
      load();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  return (
    <>
      {embedded ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button className="btn primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ Fermer" : "＋ Ajouter un article"}</button>
        </div>
      ) : (
        <PageHead
          eyebrow="Développement"
          title="Inventaire"
          lead="Stock de matériel à vendre. Ajustez les quantités, vendez, suivez les ruptures."
          actions={<button className="btn primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ Fermer" : "＋ Ajouter un article"}</button>}
        />
      )}
      <StatusMessage status={status} />

      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <Kpi label="Articles" value={totals.items} />
        <Kpi label="Unités en stock" value={totals.units} />
        <Kpi label="Valeur du stock (HT)" value={euro(totals.value)} />
        <Kpi label="Stock bas / rupture" value={totals.low} />
      </div>

      {showForm && (
        <Card title="Nouvel article" className="fade">
          <form onSubmit={add}>
            <div className="row3">
              <Field label="Nom" value={form.name} onChange={set("name")} required />
              <SelectField label="Catégorie" value={form.category} onChange={set("category")}>
                <option value="">—</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectField>
              <Field label="Référence (SKU)" value={form.sku} onChange={set("sku")} />
            </div>
            <div className="row3">
              <Field label="Quantité initiale" type="number" min="0" value={form.quantity} onChange={set("quantity")} />
              <Field label="Prix unitaire HT (€)" type="number" step="0.01" value={form.unit_price} onChange={set("unit_price")} />
              <SelectField label="TVA (%)" value={form.tax_rate} onChange={set("tax_rate")}>
                {TVA_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
              </SelectField>
            </div>
            <div className="row2">
              <Field label="Seuil d'alerte" type="number" min="0" value={form.threshold} onChange={set("threshold")} />
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 10, fontSize: 13, color: "var(--muted)" }}>
                {form.unit_price ? <span>TTC estimé : <b style={{ color: "var(--text)" }}>{euro(ttc(form.unit_price, form.tax_rate))}</b></span> : null}
              </div>
            </div>
            <button type="submit" className="btn primary">Ajouter</button>
          </form>
        </Card>
      )}

      {items.length === 0 ? (
        <Card><EmptyState icon="📦">Aucun article en stock. Ajoutez votre premier article.</EmptyState></Card>
      ) : (
        <div className="grid cols-3">
          {items.map((it) => {
            const st = stockState(it);
            const max = Math.max(it.threshold * 2, it.quantity, 10);
            return (
              <div key={it.id} className="card" style={{ borderTop: `3px solid ${st.color}` }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <b style={{ fontSize: 15 }}>{it.name}</b>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {it.category || "—"}{it.sku ? ` · ${it.sku}` : ""}
                    </div>
                    {it.unit_price != null && (
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        {euro(it.unit_price)} HT · TVA {Number(it.tax_rate)}% · <b style={{ color: "var(--text)" }}>{euro(ttc(it.unit_price, it.tax_rate))} TTC</b>
                      </div>
                    )}
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "12px 0 6px" }}>
                  <span style={{ fontFamily: "var(--font-d)", fontSize: 34, fontWeight: 700, color: st.color }}>{it.quantity}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>en stock{it.threshold ? ` · seuil ${it.threshold}` : ""}</span>
                </div>
                <div className="progress" style={{ marginBottom: 12 }}>
                  <span style={{ width: `${Math.min(100, (it.quantity / max) * 100)}%`, background: st.color }} />
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn sm" onClick={() => adjust(it, -10)} disabled={it.quantity <= 0}>−10</button>
                  <button className="btn sm" onClick={() => adjust(it, -1)} disabled={it.quantity <= 0}>−1</button>
                  <button className="btn sm" onClick={() => adjust(it, 1)}>+1</button>
                  <button className="btn sm" onClick={() => adjust(it, 10)}>+10</button>
                  <div className="spacer" />
                  <button className="btn sm primary" onClick={() => sell(it)} disabled={it.quantity <= 0} title="Vendre (enregistre une vente)">🛒 Vendre</button>
                  <button className="iconbtn" title="Modifier l'article" onClick={() => openEdit(it)}>✎</button>
                  <button className="iconbtn del" title="Supprimer" onClick={() => remove(it)}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3 style={{ fontSize: 16 }}>Modifier l'article</h3>
              <button className="x" onClick={() => setEditing(null)} aria-label="Fermer">×</button>
            </div>
            <form onSubmit={saveEdit}>
              <div className="mbody">
                <div className="row3">
                  <Field label="Nom" value={editing.name} onChange={setEdit("name")} required />
                  <SelectField label="Catégorie" value={editing.category} onChange={setEdit("category")}>
                    <option value="">—</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </SelectField>
                  <Field label="Référence (SKU)" value={editing.sku} onChange={setEdit("sku")} />
                </div>
                <div className="row3">
                  <Field label="Quantité" type="number" min="0" value={editing.quantity} onChange={setEdit("quantity")} />
                  <Field label="Prix unitaire HT (€)" type="number" step="0.01" value={editing.unit_price} onChange={setEdit("unit_price")} />
                  <SelectField label="TVA (%)" value={String(editing.tax_rate)} onChange={setEdit("tax_rate")}>
                    {TVA_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
                  </SelectField>
                </div>
                <div className="row2">
                  <Field label="Seuil d'alerte" type="number" min="0" value={editing.threshold} onChange={setEdit("threshold")} />
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 10, fontSize: 13, color: "var(--muted)" }}>
                    {editing.unit_price ? <span>TTC : <b style={{ color: "var(--text)" }}>{euro(ttc(editing.unit_price, editing.tax_rate))}</b></span> : null}
                  </div>
                </div>
              </div>
              <div className="mfoot">
                <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Annuler</button>
                <button type="submit" className="btn primary">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default Inventaire;
