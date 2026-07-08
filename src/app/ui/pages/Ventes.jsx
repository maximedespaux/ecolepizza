import { useEffect, useMemo, useState } from "react";
import {
  getSales, deleteSale, getInventory, getStagiaires, checkoutSale,
  getShopSettings, saveShopSettings,
} from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Inventaire from "./Inventaire.jsx";
import { euro, initials } from "../lib/format.js";
import { bumpBadges } from "../lib/events.js";

const ttc = (ht, rate) => Number(ht || 0) * (1 + Number(rate || 0) / 100);
const TABS = [
  { v: "caisse", label: "Caisse" },
  { v: "historique", label: "Historique" },
  { v: "inventaire", label: "Inventaire" },
  { v: "reglages", label: "Réglages" },
];

function Ventes() {
  const [tab, setTab] = useState("caisse");
  const [sales, setSales] = useState([]);
  const [total, setTotal] = useState(0);
  const [inventory, setInventory] = useState([]);
  const [learners, setLearners] = useState([]);
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);

  // Panier / caisse
  const [pick, setPick] = useState("");
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState([]);
  const [clientQuery, setClientQuery] = useState("");
  const [client, setClient] = useState(null);
  const [discount, setDiscount] = useState(""); // % remise globale
  const [payment, setPayment] = useState("");
  const [paid, setPaid] = useState(true);

  async function loadSales() {
    try { const r = await getSales(); setSales(r.data); setTotal(r.total); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  function loadInventory() { getInventory().then((r) => setInventory(r.data)).catch(() => {}); }
  useEffect(() => {
    loadSales();
    loadInventory();
    getStagiaires().then((r) => setLearners(r.data)).catch(() => {});
    getShopSettings().then((r) => { setSettings(r.data); setPayment((r.data.payment_methods || "").split(",")[0] || ""); }).catch(() => {});
  }, []);

  const payOptions = useMemo(
    () => (settings?.payment_methods || "Espèces,CB,Virement,Chèque").split(",").map((s) => s.trim()).filter(Boolean),
    [settings]
  );

  const grouped = useMemo(() => {
    const g = {};
    for (const it of inventory) { const c = it.category || "Autre"; (g[c] = g[c] || []).push(it); }
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0]));
  }, [inventory]);

  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return [];
    return learners.filter((l) => `${l.first_name} ${l.last_name} ${l.email || ""}`.toLowerCase().includes(q)).slice(0, 6);
  }, [clientQuery, learners]);

  function addToCart() {
    const it = inventory.find((i) => i.id === pick);
    if (!it) return;
    const n = Math.max(1, parseInt(qty, 10) || 1);
    setCart((c) => {
      const ex = c.find((l) => l.item_id === it.id);
      if (ex) return c.map((l) => (l.item_id === it.id ? { ...l, quantity: l.quantity + n } : l));
      return [...c, { item_id: it.id, name: it.name, quantity: n, unit_price: Number(it.unit_price || 0), tax_rate: Number(it.tax_rate || 0), disc: 0, stock: it.quantity }];
    });
    setPick(""); setQty(1);
  }
  const removeLine = (id) => setCart((c) => c.filter((l) => l.item_id !== id));
  const setLine = (id, patch) => setCart((c) => c.map((l) => (l.item_id === id ? { ...l, ...patch } : l)));

  const tvaApplies = settings ? !!settings.tva_applies : true;
  const totals = useMemo(() => {
    const d = Math.min(100, Math.max(0, Number(discount) || 0));
    const factor = 1 - d / 100;
    let ht = 0, tva = 0;
    for (const l of cart) {
      const lineHT = l.unit_price * l.quantity * (1 - (Number(l.disc) || 0) / 100) * factor;
      ht += lineHT;
      if (tvaApplies) tva += lineHT * l.tax_rate / 100;
    }
    return { ht, tva, ttc: ht + tva, discount: d };
  }, [cart, discount, tvaApplies]);

  async function validate() {
    if (cart.length === 0) return;
    setStatus(null);
    try {
      const r = await checkoutSale({
        learner_id: client?.id || null,
        discount: Number(discount) || 0,
        payment_method: payment || null,
        status: paid ? "PAYEE" : "IMPAYEE",
        lines: cart.map((l) => ({ item_id: l.item_id, quantity: l.quantity, discount_pct: Number(l.disc) || 0 })),
      });
      setCart([]); setClient(null); setClientQuery(""); setDiscount("");
      setStatus({ type: "success", message: `Vente validée — facture ${r.invoice_number} (${euro(r.total_ttc)} TTC) pour ${r.buyer}.` });
      loadSales(); loadInventory(); bumpBadges();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  async function remove(id) {
    try { await deleteSale(id); loadSales(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  return (
    <>
      <PageHead eyebrow="Boutique" title="Ventes de Matériels et Inventaire"
        lead="Point de vente du matériel : composez un panier, appliquez des remises, encaissez — la facture est créée automatiquement. Gérez le stock et les réglages de facturation dans les onglets." />
      <StatusMessage status={status} />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.v} className={"tab" + (tab === t.v ? " on" : "")} onClick={() => setTab(t.v)}>{t.label}</button>
        ))}
      </div>

      {tab === "caisse" && (
        <>
          <div className="grid cols-3" style={{ marginBottom: 16 }}>
            <Kpi label="Ventes" value={sales.length} />
            <Kpi label="Chiffre d'affaires (HT)" value={euro(total)} />
            <Kpi label="Panier moyen" value={euro(sales.length ? total / sales.length : 0)} />
          </div>

          <div className="grid cols-2">
            <Card title="Point de vente">
              <div className="row3" style={{ alignItems: "end" }}>
                <div className="field" style={{ gridColumn: "span 2" }}>
                  <label>Produit</label>
                  <select className="inp" value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">— Choisir un produit —</option>
                    {grouped.map(([cat, items]) => (
                      <optgroup key={cat} label={cat}>
                        {items.map((it) => (
                          <option key={it.id} value={it.id} disabled={it.quantity <= 0}>
                            {it.name} — {euro(it.unit_price || 0)} HT ({it.quantity} en stock)
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <Field label="Qté" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <button className="btn" onClick={addToCart} disabled={!pick}>＋ Ajouter au panier</button>

              <div className="divider" />
              <div className="field">
                <label>Client</label>
                {client ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(...client.name.split(" "))}</span>
                    <b style={{ flex: 1 }}>{client.name}</b>
                    <button className="btn sm ghost" onClick={() => { setClient(null); setClientQuery(""); }}>Changer</button>
                  </div>
                ) : (
                  <>
                    <input className="inp" placeholder="Rechercher un stagiaire… (ou laisser vide = vente comptoir)" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} />
                    {matches.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                        {matches.map((l) => (
                          <button key={l.id} className="btn sm" style={{ justifyContent: "flex-start" }}
                            onClick={() => setClient({ id: l.id, name: `${l.first_name} ${l.last_name}` })}>
                            {l.last_name} {l.first_name} <span className="hint">· {l.email || "—"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="row2">
                <div className="field"><label>Moyen de paiement</label>
                  <select className="inp" value={payment} onChange={(e) => setPayment(e.target.value)}>
                    {payOptions.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <label className="field" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
                  <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Payé à l'encaissement
                </label>
              </div>
            </Card>

            <Card title={`Panier (${cart.length})`}>
              {cart.length === 0 ? (
                <EmptyState icon="🧺">Panier vide. Ajoutez des produits.</EmptyState>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {cart.map((l) => (
                      <div key={l.item_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{l.name}</b>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{euro(l.unit_price)} HT · TVA {l.tax_rate}%</span>
                        </span>
                        <input type="number" min="1" max={l.stock} value={l.quantity} title="Quantité"
                          onChange={(e) => setLine(l.item_id, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          className="inp" style={{ width: 56 }} />
                        <input type="number" min="0" max="100" value={l.disc} title="Remise %"
                          onChange={(e) => setLine(l.item_id, { disc: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                          className="inp" style={{ width: 54 }} placeholder="%" />
                        <span className="mono" style={{ width: 74, textAlign: "right" }}>{euro(ttc(l.unit_price * l.quantity * (1 - (l.disc || 0) / 100), tvaApplies ? l.tax_rate : 0))}</span>
                        <button className="iconbtn del" title="Retirer" onClick={() => removeLine(l.item_id)}>🗑</button>
                      </div>
                    ))}
                  </div>
                  <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                    <label>Remise globale (%)</label>
                    <input className="inp" type="number" min="0" max="100" step="0.1" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ maxWidth: 140 }} />
                  </div>
                  <div style={{ marginTop: 12, fontSize: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}><span>Total HT{totals.discount > 0 ? ` (remise ${totals.discount}%)` : ""}</span><span className="mono">{euro(totals.ht)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}><span>TVA{tvaApplies ? "" : " (exonérée)"}</span><span className="mono">{euro(totals.tva)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 4 }}><span>Total TTC</span><span className="mono">{euro(totals.ttc)}</span></div>
                  </div>
                  <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={validate}>
                    Encaisser → créer la facture
                  </button>
                </>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === "historique" && (
        <Card title={`Historique (${sales.length})`}>
          {sales.length === 0 ? (
            <EmptyState icon="🛒">Aucune vente enregistrée.</EmptyState>
          ) : (
            <div className="tablewrap" style={{ border: "none" }}>
              <table>
                <thead><tr><th>Date</th><th>Produit</th><th>Client</th><th>Qté</th><th className="ta-r">Montant</th><th></th></tr></thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id}>
                      <td className="mono">{s.date}</td>
                      <td><b>{s.product}</b>{s.category ? <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{s.category}</span> : null}</td>
                      <td>{s.last_name ? `${s.last_name} ${s.first_name}` : "—"}</td>
                      <td>{s.quantity}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{euro(Number(s.amount) * (s.quantity || 1))}</td>
                      <td style={{ textAlign: "right" }}><button className="iconbtn del" title="Supprimer" onClick={() => remove(s.id)}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "inventaire" && <Inventaire embedded />}

      {tab === "reglages" && (
        <ShopSettings settings={settings} onSaved={(s) => { setSettings(s); setStatus({ type: "success", message: "Réglages enregistrés." }); }} onError={(m) => setStatus({ type: "error", message: m })} />
      )}
    </>
  );
}

function ShopSettings({ settings, onSaved, onError }) {
  const [form, setForm] = useState(() => ({
    invoice_prefix: settings?.invoice_prefix || "F",
    next_number: settings?.next_number || 1,
    payment_methods: settings?.payment_methods || "Espèces,CB,Virement,Chèque",
    legal_mentions: settings?.legal_mentions || "",
    tva_applies: settings ? !!settings.tva_applies : true,
  }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try { const r = await saveShopSettings(form); await Promise.resolve(r); onSaved({ ...form }); }
    catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <Card title="Réglages de facturation">
      <div className="row2">
        <div className="field"><label>Préfixe de numéro</label>
          <input className="inp" value={form.invoice_prefix} onChange={set("invoice_prefix")} placeholder="F" /></div>
        <div className="field"><label>Prochain numéro</label>
          <input className="inp" type="number" min="1" value={form.next_number} onChange={set("next_number")} /></div>
      </div>
      <p className="sub" style={{ marginTop: 0 }}>Exemple de numéro : <span className="mono">{form.invoice_prefix}-{new Date().getFullYear()}-{String(form.next_number).padStart(4, "0")}</span></p>
      <div className="field"><label>Moyens de paiement (séparés par des virgules)</label>
        <input className="inp" value={form.payment_methods} onChange={set("payment_methods")} placeholder="Espèces,CB,Virement,Chèque" /></div>
      <label className="field" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="checkbox" checked={form.tva_applies} onChange={(e) => setForm((p) => ({ ...p, tva_applies: e.target.checked }))} />
        Appliquer la TVA (décochez pour une facturation exonérée)
      </label>
      <div className="field"><label>Mentions légales (bas de facture)</label>
        <textarea className="inp" rows={3} value={form.legal_mentions} onChange={set("legal_mentions")} /></div>
      <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer les réglages"}</button>
    </Card>
  );
}

export default Ventes;
