import { useEffect, useState } from "react";
import { getInvoices, createInvoice, updateInvoice, recordPayment, deleteInvoice, getEnrollments, downloadFacturX, downloadInvoiceXml, facturXUrl } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import Badge from "../components/Badge.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { euro } from "../lib/format.js";
import { bumpBadges } from "../lib/events.js";

const TYPES = [["DEVIS", "Devis"], ["ACOMPTE", "Acompte"], ["FACTURE", "Facture"], ["AVOIR", "Avoir"]];
const STATUS = { BROUILLON: ["Brouillon", "n"], EMISE: ["Émise", "b"], PAYEE: ["Payée ✓", "g"], IMPAYEE: ["Impayée", "r"], ANNULEE: ["Annulée", "n"] };
const EMPTY = { type: "FACTURE", enrollment_id: "", amount_net: "", tva_exoneree: 1, due_date: "" };

function Factures() {
  const [invoices, setInvoices] = useState([]);
  const [totals, setTotals] = useState({ emis: 0, paye: 0, impaye: 0 });
  const [enrollments, setEnrollments] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      const r = await getInvoices();
      setInvoices(r.data);
      setTotals(r.totals);
      bumpBadges();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => {
    load();
    getEnrollments().then((r) => setEnrollments(r.data)).catch(() => {});
  }, []);

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    setStatus(null);
    try {
      const r = await createInvoice(form);
      setForm(EMPTY);
      setShowForm(false);
      setStatus({ type: "success", message: `Créé : ${r.number}` });
      load();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  async function setStatusOf(id, s) {
    try { await updateInvoice(id, { status: s }); load(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }
  async function pay(inv) {
    const rest = Number(inv.amount_net) - Number(inv.paid);
    const amount = window.prompt("Montant du paiement (€) :", rest > 0 ? rest.toFixed(2) : inv.amount_net);
    if (amount === null) return;
    try { await recordPayment(inv.id, amount); load(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }
  async function remove(id) {
    if (!window.confirm("Supprimer ce document ?")) return;
    try { await deleteInvoice(id); load(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }
  async function dl(fn, i) {
    setStatus(null);
    try { await fn(i.id, i.number); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }
  async function preview(i) {
    setStatus(null);
    const w = window.open("", "_blank"); // ouvert dans le geste utilisateur (anti-popup)
    try {
      const url = await facturXUrl(i.id);
      if (w) w.location.href = url; else window.open(url, "_blank");
    } catch (err) {
      if (w) w.close();
      setStatus({ type: "error", message: err.message });
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Facturation"
        title="Devis & factures"
        lead="Devis, acomptes, factures et avoirs. TVA non applicable (art. 261-4-4° du CGI)."
        actions={<button className="btn primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ Fermer" : "＋ Nouveau document"}</button>}
      />
      <StatusMessage status={status} />

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <Kpi label="Émis (factures)" value={euro(totals.emis)} />
        <Kpi label="Encaissé" value={euro(totals.paye)} />
        <Kpi label="Reste dû" value={euro(totals.impaye)} />
      </div>

      {showForm && (
        <Card title="Nouveau document" className="fade">
          <form onSubmit={add}>
            <div className="row3">
              <SelectField label="Type" value={form.type} onChange={set("type")}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </SelectField>
              <Field label="Montant net (€)" type="number" step="0.01" value={form.amount_net} onChange={set("amount_net")} required />
              <Field label="Échéance" type="date" value={form.due_date} onChange={set("due_date")} />
            </div>
            <div className="row2">
              <SelectField label="Dossier (facultatif)" value={form.enrollment_id} onChange={set("enrollment_id")}>
                <option value="">— Aucun —</option>
                {enrollments.map((e) => (
                  <option key={e.id} value={e.id}>{e.last_name} {e.first_name} — {e.program_code}</option>
                ))}
              </SelectField>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingBottom: 10, fontSize: 14 }}>
                <input type="checkbox" checked={!!form.tva_exoneree} onChange={(e) => setForm((p) => ({ ...p, tva_exoneree: e.target.checked ? 1 : 0 }))} />
                TVA exonérée
              </label>
            </div>
            <button type="submit" className="btn primary">Créer</button>
          </form>
        </Card>
      )}

      <Card title={`Documents (${invoices.length})`}>
        {invoices.length === 0 ? (
          <EmptyState icon="🧾">Aucun document de facturation.</EmptyState>
        ) : (
          <div className="tablewrap" style={{ border: "none" }}>
            <table>
              <thead><tr><th>Numéro</th><th>Type</th><th>Client / dossier</th><th className="ta-r">Montant</th><th>Statut</th><th></th></tr></thead>
              <tbody>
                {invoices.map((i) => {
                  const [label, tone] = STATUS[i.status] || [i.status, "n"];
                  const who = i.company_name || (i.last_name ? `${i.last_name} ${i.first_name}` : "—");
                  return (
                    <tr key={i.id}>
                      <td className="mono">{i.number}</td>
                      <td>{i.type}</td>
                      <td>{who}{i.program_code ? ` · ${i.program_code}` : ""}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{euro(i.amount_net)}{Number(i.paid) > 0 && <span style={{ display: "block", fontSize: 11, color: "var(--green)" }}>payé {euro(i.paid)}</span>}</td>
                      <td><Badge tone={tone}>{label}</Badge></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {i.status === "BROUILLON" && <button className="btn sm" title="Émettre" onClick={() => setStatusOf(i.id, "EMISE")}>Émettre</button>}{" "}
                        {i.status !== "PAYEE" && i.status !== "ANNULEE" && (i.type === "FACTURE" || i.type === "ACOMPTE") && <button className="btn sm" title="Encaisser" onClick={() => pay(i)}>Payer</button>}{" "}
                        <button className="btn sm" title="Aperçu de la facture" onClick={() => preview(i)}>Aperçu</button>{" "}
                        <button className="btn sm" title="Télécharger la facture Factur-X (PDF)" onClick={() => dl(downloadFacturX, i)}>Factur-X</button>{" "}
                        <button className="iconbtn" title="Télécharger le XML" onClick={() => dl(downloadInvoiceXml, i)}>⭳</button>{" "}
                        <button className="iconbtn del" title="Supprimer" onClick={() => remove(i.id)}>🗑</button>
                      </td>
                    </tr>
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

export default Factures;
