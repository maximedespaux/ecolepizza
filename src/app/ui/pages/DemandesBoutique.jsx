import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Icon } from "../components/Icon.jsx";
import PaiementSplit, { resolvePayments } from "../components/PaiementSplit.jsx";
import { euro } from "../lib/format.js";
import { initials } from "../lib/format.js";
import { getShopRequests, updateShopRequest, invoiceShopRequest, deleteShopRequest, deleteAllShopRequests, getEmitters, getTemplates, getShopSettings } from "../api/apiClient.js";

// Créneau de retrait en clair (« lundi 27 juillet »), comme côté stagiaire : une date
// ISO nue se relit mal quand on prépare les commandes de la journée.
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
function labelJour(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return `${JOURS[new Date(y, m - 1, d).getDay()]} ${d} ${MOIS[m - 1]}`;
}

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

// On encaisse AVANT de facturer : la facture constate un paiement reçu, elle ne le
// précède pas. C'est aussi l'ordre que le serveur déclare (STATUSES).
const FLOW = ["NOUVELLE", "EN_PREPARATION", "PRETE", "PAYE", "FACTUREE", "REMISE"];
const LABEL = {
  NOUVELLE: "Reçue", EN_PREPARATION: "En préparation", PRETE: "Prête à retirer",
  PAYE: "Payé", FACTUREE: "Facturé", REMISE: "Remis", ANNULEE: "Annulée",
};
/* Classes réellement définies dans app.css : g (vert) · a (ambre) · r (rouge) · b (bleu) · n (neutre).
   Une classe inventée sortirait un badge sans style, et le build n'en dirait rien. */
const TONE = { NOUVELLE: "r", EN_PREPARATION: "a", PRETE: "g", PAYE: "a", FACTUREE: "n", REMISE: "b", ANNULEE: "n" };

