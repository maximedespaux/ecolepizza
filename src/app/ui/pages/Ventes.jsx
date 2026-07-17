import { Fragment, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import MoneyToggle from "../components/MoneyToggle.jsx";
import {
  getSales, deleteSale, getInventory, getStagiaires, checkoutSale,
  getShopSettings, saveShopSettings, downloadFacturX,
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
  { v: "historique", label: "Historique des ventes" },
  { v: "inventaire", label: "Inventaire" },
  { v: "reglages", label: "Réglages" },
];

function Ventes() {
  const [tab, setTab] = useState("caisse");
  const [sales, setSales] = useState([]);
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
  const [lastInvoice, setLastInvoice] = useState(null); // facture créée (pour télécharger le PDF)

  async function loadSales() {
    try { const r = await getSales(); setSales(r.data); }
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

  // « Boutique » importée dans la caisse : catalogue des articles à prix (mêmes articles
  // que la boutique du stagiaire — inventory_item avec un prix), en grille cliquable.
  const [posCat, setPosCat] = useState("");
  const posItems = useMemo(() => inventory.filter((i) => i.unit_price != null), [inventory]);
  const posCats = useMemo(() => [...new Set(posItems.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [posItems]);
  const posShown = posCat ? posItems.filter((i) => i.category === posCat) : posItems;

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
      return [...c, { item_id: it.id, name: it.name, quantity: n, unit_price: Number(it.unit_price || 0), tax_rate: Number(it.tax_rate || 0), disc: "", stock: it.quantity }];
    });
    setPick(""); setQty(1);
  }
  // Ajoute un article de la boutique au panier (une unité par clic).
  function addItem(it) {
    setCart((c) => {
      const ex = c.find((l) => l.item_id === it.id);
      if (ex) return c.map((l) => (l.item_id === it.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { item_id: it.id, name: it.name, quantity: 1, unit_price: Number(it.unit_price || 0), tax_rate: Number(it.tax_rate || 0), disc: "", stock: it.quantity }];
    });
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
      setLastInvoice({ id: r.invoice_id, number: r.invoice_number });
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
        lead="Point de vente du matériel : composez un panier, appliquez des remises, encaissez — la facture est créée automatiquement. Gérez le stock et les réglages de facturation dans les onglets."
        actions={<MoneyToggle />} />
      <StatusMessage status={status} />

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.v} className={"tab" + (tab === t.v ? " on" : "")} onClick={() => setTab(t.v)}>{t.label}</button>
        ))}
      </div>

      {tab === "caisse" && (
        <>
          {lastInvoice && (
            <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, borderLeft: "3px solid var(--green)" }}>
              <Icon name="receipt" size={18} />
              <span style={{ flex: 1 }}>Facture <b>{lastInvoice.number}</b> créée avec les articles sélectionnés.</span>
              <button className="btn sm" onClick={() => downloadFacturX(lastInvoice.id, lastInvoice.number)}><Icon name="download" size={14} /> Télécharger le PDF</button>
              <button className="iconbtn" onClick={() => setLastInvoice(null)} aria-label="Fermer"><Icon name="x" size={14} /></button>
            </div>
          )}
          {/* Boutique importée : grille d'articles cliquable pour composer le panier. */}
          <div style={{ marginBottom: 16 }}>
            <Card title={<span className="card-ttl"><Icon name="package" size={16} /> Boutique — cliquer pour ajouter</span>}>
              {posItems.length === 0 ? (
                <EmptyState icon="package">Aucun article en boutique. Ajoute un prix aux articles dans l'onglet Inventaire.</EmptyState>
              ) : (
                <>
                  <div className="rayon-tabs" style={{ marginBottom: 12 }}>
                    <button className={"rayon-tab" + (posCat === "" ? " on" : "")} onClick={() => setPosCat("")}>Tout ({posItems.length})</button>
                    {posCats.map((c) => (
                      <button key={c} className={"rayon-tab" + (posCat === c ? " on" : "")} onClick={() => setPosCat(c)}>{c}</button>
                    ))}
                  </div>
                  <div className="shop-grid">
                    {posShown.map((it) => (
                      <div key={it.id} className="shop-card">
                        {!posCat ? <span className="shop-rayon">{it.category || "Divers"}</span> : null}
                        <b className="shop-name">{it.name}</b>
                        <span className="shop-price"><b className="tnum">{euro(it.unit_price)} <span className="shop-unit">HT</span></b></span>
                        {it.quantity <= 0
                          ? <span className="shop-stock"><Icon name="clock" size={12} /> Rupture</span>
                          : <span className="hint" style={{ fontSize: 11 }}>{it.quantity} en stock</span>}
                        <button className="btn sm shop-add" style={{ marginTop: 8, width: "100%" }} onClick={() => addItem(it)} disabled={it.quantity <= 0}>
                          <Icon name="plus" size={14} /> Ajouter
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
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
                <EmptyState icon="package">Panier vide. Ajoutez des produits.</EmptyState>
              ) : (
                <>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--dim)" }}>
                      <span style={{ flex: 1, minWidth: 0 }}>Article</span>
                      <span style={{ width: 76, textAlign: "center" }}>Qté</span>
                      <span style={{ width: 76, textAlign: "center" }}>Remise %</span>
                      <span style={{ width: 74, textAlign: "right" }}>Total TTC</span>
                      <span style={{ width: 32, flex: "0 0 32px" }} />
                    </div>
                    {cart.map((l) => (
                      <div key={l.item_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border-soft)" }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{l.name}</b>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{euro(l.unit_price)} HT · TVA {l.tax_rate}%</span>
                        </span>
                        <input type="number" min="1" max={l.stock} value={l.quantity} title="Quantité"
                          onChange={(e) => setLine(l.item_id, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                          className="inp" style={{ width: 76, flex: "0 0 auto", textAlign: "center" }} />
                        <input type="number" min="0" max="100" value={l.disc} title="Remise %"
                          onChange={(e) => { const v = e.target.value; setLine(l.item_id, { disc: v === "" ? "" : Math.min(100, Math.max(0, Number(v) || 0)) }); }}
                          className="inp" style={{ width: 76, flex: "0 0 auto", textAlign: "center" }} placeholder="%" />
                        <span className="mono" style={{ width: 74, textAlign: "right" }}>{euro(ttc(l.unit_price * l.quantity * (1 - (l.disc || 0) / 100), tvaApplies ? l.tax_rate : 0))}</span>
                        <button className="iconbtn del" title="Retirer" onClick={() => removeLine(l.item_id)}><Icon name="trash" size={15} /></button>
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

      {tab === "historique" && <SalesHistory sales={sales} onRemove={remove} />}

      {tab === "inventaire" && <Inventaire embedded />}

      {tab === "reglages" && (
        <ShopSettings settings={settings} onSaved={(s) => { setSettings(s); setStatus({ type: "success", message: "Réglages enregistrés." }); }} onError={(m) => setStatus({ type: "error", message: m })} />
      )}
    </>
  );
}

// Historique des ventes : chiffre d'affaires + sélection de période (dates / raccourcis).
function SalesHistory({ sales, onRemove }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState(() => new Set()); // factures dépliées
  const toggle = (k) => setOpen((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const filtered = useMemo(
    () => sales.filter((s) => (!from || s.date >= from) && (!to || s.date <= to)),
    [sales, from, to]
  );
  // Regroupe les lignes de vente par facture (invoice_id). Les ventes sans facture
  // (saisie directe / antérieures à la migration) forment chacune leur propre groupe.
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of filtered) {
      const key = s.invoice_id || `sale:${s.id}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key, invoice_id: s.invoice_id || null, invoice_number: s.invoice_number || null,
          date: s.date, client: s.last_name ? `${s.last_name} ${s.first_name || ""}`.trim() : "—",
          lines: [], total: 0, units: 0,
        };
        map.set(key, g);
      }
      g.lines.push(s);
      g.total += Number(s.amount) * (s.quantity || 1);
      g.units += Number(s.quantity) || 1;
    }
    return [...map.values()];
  }, [filtered]);

  const ca = useMemo(() => filtered.reduce((sum, s) => sum + Number(s.amount) * (s.quantity || 1), 0), [filtered]);
  const units = useMemo(() => filtered.reduce((sum, s) => sum + (Number(s.quantity) || 1), 0), [filtered]);

  const ymd = (d) => d.toISOString().slice(0, 10);
  const thisMonth = () => { const d = new Date(); setFrom(ymd(new Date(d.getFullYear(), d.getMonth(), 1))); setTo(ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0))); };
  const last30 = () => { const t = new Date(), f = new Date(); f.setDate(f.getDate() - 29); setFrom(ymd(f)); setTo(ymd(t)); };
  const thisYear = () => { const y = new Date().getFullYear(); setFrom(`${y}-01-01`); setTo(`${y}-12-31`); };
  const clear = () => { setFrom(""); setTo(""); };
  const allTime = !from && !to;

  return (
    <>
      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <Kpi label={`Chiffre d'affaires HT${allTime ? "" : " (période)"}`} value={euro(ca)} />
        <Kpi label="Articles vendus" value={units} />
        <Kpi label="Ventes / factures" value={groups.length} />
      </div>
      <Card title="Historique des ventes">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 14 }}>
          <div className="field" style={{ margin: 0 }}><label>Du</label><input className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}><label>Au</label><input className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn sm ghost" onClick={thisMonth}>Ce mois</button>
          <button className="btn sm ghost" onClick={last30}>30 jours</button>
          <button className="btn sm ghost" onClick={thisYear}>Cette année</button>
          {!allTime && <button className="btn sm ghost" onClick={clear}>Tout</button>}
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="cart">{allTime ? "Aucune vente enregistrée." : "Aucune vente sur cette période."}</EmptyState>
        ) : (
          <div className="tablewrap" style={{ border: "none" }}>
            <table>
              <thead><tr><th style={{ width: 34 }}></th><th>Date</th><th>Facture</th><th>Client</th><th>Articles</th><th className="ta-r">Montant HT</th><th></th></tr></thead>
              <tbody>
                {groups.map((g) => {
                  const isOpen = open.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <tr style={{ cursor: "pointer" }} onClick={() => toggle(g.key)}>
                        <td><button className="iconbtn" title={isOpen ? "Réduire" : "Voir le détail"} onClick={(e) => { e.stopPropagation(); toggle(g.key); }}><Icon name={isOpen ? "chevron-down" : "chevron-right"} size={15} /></button></td>
                        <td className="mono">{g.date}</td>
                        <td>{g.invoice_number ? <b>{g.invoice_number}</b> : <span className="hint">Vente directe</span>}</td>
                        <td>{g.client}</td>
                        <td>{g.units} <span className="hint">({g.lines.length} ligne{g.lines.length > 1 ? "s" : ""})</span></td>
                        <td className="mono tnum" style={{ textAlign: "right" }}>{euro(g.total)}</td>
                        <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
                          {g.invoice_id && (
                            <button className="iconbtn" title="Télécharger la facture (PDF)" onClick={() => downloadFacturX(g.invoice_id, g.invoice_number || "facture")}><Icon name="download" size={15} /></button>
                          )}
                        </td>
                      </tr>
                      {isOpen && g.lines.map((s) => (
                        <tr key={s.id} style={{ background: "var(--surface2)" }}>
                          <td></td>
                          <td className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>{s.date}</td>
                          <td colSpan={2}><b>{s.product}</b>{s.category ? <span className="hint"> · {s.category}</span> : null}</td>
                          <td>{s.quantity}</td>
                          <td className="mono tnum" style={{ textAlign: "right" }}>{euro(Number(s.amount) * (s.quantity || 1))}</td>
                          <td style={{ textAlign: "right" }}><button className="iconbtn del" title="Supprimer cette ligne" onClick={() => onRemove(s.id)}><Icon name="trash" size={14} /></button></td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
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
