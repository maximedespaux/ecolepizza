import { useEffect, useMemo, useState } from "react";
import {
  getMercuriale, createMercStore, deleteMercStore,
  createMercItem, updateMercItem, deleteMercItem, setMercPrice,
} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { Field } from "../components/Field.jsx";
import { euro } from "../lib/format.js";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Mercuriale : liste de prix de référence avec comparaison multi-magasins.
 * Une ligne par produit, une colonne de prix HT par magasin ; le moins cher est
 * surligné. Prix éditables à la main (relevé Metro ou saisie ponctuelle).
 */
function Mercuriale() {
  const [stores, setStores] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [rayon, setRayon] = useState("Tous");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // produit en ajout/édition

  async function load() {
    try {
      const r = await getMercuriale();
      setStores(r.stores || []);
      setItems(r.items || []);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const rayons = useMemo(
    () => ["Tous", ...Array.from(new Set(items.map((i) => i.rayon).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr"))],
    [items]
  );
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((i) =>
      (rayon === "Tous" || i.rayon === rayon) &&
      (!query || `${i.marque || ""} ${i.produit} ${i.reference || ""}`.toLowerCase().includes(query))
    );
  }, [items, rayon, q]);

  // id du magasin le moins cher pour un produit (ignore les cellules vides).
  function cheapestStore(item) {
    let best = null, min = Infinity;
    for (const s of stores) {
      const v = item.prices[s.id]?.prix_ht;
      if (v != null && Number(v) < min) { min = Number(v); best = s.id; }
    }
    return best;
  }

  async function addStore() {
    const name = window.prompt("Nom du magasin (ex. « Metro Toulouse ») :", "");
    if (!name || !name.trim()) return;
    try { await createMercStore(name.trim()); load(); } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function removeStore(s) {
    if (!window.confirm(`Retirer le magasin « ${s.name} » et tous ses prix ?`)) return;
    try { await deleteMercStore(s.id); load(); } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function removeItem(i) {
    if (!window.confirm(`Supprimer le produit « ${i.produit} » ?`)) return;
    try { await deleteMercItem(i.id); load(); } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  // Enregistre une cellule de prix (optimiste) ; vide => cellule effacée.
  async function savePrice(item, storeId, value) {
    const prev = item.prices[storeId]?.prix_ht;
    const norm = value === "" ? "" : String(value);
    if (norm === (prev == null ? "" : String(prev))) return;
    try {
      const r = await setMercPrice(item.id, storeId, { prix_ht: value === "" ? null : value });
      setItems((list) => list.map((it) => {
        if (it.id !== item.id) return it;
        const prices = { ...it.prices };
        if (value === "") delete prices[storeId];
        else prices[storeId] = { prix_ht: Number(value), date_releve: r.date_releve };
        return { ...it, prices };
      }));
    } catch (e) { setStatus({ type: "error", message: e.message }); load(); }
  }

  function exportCSV() {
    const cols = ["Marque", "Produit", "Référence", "Conditionnement", "Unité",
      ...stores.map((s) => `Prix HT ${s.name}`), "Prix/kg", "Rayon", "Notes"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = filtered.map((i) => [
      i.marque, i.produit, i.reference, i.conditionnement, i.unite,
      ...stores.map((s) => i.prices[s.id]?.prix_ht ?? ""),
      i.prix_kg ?? "", i.rayon, i.notes,
    ].map(esc).join(";"));
    const csv = [cols.map(esc).join(";"), ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mercuriale-${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHead
        eyebrow="Commercial"
        title="Mercuriale"
        lead="Liste de prix de référence, comparée entre magasins. Une colonne de prix par magasin ; le moins cher est surligné. Prix éditables à la main (relevé Metro ou saisie ponctuelle)."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={exportCSV} disabled={filtered.length === 0}><Icon name="download" size={14} /> Exporter (CSV)</button>
            <button className="btn ghost" onClick={addStore}><Icon name="plus" size={14} /> Magasin</button>
            <button className="btn primary" onClick={() => setEditing({ _new: true })}><Icon name="plus" size={14} /> Produit</button>
          </div>
        }
      />
      <StatusMessage status={status} />

      <Card>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {rayons.map((r) => (
              <button key={r} className={"btn sm " + (rayon === r ? "primary" : "ghost")} onClick={() => setRayon(r)}>{r}</button>
            ))}
          </div>
          <div className="spacer" />
          <input className="inp" style={{ maxWidth: 260 }} placeholder="Rechercher un produit / marque / réf…" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="hint">{filtered.length} produit{filtered.length > 1 ? "s" : ""}</span>
        </div>

        {loading ? (
          <p className="sub">Chargement…</p>
        ) : items.length === 0 ? (
          <EmptyState icon="table">
            Aucun produit. Ajoutez un magasin puis des produits — ou importez le relevé Metro (à venir).
          </EmptyState>
        ) : (
          <div className="tablewrap" style={{ border: "none" }}>
            <table className="merc-table">
              <thead>
                <tr>
                  <th>Marque</th>
                  <th>Produit</th>
                  <th>Réf.</th>
                  <th>Cond.</th>
                  <th>Unité</th>
                  {stores.map((s) => (
                    <th key={s.id} className="ta-r merc-store">
                      <span>{s.name}</span>
                      <button className="merc-x" title="Retirer ce magasin" onClick={() => removeStore(s)}><Icon name="x" size={12} /></button>
                    </th>
                  ))}
                  <th className="ta-r">Prix/kg</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const best = cheapestStore(i);
                  return (
                    <tr key={i.id}>
                      <td>{i.marque || "—"}</td>
                      <td><b>{i.produit}</b></td>
                      <td className="mono" style={{ fontSize: 12 }}>{i.reference || "—"}</td>
                      <td style={{ fontSize: 12 }}>{i.conditionnement || "—"}</td>
                      <td style={{ fontSize: 12 }}>{i.unite || "—"}</td>
                      {stores.map((s) => (
                        <PriceCell key={s.id} item={i} store={s} best={best === s.id} onSave={savePrice} />
                      ))}
                      <td className="ta-r mono" style={{ fontSize: 12 }}>{i.prix_kg != null ? euro(i.prix_kg) : "—"}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 160 }}>{i.notes || ""}</td>
                      <td className="ta-r" style={{ whiteSpace: "nowrap" }}>
                        <button className="iconbtn" title="Modifier" onClick={() => setEditing(i)}><Icon name="pencil" size={14} /></button>
                        <button className="iconbtn del" title="Supprimer" onClick={() => removeItem(i)}><Icon name="trash" size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {stores.length === 0 && !loading && (
          <p className="hint" style={{ marginTop: 10 }}>Astuce : ajoutez d'abord vos magasins Metro (bouton « Magasin ») pour créer les colonnes de prix.</p>
        )}
      </Card>

      {editing && (
        <ItemModal
          item={editing._new ? {} : editing}
          onClose={() => setEditing(null)}
          onError={(m) => setStatus({ type: "error", message: m })}
          onSaved={() => { setEditing(null); setStatus({ type: "success", message: "Produit enregistré." }); load(); }}
        />
      )}
    </>
  );
}

// Cellule de prix éditable : sauvegarde au blur / Entrée ; surligne le moins cher.
function PriceCell({ item, store, best, onSave }) {
  const cur = item.prices[store.id]?.prix_ht;
  const [val, setVal] = useState(cur == null ? "" : String(cur));
  useEffect(() => { setVal(cur == null ? "" : String(cur)); }, [cur]);
  return (
    <td className={"merc-price" + (best ? " best" : "")}>
      <input
        className="inp" inputMode="decimal" value={val} placeholder="—"
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => onSave(item, store.id, val.trim())}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      />
    </td>
  );
}

// Ajout / édition d'un produit (champs de la ligne, hors prix par magasin).
function ItemModal({ item, onClose, onSaved, onError }) {
  const isNew = !item.id;
  const [form, setForm] = useState({
    rayon: item.rayon || "", marque: item.marque || "", produit: item.produit || "",
    reference: item.reference || "", conditionnement: item.conditionnement || "",
    unite: item.unite || "", prix_kg: item.prix_kg ?? "", notes: item.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    if (!form.produit.trim()) return onError("Nom du produit requis.");
    setSaving(true);
    try {
      if (isNew) await createMercItem(form);
      else await updateMercItem(item.id, form);
      onSaved();
    } catch (er) { onError(er.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>{isNew ? "Nouveau produit" : "Modifier le produit"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <form onSubmit={save}>
          <div className="mbody">
            <div className="row2">
              <Field label="Produit" value={form.produit} onChange={set("produit")} required placeholder="Mozzarella fiordilatte…" />
              <Field label="Marque" value={form.marque} onChange={set("marque")} placeholder="Galbani, Demetra…" />
            </div>
            <div className="row3">
              <Field label="Rayon" value={form.rayon} onChange={set("rayon")} placeholder="Frais, Poissons…" />
              <Field label="Référence" value={form.reference} onChange={set("reference")} />
              <Field label="Conditionnement" value={form.conditionnement} onChange={set("conditionnement")} placeholder="1 kg, x6, colis de 12" />
            </div>
            <div className="row2">
              <Field label="Unité" value={form.unite} onChange={set("unite")} placeholder="kg, L, pièce" />
              <Field label="Prix au kg/L (€)" type="number" step="0.001" value={form.prix_kg} onChange={set("prix_kg")} />
            </div>
            <Field label="Notes" value={form.notes} onChange={set("notes")} placeholder="Remarque, équivalence, indispo…" />
          </div>
          <div className="mfoot">
            <button type="button" className="btn ghost" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Mercuriale;
