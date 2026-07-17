import { useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro } from "../lib/format.js";
import { initials } from "../lib/format.js";
import { getShopRequests, updateShopRequest, invoiceShopRequest, deleteShopRequest } from "../api/apiClient.js";

/**
 * Zone « Demandes boutique » — le pendant école de la boutique stagiaire.
 *
 * Le stagiaire compose son panier, valide, et sa demande atterrit ici avec SON IDENTITÉ et
 * ses articles. L'école prépare, remet en main propre, puis facture. Aucun paiement en ligne :
 * il est sur place cinq jours.
 *
 * La facturation ne prend QUE les lignes « école » : sur une ligne partenaire, l'école ne vend
 * pas, elle met en relation — la facturer reviendrait à encaisser la vente d'un autre.
 */

const FLOW = ["NOUVELLE", "EN_PREPARATION", "PRETE", "REMISE", "FACTUREE"];
const LABEL = {
  NOUVELLE: "Reçue", EN_PREPARATION: "En préparation", PRETE: "Prête à retirer",
  REMISE: "Remise", FACTUREE: "Facturée", ANNULEE: "Annulée",
};
/* Classes réellement définies dans app.css : g (vert) · a (ambre) · r (rouge) · b (bleu) · n (neutre).
   Une classe inventée sortirait un badge sans style, et le build n'en dirait rien. */
const TONE = { NOUVELLE: "r", EN_PREPARATION: "a", PRETE: "g", REMISE: "b", FACTUREE: "n", ANNULEE: "n" };

function Demande({ d, onChange }) {
  const [busy, setBusy] = useState(false);
  const next = FLOW[FLOW.indexOf(d.status) + 1];
  const facturable = d.lines.some((l) => l.source === "ECOLE" && l.unit_price_ht != null) && !d.invoice_id;

  async function setStatus(status) {
    setBusy(true);
    try { await updateShopRequest(d.id, { status }); onChange(); } finally { setBusy(false); }
  }
  async function facturer() {
    setBusy(true);
    try { await invoiceShopRequest(d.id); onChange(); } finally { setBusy(false); }
  }
  async function supprimer() {
    if (!window.confirm(`Supprimer définitivement la demande ${d.ref} de ${d.learner.last_name} ${d.learner.first_name} ?`)) return;
    setBusy(true);
    try { await deleteShopRequest(d.id); onChange(); }
    catch (e) { window.alert(e.message || "Suppression impossible."); }
    finally { setBusy(false); }
  }

  return (
    <Card title={
      <span className="card-ttl" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="avatar" style={{ width: 28, height: 28, flex: "0 0 28px", fontSize: 11 }}>
          {initials(d.learner.first_name, d.learner.last_name)}
        </span>
        <b>{d.learner.last_name} {d.learner.first_name}</b>
        <span className="tnum hint">{d.ref}</span>
        <span className={"badge " + (TONE[d.status] || "n")}>{LABEL[d.status] || d.status}</span>
        {d.has_partner ? <span className="badge n">partenaire</span> : null}
      </span>
    }>
      <p className="hint" style={{ margin: "0 0 10px" }}>
        {d.learner.email || "—"} · {d.learner.phone || "—"} · demandé le {new Date(d.created_at).toLocaleDateString("fr-FR")}
      </p>

      {d.lines.map((l, i) => (
        <div key={i}>
          <div className="cart-row">
            <b className="cart-lbl">{l.label}
              {l.source === "PARTENAIRE" ? <span className="badge n" style={{ marginLeft: 6 }}>partenaire</span> : null}</b>
            <span className="tnum" style={{ width: 34, textAlign: "right" }}>× {l.qty}</span>
            <b className="tnum cart-sum">
              {l.unit_price_ht == null ? <span className="hint">à définir</span>
                : euro(l.unit_price_ht * l.qty * (1 + l.tax_rate / 100))}
            </b>
          </div>
          {/* Ce qu'il faut broder. C'est l'info la plus critique de la demande : sans elle,
              la veste part chez le brodeur sans nom. Elle doit sauter aux yeux. */}
          {l.personalization ? (
            <div className="cart-perso">
              <label>À broder</label>
              <b style={{ fontSize: 14 }}>{l.personalization}</b>
            </div>
          ) : null}
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 700 }}>Total</span>
        <b className="tnum" style={{ fontSize: 17 }}>{euro(d.total_ttc)} <span className="hint" style={{ fontWeight: 400 }}>TTC</span></b>
      </div>
      {d.tarif_a_definir ? <p className="hint" style={{ margin: "6px 0 0", color: "var(--orange)" }}>
        Des articles partenaires sont « sur demande » : leur prix n'est pas dans ce total.
      </p> : null}

      {d.note ? <p className="hint" style={{ margin: "10px 0 0" }}>
        <Icon name="message-circle" size={13} style={{ verticalAlign: "-2px" }} /> « {d.note} »
      </p> : null}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        {next ? <button className="btn sm primary" onClick={() => setStatus(next)} disabled={busy}>
          <Icon name="chevron-right" size={14} /> {LABEL[next]}
        </button> : null}
        {facturable ? <button className="btn sm" onClick={facturer} disabled={busy}>
          <Icon name="file-text" size={14} /> Créer la facture
        </button> : null}
        {d.invoice_id ? <span className="badge g"><Icon name="check" size={12} /> Facturée</span> : null}
        <span style={{ flex: 1 }} />
        {d.status !== "ANNULEE" ? <button className="btn sm ghost" onClick={() => setStatus("ANNULEE")} disabled={busy}>Annuler</button> : null}
        {!d.invoice_id ? <button className="btn sm ghost danger" onClick={supprimer} disabled={busy} title="Supprimer la demande"><Icon name="trash" size={14} /></button> : null}
      </div>
    </Card>
  );
}

function DemandesBoutique() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const load = () => getShopRequests(filter || undefined).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  useEffect(() => { setRows(null); load(); /* eslint-disable-next-line */ }, [filter]);

  return (
    <>
      <PageHead eyebrow="Boutique" title="Demandes des stagiaires"
        lead="Ce que tes stagiaires ont demandé depuis leur espace. Tu prépares, tu remets en main propre, tu factures." />

      <div className="rayon-tabs" style={{ marginBottom: 16 }}>
        <button className={"rayon-tab" + (filter === "" ? " on" : "")} onClick={() => setFilter("")}>Toutes</button>
        {FLOW.concat("ANNULEE").map((s) => (
          <button key={s} className={"rayon-tab" + (filter === s ? " on" : "")} onClick={() => setFilter(s)}>{LABEL[s]}</button>
        ))}
      </div>

      {rows === null ? <p className="hint">Chargement…</p>
        : !rows.length ? <EmptyState icon="package" title="Aucune demande"
            text="Quand un stagiaire validera son panier depuis la boutique, sa demande arrivera ici avec son identité et ses articles." />
        : rows.map((d) => <Demande key={d.id} d={d} onChange={load} />)}
    </>
  );
}

export default DemandesBoutique;
