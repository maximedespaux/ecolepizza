import { useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import MoneyToggle from "../components/MoneyToggle.jsx";
import { getInventory, createItem, adjustItem, deleteItem, updateItem } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import Badge from "../components/Badge.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { euro } from "../lib/format.js";
import { bumpBadges } from "../lib/events.js";

const CATEGORIES = [
  "Four", "Pétrin", "Matière première", "Accessoire", "Livre", "Autre",
  // Sous-catégories matériel Gi.Metal
  "Pelle à enfourner", "Pelle à défourner", "Pelle napolitaine", "Nettoyage",
  "Spatule", "Coupe-pâte / Roulette", "Cuisson / Plaque", "Support pelle",
  "Thermomètre", "Louche", "Biberon", "Textile",
];
const TVA_RATES = ["20", "10", "5.5", "2.1", "0"];
const EMPTY = { name: "", category: "", sku: "", quantity: 0, unit_price: "", tax_rate: "20", threshold: 0,
  remiseValeur: "", remiseUnite: "%" };

// Icône par (sous-)catégorie — vignette visuelle à défaut de photo produit.
const CAT_ICON = {
  "Pelle à enfourner": "pizza", "Pelle à défourner": "pizza", "Pelle napolitaine": "pizza",
  "Cuisson / Plaque": "flame", "Nettoyage": "spray-can", "Spatule": "utensils", "Louche": "utensils",
  "Coupe-pâte / Roulette": "scissors", "Thermomètre": "thermometer", "Biberon": "droplet",
  "Textile": "shirt", "Support pelle": "package", "Four": "flame", "Pétrin": "settings",
  "Matière première": "package", "Accessoire": "package", "Livre": "file-text", "Autre": "package",
};
const catIcon = (c) => CAT_ICON[c] || "package";

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

  /* La seule question qu'on pose à un inventaire : QU'EST-CE QUI EST BAS ? Elle n'avait aucune
     réponse visuelle — un compteur annonçait « 1 », à charge d'aller le trouver parmi trente
     catégories et cent quatre-vingt-sept commandes. Les articles concernés sont maintenant
     NOMMÉS en tête, le plus bas d'abord, et mènent à leur fiche au clic.
     Le filtre passe par `stockState`, celui-là même qui étiquette chaque article : deux règles
     de seuil écrites séparément finiraient par diverger, et la bande contredirait les badges. */
  const aReappro = useMemo(
    () => items.filter((it) => stockState(it).tone !== "g").sort((a, b) => a.quantity - b.quantity),
    [items]
  );

  // Regroupe l'inventaire par (sous-)catégorie ; sections triées alpha.
  const grouped = useMemo(() => {
    const g = {};
    for (const it of items) { const c = it.category || "Autre"; (g[c] ||= []).push(it); }
    return Object.entries(g).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  }, [items]);
  // Catégories connues (par défaut + présentes) pour l'autocomplétion.
  const allCats = useMemo(() => {
    const s = new Set(CATEGORIES);
    for (const it of items) if (it.category) s.add(it.category);
    return [...s].sort((a, b) => a.localeCompare(b, "fr"));
  }, [items]);

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  /* La remise se saisit en UNE valeur + une unité, mais se stocke en DEUX colonnes. La
   * conversion vit ici, à un seul endroit : l'unité non retenue part à "" pour être EFFACÉE
   * côté serveur — sinon basculer de 10 % à 5 € laisserait les deux en base, et c'est le
   * montant qui gagnerait sans qu'on comprenne pourquoi. */
  const versColonnes = ({ remiseValeur, remiseUnite, ...reste }) => {
    const v = String(remiseValeur ?? "").trim();
    return {
      ...reste,
      learner_discount_pct: v && remiseUnite === "%" ? v : "",
      learner_discount_eur: v && remiseUnite === "€" ? v : "",
    };
  };

  async function add(e) {
    e.preventDefault();
    setStatus(null);
    try {
      await createItem(versColonnes(form));
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

  async function remove(item) {
    if (!window.confirm(`Supprimer « ${item.name} » de l'inventaire ?`)) return;
    try { await deleteItem(item.id); load(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  function openEdit(item) {
    setEditing({
      id: item.id, name: item.name, category: item.category || "", sku: item.sku || "",
      quantity: item.quantity, unit_price: item.unit_price ?? "", tax_rate: item.tax_rate ?? "20", threshold: item.threshold,
      // Une SEULE valeur + son unité à l'écran : deux champs séparés laisseraient poser 10 %
      // ET 5 €, sans qu'on sache lequel s'applique.
      remiseValeur: item.learner_discount_eur ? String(item.learner_discount_eur)
        : (item.learner_discount_pct ? String(item.learner_discount_pct) : ""),
      remiseUnite: item.learner_discount_eur ? "€" : "%",
    });
  }
  const setEdit = (f) => (e) => setEditing((p) => ({ ...p, [f]: e.target.value }));
  async function saveEdit(e) {
    e.preventDefault();
    setStatus(null);
    try {
      const { id, ...fields } = editing;
      await updateItem(id, versColonnes(fields));
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
          lead="Stock de matériel, groupé par catégorie. Ajustez les quantités et suivez les ruptures ; les ventes se font à la caisse."
          actions={<div style={{ display: "flex", alignItems: "center", gap: 10 }}><MoneyToggle /><button className="btn primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ Fermer" : "＋ Ajouter un article"}</button></div>}
        />
      )}
      <StatusMessage status={status} />

      {/* Un compteur « stock bas : 1 » ne dit pas LEQUEL. C'est pourtant la seule chose qu'on
          veut savoir : ce qui est bas se commande, ce qui est plein ne demande rien. */}
      {aReappro.length > 0 ? (
        <div className="manque">
          <div className="manque-t">À réapprovisionner</div>
          <div className="manque-row">
            {aReappro.map((it) => {
              const s = stockState(it);
              return (
                <button key={it.id} type="button" className="manque-i" style={{ borderLeftColor: s.color }}
                  onClick={() => document.getElementById(`inv-${it.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })}>
                  <b className="tnum" style={{ color: s.color }}>{it.quantity}</b>
                  <span>{it.name}<i>{s.label}{it.threshold ? ` · seuil ${it.threshold}` : ""}</i></span>
                </button>
              );
            })}
          </div>
        </div>
      ) : items.length > 0 && (
        <div className="todo-calme">
          <Icon name="check-circle" size={17} aria-hidden="true" />
          Tout est au-dessus de son seuil — rien à réapprovisionner.
        </div>
      )}

      {/* Les trois autres compteurs décrivent, ils n'appellent rien : une ligne suffit. */}
      <div className="compteurs">
        <span><b className="tnum">{totals.items}</b> article{totals.items > 1 ? "s" : ""}</span><i />
        <span><b className="tnum">{totals.units}</b> unité{totals.units > 1 ? "s" : ""} en stock</span><i />
        <span><b className="tnum">{euro(totals.value)}</b> de valeur (HT)</span>
      </div>

      {showForm && (
        <Card title="Nouvel article" className="fade">
          <form onSubmit={add}>
            <div className="row3">
              <Field label="Nom" value={form.name} onChange={set("name")} required />
              <div className="field">
                <label>Catégorie</label>
                <input className="inp" list="inv-cats" value={form.category} onChange={set("category")} placeholder="Pelle à enfourner, Spatule…" />
              </div>
              <Field label="Référence (SKU)" value={form.sku} onChange={set("sku")} />
            </div>
            <div className="row3">
              <Field label="Quantité initiale" type="number" min="0" value={form.quantity} onChange={set("quantity")} />
              <Field label="Prix unitaire HT (€)" type="number" step="0.01" value={form.unit_price} onChange={set("unit_price")} />
              <SelectField label="TVA (%)" value={form.tax_rate} onChange={set("tax_rate")}>
                {TVA_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
              </SelectField>
            </div>
            {/* row3 : trois colonnes (seuil · remise · TTC estimé), cf. la modale d'édition. */}
            <div className="row3">
              <Field label="Seuil d'alerte" type="number" min="0" value={form.threshold} onChange={set("threshold")} />
              {/* Remise réservée aux stagiaires : appliquée UNIQUEMENT dans leur boutique.
                  La caisse garde le prix catalogue — elle sert aussi des clients de passage,
                  et l'opérateur y remise au cas par cas.
                  Vide = aucune remise. En % elle suit le prix, en € elle reste fixe. */}
              <div className="field">
                <label>Remise stagiaire</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="inp" type="number" min="0" step="0.5" placeholder="aucune"
                    value={form.remiseValeur} onChange={set("remiseValeur")} style={{ flex: 1 }} />
                  <select className="inp" value={form.remiseUnite} onChange={set("remiseUnite")}
                    style={{ width: 78, flex: "0 0 auto" }} aria-label="Unité de la remise">
                    <option value="%">%</option>
                    <option value="€">€</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 10, fontSize: 13, color: "var(--muted)" }}>
                {form.unit_price ? <span>TTC estimé : <b style={{ color: "var(--text)" }}>{euro(ttc(form.unit_price, form.tax_rate))}</b></span> : null}
              </div>
            </div>
            <button type="submit" className="btn primary">Ajouter</button>
          </form>
        </Card>
      )}

      {items.length === 0 ? (
        <Card><EmptyState icon="package">Aucun article en stock. Ajoutez votre premier article.</EmptyState></Card>
      ) : (
        grouped.map(([cat, catItems]) => (
          <div key={cat} className="inv-group">
            <div className="inv-cat"><Icon name={catIcon(cat)} size={17} /><span>{cat}</span><span className="inv-cat-n">{catItems.length}</span></div>
            <div className="grid cols-3">
              {catItems.map((it) => {
                const st = stockState(it);
                const max = Math.max(it.threshold * 2, it.quantity, 10);
                return (
                  <div key={it.id} id={`inv-${it.id}`} className="card" style={{ borderTop: `3px solid ${st.color}` }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ display: "flex", gap: 10, minWidth: 0 }}>
                        <span className="inv-thumb" style={{ color: st.color }}><Icon name={catIcon(it.category)} size={20} /></span>
                        <div style={{ minWidth: 0 }}>
                          <b style={{ fontSize: 15 }}>{it.name}</b>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            {it.category || "—"}{it.sku ? ` · ${it.sku}` : ""}
                          </div>
                          {it.unit_price != null && (
                            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                              <span className="tnum">{euro(it.unit_price)}</span> HT · TVA {Number(it.tax_rate)}% · <b style={{ color: "var(--text)" }}><span className="tnum">{euro(ttc(it.unit_price, it.tax_rate))}</span> TTC</b>
                            </div>
                          )}
                          {/* Effet de la remise stagiaire, calculé par le serveur (lib/remise.js) :
                              prix d'origine barré, taux consenti, prix final. Sans cette ligne,
                              l'école réglait une remise sans jamais voir ce que l'article coûte
                              dans la boutique — il fallait ouvrir l'espace stagiaire pour le savoir. */}
                          {it.remise_libelle && it.unit_price != null && (
                            <div style={{ fontSize: 12, marginTop: 3, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 5px" }}>
                              {/* Resserré : la colonne ne fait que ~110px (icône à gauche, badge de
                                  stock à droite). « TTC » n'est pas répété — la ligne juste au-dessus
                                  le dit déjà — et le libellé tient sur un mot. */}
                              <span className="hint" style={{ fontWeight: 400, width: "100%" }}>Prix stagiaire</span>
                              <span className="tnum" style={{ textDecoration: "line-through", color: "var(--muted)" }}>
                                {euro(ttc(it.unit_price, it.tax_rate))}
                              </span>
                              <Badge tone="g">{it.remise_libelle}</Badge>
                              <b className="tnum" style={{ color: "var(--text)" }}>
                                {euro(ttc(it.prix_stagiaire_ht, it.tax_rate))}
                              </b>
                            </div>
                          )}
                        </div>
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
                      <button className="iconbtn" title="Modifier l'article" onClick={() => openEdit(it)}><Icon name="pencil" size={15} /></button>
                      <button className="iconbtn del" title="Supprimer" onClick={() => remove(it)}><Icon name="trash" size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
      <datalist id="inv-cats">{allCats.map((c) => <option key={c} value={c} />)}</datalist>

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
                  <div className="field">
                    <label>Catégorie</label>
                    <input className="inp" list="inv-cats" value={editing.category} onChange={setEdit("category")} placeholder="Pelle à enfourner, Spatule…" />
                  </div>
                  <Field label="Référence (SKU)" value={editing.sku} onChange={setEdit("sku")} />
                </div>
                <div className="row3">
                  <Field label="Quantité" type="number" min="0" value={editing.quantity} onChange={setEdit("quantity")} />
                  <Field label="Prix unitaire HT (€)" type="number" step="0.01" value={editing.unit_price} onChange={setEdit("unit_price")} />
                  <SelectField label="TVA (%)" value={String(editing.tax_rate)} onChange={setEdit("tax_rate")}>
                    {TVA_RATES.map((r) => <option key={r} value={r}>{r} %</option>)}
                  </SelectField>
                </div>
                {/* row3 et non row2 : cette rangée porte TROIS colonnes (seuil · remise · TTC).
                    En row2 le troisième enfant retombait sur une ligne à lui, et les deux champs
                    s'élargissaient à 253 px au lieu des 165 px des rangées du dessus — la grille
                    se décalait à partir de là. */}
                <div className="row3">
                  <Field label="Seuil d'alerte" type="number" min="0" value={editing.threshold} onChange={setEdit("threshold")} />
                  {/* Même contrôle qu'à la création. Il manquait ici : on pouvait poser une
                      remise en créant l'article, mais plus jamais la revoir ni la changer. */}
                  <div className="field">
                    <label>Remise stagiaire</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="inp" type="number" min="0" step="0.5" placeholder="aucune"
                        value={editing.remiseValeur} onChange={setEdit("remiseValeur")} style={{ flex: 1 }} />
                      <select className="inp" value={editing.remiseUnite} onChange={setEdit("remiseUnite")}
                        style={{ width: 78, flex: "0 0 auto" }} aria-label="Unité de la remise">
                        <option value="%">%</option>
                        <option value="€">€</option>
                      </select>
                    </div>
                  </div>
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