function Demande({ d, onChange, onErreur }) {
  const [busy, setBusy] = useState(false);
  const [factureOuverte, setFactureOuverte] = useState(false);
  const idx = FLOW.indexOf(d.status);            // position dans le flux (−1 si ANNULEE)
  const inFlow = idx >= 0;
  const hasInvoice = !!d.invoice_id;
  const prev = idx > 0 ? FLOW[idx - 1] : null;
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  const facturable = d.lines.some((l) => l.source === "ECOLE" && l.unit_price_ht != null) && !hasInvoice;
  // On peut reculer, mais pas repasser AVANT « Facturé » quand une facture existe
  // (cela reviendrait à annuler la facture). À la dernière étape (Remis, terminé) : plus de recul.
  const factIdx = FLOW.indexOf("FACTUREE");
  const isLast = idx === FLOW.length - 1;
  const canPrev = !!prev && d.status !== "ANNULEE" && !isLast && !(hasInvoice && FLOW.indexOf(prev) < factIdx);
  // « Suivant » gère TOUTES les transitions, facture comprise : à l'étape Payé, avancer
  // vers Facturé CRÉE la facture (si facturable) ; sinon simple changement de statut.
  const canNext = !!next && d.status !== "ANNULEE";
  const nextIsFacture = next === "FACTUREE" && facturable;

  async function setStatus(status) {
    setBusy(true);
    try { await updateShopRequest(d.id, { status }); onChange(); } finally { setBusy(false); }
  }
  /* Facturer ouvre d'abord un choix : QUI facture (entité émettrice) et sous QUELLE présentation
   * (modèle). Ces deux-là étaient subis — la facture naissait sans émettrice, donc avec un numéro
   * BQ hors des séquences officielles, et son modèle était deviné au moment du PDF. On confirme
   * aussi le destinataire choisi par le stagiaire, qui a pu se tromper. */
  async function facturer(choix) {
    setBusy(true);
    try { await invoiceShopRequest(d.id, choix); onChange(); }
    catch (e) { onErreur(e.message || "Facturation impossible."); }
    finally { setBusy(false); }
  }
  // Étape suivante : crée la facture si on passe à « Facturé » (et que c'est facturable),
  // sinon avance simplement le statut.
  async function goNext() {
    if (!next) return;
    if (nextIsFacture) return setFactureOuverte(true);
    setBusy(true);
    try { await updateShopRequest(d.id, { status: next }); onChange(); } finally { setBusy(false); }
  }
  async function supprimer() {
    if (!window.confirm(`Supprimer définitivement la demande ${d.ref} de ${d.learner.last_name} ${d.learner.first_name} ?`)) return;
    setBusy(true);
    try { await deleteShopRequest(d.id); onChange(); }
    catch (e) { onErreur(e.message || "Suppression impossible."); }
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

      {/* Créneau de retrait : QUAND le stagiaire passe chercher. Saisi par lui, mis en
          évidence ici — c'est ce qui dicte l'ordre de préparation. */}
      <div className="cart-perso" style={{ marginBottom: 10 }}>
        <label>Retrait</label>
        {d.pickup_at
          ? <b style={{ fontSize: 14 }}>{labelJour(String(d.pickup_at).slice(0, 10))} à {String(d.pickup_at).slice(11, 16)}</b>
          : <span className="hint">Non précisé — le stagiaire passera quand il pourra</span>}
      </div>

      {d.lines.map((l, i) => (
        <div key={i}>
          <div className="cart-row">
            <b className="cart-lbl">{l.label}
              {/* Déclinaison (taille · coupe, couleur…) : c'est l'article qu'on sort du carton.
                  L'inventaire ne tient qu'une ligne par produit, donc sans ça on ne sait pas
                  quoi préparer. */}
              {l.variant ? <span className="badge b" style={{ marginLeft: 6 }}>{l.variant}</span> : null}
              {l.source === "PARTENAIRE" ? <span className="badge n" style={{ marginLeft: 6 }}>partenaire</span> : null}</b>
            <span className="tnum" style={{ width: 34, textAlign: "right" }}>× {l.qty}</span>
            <b className="tnum cart-sum">
              {l.unit_price_ht == null ? <span className="hint">à définir</span>
                : euro(l.unit_price_ht * l.qty * (1 + l.tax_rate / 100))}
            </b>
          </div>
          {/* Remise stagiaire consentie sur cette ligne, telle qu'elle a été FIGÉE à la commande.
              Sans elle, l'école voyait un total sans savoir d'où venait l'écart avec le prix
              catalogue — et ne pouvait pas répondre à un stagiaire qui conteste son montant.
              Placée SOUS la ligne, comme la broderie : la ligne principale est déjà dense. */}
          {l.discount_pct > 0 && l.unit_price_gross_ht != null ? (
            <div className="cart-perso" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px" }}>
              <label style={{ margin: 0 }}>Remise stagiaire</label>
              <span className="tnum" style={{ textDecoration: "line-through", color: "var(--muted)" }}>
                {euro(l.unit_price_gross_ht * l.qty * (1 + l.tax_rate / 100))}
              </span>
              <span className="badge g">−{Number.isInteger(l.discount_pct) ? l.discount_pct : l.discount_pct.toFixed(2).replace(".", ",")} %</span>
              <b className="tnum">{euro(l.unit_price_ht * l.qty * (1 + l.tax_rate / 100))}</b>
              <span className="hint">
                soit {euro((l.unit_price_gross_ht - l.unit_price_ht) * l.qty * (1 + l.tax_rate / 100))} d'économie
              </span>
            </div>
          ) : null}
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
        {canNext ? <button className="btn sm primary" onClick={goNext} disabled={busy}
          style={next === "REMISE" ? { background: "var(--green)", borderColor: "transparent" } : undefined}>
          {nextIsFacture
            ? <><Icon name="file-text" size={14} /> Créer la facture</>
            : next === "REMISE"
              ? <><Icon name="check" size={14} /> Terminé (remis)</>
              : <>Suivant : {LABEL[next]} <Icon name="chevron-right" size={14} /></>}
        </button> : null}
        {d.invoice_id ? <span className="badge g"><Icon name="check" size={12} /> Facturée</span> : null}
        <span style={{ flex: 1 }} />
        {d.status === "ANNULEE"
          ? <button className="btn sm ghost" onClick={() => setStatus("NOUVELLE")} disabled={busy}>Réactiver</button>
          : !isLast ? <button className="btn sm ghost" onClick={() => setStatus("ANNULEE")} disabled={busy}>Annuler</button> : null}
        {!d.invoice_id ? <button className="btn sm ghost danger" onClick={supprimer} disabled={busy} title="Supprimer la demande"><Icon name="trash" size={14} /></button> : null}
      </div>
      {factureOuverte && (
        <FacturerModal d={d} busy={busy}
          onClose={() => setFactureOuverte(false)}
          onValider={(choix) => { setFactureOuverte(false); facturer(choix); }} />
      )}
    </Card>
  );
}

/**
 * Choix avant émission : destinataire, entité émettrice, modèle.
 *
 * Les trois se décident ICI, et pas au panier du stagiaire : lui demander qui paie l'obligerait à
 * connaître un accord commercial entre son employeur et l'école, qu'il ne connaît pas forcément —
 * et l'école devrait de toute façon revérifier derrière.
 *
 * Les trois étaient SUBIS. L'acheteur était le stagiaire en dur, même quand son employeur payait.
 * Aucune émettrice n'était posée, donc la facture prenait un numéro BQ-AAAA-NNNN à part, hors des
 * séquences officielles. Et le modèle était deviné au moment du PDF par `pickInvoiceTemplate` :
 * on découvrait la présentation retenue en ouvrant le document.
 */
function FacturerModal({ d, busy, onClose, onValider }) {
  const [emetteurs, setEmetteurs] = useState([]);
  const [modeles, setModeles] = useState([]);
  const [emetteurId, setEmetteurId] = useState("");
  const [slug, setSlug] = useState("");
  const [moyens, setMoyens] = useState([]);
  const [paiements, setPaiements] = useState([{ method: "", amount: "" }]);
  // Total TTC des seules lignes ÉCOLE : c'est ce que l'école encaisse (une ligne partenaire
  // est vendue par le partenaire, cf. invoiceShopRequest).
  const totalTtc = (d.lines || [])
    .filter((l) => l.source === "ECOLE" && l.unit_price_ht != null)
    .reduce((s2, l) => s2 + l.unit_price_ht * l.qty * (1 + l.tax_rate / 100), 0);
  /* Échéance au JOUR MÊME par défaut : à ce stade le paiement a déjà eu lieu (« Payé » précède
   * « Facturé »), la facture ne fait que le constater — rien n'est dû plus tard. Modifiable pour
   * le cas où l'on facture une entreprise qui règlera à réception. */
  const [echeance, setEcheance] = useState(() => new Date().toISOString().slice(0, 10));
  // L'entreprise n'est proposée que si le stagiaire a un employeur. Le stagiaire n'a rien choisi
  // au panier : c'est l'école qui sait s'il y a prise en charge, et elle le décide ici.
  // Par défaut on facture le stagiaire — la prise en charge est l'exception, pas la règle.
  const aEntreprise = !!d.company_id;
  const [billTo, setBillTo] = useState("STAGIAIRE");

  useEffect(() => {
    getEmitters().then((r) => {
      const l = r.data || [];
      setEmetteurs(l);
      setEmetteurId((l.find((e) => e.is_default) || {}).id || "");
    }).catch(() => {});
    getShopSettings().then((r) => {
      const l = String(r.data?.payment_methods || "").split(",").map((x) => x.trim()).filter(Boolean);
      setMoyens(l);
      if (l.length) setPaiements([{ method: l[0], amount: "" }]);
    }).catch(() => {});
    getTemplates().then((r) => {
      const l = (r.data || []).filter((t) => String(t.doc_type || "").toUpperCase() === "FACTURE"
        && t.active !== false && t.active !== 0);
      setModeles(l);
      if (l.length === 1) setSlug(l[0].slug); // un seul modèle : rien à choisir
    }).catch(() => {});
  }, []);

  /* PORTAIL OBLIGATOIRE. La modale était rendue DANS la carte de la demande, et `.card` porte un
   * `transform` (l'animation `rise` le laisse en matrice identité au repos). Or tout `transform`
   * autre que `none` fait de l'élément le BLOC CONTENEUR d'un enfant `position:fixed` : le voile
   * ne couvrait plus la fenêtre mais la carte — 435px — et la modale, centrée là-dedans,
   * descendait sous le bord de l'écran. Le pied, donc « Créer la facture », devenait
   * inatteignable : rien ne défilait, ni la page ni la modale.
   * `document.body` n'a aucun ancêtre transformé : le `fixed` retrouve la fenêtre. */
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>Facturer la demande {d.ref}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <div className="field">
            <label>Facturer à</label>
            {aEntreprise ? (
              <select className="inp" value={billTo} onChange={(e) => setBillTo(e.target.value)}>
                <option value="STAGIAIRE">{d.learner.last_name} {d.learner.first_name} (le stagiaire)</option>
                <option value="ENTREPRISE">{d.company_name || "Son entreprise"}</option>
              </select>
            ) : (
              <p className="hint" style={{ margin: 0 }}>
                {d.learner.last_name} {d.learner.first_name} — ce stagiaire n'est rattaché à aucune entreprise.
              </p>
            )}
          </div>
          <div className="field">
            <label>Entité émettrice</label>
            <select className="inp" value={emetteurId} onChange={(e) => setEmetteurId(e.target.value)}>
              <option value="">— Aucune (numéro BQ séparé) —</option>
              {emetteurs.map((e) => <option key={e.id} value={e.id}>{e.legal_name || e.name}</option>)}
            </select>
            <p className="hint" style={{ margin: "6px 0 0" }}>
              Elle donne le numéro de facture et l'identité imprimée en en-tête.
            </p>
          </div>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="field">
              <label>Date d'échéance</label>
              <input className="inp" type="date" value={echeance} onChange={(e) => setEcheance(e.target.value)} />
            </div>
            <div className="field">
              <label>Total encaissé</label>
              <div className="inp" style={{ display: "flex", alignItems: "center", background: "var(--surface2)" }}>
                <b className="mono">{euro(totalTtc)}</b>
              </div>
            </div>
          </div>
          {/* Règlement ventilé — MÊME composant que la caisse : un stagiaire peut payer
              30 € en espèces et le reste en carte. Le champ unique d'avant obligeait à
              choisir un moyen et à taire l'autre. */}
          <div className="field">
            <label>Règlement</label>
            <PaiementSplit options={moyens} total={totalTtc} rows={paiements} onChange={setPaiements} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Modèle de facture</label>
            <select className="inp" value={slug} onChange={(e) => setSlug(e.target.value)}>
              <option value="">— Choisir automatiquement —</option>
              {modeles.map((t) => <option key={t.slug} value={t.slug}>{t.title || t.slug}</option>)}
            </select>
            {!modeles.length && (
              <p className="hint" style={{ margin: "6px 0 0", color: "var(--ember1)" }}>
                Aucun modèle de type FACTURE actif : la facture ne pourra pas être éditée en PDF.
              </p>
            )}
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" disabled={busy}
            onClick={() => onValider({
              bill_to: billTo,
              billing_profile_id: emetteurId || null,
              template_slug: slug || null,
              payments: resolvePayments(paiements, totalTtc).parts,
              due_date: echeance || null,
            })}>
            {busy ? "Création…" : "Créer la facture"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function DemandesBoutique() {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("");
  const [purging, setPurging] = useState(false);
  // Les résultats de suppression passaient par `window.alert` : seul point de cet écran à
  // sortir de la charte, et un message qu'il fallait congédier d'un clic avant de pouvoir
  // regarder la liste qu'il commentait.
  const [statut, setStatut] = useState(null);
  const load = () => getShopRequests(filter || undefined).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  useEffect(() => { setRows(null); load(); /* eslint-disable-next-line */ }, [filter]);

  // PURGE TOTALE : supprime toutes les demandes, quel que soit leur statut. Double
  // confirmation (dont une saisie) car l'action est irréversible.
  async function purgerTout() {
    if (!window.confirm("Supprimer DÉFINITIVEMENT TOUTES les demandes boutique (tous statuts confondus) ?\nCette action est irréversible.")) return;
    const t = window.prompt('Pour confirmer, tape « SUPPRIMER » :');
    if (String(t || "").trim().toUpperCase() !== "SUPPRIMER") return;
    setPurging(true);
    try { const { deleted } = await deleteAllShopRequests(); setStatut({ type: "success", message: `${deleted} demande(s) supprimée(s).` }); load(); }
    catch (e) { setStatut({ type: "error", message: e.message || "Suppression impossible." }); }
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

      <StatusMessage status={statut} />

      <div className="rayon-tabs" style={{ marginBottom: 16 }}>
        <button className={"rayon-tab" + (filter === "" ? " on" : "")} onClick={() => setFilter("")}>Toutes</button>
        {FLOW.concat("ANNULEE").map((s) => (
          <button key={s} className={"rayon-tab" + (filter === s ? " on" : "")} onClick={() => setFilter(s)}>{LABEL[s]}</button>
        ))}
      </div>

      {rows === null ? <p className="hint">Chargement…</p>
        : !rows.length ? <EmptyState icon="package" title="Aucune demande"
            text="Quand un stagiaire validera son panier depuis la boutique, sa demande arrivera ici avec son identité et ses articles." />
        : rows.map((d) => <Demande key={d.id} d={d} onChange={load} onErreur={(m) => setStatut({ type: "error", message: m })} />)}
    </>
  );
}

export default DemandesBoutique;
