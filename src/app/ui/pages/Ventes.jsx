import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import ImageLien from "../components/ImageLien.jsx";
import MoneyToggle from "../components/MoneyToggle.jsx";
import {
  getSales, deleteSale, getInventory, getStagiaires, checkoutSale,
  getShopSettings, downloadFacturX, getCompanies, getEmitters, getTemplates } from "../api/apiClient.js";
import PaiementSplit, { resolvePayments } from "../components/PaiementSplit.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import DataTable from "../components/DataTable.jsx";
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
];

function Ventes() {
  const [tab, setTab] = useState("caisse");
  const [sales, setSales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [learners, setLearners] = useState([]);
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  // Le téléchargement peut être REFUSÉ (aucun modèle de facture configuré, modèle qui n'est
  // plus de type FACTURE…). Le serveur renvoie alors un motif qui dit quoi corriger : il doit
  // arriver jusqu'à l'écran, pas mourir dans une promesse rejetée.
  const telechargerFacture = (id, numero) =>
    downloadFacturX(id, numero).catch((e) => setStatus({ type: "error", message: e.message }));

  // Panier / caisse
  const [pick, setPick] = useState("");
  const [qty, setQty] = useState(1);
  const [cart, setCart] = useState([]);
  const [clientQuery, setClientQuery] = useState("");
  const [client, setClient] = useState(null);
  // L'acheteur est de trois sortes exclusives : un stagiaire, une entreprise, ou personne
  // (comptoir). La bascule choisit d'abord LE TYPE — une seule liste cherchée à la fois, plutôt
  // qu'un champ qui mêle personnes et entreprises et laisse deviner ce qu'on a sous les yeux.
  const [buyerType, setBuyerType] = useState("stagiaire"); // "stagiaire" | "entreprise"
  const [companies, setCompanies] = useState([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [company, setCompany] = useState(null);
  // Quand l'entreprise paie, on peut RATTACHER un stagiaire (matériel destiné à un apprenant
  // précis) : c'est l'entreprise qui est facturée, le stagiaire n'est qu'un lien retrouvable.
  const [attachLearner, setAttachLearner] = useState(false);
  // Entité émettrice : sous quelle identité la facture sort. Vide = défaut du serveur. On ne
  // montre le sélecteur que s'il existe PLUSIEURS entités — sinon c'est du bruit.
  const [emitters, setEmitters] = useState([]);
  const [emitterId, setEmitterId] = useState("");
  // Modèle de facture choisi à la vente (OBLIGATOIRE) : la facture sort sous ce modèle.
  const [factureTemplates, setFactureTemplates] = useState([]);
  const [factureSlug, setFactureSlug] = useState("");
  const [discount, setDiscount] = useState(""); // % remise globale
  const [dueDate, setDueDate] = useState(""); // échéance de règlement (vide = à réception)
  // Répartition du règlement : une ligne par moyen, la dernière prenant le solde. Une seule
  // ligne = paiement simple. Le moyen se fixe quand les options chargent.
  const [payments, setPayments] = useState([{ method: "", amount: "" }]);
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
    getCompanies().then((r) => setCompanies(r.data || [])).catch(() => {});
    getEmitters().then((r) => {
      const list = r.data || [];
      setEmitters(list);
      setEmitterId((list.find((e) => e.is_default) || {}).id || ""); // présélectionne le défaut
    }).catch(() => {});
    getShopSettings().then((r) => setSettings(r.data)).catch(() => {});
    // Modèles de FACTURE actifs : le vendeur choisit lequel utiliser pour cette vente.
    getTemplates().then((r) => {
      const list = (r.data || []).filter((t) => String(t.doc_type || "").toUpperCase() === "FACTURE" && t.active !== false && t.active !== 0);
      setFactureTemplates(list);
      if (list.length === 1) setFactureSlug(list[0].slug); // un seul modèle : présélectionné
    }).catch(() => {});
  }, []);

  // L'émettrice choisie porte désormais TVA et moyens de paiement ; à défaut, on retombe sur les
  // réglages boutique, puis sur des valeurs par défaut. La caisse suit donc l'entité sélectionnée.
  const selectedEmitter = useMemo(() => emitters.find((e) => e.id === emitterId) || null, [emitters, emitterId]);
  const payOptions = useMemo(
    () => (selectedEmitter?.payment_methods || settings?.payment_methods || "Espèces,CB,Virement,Chèque")
      .split(",").map((s) => s.trim()).filter(Boolean),
    [selectedEmitter, settings]
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

  const companyMatches = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    if (!q) return [];
    return companies.filter((c) => `${c.name} ${c.siret || ""} ${c.email || ""}`.toLowerCase().includes(q)).slice(0, 6);
  }, [companyQuery, companies]);

  // Changer de type d'acheteur remet à zéro l'autre sélection : on ne facture jamais à la fois
  // une entreprise et un stagiaire au titre d'acheteur — le stagiaire n'est qu'un rattachement.
  function switchBuyerType(t) {
    setBuyerType(t);
    setClient(null); setClientQuery("");
    setCompany(null); setCompanyQuery("");
    setAttachLearner(false);
  }

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
  // Ajoute un article de la boutique au panier (une unité par clic), SANS dépasser le stock.
  function addItem(it) {
    const stock = Number(it.quantity) || 0;
    if (stock <= 0) return;
    setCart((c) => {
      const ex = c.find((l) => l.item_id === it.id);
      if (ex) {
        if (ex.quantity >= stock) return c; // stock atteint : on n'ajoute pas
        return c.map((l) => (l.item_id === it.id ? { ...l, quantity: Math.min(stock, l.quantity + 1) } : l));
      }
      return [...c, { item_id: it.id, name: it.name, quantity: 1, unit_price: Number(it.unit_price || 0), tax_rate: Number(it.tax_rate || 0), disc: "", stock }];
    });
  }
  const removeLine = (id) => setCart((c) => c.filter((l) => l.item_id !== id));
  const setLine = (id, patch) => setCart((c) => c.map((l) => (l.item_id === id ? { ...l, ...patch } : l)));

  // Cale les moyens de paiement sur les options disponibles : au chargement (ligne sans moyen),
  // et si l'émettrice change et retire un moyen qui n'existe plus.
  useEffect(() => {
    if (!payOptions.length) return;
    setPayments((rows) => {
      const fixed = rows.map((r) => (payOptions.includes(r.method) ? r : { ...r, method: payOptions[0] }));
      return fixed.length ? fixed : [{ method: payOptions[0], amount: "" }];
    });
  }, [payOptions]);

  const tvaApplies = selectedEmitter ? !!selectedEmitter.tva_applies : (settings ? !!settings.tva_applies : true);
  // Une remise de ligne exclut la remise globale, et réciproquement (cf. sale.controller.js) :
  // les deux se cumulaient, et 10 % sur l'article plus 5 % sur la vente faisaient 14,5 %.
  const remiseDeLigne = useMemo(() => cart.some((l) => Number(l.disc) > 0), [cart]);
  const remiseGlobale = Math.min(100, Math.max(0, Number(discount) || 0));

  const totals = useMemo(() => {
    let ht = 0, tva = 0;
    for (const l of cart) {
      // Le taux qui s'applique vraiment : celui de la ligne en mode ligne, sinon le global.
      const taux = remiseDeLigne ? (Number(l.disc) || 0) : remiseGlobale;
      // MÊME ARRONDI QUE LE SERVEUR : prix unitaire arrondi d'abord, puis multiplié. La caisse
      // arrondissait après la multiplication et pouvait donc afficher un centime de moins que
      // la facture émise — un ticket qui ne tombe pas sur le montant encaissé.
      const unitNet = Number((l.unit_price * (1 - taux / 100)).toFixed(2));
      const lineHT = Number((unitNet * l.quantity).toFixed(2));
      ht += lineHT;
      if (tvaApplies) tva += lineHT * l.tax_rate / 100;
    }
    return { ht, tva, ttc: ht + tva, discount: remiseDeLigne ? 0 : remiseGlobale };
  }, [cart, remiseDeLigne, remiseGlobale, tvaApplies]);

  async function validate() {
    if (cart.length === 0) return;
    if (!factureSlug) { setStatus({ type: "error", message: "Choisissez le modèle de facture avant d'encaisser." }); return; }
    setStatus(null);
    try {
      // Entreprise : elle est l'acheteur (company_id) ; le stagiaire n'est envoyé QUE si on l'a
      // explicitement rattaché. Stagiaire : lui seul, aucune entreprise.
      const buyerFields = buyerType === "entreprise"
        ? { company_id: company?.id || null, learner_id: (attachLearner && client?.id) || null }
        : { learner_id: client?.id || null, company_id: null };
      // Répartition résolue : montants saisis + solde sur le dernier moyen. On envoie la liste ;
      // le serveur revérifie que la somme tombe sur le TTC.
      const { parts } = resolvePayments(payments, totals.ttc);
      const r = await checkoutSale({
        ...buyerFields,
        billing_profile_id: emitterId || null,
        invoice_template_slug: factureSlug,
        // Une remise de ligne annule la globale — le champ est désactivé, mais son ANCIENNE
        // valeur reste en état si on remise un article après coup. L'envoyer ferait refuser la
        // vente par le serveur (les deux ne se cumulent plus) pour une saisie que l'opérateur
        // ne voit même plus à l'écran.
        discount: remiseDeLigne ? 0 : remiseGlobale,
        due_date: dueDate || null,
        payment_method: parts[0]?.method || null,   // rétro-compat : moyen principal
        payments: parts,
        status: paid ? "PAYEE" : "IMPAYEE",
        lines: cart.map((l) => ({ item_id: l.item_id, quantity: l.quantity, discount_pct: Number(l.disc) || 0 })),
      });
      setCart([]); switchBuyerType("stagiaire"); setDiscount(""); setDueDate("");
      setPayments([{ method: payOptions[0] || "", amount: "" }]);
      setLastInvoice({ id: r.invoice_id, number: r.invoice_number });
      setStatus({ type: "success", message: `Vente validée, facture ${r.invoice_number} (${euro(r.total_ttc)} TTC) pour ${r.buyer}.` });
      loadSales(); loadInventory(); bumpBadges();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  async function remove(id) {
    try { await deleteSale(id); loadSales(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  return (
    <>
      <PageHead eyebrow="Boutique" title="Ventes de Matériels et Inventaire"
        // C'est une CAISSE : quelqu'un attend sa monnaie. L'accroche portait quatre lignes de
        // mode d'emploi devant un écran qu'on ouvre pour encaisser en quinze secondes, et
        // décrivait des gestes que les onglets et les boutons annoncent déjà eux-mêmes.
        lead="La facture est créée automatiquement à l'encaissement."
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
              {/* Sans `catch`, un refus du serveur — modèle de facture non configuré, par
                  exemple — se perdait dans une promesse rejetée : le bouton ne faisait
                  simplement rien, sans un mot. */}
              <button className="btn sm" onClick={() => telechargerFacture(lastInvoice.id, lastInvoice.number)}><Icon name="download" size={14} /> Télécharger le PDF</button>
              <button className="iconbtn" onClick={() => setLastInvoice(null)} aria-label="Fermer"><Icon name="x" size={14} /></button>
            </div>
          )}
          {/* Caisse : boutique (catalogue) à gauche, panier avec client + paiement à droite. */}
          <div className="grid cols-2" style={{ alignItems: "start" }}>
            <Card title={<span className="card-ttl"><Icon name="package" size={16} /> Boutique, cliquer pour ajouter</span>}>
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
                    {posShown.map((it) => {
                      const inC = cart.find((l) => l.item_id === it.id)?.quantity || 0;
                      const atMax = it.quantity <= 0 || inC >= it.quantity; // stock épuisé ou déjà tout au panier
                      return (
                        <div key={it.id} className="shop-card">
                          {/* LA PHOTO À LA CAISSE (migration 133). On y vend en présence d'un
                              client, souvent sans connaître le catalogue par cœur : reconnaître
                              une veste ou une pelle d'un coup d'œil va plus vite que lire quinze
                              libellés. Plus petite que dans la boutique du stagiaire — celui-ci
                              choisit, l'opérateur RETROUVE — et absente s'il n'y a pas d'image,
                              plutôt qu'un cadre vide qui aurait l'air cassé. */}
                          <ImageLien src={it.image_url} className="pos-photo" fallback={null} />
                          {!posCat ? <span className="shop-rayon">{it.category || "Divers"}</span> : null}
                          <b className="shop-name">{it.name}</b>
                          <span className="shop-price"><b className="tnum">{euro(it.unit_price)} <span className="shop-unit">HT</span></b></span>
                          {it.quantity <= 0
                            ? <span className="shop-stock"><Icon name="clock" size={12} /> Rupture</span>
                            : <span className="hint" style={{ fontSize: 11 }}>{it.quantity} en stock{inC ? ` · ${inC} au panier` : ""}</span>}
                          <button className="btn sm shop-add" style={{ marginTop: 8, width: "100%" }} onClick={() => addItem(it)} disabled={atMax}>
                            <Icon name={atMax ? "check" : "plus"} size={14} /> {atMax ? (it.quantity <= 0 ? "Rupture" : "Stock atteint") : "Ajouter"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>

            {/* LE PANIER RESTE EN VUE pendant qu'on remplit la boutique. Le catalogue est long ;
                en descendant pour trouver un article, on perdait de vue ce qu'on avait déjà
                ajouté et le total à annoncer — sur une caisse, devant quelqu'un qui attend.
                Il se colle sous la barre supérieure (63 px), et se libère dès que la colonne
                passe sous la boutique en écran étroit : collé sur une pile verticale, il
                masquerait le catalogue qu'on essaie de parcourir. */}
            <Card className="panier-colle" title={<span className="card-ttl"><Icon name="shopping-cart" size={16} /> Panier ({cart.length})</span>}>
              {/* Acheteur + moyen de paiement, en tête du panier. */}
              <div className="field">
                <label>Acheteur</label>
                {/* Bascule du type : une seule liste cherchée à la fois. */}
                <div className="rayon-tabs" style={{ marginBottom: 8 }}>
                  <button className={"rayon-tab" + (buyerType === "stagiaire" ? " on" : "")} onClick={() => switchBuyerType("stagiaire")}>
                    <Icon name="user" size={13} /> Stagiaire
                  </button>
                  <button className={"rayon-tab" + (buyerType === "entreprise" ? " on" : "")} onClick={() => switchBuyerType("entreprise")}>
                    <Icon name="building" size={13} /> Entreprise
                  </button>
                </div>

                {buyerType === "stagiaire" ? (
                  client ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(...client.name.split(" "))}</span>
                      <b style={{ flex: 1 }}>{client.name}</b>
                      <button className="btn sm ghost" onClick={() => { setClient(null); setClientQuery(""); }}>Changer</button>
                    </div>
                  ) : (
                    <>
                      <input className="inp" aria-label="Rechercher un stagiaire à qui rattacher la vente" placeholder="Rechercher un stagiaire… (ou laisser vide = vente comptoir)" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} />
                      {matches.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                          {matches.map((l) => (
                            <button key={l.id} className="btn sm" style={{ justifyContent: "flex-start" }}
                              onClick={() => setClient({ id: l.id, name: `${l.first_name} ${l.last_name}` })}>
                              {l.last_name} {l.first_name} <span className="hint">· {l.email || "-"}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )
                ) : (
                  <>
                    {company ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Icon name="building" size={18} />
                        <b style={{ flex: 1 }}>{company.name}</b>
                        <button className="btn sm ghost" onClick={() => { setCompany(null); setCompanyQuery(""); }}>Changer</button>
                      </div>
                    ) : (
                      <>
                        <input className="inp" placeholder="Rechercher une entreprise…" value={companyQuery} onChange={(e) => setCompanyQuery(e.target.value)} />
                        {companyMatches.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                            {companyMatches.map((c) => (
                              <button key={c.id} className="btn sm" style={{ justifyContent: "flex-start" }}
                                onClick={() => setCompany({ id: c.id, name: c.name })}>
                                {c.name} <span className="hint">· {c.siret || "SIRET, "}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {companyQuery.trim() && companyMatches.length === 0 && (
                          <span className="hint" style={{ marginTop: 6 }}>Aucune entreprise. Créez-la dans Entreprises.</span>
                        )}
                      </>
                    )}

                    {/* Rattacher un stagiaire, sans changer l'acheteur : la facture reste au nom
                        de l'entreprise, le stagiaire sert à retrouver la vente. */}
                    <label className="field" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                      <input type="checkbox" checked={attachLearner} onChange={(e) => { setAttachLearner(e.target.checked); if (!e.target.checked) { setClient(null); setClientQuery(""); } }} />
                      Rattacher un stagiaire à cette vente
                    </label>
                    {attachLearner && (
                      client ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>{initials(...client.name.split(" "))}</span>
                          <span style={{ flex: 1 }}>{client.name}</span>
                          <button className="btn sm ghost" onClick={() => { setClient(null); setClientQuery(""); }}>Changer</button>
                        </div>
                      ) : (
                        <>
                          <input className="inp" placeholder="Rechercher le stagiaire concerné…" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} />
                          {matches.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                              {matches.map((l) => (
                                <button key={l.id} className="btn sm" style={{ justifyContent: "flex-start" }}
                                  onClick={() => setClient({ id: l.id, name: `${l.first_name} ${l.last_name}` })}>
                                  {l.last_name} {l.first_name} <span className="hint">· {l.email || "-"}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )
                    )}
                  </>
                )}
              </div>

              {/* Modèle de facture (OBLIGATOIRE) : le vendeur choisit le type de facture à émettre. */}
              <div className="field">
                <label>Modèle de facture <span style={{ color: "var(--ember1)" }}>*</span></label>
                <select className="inp" value={factureSlug} onChange={(e) => setFactureSlug(e.target.value)}
                  style={!factureSlug ? { borderColor: "var(--ember1)" } : undefined}>
                  <option value="">Choisir le type de facture</option>
                  {factureTemplates.map((t) => (
                    <option key={t.slug} value={t.slug}>{t.label || t.slug}</option>
                  ))}
                </select>
                {factureTemplates.length === 0 && (
                  <p className="hint" style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ember1)" }}>
                    Aucun modèle de type FACTURE. Créez-en un dans Modèles de documents.
                  </p>
                )}
              </div>

              {/* Sous quelle identité la facture sort — seulement s'il y a un choix à faire. */}
              {emitters.length > 1 && (
                <div className="field">
                  <label>Facturer au nom de</label>
                  <select className="inp" value={emitterId} onChange={(e) => setEmitterId(e.target.value)}>
                    {emitters.map((em) => (
                      <option key={em.id} value={em.id}>{em.label || em.legal_name}{em.is_default ? " (défaut)" : ""}</option>
                    ))}
                  </select>
                </div>
              )}

              <PaiementSplit options={payOptions} total={totals.ttc} rows={payments} onChange={setPayments} />
              <div className="row2">
                <div className="field"><label>Échéance de règlement</label>
                  <input className="inp" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <label className="field" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
                  <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} /> Payé à l'encaissement
                </label>
              </div>
              <div className="divider" />
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
                        <input type="number" min="1" max={l.stock} value={l.quantity} title={`Quantité (max ${l.stock} en stock)`}
                          onChange={(e) => setLine(l.item_id, { quantity: Math.min(Number(l.stock) || 1, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
                          className="inp" style={{ width: 76, flex: "0 0 auto", textAlign: "center" }} />
                        <input type="number" min="0" max="100" value={l.disc}
                          disabled={remiseGlobale > 0}
                          title={remiseGlobale > 0
                            ? "Une remise globale est saisie : les deux ne se cumulent pas."
                            : "Remise %"}
                          onChange={(e) => { const v = e.target.value; setLine(l.item_id, { disc: v === "" ? "" : Math.min(100, Math.max(0, Number(v) || 0)) }); }}
                          className="inp" style={{ width: 76, flex: "0 0 auto", textAlign: "center" }} placeholder="%" />
                        {/* Le montant de ligne suit le MÊME arrondi que le serveur (prix unitaire
                            d'abord), sinon le ticket ne tombe pas sur ce qui est facturé. */}
                        <span className="mono" style={{ width: 74, textAlign: "right" }}>
                          {euro(ttc(
                            Number((l.unit_price * (1 - (remiseDeLigne ? (Number(l.disc) || 0) : remiseGlobale) / 100)).toFixed(2)) * l.quantity,
                            tvaApplies ? l.tax_rate : 0))}
                        </span>
                        <button className="iconbtn del" title="Retirer" onClick={() => removeLine(l.item_id)}><Icon name="trash" size={15} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                    <label>Remise globale (%)</label>
                    <input className="inp" type="number" min="0" max="100" step="0.1" placeholder="0"
                      value={remiseDeLigne ? "" : discount}
                      disabled={remiseDeLigne}
                      title={remiseDeLigne ? "Un article porte déjà une remise : les deux ne se cumulent pas." : undefined}
                      onChange={(e) => setDiscount(e.target.value)} style={{ maxWidth: 140 }} />
                    {remiseDeLigne && (
                      <p className="hint" style={{ margin: "6px 0 0" }}>
                        Un article porte une remise : la remise globale ne s'applique pas en plus.
                        Retire les remises des articles pour remiser toute la vente d'un coup.
                      </p>
                    )}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}><span>Total HT{totals.discount > 0 ? ` (remise ${totals.discount}%)` : ""}</span><span className="mono">{euro(totals.ht)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)" }}><span>TVA{tvaApplies ? "" : " (exonérée)"}</span><span className="mono">{euro(totals.tva)}</span></div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 4 }}><span>Total TTC</span><span className="mono">{euro(totals.ttc)}</span></div>
                  </div>
                  {/* On bloque l'encaissement si le règlement dépasse le total : une répartition
                      qui ne boucle pas ne doit pas partir. (Sans surcoût quand c'est payé.) */}
                  {(() => {
                    const trop = paid && !resolvePayments(payments, totals.ttc).valid;
                    const sansModele = !factureSlug; // modèle de facture obligatoire
                    const motif = trop ? "La répartition des paiements dépasse le total"
                      : sansModele ? "Choisissez le modèle de facture" : undefined;
                    return (
                      <button className="btn primary" style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
                        onClick={validate} disabled={trop || sansModele} title={motif}>
                        Encaisser → créer la facture
                      </button>
                    );
                  })()}
                </>
              )}
            </Card>
          </div>
        </>
      )}

      {tab === "historique" && <SalesHistory sales={sales} onRemove={remove} onDownload={telechargerFacture} />}

      {tab === "inventaire" && <Inventaire embedded />}

    </>
  );
}

// Historique des ventes : chiffre d'affaires + sélection de période (dates / raccourcis).
/* `onDownload` vient du parent : `telechargerFacture` y est défini avec sa gestion
   d'erreur (setStatus). Il était appelé ici sans être dans la portée — le bouton
   « Télécharger la facture » levait donc une ReferenceError au clic. */
function SalesHistory({ sales, onRemove, onDownload }) {
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
          // L'entreprise acheteuse prime dans l'affichage : c'est elle qui a payé. À défaut, le
          // stagiaire ; à défaut encore, un tiret pour une vente comptoir.
          date: s.date, client: s.company_name || (s.last_name ? `${s.last_name} ${s.first_name || ""}`.trim() : "-"),
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
        <Kpi label={`Chiffre d'affaires HT${allTime ? "" : " (période)"}`} value={euro(ca)} icon="euro" tone="green" />
        <Kpi label="Articles vendus" value={units} icon="package" tone="blue" countUp />
        <Kpi label="Ventes / factures" value={groups.length} icon="receipt" tone="blue" countUp />
      </div>
      <Card title="Historique des ventes">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 14 }}>
          <div className="field" style={{ margin: 0 }}><label htmlFor="ventes-du">Du</label><input id="ventes-du" className="inp" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}><label htmlFor="ventes-au">Au</label><input id="ventes-au" className="inp" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button className="btn sm ghost" onClick={thisMonth}>Ce mois</button>
          <button className="btn sm ghost" onClick={last30}>30 jours</button>
          <button className="btn sm ghost" onClick={thisYear}>Cette année</button>
          {!allTime && <button className="btn sm ghost" onClick={clear}>Tout</button>}
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="cart">{allTime ? "Aucune vente enregistrée." : "Aucune vente sur cette période."}</EmptyState>
        ) : (
          <DataTable
            rows={groups}
            rowKey={(g) => g.key}
            /* La ligne entière déplie — la petite flèche n'était qu'un raccourci. `aria-expanded`
               dit l'état, que le chevron montre déjà à l'œil. */
            rowProps={(g) => ({
              style: { cursor: "pointer" },
              role: "button",
              tabIndex: 0,
              "aria-expanded": open.has(g.key),
              "aria-label": `${open.has(g.key) ? "Replier" : "Voir"} le détail de ${g.invoice_number || "la vente directe"} du ${g.date}`,
              onClick: () => toggle(g.key),
              onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(g.key); } },
            })}
            /* Le DÉTAIL d'une vente : ses lignes d'articles. `null` quand la vente est repliée
               — c'est la page qui tient cet état, le tableau ne fait que l'accueillir. */
            detail={(g) => (open.has(g.key) ? (
              <div className="dt-detail-liste">
                {g.lines.map((s) => (
                  <div className="dt-detail-ligne" key={s.id}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{s.product}</b>{s.category ? <span className="hint"> · {s.category}</span> : null}
                    </span>
                    <span className="qte">×{s.quantity}</span>
                    <span className="prix mono">{euro(Number(s.amount) * (s.quantity || 1))}</span>
                    <button className="iconbtn del" title="Supprimer cette ligne"
                      aria-label={`Supprimer ${s.product}`}
                      onClick={(e) => { e.stopPropagation(); onRemove(s.id); }}><Icon name="trash" size={14} /></button>
                  </div>
                ))}
              </div>
            ) : null)}
            cols={[
              { k: "plier", t: "", sansCarte: true, th: { width: 34 },
                cell: (g) => <Icon name={open.has(g.key) ? "chevron-down" : "chevron-right"} size={15} aria-hidden="true" /> },
              { k: "facture", t: "Facture", principal: true,
                cell: (g) => (g.invoice_number ? <b>{g.invoice_number}</b> : <span className="hint">Vente directe</span>) },
              { k: "date", t: "Date", cell: (g) => <span className="mono">{g.date}</span> },
              { k: "client", t: "Client", cell: (g) => g.client || null },
              { k: "articles", t: "Articles",
                // `{" "}` explicite : l'espace entre l'accolade et la balise disparaît à la
                // compilation, et on lisait « 6(6 lignes) ».
                cell: (g) => <>{g.units}{" "}<span className="hint">({g.lines.length} ligne{g.lines.length > 1 ? "s" : ""})</span></> },
              { k: "total", t: "Montant HT", th: { className: "ta-r" }, td: { textAlign: "right" },
                cell: (g) => <span className="mono tnum">{euro(g.total)}</span> },
              { k: "actions", t: "", actions: true, td: { textAlign: "right" },
                cell: (g) => (g.invoice_id ? (
                  <button className="iconbtn" title="Télécharger la facture (PDF)"
                    aria-label={`Télécharger la facture ${g.invoice_number || ""}`}
                    onClick={(e) => { e.stopPropagation(); onDownload(g.invoice_id, g.invoice_number || "facture"); }}><Icon name="download" size={15} /></button>
                ) : null) },
            ]}
          />
        )}
      </Card>
    </>
  );
}

export default Ventes;
