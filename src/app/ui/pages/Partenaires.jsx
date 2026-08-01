import { useContext, useEffect, useMemo, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { getPartenaires, createPartenaire, updatePartenaire, deletePartenaire, updateRevenue, deleteRevenue, deleteContribution } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DataTable from "../components/DataTable.jsx";
import MoneyToggle from "../components/MoneyToggle.jsx";
import ApportForm from "../components/PartnerContributions.jsx";
import PartnerProduits from "../components/PartnerProduits.jsx";
import { APPORT_TYPES, apportType, apportsOfPartner } from "../lib/apports.js";
import { euro } from "../lib/format.js";

const CATEGORIES = ["FARINE", "MATERIEL", "FOUR", "CHARCUTERIE", "FROMAGE", "CONSERVE", "DISTRIBUTION", "AUTRE"];
const ADMIN = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"];
const EMPTY = {
  name: "", category: "AUTRE", contact_name: "", contact_email: "", contact_phone: "",
  website: "", town: "", discount_pct: "", offer: "", notes: "",
};
const frDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const sumCash = (ap) => ap.filter((a) => apportType(a.type).cash).reduce((s, a) => s + (Number(a.value) || 0), 0);
const sumKind = (ap) => ap.filter((a) => !apportType(a.type).cash).reduce((s, a) => s + (Number(a.value) || 0), 0);

function Partenaires() {
  const { user } = useContext(UserContext);
  const canEdit = ADMIN.includes(user?.role);
  const [partners, setPartners] = useState([]);
  const [status, setStatus] = useState(null);
  const [editing, setEditing] = useState(null);   // partenaire édité ou { _new: true }
  const [editApport, setEditApport] = useState(null); // commission corrigée (revenue_extra)
  const [cat, setCat] = useState("");
  const [tab, setTab] = useState("partenaires");   // partenaires | historique

  async function load() {
    try { const { data } = await getPartenaires(); setPartners(data); }
    catch (err) { setStatus({ type: "error", message: err.message }); }
  }
  useEffect(() => { load(); }, []);

  async function removeApport(ap) {
    if (!window.confirm(`Supprimer « ${ap.label} » ?`)) return;
    try {
      if (ap.src === "contribution") await deleteContribution(ap.srcId);
      else await deleteRevenue(ap.srcId);
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  /* Les partenaires QUI RAPPORTENT passent devant, le reste par ordre alphabétique.
     Aujourd'hui aucun n'a d'apport enregistré : le tri est donc sans effet, et c'est voulu —
     il ne FABRIQUE pas une hiérarchie, il la révèle le jour où elle existe. Trier par montant
     d'office aurait mis en avant des écarts inventés. */
  const filtered = useMemo(() => {
    const base = cat ? partners.filter((p) => p.category === cat) : partners;
    return [...base].sort((a, b) => {
      const va = sumCash(apportsOfPartner(a)) + sumKind(apportsOfPartner(a));
      const vb = sumCash(apportsOfPartner(b)) + sumKind(apportsOfPartner(b));
      if (vb !== va) return vb - va;
      return String(a.name || "").localeCompare(String(b.name || ""), "fr");
    });
  }, [partners, cat]);
  /* Une fiche sans contact ni offre ne sert à rien : ce répertoire existe pour qu'on sache QUI
     APPELER. Le dire UNE FOIS en tête, et non sur chacune des vingt-trois cartes — répéter
     « fiche à compléter » vingt-trois fois est exactement le défaut qu'on vient de corriger en
     retirant les vingt-trois « 0 € ». */
  const incompletes = useMemo(() => partners.filter((p) =>
    !p.offer && !p.contact_name && !p.contact_phone && !p.contact_email && !p.website && !p.town
  ).length, [partners]);

  const withApports = useMemo(
    () => partners.map((p) => ({ p, ap: apportsOfPartner(p) })).filter((x) => x.ap.length > 0),
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
        lead="Qui contacter, ce qu'ils proposent, et ce qu'ils vous apportent."
        actions={<div style={{ display: "flex", alignItems: "center", gap: 10 }}><MoneyToggle />{canEdit && <button className="btn primary" onClick={() => setEditing({ _new: true, ...EMPTY })}>＋ Ajouter un partenaire</button>}</div>}
      />
      <StatusMessage status={status} />

      <ApportForm partners={partners} onSaved={load} />

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={"tab" + (tab === "partenaires" ? " on" : "")} onClick={() => setTab("partenaires")}>Partenaires</button>
        <button className={"tab" + (tab === "historique" ? " on" : "")} onClick={() => setTab("historique")}>Historique des apports</button>
      </div>

      {tab === "partenaires" ? (
        <>
          <div className="filtres">
            <select className="inp" aria-label="Filtrer par catégorie de partenaire" value={cat} onChange={(e) => setCat(e.target.value)} style={{ maxWidth: 240 }}>
              <option value="">Toutes les catégories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {incompletes > 0 && (
            <div className="carte-dette" style={{ marginBottom: 14 }}>
              <Icon name="info" size={16} />
              <span>
                <b className="tnum">{incompletes}</b> fiche{incompletes > 1 ? "s" : ""} sur <b className="tnum">{partners.length}</b>
                {incompletes > 1 ? " n'ont" : " n'a"} ni contact ni offre — un répertoire ne sert
                qu'une fois rempli.
              </span>
            </div>
          )}

          {filtered.length === 0 ? (
            <Card title="Partenaires"><EmptyState icon="handshake">Aucun partenaire.</EmptyState></Card>
          ) : (
            <div className="partner-grid">
              {filtered.map((p) => {
                const ap = apportsOfPartner(p);
                return (
                  <Card key={p.id} title={p.name} more={
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      {/* La REMISE est le fait opérationnel de cette page : c'est ce qu'on vérifie
                          avant de commander. Elle était noyée en dernière ligne des coordonnées. */}
                      {Number(p.discount_pct) > 0 && <Badge tone="g">−{p.discount_pct}%</Badge>}
                      <Badge tone="n">{p.category}</Badge>
                    </span>
                  }>
                    {p.offer && <p style={{ marginTop: 0, fontSize: 13.5 }}>{p.offer}</p>}
                    <div className="partner-meta">
                      {p.contact_name && <div>{p.contact_name}</div>}
                      {p.contact_phone && <div><a href={`tel:${p.contact_phone}`}>{p.contact_phone}</a></div>}
                      {p.contact_email && <div><a href={`mailto:${p.contact_email}`}>{p.contact_email}</a></div>}
                      {p.website && <div><a href={p.website.startsWith("http") ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer">{p.website}</a></div>}
                      {p.town && <div>{p.town}</div>}
                    </div>

                    {/* LES TOTAUX NE PARAISSENT QUE S'ILS EXISTENT. Vingt-trois cartes affichaient
                        « Commissions 0 € · En nature 0 € » puis « Aucun apport pour l'instant » :
                        la place la plus visible allait à de l'argent qui n'existe pas, sur une page
                        qu'on ouvre pour trouver un contact et vérifier une remise. L'absence
                        d'apport se dit très bien en ne disant rien. */}
                    {ap.length > 0 && (
                      <div className="partner-totals">
                        <div><span className="sub">Commissions</span><b className="tnum" style={{ color: "var(--green)" }}>{euro(sumCash(ap))}</b></div>
                        <div><span className="sub">En nature</span><b className="tnum" style={{ color: "var(--orange)" }}>{euro(sumKind(ap))}</b></div>
                      </div>
                    )}

                    {ap.length > 0 && (
                      <div className="apport-list">
                        {ap.slice(0, 4).map((a) => {
                          const t = apportType(a.type);
                          return (
                            <div key={a.id} className="apport-row">
                              <span className={`dot tone-${t.tone}`} />
                              <span className="apport-label" title={a.label}>{a.label}</span>
                              <span className="apport-date">{frDate(a.date)}</span>
                              <b className="tnum">{euro(a.value)}</b>
                            </div>
                          );
                        })}
                        {ap.length > 4 && (
                          <button type="button" className="btn sm ghost" style={{ marginTop: 4 }} onClick={() => setTab("historique")}>
                            Voir les {ap.length} apports →
                          </button>
                        )}
                      </div>
                    )}

                    {p.notes && <p className="sub" style={{ marginBottom: 0 }}>{p.notes}</p>}

                    {/* Catalogue vendu par CE partenaire — ce que le stagiaire voit dans l'onglet
                        « Offres partenaires ». Replié par défaut : la page sert d'abord à trouver
                        un contact et vérifier une remise, le catalogue est un second temps. */}
                    <PartnerProduits partnerId={p.id} onErreur={(m) => setStatus({ type: "error", message: m })} />

                    {canEdit && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button className="btn sm ghost" onClick={() => setEditing({ ...p })}>Modifier</button>
                        <button className="btn sm ghost danger" title={`Supprimer ${p.name}`} aria-label={`Supprimer le partenaire ${p.name}`} onClick={() => onDelete(p)}><Icon name="trash" size={15} /></button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : withApports.length === 0 ? (
        <Card><EmptyState icon="handshake">Aucun apport enregistré. Ajoutez une commission ou une contribution ci-dessus.</EmptyState></Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {withApports.map(({ p, ap }) => (
            <Card key={p.id}
              title={<span className="card-ttl"><Icon name="handshake" size={15} /> {p.name}</span>}
              more={<span className="sub">Commissions {euro(sumCash(ap))} · Nature {euro(sumKind(ap))}</span>}>
              <DataTable
                rows={ap}
                rowKey={(a) => a.id}
                cols={[
                  { k: "date", t: "Date", td: { whiteSpace: "nowrap" }, cell: (a) => <span className="tnum">{frDate(a.date)}</span> },
                  // Le libellé identifie l'apport bien mieux que sa date : c'est lui qui
                  // devient le titre de la carte en écran étroit.
                  { k: "label", t: "Libellé", principal: true, cell: (a) => a.label },
                  { k: "type", t: "Type", td: { whiteSpace: "nowrap" },
                    cell: (a) => { const t = apportType(a.type); return <>
                      <Badge tone={t.tone}>{t.label}</Badge>{t.cash && <span className="hint" style={{ marginLeft: 6 }}>→ CA</span>}
                    </>; } },
                  { k: "value", t: "Valeur", th: { className: "ta-r" }, td: { textAlign: "right" },
                    cell: (a) => <span className="tnum">{euro(a.value)}</span> },
                  { k: "actions", t: "", actions: true, td: { textAlign: "right" },
                    cell: (a) => (canEdit ? (
                      <span style={{ display: "inline-flex", gap: 4 }}>
                        {/* Modifier ne vaut QUE pour une commission (revenue_extra) : les
                            contributions en nature n'ont pas de route de mise à jour, seulement
                            création et suppression. Proposer le bouton partout donnerait un
                            formulaire qui ne peut pas enregistrer. */}
                        {a.src === "revenue" && (
                          <button className="iconbtn" title="Modifier" aria-label={`Modifier l'apport ${a.label}`}
                            onClick={() => setEditApport({ ...a, partner_id: p.id })}><Icon name="pencil" size={15} /></button>
                        )}
                        <button className="iconbtn del" title="Supprimer" aria-label={`Supprimer l'apport ${a.label}`} onClick={() => removeApport(a)}><Icon name="trash" size={15} /></button>
                      </span>
                    ) : null) },
                ]}
              />
            </Card>
          ))}
        </div>
      )}

      {editApport && (
        <ApportModal apport={editApport} partners={partners} onClose={() => setEditApport(null)}
          onSaved={() => { setEditApport(null); setStatus({ type: "success", message: "Apport corrigé." }); load(); }}
          onError={(m) => setStatus({ type: "error", message: m })} />
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
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button></div>
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

/**
 * Corriger une commission déjà enregistrée.
 *
 * `PATCH /comptabilite/revenus/:id` existait — validé, journalisé à l'audit — et n'avait AUCUN
 * appelant : un apport ne pouvait que se supprimer et se ressaisir. Or il porte une date, et
 * une suppression/ressaisie fait perdre l'original en même temps qu'elle corrige la faute de
 * frappe. Un montant faux dans le chiffre d'affaires n'attend pas une seconde saisie.
 *
 * Le TYPE reste dans les natures « cash » : passer une commission en « Matériel » la ferait
 * changer de table (partner_contribution), ce que cette route ne sait pas faire. Le partenaire,
 * lui, se change — une commission portée au mauvais nom est une erreur courante, et c'était
 * jusqu'ici la plus coûteuse à réparer.
 */
function ApportModal({ apport, partners, onClose, onSaved, onError }) {
  const [form, setForm] = useState(() => ({
    partner_id: apport.partner_id || "",
    type: apportType(apport.type).cash ? apport.type : "COMMISSION",
    label: apport.label || "",
    value: String(apport.value ?? ""),
    date: apport.date || "",
  }));
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!form.partner_id) return onError("Choisissez le partenaire.");
    if (!form.label.trim()) return onError("Libellé requis.");
    if (form.value === "" || Number.isNaN(Number(form.value))) return onError("Montant invalide.");
    setSaving(true);
    try {
      await updateRevenue(apport.srcId, {
        label: form.label, categorie: form.type, montant: form.value,
        date: form.date, partner_id: form.partner_id,
      });
      onSaved();
    } catch (e) { onError(e.message || "Enregistrement impossible."); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h3>Modifier l'apport</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button></div>
        <div className="mbody">
          <div className="row2">
            <SelectField label="Partenaire" value={form.partner_id} onChange={set("partner_id")} required>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </SelectField>
            <SelectField label="Type" value={form.type} onChange={set("type")}>
              {APPORT_TYPES.filter((t) => t.cash).map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </SelectField>
          </div>
          <Field label="Libellé" value={form.label} onChange={set("label")} required />
          <div className="row2">
            <Field label="Montant (€)" value={form.value} onChange={set("value")} inputMode="decimal" required />
            <Field label="Date" type="date" value={form.date} onChange={set("date")} />
          </div>
          <p className="hint" style={{ marginBottom: 0 }}>
            Cette somme entre dans le chiffre d'affaires : la corriger ici corrige la Comptabilité.
          </p>
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
