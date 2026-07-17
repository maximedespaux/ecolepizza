import { useEffect, useState } from "react";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { euro } from "../lib/format.js";
import { initials } from "../lib/format.js";
import { getShopRequests, updateShopRequest, invoiceShopRequest, deleteShopRequest, deleteAllShopRequests } from "../api/apiClient.js";

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

const FLOW = ["NOUVELLE", "EN_PREPARATION", "PRETE", "PAYE", "FACTUREE", "REMISE"];
const LABEL = {
  NOUVELLE: "Reçue", EN_PREPARATION: "En préparation", PRETE: "Prête à retirer",
  PAYE: "Payé", FACTUREE: "Facturé", REMISE: "Remis", ANNULEE: "Annulée",
};
/* Classes réellement définies dans app.css : g (vert) · a (ambre) · r (rouge) · b (bleu) · n (neutre).
   Une classe inventée sortirait un badge sans style, et le build n'en dirait rien. */
const TONE = { NOUVELLE: "r", EN_PREPARATION: "a", PRETE: "g", PAYE: "a", FACTUREE: "n", REMISE: "b", ANNULEE: "n" };

function Demande({ d, onChange }) {
  const [busy, setBusy] = useState(false);
  const idx = FLOW.indexOf(d.status);            // position dans le flux (−1 si ANNULEE)
  const inFlow = idx >= 0;
  const hasInvoice = !!d.invoice_id;
  const prev = idx > 0 ? FLOW[idx - 1] : null;
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  const facturable = d.lines.some((l) => l.source === "ECOLE" && l.unit_price_ht != null) && !hasInvoice;
  // On ne peut plus reculer une fois la facture émise.
  const canPrev = !!prev && d.status !== "ANNULEE" && !hasInvoice;
  // « Suivant » gère TOUTES les transitions, facture comprise : à l'étape Payé, avancer
  // vers Facturé CRÉE la facture (si facturable) ; sinon simple changement de statut.
  const canNext = !!next && d.status !== "ANNULEE";
  const nextIsFacture = next === "FACTUREE" && facturable;

  async function setStatus(status) {
    setBusy(true);
    try { await updateShopRequest(d.id, { status }); onChange(); } finally { setBusy(false); }
  }
  async function facturer() {
    setBusy(true);
    try { await invoiceShopRequest(d.id); onChange(); } finally { setBusy(false); }
  }
  // Étape suivante : crée la facture si on passe à « Facturé » (et que c'est facturable),
  // sinon avance simplement le statut.
  async function goNext() {
    if (!next) return;
    if (nextIsFacture) return facturer();
    setBusy(true);
    try { await updateShopRequest(d.id, { status: next }); onChange(); } finally { setBusy(false); }
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

      {/* Étapes de la commande (progression). */}
      {inFlow ? (
        <div className="cmd-steps">
          {FLOW.map((s, i) => (
            <div key={s} className={"cmd-step" + (i < idx ? " done" : i === idx ? " on" : "")}>
              <span className="cmd-dot">{i < idx ? <Icon name="check" size={12} /> : i + 1}</span>
              <span className="cmd-step-lbl">{LABEL[s]}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="hint" style={{ margin: "14px 0 0", color: "var(--ember1)" }}><Icon name="x" size={13} style={{ verticalAlign: "-2px" }} /> Demande annulée.</p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        {canPrev ? <button className="btn sm ghost" onClick={() => setStatus(prev)} disabled={busy}>
          <Icon name="chevron-left" size={14} /> Précédent
        </button> : null}
        {canNext ? <button className="btn sm primary" onClick={goNext} disabled={busy}>
          {nextIsFacture
            ? <><Icon name="file-text" size={14} /> Créer la facture</>
            : <>Suivant : {LABEL[next]} <Icon name="chevron-right" size={14} /></>}
        </button> : null}
        {d.invoice_id ? <span className="badge g"><Icon name="check" size={12} /> Facturée</span> : null}
        <span style={{ flex: 1 }} />
        {d.status !== "ANNULEE"
          ? <button className="btn sm ghost" onClick={() => setStatus("ANNULEE")} disabled={busy}>Annuler</button>
          : <button className="btn sm ghost" onClick={() => setStatus("NOUVELLE")} disabled={busy}>Réactiver</button>}
        {!d.invoice_id ? <button className="btn sm ghost danger" onClick={supprimer} disabled={busy} title="Supprimer la demande"><Icon name="trash" size={14} /></button> : null}
      </div>
    </Card>
  );
}

function DemandesBoutique() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const [purging, setPurging] = useState(false);
  const load = () => getShopRequests(filter || undefined).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  useEffect(() => { setRows(null); load(); /* eslint-disable-next-line */ }, [filter]);

  // PURGE TOTALE : supprime toutes les demandes, quel que soit leur statut. Double
  // confirmation (dont une saisie) car l'action est irréversible.
  async function purgerTout() {
    if (!window.confirm("Supprimer DÉFINITIVEMENT TOUTES les demandes boutique (tous statuts confondus) ?\nCette action est irréversible.")) return;
    const t = window.prompt('Pour confirmer, tape « SUPPRIMER » :');
    if (String(t || "").trim().toUpperCase() !== "SUPPRIMER") return;
    setPurging(true);
    try { const { deleted } = await deleteAllShopRequests(); window.alert(`${deleted} demande(s) supprimée(s).`); load(); }
    catch (e) { window.alert(e.message || "Suppression impossible."); }
    finally { setPurging(false); }
  }

  return (
    <>
      <PageHead eyebrow="Boutique" title="Demandes des stagiaires"
        lead="Ce que tes stagiaires ont demandé depuis leur espace. Tu prépares, tu remets en main propre, tu factures."
        actions={rows && rows.length ? (
          <button className="btn sm ghost danger" onClick={purgerTout} disabled={purging} title="Supprimer toutes les demandes, quel que soit leur statut">
            <Icon name="trash" size={14} /> {purging ? "Suppression…" : "Tout supprimer"}
          </button>
        ) : null} />

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
