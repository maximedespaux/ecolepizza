import { useEffect, useMemo, useState } from "react";
import MoneyToggle from "../components/MoneyToggle.jsx";
import { Icon } from "../components/Icon.jsx";
import { getInvoices, createInvoice, updateInvoice, recordPayment, deleteInvoice, getEnrollments, getCompanies, downloadFacturX, downloadInvoiceXml, facturXUrl } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import MenuActions from "../components/MenuActions.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { euro } from "../lib/format.js";
import { bumpBadges } from "../lib/events.js";

const TYPES = [["DEVIS", "Devis"], ["ACOMPTE", "Acompte"], ["FACTURE", "Facture"], ["AVOIR", "Avoir"]];
const STATUS = { BROUILLON: ["Brouillon", "n"], EMISE: ["Émise", "b"], PAYEE: ["Payée", "g"], IMPAYEE: ["Impayée", "r"], ANNULEE: ["Annulée", "n"] };
/* CE QUI DOIT ENCORE ÊTRE PAYÉ REMONTE. La page répond à « qui me doit de l'argent » ; les
   impayées y étaient mêlées aux payées, dans l'ordre d'émission. Le tri est STABLE (garanti
   depuis ES2019) : à statut égal, l'ordre d'origine — donc chronologique — est conservé. */
const RANG_STATUT = { IMPAYEE: 0, EMISE: 1, BROUILLON: 2, PAYEE: 3, ANNULEE: 4 };

const emptyLine = () => ({ enrollment_id: "", description: "", amount_net: "" });
const makeEmpty = () => ({ type: "FACTURE", company_id: "", tva_exoneree: 1, due_date: "", lines: [emptyLine()] });

