import { useEffect, useMemo, useState } from "react";
import { getSales, deleteSale, getInventory, getStagiaires, checkoutSale } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { euro, initials } from "../lib/format.js";
import { bumpBadges } from "../lib/events.js";

const ttc = (ht, rate) => Number(ht || 0) * (1 + Number(rate || 0) / 100);

function Ventes() {
  const [sales, setSales] = useState([]);
  const [total, setTotal] = useState(0);
  const [inventory, setInventory] = useState([]);
  const [learners, setLearners] = useState([]);
  const [status, setStatus] = useState(null);

  // Panier / caisse
  const [pick, setPick] = useState("");
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState([]);
  const [clientQuery, setClientQuery] = useState("");
  const [client, setClient] = useState(null); // { id, name } ou null (comptoir)
  const [discount, setDiscount] = useState(""); // % remise

  async function loadSales() {
    try {
      const r = await getSales();
      setSales(r.data);
      setTotal(r.total);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => {
    loadSales();
    getInventory().then((r) => setInventory(r.data)).catch(() => {});
    getStagiaires().then((r) => setLearners(r.data)).catch(() => {});
  }, []);

  // Produits groupés par catégorie pour le menu déroulant.
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
      return [...c, { item_id: it.id, name: it.name, quantity: n, unit_price: Number(it.unit_price || 0), tax_rate: Number(it.tax_rate || 0), stock: it.quantity }];
    });
    setPick(""); setQty(1);
  }
  const removeLine = (id) => setCart((c) => c.filter((l) => l.item_id !== id));

  const totals = useMemo(() => {
    const d = Math.min(100, Math.max(0, Number(discount) || 0));
    const factor = 1 - d / 100;
    let ht = 0, tva = 0;
    for (const l of cart) { const line = l.unit_price * l.quantity * factor; ht += line; tva += line * l.tax_rate / 100; }
    return { ht, tva, ttc: ht + tva, discount: d };
  }, [cart, discount]);

  async function validate() {
    if (cart.length === 0) return;
    setStatus(null);
    try {
      const r = await checkoutSale({ learner_id: client?.id || null, discount: Number(discount) || 0, lines: cart.map((l) => ({ item_id: l.item_id, quantity: l.quantity })) });
      setCart([]); setClient(null); setClientQuery(""); setDiscount("");
      setStatus({ type: "success", message: `Vente validée — facture ${r.invoice_number} créée pour ${r.buyer}.` });
      loadSales();
      getInventory().then((res) => setInventory(res.data)).catch(() => {});
      bumpBadges();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  async function remove(id) {
    try { await deleteSale(id); loadSales(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  return (
    <>
      <PageHead eyebrow="Développement" title="Ventes de matériel" lead="Point de vente : composez un panier, choisissez le client, validez — la facture est créée automatiquement." />
      <StatusMessage status={status} />

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <Kpi label="Ventes" value={sales.length} />
        <Kpi label="Chiffre d'affaires (HT)" value={euro(total)} />
        <Kpi label="Panier moyen" value={euro(sales.length ? total / sales.length : 0)} />
      </div>

      <div className="grid cols-2">
        {/* Caisse */}
        <Card title="🛒 Point de vente">
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

          {/* Client */}
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
        </Card>

        {/* Panier */}
        <Card title={`Panier (${cart.length})`}>
          {cart.length === 0 ? (
            <EmptyState icon="🧺">Panier vide. Ajoutez des produits.</EmptyState>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cart.map((l) => (
                  <div key={l.item_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <span style={{ flex: 1 }}>
                      <b>{l.name}</b> <span className="hint">× {l.quantity}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{euro(l.unit_price)} HT · TVA {l.tax_rate}%</span>
                    </span>
                    <span className="mono">{euro(ttc(l.unit_price * l.quantity, l.tax_rate))}</span>
                    <button className="iconbtn del" title="Retirer" onClick={() => removeLine(l.item_id)}>🗑</button>
                  </div>
                ))}
              </div>
              <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                <label>Remise (%)</label>
                <input className="inp" type="number" min="0" max="100" step="0.1" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} style={{ maxWidth: 140 }} />
              </div>
              <div style={{ marginTop: 12, fontSize: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}><span>Total HT{totals.discount > 0 ? ` (remise ${totals.discount}%)` : ""}</span><span className="mono">{euro(totals.ht)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}><span>TVA</span><span className="mono">{euro(totals.tva)}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 4 }}><span>Total TTC</span><span className="mono">{euro(totals.ttc)}</span></div>
              </div>
              <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }} onClick={validate}>
                Valider la vente → créer la facture
              </button>
            </>
          )}
        </Card>
      </div>

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
    </>
  );
}

export default Ventes;
