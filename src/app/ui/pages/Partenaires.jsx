import { useContext, useEffect, useMemo, useState } from "react";
import { getPartenaires, createPartenaire, updatePartenaire, deletePartenaire, createRevenue, updateRevenue, deleteRevenue } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { euro } from "../lib/format.js";

const CATEGORIES = ["FARINE", "MATERIEL", "FOUR", "CHARCUTERIE", "FROMAGE", "CONSERVE", "DISTRIBUTION", "AUTRE"];
const ADMIN = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"];
const REVENU_CATS = [
  { v: "COMMISSION", label: "Commission partenaire" },
  { v: "SUBVENTION", label: "Subvention" },
  { v: "AUTRE", label: "Autre produit" },
];
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = {
  name: "", category: "AUTRE", contact_name: "", contact_email: "", contact_phone: "",
  website: "", town: "", discount_pct: "", offer: "", notes: "",
};

function Partenaires() {
  const { user } = useContext(UserContext);
  const canEdit = ADMIN.includes(user?.role);
  const [partners, setPartners] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null); // partenaire édité ou { _new: true }
  const [cat, setCat] = useState("");
  // Saisie d'un produit divers (commission…) — déplacée depuis « Produit divers ».
  const [rec, setRec] = useState({ label: "", categorie: "COMMISSION", montant: "", date: today(), partner_id: "" });
  const [saving, setSaving] = useState(false);
  const [openDetails, setOpenDetails] = useState({}); // détail des commissions déplié par partenaire
  const [editLine, setEditLine] = useState(null); // ligne de commission en édition

  async function delLine(c) {
    if (!window.confirm(`Supprimer « ${c.label} » ?`)) return;
    try { await deleteRevenue(c.id); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function saveLine() {
    if (!editLine.label.trim() || editLine.amount === "") { setStatus({ type: "error", message: "Libellé et montant requis." }); return; }
    try {
      await updateRevenue(editLine.id, { label: editLine.label, montant: editLine.amount, date: editLine.date });
      setEditLine(null); load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  async function load() {
    try { const { data } = await getPartenaires(); setPartners(data); }
    catch (err) { setStatus({ type: "error", message: err.message }); }
  }
  useEffect(() => { load(); }, []);

  async function recordRevenue() {
    if (!rec.label.trim() || !rec.montant) { setStatus({ type: "error", message: "Libellé et montant requis." }); return; }
    if (rec.categorie === "COMMISSION" && !rec.partner_id) { setStatus({ type: "error", message: "Sélectionnez le partenaire concerné pour une commission." }); return; }
    setSaving(true); setStatus(null);
    try {
      await createRevenue(rec);
      setRec({ label: "", categorie: rec.categorie, montant: "", date: today(), partner_id: "" });
      setStatus({ type: "success", message: "Produit enregistré (ajouté au chiffre d'affaires)." });
      load(); // rafraîchit les commissions cumulées par partenaire
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  const filtered = useMemo(
    () => (cat ? partners.filter((p) => p.category === cat) : partners),
    [partners, cat]
  );
  const totalCommissions = useMemo(
    () => partners.reduce((s, p) => s + Number(p.commissions_total || 0), 0),
    [partners]
  );

  async function onDelete(p) {
    if (!window.confirm(`Supprimer le partenaire « ${p.name} » ?`)) return;
    try { await deletePartenaire(p.id); setStatus({ type: "success", message: "Partenaire supprimé." }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  return (
    <>
      <PageHead
        eyebrow="Réseau · Suivi"
        title="Partenaires"
        lead="Suivi des partenaires : contacts, ce qu'ils proposent, et les commissions générées. Le formateur peut consulter ; les commissions se saisissent via « Produit divers »."
        actions={canEdit && <button className="btn primary" onClick={() => setEditing({ _new: true, ...EMPTY })}>＋ Ajouter un partenaire</button>}
      />
      <StatusMessage status={status} />

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="lbl">Partenaires</div><div className="val tnum">{partners.length}</div></div>
        <div className="kpi"><div className="lbl">Commissions cumulées</div><div className="val tnum" style={{ color: "var(--green)" }}>{euro(totalCommissions)}</div></div>
        <div className="kpi"><div className="lbl">Catégories</div><div className="val tnum">{new Set(partners.map((p) => p.category)).size}</div></div>
      </div>

      <Card title="Enregistrer un produit divers" style={{ marginBottom: 16 }}>
        <p className="ca-add" style={{ marginTop: -4, marginBottom: 12 }}>+ Ajouté au chiffre d'affaires</p>
        <div className="row3" style={{ alignItems: "end" }}>
          <div className="field"><label>Libellé</label>
            <input className="inp" value={rec.label} onChange={(e) => setRec({ ...rec, label: e.target.value })} placeholder="Commission Le 5 Stagioni…" /></div>
          <div className="field"><label>Type</label>
            <select value={rec.categorie} onChange={(e) => setRec({ ...rec, categorie: e.target.value })}>
              {REVENU_CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
            </select></div>
          <div className="field"><label>Montant (€)</label>
            <input className="inp" inputMode="decimal" value={rec.montant} onChange={(e) => setRec({ ...rec, montant: e.target.value })} placeholder="0" /></div>
        </div>
        <div className="row3" style={{ alignItems: "end" }}>
          {rec.categorie === "COMMISSION" && (
            <div className="field"><label>Partenaire concerné <span style={{ color: "var(--ember1)" }}>*</span></label>
              <select value={rec.partner_id} onChange={(e) => setRec({ ...rec, partner_id: e.target.value })} required>
                <option value="">— Sélectionner un partenaire —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
          )}
          <div className="field"><label>Date</label>
            <input className="inp" type="date" value={rec.date} onChange={(e) => setRec({ ...rec, date: e.target.value })} /></div>
          <button className="btn primary" disabled={saving} onClick={recordRevenue}>{saving ? "Enregistrement…" : "+ Ajouter le produit"}</button>
        </div>
      </Card>

      <div className="searchbar" style={{ marginBottom: 12 }}>
        <select className="inp" value={cat} onChange={(e) => setCat(e.target.value)} style={{ maxWidth: 240 }}>
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card title="Partenaires"><EmptyState icon="🤝">Aucun partenaire.</EmptyState></Card>
      ) : (
        <div className="partner-grid">
          {filtered.map((p) => (
            <Card key={p.id} title={p.name} more={<Badge tone="n">{p.category}</Badge>}>
              {p.offer && <p style={{ marginTop: 0, fontSize: 13.5 }}>{p.offer}</p>}
              <div className="partner-meta">
                {p.contact_name && <div>{p.contact_name}</div>}
                {p.contact_phone && <div><a href={`tel:${p.contact_phone}`}>{p.contact_phone}</a></div>}
                {p.contact_email && <div><a href={`mailto:${p.contact_email}`}>{p.contact_email}</a></div>}
                {p.website && <div><a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer">{p.website}</a></div>}
                {p.town && <div>{p.town}</div>}
                {p.discount_pct != null && <div>Remise {p.discount_pct}%</div>}
              </div>
              <div className="partner-commission">
                <span>Commissions</span>
                <b>{euro(Number(p.commissions_total || 0))}</b>
                <span className="sub">{p.commissions_count || 0} · {p.last_commission ? `dernière ${p.last_commission}` : "aucune"}</span>
              </div>
              {p.commissions && p.commissions.length > 0 && (
                <>
                  <button type="button" className="btn sm ghost" style={{ marginTop: 6 }}
                    onClick={() => setOpenDetails((o) => ({ ...o, [p.id]: !o[p.id] }))}>
                    {openDetails[p.id] ? "Masquer le détail" : `Voir le détail (${p.commissions.length})`}
                  </button>
                  {openDetails[p.id] && (
                    <div style={{ marginTop: 6, display: "flex", flexDirection: "column" }}>
                      {p.commissions.map((c) => (editLine && editLine.id === c.id ? (
                        <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", padding: "4px 0", borderBottom: "1px solid var(--border-soft)" }}>
                          <input className="inp" style={{ flex: 1, minWidth: 0 }} value={editLine.label} onChange={(e) => setEditLine({ ...editLine, label: e.target.value })} />
                          <input className="inp" style={{ width: 70 }} inputMode="decimal" value={editLine.amount} onChange={(e) => setEditLine({ ...editLine, amount: e.target.value })} />
                          <input className="inp" type="date" style={{ width: 132 }} value={editLine.date} onChange={(e) => setEditLine({ ...editLine, date: e.target.value })} />
                          <button type="button" className="btn sm primary" onClick={saveLine}>OK</button>
                          <button type="button" className="btn sm ghost" onClick={() => setEditLine(null)}>×</button>
                        </div>
                      ) : (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12.5, padding: "4px 0", borderBottom: "1px solid var(--border-soft)" }}>
                          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.label}<span style={{ color: "var(--dim)" }}> · {new Date(c.date).toLocaleDateString("fr-FR")}</span>
                          </span>
                          <b className="tnum">{euro(Number(c.amount))}</b>
                          {canEdit && (
                            <>
                              <button type="button" className="iconbtn" title="Modifier" onClick={() => setEditLine({ id: c.id, label: c.label, amount: String(c.amount), date: c.date })}>✎</button>
                              <button type="button" className="iconbtn del" title="Supprimer" onClick={() => delLine(c)}>🗑</button>
                            </>
                          )}
                        </div>
                      )))}
                    </div>
                  )}
                </>
              )}
              {p.notes && <p className="sub" style={{ marginBottom: 0 }}>{p.notes}</p>}
              {canEdit && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button className="btn sm ghost" onClick={() => setEditing({ ...p })}>Modifier</button>
                  <button className="btn sm ghost danger" onClick={() => onDelete(p)}>🗑</button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <PartnerModal partner={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setStatus({ type: "success", message: "Partenaire enregistré." }); load(); }}
          onError={(m) => setStatus({ type: "error", message: m })} />
      )}
    </>
  );
}

function PartnerModal({ partner, onClose, onSaved, onError }) {
  const isNew = !!partner._new;
  const [form, setForm] = useState(() => ({ ...EMPTY, ...partner, discount_pct: partner.discount_pct ?? "" }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!form.name.trim()) { onError("Nom requis."); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, category: form.category, contact_name: form.contact_name,
        contact_email: form.contact_email, contact_phone: form.contact_phone, website: form.website,
        town: form.town, discount_pct: form.discount_pct, offer: form.offer, notes: form.notes,
      };
      if (isNew) await createPartenaire(payload);
      else await updatePartenaire(partner.id, payload);
      onSaved();
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h3>{isNew ? "Nouveau partenaire" : "Modifier le partenaire"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button></div>
        <div className="mbody">
          <div className="row2">
            <Field label="Nom" value={form.name} onChange={set("name")} required />
            <SelectField label="Catégorie" value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </SelectField>
          </div>
          <div className="field"><label>Ce qu'il propose (offre)</label>
            <textarea className="inp" rows={2} value={form.offer} onChange={set("offer")} placeholder="Farines T65, remise pro, livraison…" /></div>
          <div className="row2">
            <Field label="Contact (nom)" value={form.contact_name} onChange={set("contact_name")} />
            <Field label="Téléphone" value={form.contact_phone} onChange={set("contact_phone")} />
          </div>
          <div className="row2">
            <Field label="Email" type="email" value={form.contact_email} onChange={set("contact_email")} />
            <Field label="Site web" value={form.website} onChange={set("website")} />
          </div>
          <div className="row2">
            <Field label="Ville" value={form.town} onChange={set("town")} />
            <Field label="Remise (%)" type="number" step="0.1" value={form.discount_pct} onChange={set("discount_pct")} />
          </div>
          <div className="field"><label>Notes de suivi</label>
            <textarea className="inp" rows={3} value={form.notes} onChange={set("notes")} /></div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

export default Partenaires;