function Factures() {
  // `null` et non `[]` : c'est ce qui distingue « on charge » de « c'est vide ». À `[]`, la
  // page annonçait « Aucun document de facturation » pendant tout le chargement.
  const [invoices, setInvoices] = useState(null);
  const [totals, setTotals] = useState({ emis: 0, paye: 0, impaye: 0 });
  const [enrollments, setEnrollments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(makeEmpty);
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
    getCompanies().then((r) => setCompanies(r.data)).catch(() => {});
  }, []);

  const lignes = useMemo(() => {
    if (!invoices) return null;
    return [...invoices].sort((a, b) => (RANG_STATUT[a.status] ?? 9) - (RANG_STATUT[b.status] ?? 9));
  }, [invoices]);

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const setLine = (i, k, v) => setForm((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const addLine = () => setForm((p) => ({ ...p, lines: [...p.lines, emptyLine()] }));
  const delLine = (i) => setForm((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, j) => j !== i) : p.lines }));
  const formTotal = form.lines.reduce((s, l) => s + (Number(l.amount_net) || 0), 0);

  async function add(e) {
    e.preventDefault();
    setStatus(null);
    try {
      const r = await createInvoice({
        type: form.type, company_id: form.company_id || null,
        tva_exoneree: form.tva_exoneree, due_date: form.due_date || null,
        lines: form.lines,
      });
      setForm(makeEmpty());
      setShowForm(false);
      setStatus({ type: "success", message: `Créé : ${r.number}` });
      load();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  async function setStatusOf(id, s) {
    try { await updateInvoice(id, { status: s }); load(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }
  async function pay(inv) {
    // Un clic = encaisse le solde restant et marque la facture payée.
    const rest = Math.max(0, Number(inv.amount_net) - Number(inv.paid));
    const amount = rest > 0 ? rest : Number(inv.amount_net);
    if (!window.confirm(`Marquer « ${inv.number} » comme payée et encaisser ${euro(amount)} ?`)) return;
    try {
      await recordPayment(inv.id, amount);
      setStatus({ type: "success", message: `Encaissé : ${euro(amount)} · ${inv.number} payée.` });
      load();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
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
        actions={<div style={{ display: "flex", alignItems: "center", gap: 10 }}><MoneyToggle /><button className="btn primary" onClick={() => setShowForm((v) => !v)}>{showForm ? "✕ Fermer" : "＋ Nouveau document"}</button></div>}
      />
      <StatusMessage status={status} />

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        {/* Trois tons distincts : le filet coloré ne sert à rien s'il est le même partout.
            Bleu pour ce qui est ÉMIS (un fait), vert pour ce qui est ENTRÉ, ambre pour ce qui
            est ATTENDU — c'est la seule des trois qui appelle une action. */}
        <Kpi label="Émis (factures)" value={euro(totals.emis)} icon="receipt" tone="blue" />
        <Kpi label="Encaissé" value={euro(totals.paye)} icon="euro" tone="green" />
        <Kpi label="Reste dû" value={euro(totals.impaye)} icon="clock" tone="gold" />
      </div>

      {showForm && (
        <Card title="Nouveau document" className="fade">
          <form onSubmit={add}>
            <div className="row3">
              <SelectField label="Type" value={form.type} onChange={set("type")}>
                {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </SelectField>
              <SelectField label="Client / entreprise (facultatif)" value={form.company_id} onChange={set("company_id")}>
                <option value="">— Aucune —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
              <Field label="Échéance" type="date" value={form.due_date} onChange={set("due_date")} />
            </div>

            <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "4px 0 6px" }}>Dossiers / lignes facturées</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.lines.map((l, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 0.8fr auto", gap: 8, alignItems: "center" }}>
                  <select className="inp" value={l.enrollment_id} onChange={(e) => setLine(i, "enrollment_id", e.target.value)}>
                    <option value="">— Dossier —</option>
                    {enrollments.map((e) => (
                      <option key={e.id} value={e.id}>{e.last_name} {e.first_name} — {e.program_code}</option>
                    ))}
                  </select>
                  <input className="inp" placeholder="Libellé (par défaut : la formation)" value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} />
                  <input className="inp" type="number" step="0.01" placeholder="Montant HT" value={l.amount_net} onChange={(e) => setLine(i, "amount_net", e.target.value)} />
                  <button type="button" className="iconbtn del" title="Retirer la ligne" onClick={() => delLine(i)} disabled={form.lines.length <= 1}><Icon name="x" size={14} /></button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <button type="button" className="btn sm ghost" onClick={addLine}>＋ Ajouter une ligne</button>
              <span style={{ fontWeight: 700 }}>Total HT : {euro(formTotal)}</span>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", fontSize: 14 }}>
              <input type="checkbox" checked={!!form.tva_exoneree} onChange={(e) => setForm((p) => ({ ...p, tva_exoneree: e.target.checked ? 1 : 0 }))} />
              TVA exonérée (art. 261-4-4° du CGI)
            </label>
            <button type="submit" className="btn primary" disabled={formTotal <= 0}>Créer</button>
          </form>
        </Card>
      )}

      <Card title={`Documents${invoices ? ` (${invoices.length})` : ""}`}>
          <DataTable
            rows={lignes}
            vide={<EmptyState icon="receipt" title="Aucun document de facturation"
              text="Devis, acomptes, factures et avoirs apparaîtront ici dès le premier document émis." />}
            rowKey={(i) => i.id}
            // Une impayée se repère sans lire son statut : c'est la seule ligne qui réclame.
            rowProps={(i) => (i.status === "IMPAYEE" ? { className: "ln-du" } : null)}
            cols={[
              { k: "number", t: "Numéro", cell: (i) => <span className="mono">{i.number}</span> },
              { k: "who", t: "Client / dossier", principal: true,
                cell: (i) => {
                  /* Repli sur le NUMÉRO quand le client est inconnu. En colonnes, un « — »
                     se lit très bien : la colonne d'à côté porte le numéro. En carte, ce même
                     « — » devenait le TITRE — « — · 6 dossiers » — et la carte n'identifiait
                     plus rien. Un titre doit toujours nommer. */
                  const who = i.company_name || (i.last_name ? `${i.last_name} ${i.first_name}` : i.number);
                  return `${who}${Number(i.n_lines) > 1 ? ` · ${i.n_lines} dossiers` : i.program_code ? ` · ${i.program_code}` : ""}`;
                } },
              { k: "type", t: "Type", cell: (i) => i.type },
              { k: "amount", t: "Montant", th: { className: "ta-r" }, td: { textAlign: "right" },
                cell: (i) => (
                  <span className="mono tnum">
                    {euro(i.amount_net)}
                    {Number(i.paid) > 0 && <span style={{ display: "block", fontSize: 11, color: "var(--green)" }}>payé {euro(i.paid)}</span>}
                  </span>
                ) },
              { k: "statut", t: "Statut",
                cell: (i) => { const [label, tone] = STATUS[i.status] || [i.status, "n"]; return <Badge tone={tone}>{label}</Badge>; } },
              /* UNE action principale, celle que l'état appelle — un brouillon s'émet, une
                 facture émise s'encaisse, une facture close se relit. Les cinq autres commandes
                 passent au menu : « encaisser » se fait tous les jours, « exporter le XML »
                 deux fois par an, et les afficher pareil obligeait à relire six intitulés
                 avant chaque clic. */
              { k: "actions", t: "", actions: true, td: { textAlign: "right", whiteSpace: "nowrap" },
                cell: (i) => {
                  const encaissable = i.status !== "PAYEE" && i.status !== "ANNULEE"
                    && (i.type === "FACTURE" || i.type === "ACOMPTE");
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {i.status === "BROUILLON" ? (
                        <button className="btn sm primary" onClick={() => setStatusOf(i.id, "EMISE")}>Émettre</button>
                      ) : encaissable ? (
                        <button className="btn sm primary" title="Encaisser le solde et marquer payée" onClick={() => pay(i)}>Payer</button>
                      ) : (
                        <button className="btn sm" onClick={() => preview(i)}>Aperçu</button>
                      )}
                      <MenuActions label={`Autres actions pour ${i.number}`}>
                        {i.status !== "BROUILLON" && !encaissable ? null : (
                          <button type="button" onClick={() => preview(i)}><Icon name="eye" size={15} /> Aperçu</button>
                        )}
                        <button type="button" onClick={() => dl(downloadFacturX, i)}><Icon name="file-text" size={15} /> Factur-X (PDF)</button>
                        <button type="button" onClick={() => dl(downloadInvoiceXml, i)}><Icon name="download" size={15} /> XML seul</button>
                        {encaissable && i.status !== "BROUILLON" && (
                          <button type="button" onClick={() => setStatusOf(i.id, "ANNULEE")}><Icon name="ban" size={15} /> Annuler</button>
                        )}
                        <button type="button" className="danger" onClick={() => remove(i.id)}><Icon name="trash" size={15} /> Supprimer</button>
                      </MenuActions>
                    </span>
                  );
                } },
            ]}
          />
      </Card>
    </>
  );
}

export default Factures;
