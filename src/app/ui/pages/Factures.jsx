import { useEffect, useMemo, useRef, useState } from "react";
import MoneyToggle from "../components/MoneyToggle.jsx";
import { Icon } from "../components/Icon.jsx";
import InfosManquantes from "../components/InfosManquantes.jsx";
import { getInvoices, createInvoice, updateInvoice, recordPayment, deleteInvoice, getSessionsAFacturer, getCompanies, downloadFacturX, downloadInvoiceXml, facturXUrl, getTemplates, getEmitters } from "../api/apiClient.js";
import PaiementSplit, { resolvePayments } from "../components/PaiementSplit.jsx";
// Le TTC comme le PDF le calcule : le règlement doit tomber dessus au centime.
import { ttcDe } from "../lib/ttc.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import MenuActions from "../components/MenuActions.jsx";
import { Field, SelectField } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { euro, dateFr } from "../lib/format.js";
import SelecteurSemaine from "../components/SelecteurSemaine.jsx";
import { grouperParSemaine, semaineParDefaut } from "../lib/sessions.js";
import { basculer, estCoche, toutCocher, toutEstCoche, aFacturer } from "../lib/lignesFacture.js";
import { bumpBadges } from "../lib/events.js";

const TYPES = [["DEVIS", "Devis"], ["ACOMPTE", "Acompte"], ["FACTURE", "Facture"], ["AVOIR", "Avoir"]];
const STATUS = { BROUILLON: ["Brouillon", "n"], EMISE: ["Émise", "b"], PAYEE: ["Payée", "g"], IMPAYEE: ["Impayée", "r"], ANNULEE: ["Annulée", "n"] };
/* CE QUI DOIT ENCORE ÊTRE PAYÉ REMONTE. La page répond à « qui me doit de l'argent » ; les
   impayées y étaient mêlées aux payées, dans l'ordre d'émission. Le tri est STABLE (garanti
   depuis ES2019) : à statut égal, l'ordre d'origine — donc chronologique — est conservé. */
const RANG_STATUT = { IMPAYEE: 0, EMISE: 1, BROUILLON: 2, PAYEE: 3, ANNULEE: 4 };

// Une ligne LIBRE, sans dossier ; celles des stagiaires naissent des cases cochées (lib/lignesFacture.js).
const emptyLine = () => ({ enrollment_id: "", description: "", amount_net: "" });
const makeEmpty = (modele = "") => ({ type: "FACTURE", company_id: "", tva_exoneree: 1, due_date: "", template_slug: modele, lines: [] });
const periodeSession = (s) => (s.fin && s.fin !== s.debut ? `du ${dateFr(s.debut)} au ${dateFr(s.fin)}` : dateFr(s.debut));

const MOYENS_DEFAUT = "Espèces,CB,Virement,Chèque";

/* Le règlement DÉJÀ posé sur un brouillon → les lignes de PaiementSplit. La ventilation s'il y en a
   une (le dernier montant, lui, se recalcule toujours), sinon le moyen seul, sinon le premier moyen. */
function lignesDuReglement(inv, moyens) {
  let parts;
  try { parts = JSON.parse(inv.payment_split || "[]"); } catch { parts = []; }
  if (Array.isArray(parts) && parts.length) {
    return parts.map((p) => ({ method: p.method || "", amount: String(p.amount ?? ""), bank: p.bank || "", cheque_number: p.cheque_number || "" }));
  }
  return [{ method: inv.payment_method || moyens[0] || "", amount: "" }];
}

function Factures() {
  // `null` et non `[]` : c'est ce qui distingue « on charge » de « c'est vide ». À `[]`, la
  // page annonçait « Aucun document de facturation » pendant tout le chargement.
  const [invoices, setInvoices] = useState(null);
  const [totals, setTotals] = useState({ emis: 0, paye: 0, impaye: 0 });
  /* LES SESSIONS ET LEURS STAGIAIRES, pour choisir qui facturer (2026-09-30). `null` : en cours de
     chargement. La liste de TOUS les dossiers qu'on chargeait ici (avec l'avancement de chacun, pour
     un menu déroulant) ne sert plus. */
  const [sessions, setSessions] = useState(null);
  const [semaine, setSemaine] = useState("");
  // Une entreprise choisie restreint la liste à ses stagiaires ; ce lien montre toute la session.
  const [tousLesStagiaires, setTousLesStagiaires] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(makeEmpty);
  const [status, setStatus] = useState(null);
  // Informations à compléter renvoyées par un refus d'émission (422), + de quoi forcer.
  const [manques, setManques] = useState(null);
  const [showForm, setShowForm] = useState(false);
  /* LE MODÈLE ET LE RÈGLEMENT (2026-09-28). « Nouveau document » ne les demandait pas : le modèle
     se devinait au moment du PDF, et le règlement restait vide — un modèle qui imprime « Moyens et
     montants réglés » refusait alors l'édition, sans que rien ne permette de le compléter. */
  const [modeles, setModeles] = useState([]);   // modèles FACTURE actifs
  const [moyens, setMoyens] = useState([]);     // moyens de paiement de l'entité par défaut
  const [paiements, setPaiements] = useState([{ method: "", amount: "" }]);
  // Brouillon en cours de complément : { inv, modele, paiements } — ou null.
  const [complement, setComplement] = useState(null);
  const refComplement = useRef(null);

  async function load() {
    try {
      const r = await getInvoices();
      setInvoices(r.data);
      setTotals(r.totals);
      bumpBadges();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  function chargerSessions() {
    getSessionsAFacturer().then((r) => setSessions(r.data || [])).catch(() => setSessions([]));
  }
  useEffect(() => {
    load();
    chargerSessions();
    getCompanies().then((r) => setCompanies(r.data)).catch(() => {});
    getTemplates().then((r) => {
      const l = (r.data || []).filter((t) => String(t.doc_type || "").toUpperCase() === "FACTURE" && t.active !== false && t.active !== 0);
      setModeles(l);
      // Un seul modèle : rien à choisir, il est pré-sélectionné.
      if (l.length === 1) setForm((p) => (p.template_slug ? p : { ...p, template_slug: l[0].slug }));
    }).catch(() => {});
    /* LES MOYENS DE L'ENTITÉ PAR DÉFAUT — celle sous laquelle ce document sortira —, comme à la
       caisse. Ils se règlent dans Paramètres → Facturation (« Autre moyen… » en ajoute un). */
    const poser = (liste) => {
      const l = String(liste || MOYENS_DEFAUT).split(",").map((x) => x.trim()).filter(Boolean);
      setMoyens(l);
      setPaiements([{ method: l[0] || "", amount: "" }]);
    };
    getEmitters().then((r) => {
      const l = r.data || [];
      poser((l.find((e) => e.is_default) || l[0] || {}).payment_methods);
    }).catch(() => poser(null));
  }, []);

  // Le formulaire de complément s'ouvre au-dessus de la liste : on l'amène sous les yeux.
  const idComplement = complement ? complement.inv.id : null;
  useEffect(() => {
    if (idComplement) refComplement.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [idComplement]);

  const lignes = useMemo(() => {
    if (!invoices) return null;
    return [...invoices].sort((a, b) => (RANG_STATUT[a.status] ?? 9) - (RANG_STATUT[b.status] ?? 9));
  }, [invoices]);

  const set = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const setLine = (i, k, v) => setForm((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));
  const addLine = () => setForm((p) => ({ ...p, lines: [...p.lines, emptyLine()] }));
  // Plus de « dernière ligne » à garder : sans ligne, le bouton Créer attend, et rien ne part.
  const delLine = (i) => setForm((p) => ({ ...p, lines: p.lines.filter((_, j) => j !== i) }));
  const cocher = (d) => setForm((p) => ({ ...p, lines: basculer(p.lines, d) }));
  const cocherTout = (dossiers, oui) => setForm((p) => ({ ...p, lines: toutCocher(p.lines, dossiers, oui) }));

  const companyId = form.company_id;
  const entreprise = companyId ? companies.find((c) => c.id === companyId) || null : null;
  const filtrer = !!entreprise && !tousLesStagiaires;
  const deLEntreprise = (d) => d.company_id === companyId;
  // Chaque entreprise choisie repart sur SES stagiaires — « voir tous » ne survit pas au changement.
  useEffect(() => { setTousLesStagiaires(false); }, [companyId]);
  /* Les sessions PROPOSÉES : une entreprise choisie ne montre que celles où elle a des stagiaires,
     comptés pour elle seule — on cherche sa semaine, pas celle des autres. */
  const sessionsProposees = useMemo(() => {
    if (!sessions) return [];
    if (!filtrer) return sessions;
    return sessions
      .map((x) => ({ ...x, inscrits: x.dossiers.filter((d) => d.company_id === companyId).length }))
      .filter((x) => x.inscrits > 0);
  }, [sessions, filtrer, companyId]);
  const sessionsDeLaSemaine = useMemo(
    () => (grouperParSemaine(sessionsProposees).find((g) => g.cle === semaine)?.sessions || [])
      .map((n) => sessionsProposees.find((x) => x.id === n.id)).filter(Boolean),
    [sessionsProposees, semaine]);
  /* LA SEMAINE OUVERTE : celle d'aujourd'hui, sinon la prochaine — on facture ce qu'on enseigne. Et
     quand une entreprise n'a rien dans la semaine choisie, on ouvre sur la sienne. */
  useEffect(() => {
    if (!sessions) return;
    const groupes = grouperParSemaine(sessionsProposees);
    if (!groupes.some((g) => g.cle === semaine)) setSemaine(semaineParDefaut(groupes) || "");
  }, [sessions, sessionsProposees, semaine]);
  // Le nom d'un dossier, pour dire QUI est sur chaque ligne.
  const dossiersParId = useMemo(() => {
    const m = new Map();
    for (const x of sessions || []) for (const d of x.dossiers) m.set(d.enrollment_id, { ...d, formation: x.program_code });
    return m;
  }, [sessions]);
  const formTotal = form.lines.reduce((s, l) => s + (Number(l.amount_net) || 0), 0);
  const formTtc = ttcDe(formTotal, form.tva_exoneree);
  const modeleUnique = modeles.length === 1 ? modeles[0].slug : "";

  async function add(e) {
    e.preventDefault();
    setStatus(null);
    // Le dernier moyen prend le solde ; une répartition qui DÉPASSE le total ne part pas.
    const { parts, valid } = resolvePayments(paiements, formTtc);
    if (!valid) { setStatus({ type: "error", message: "La répartition du règlement dépasse le total à régler." }); return; }
    try {
      const r = await createInvoice({
        type: form.type, company_id: form.company_id || null,
        tva_exoneree: form.tva_exoneree, due_date: form.due_date || null,
        lines: form.lines,
        template_slug: form.template_slug || null,
        payments: parts,
      });
      setForm(makeEmpty(modeleUnique));
      setPaiements([{ method: moyens[0] || "", amount: "" }]);
      setShowForm(false);
      setStatus({ type: "success", message: `Créé : ${r.number}` });
      load();
      chargerSessions(); // « brouillon : … » sous les stagiaires qu'il désigne
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
  /* COMPLÉTER UN BROUILLON : son modèle et son règlement, avant de l'émettre. C'est ce qui débloque
     un brouillon créé sans eux (« Facture non générée … Moyens et montants réglés »). Pré-rempli
     avec ce qu'il porte déjà. Un document émis ne se modifie plus : le serveur refuse. */
  function ouvrirComplement(inv) {
    // Le refus qui a mené ici est traité par ce formulaire : il ne reste pas affiché au-dessus.
    setManques(null); setStatus(null);
    setComplement({ inv, modele: inv.template_slug || "", paiements: lignesDuReglement(inv, moyens) });
  }
  async function enregistrerComplement() {
    const ttc = ttcDe(complement.inv.amount_net, complement.inv.tva_exoneree);
    const { parts, valid } = resolvePayments(complement.paiements, ttc);
    if (!valid) { setStatus({ type: "error", message: "La répartition du règlement dépasse le total à régler." }); return; }
    try {
      await updateInvoice(complement.inv.id, { template_slug: complement.modele || null, payments: parts });
      setStatus({ type: "success", message: `${complement.inv.number} complété : il peut être émis et édité.` });
      setComplement(null);
      load();
    } catch (err) { setStatus({ type: "error", message: err.message }); }
  }

  async function remove(id) {
    if (!window.confirm("Supprimer ce document ?")) return;
    try { await deleteInvoice(id); load(); } catch (err) { setStatus({ type: "error", message: err.message }); }
  }
  /* Le serveur refuse en 422 avec la LISTE de ce qu'il faut compléter (`missing`). Les deux
   * poignées ne gardaient que `err.message` : l'écran annonçait « 2 information(s) à compléter »
   * sans jamais dire lesquelles. On retient donc la liste, et de quoi réessayer en forçant —
   * `forcable` vient du serveur, qui accepte `?force=1` pour les manques de conformité. */
  async function dl(fn, i, force) {
    setStatus(null); setManques(null);
    try { await fn(i.id, i.number, force); }
    catch (err) {
      setStatus({ type: "error", message: err.message });
      if (err.missing) setManques({ liste: err.missing, forcable: !!err.forcable, refaire: () => dl(fn, i, true), facture: i });
    }
  }
  async function preview(i, force) {
    setStatus(null); setManques(null);
    const w = window.open("", "_blank"); // ouvert dans le geste utilisateur (anti-popup)
    try {
      const url = await facturXUrl(i.id, force);
      if (w) w.location.href = url; else window.open(url, "_blank");
    } catch (err) {
      if (w) w.close();
      setStatus({ type: "error", message: err.message });
      if (err.missing) setManques({ liste: err.missing, forcable: !!err.forcable, refaire: () => preview(i, true), facture: i });
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
      {manques && (
        <div style={{ marginBottom: 14 }}>
          <InfosManquantes missing={manques.liste} titre="Facture non générée">
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn sm ghost" onClick={() => setManques(null)}>Fermer</button>
              {/* Ce qui manque est souvent le règlement ou le modèle d'un BROUILLON : on ouvre de
                  quoi les poser, au lieu de laisser chercher où. */}
              {manques.facture?.status === "BROUILLON" && (
                <button type="button" className="btn sm primary" onClick={() => ouvrirComplement(manques.facture)}>
                  Compléter le modèle et le règlement
                </button>
              )}
              {manques.forcable && (
                <button type="button" className="btn sm ghost danger"
                  title="Émet le document malgré les informations manquantes : il ne sera pas conforme."
                  onClick={() => manques.refaire()}>
                  Générer quand même
                </button>
              )}
            </div>
          </InfosManquantes>
        </div>
      )}

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
                <option value="">Aucune</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
              <Field label="Échéance" type="date" value={form.due_date} onChange={set("due_date")} />
            </div>

            {/* QUI FACTURER : les stagiaires d'une SEMAINE, session par session (demandé le 2026-09-30).
                Une liste déroulante de TOUS les dossiers de l'organisme obligeait à les retrouver un à
                un, sans dire lesquels l'étaient déjà — or une facture qui oublie un stagiaire le laisse
                hors de la Comptabilité. Chaque case cochée EST une ligne (lib/lignesFacture.js). */}
            <div className="fac-qui">
              <div className="fac-qui-tete">
                <span className="fac-qui-titre">Stagiaires à facturer</span>
                <SelecteurSemaine sessions={sessionsProposees} valeur={semaine} onChoisir={setSemaine} label="Semaine de la session"
                  vide={sessions === null ? "Chargement…" : filtrer ? `Aucune session avec un stagiaire de ${entreprise.name}.` : "Aucune session."} />
              </div>
              {sessionsDeLaSemaine.length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>
                  {sessions === null ? "Chargement des sessions…"
                    : filtrer && sessionsProposees.length === 0 ? `Aucun stagiaire de ${entreprise.name} dans les sessions.`
                      : "Choisissez une semaine : ses stagiaires s'affichent ici."}
                </p>
              ) : sessionsDeLaSemaine.map((x) => {
                const dossiers = filtrer ? x.dossiers.filter(deLEntreprise) : x.dossiers;
                return (
                  <div key={x.id} className="fac-session">
                    <div className="fac-session-tete">
                      <label className="fac-tout" title="Coche les stagiaires qui ne sont ni facturés ni sur un brouillon">
                        <input type="checkbox" checked={toutEstCoche(form.lines, dossiers)} disabled={aFacturer(dossiers).length === 0}
                          onChange={(e) => cocherTout(dossiers, e.target.checked)} />
                        <b>{x.program_code}</b> <span className="fac-session-titre">{x.program_title}</span>
                      </label>
                      <span className="hint">{periodeSession(x)}</span>
                    </div>
                    {dossiers.map((d) => (
                      <label key={d.enrollment_id} className={"fac-stagiaire" + (estCoche(form.lines, d) ? " on" : "")}>
                        <input type="checkbox" checked={estCoche(form.lines, d)} onChange={() => cocher(d)} />
                        <span className="fac-stagiaire-nom">{d.nom} {d.prenom}</span>
                        {(d.entreprise || d.factures || d.brouillons) && (
                          <span className="fac-stagiaire-info">
                            {d.entreprise && <span>{d.entreprise}</span>}
                            {d.factures && <span className="fac-deja">Facturé : {d.factures}</span>}
                            {d.brouillons && <span>Brouillon : {d.brouillons}</span>}
                          </span>
                        )}
                        <span className="tnum fac-stagiaire-prix">{euro(d.montant)}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
              {entreprise && (
                <p className="hint" style={{ margin: "10px 0 0" }}>
                  {filtrer ? `Seulement les stagiaires de ${entreprise.name}.` : "Tous les stagiaires des sessions."}{" "}
                  <button type="button" className="lien-nu" onClick={() => setTousLesStagiaires((v) => !v)}>
                    {filtrer ? "Voir tous les stagiaires" : `Seulement ${entreprise.name}`}
                  </button>
                </p>
              )}
            </div>

            <label style={{ fontSize: 13, fontWeight: 600, display: "block", margin: "14px 0 6px" }}>Lignes facturées</label>
            {form.lines.length === 0 ? (
              <p className="hint" style={{ margin: "0 0 4px" }}>Cochez des stagiaires ci-dessus, ou ajoutez une ligne libre.</p>
            ) : (
              <div className="fac-lignes">
                {form.lines.map((l, i) => {
                  const d = l.enrollment_id ? dossiersParId.get(l.enrollment_id) : null;
                  return (
                    <div key={l.enrollment_id || `libre-${i}`} className="fac-ligne">
                      <span className="fac-ligne-qui">
                        {d ? <><b>{d.nom} {d.prenom}</b> <span className="hint">{d.formation}</span></> : <span className="hint">{l.enrollment_id ? "Dossier" : "Ligne libre"}</span>}
                      </span>
                      <input className="inp fac-ligne-lib" aria-label="Libellé" placeholder={l.enrollment_id ? "Libellé (par défaut : la formation)" : "Libellé"}
                        value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} />
                      <input className="inp fac-ligne-mnt" aria-label="Montant HT" type="number" step="0.01" min="0" placeholder="Montant HT"
                        value={l.amount_net} onChange={(e) => setLine(i, "amount_net", e.target.value)} />
                      <button type="button" className="iconbtn del fac-ligne-x" title="Retirer la ligne" aria-label="Retirer la ligne" onClick={() => delLine(i)}><Icon name="x" size={14} /></button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn sm ghost" onClick={addLine}>＋ Ajouter une ligne libre</button>
              <span style={{ fontWeight: 700 }}>Total HT : {euro(formTotal)}</span>
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "12px 0", fontSize: 14 }}>
              <input type="checkbox" checked={!!form.tva_exoneree} onChange={(e) => setForm((p) => ({ ...p, tva_exoneree: e.target.checked ? 1 : 0 }))} />
              TVA exonérée (art. 261-4-4° du CGI)
            </label>

            {/* LE MODÈLE ET LE RÈGLEMENT. Le modèle met le document en page ; « automatique » garde la
                règle d'avant (selon l'acheteur). Le règlement remplit « Moyens et montants réglés » :
                plusieurs moyens se répartissent le total, le dernier prenant le solde. */}
            <div className="grid cols-2" style={{ gap: 14, alignItems: "start", marginBottom: 12 }}>
              <SelectField label="Modèle de facture" value={form.template_slug} onChange={set("template_slug")}>
                <option value="">Choisir automatiquement (selon l'acheteur)</option>
                {modeles.map((t) => <option key={t.slug} value={t.slug}>{t.label || t.slug}</option>)}
              </SelectField>
              <div>
                <PaiementSplit options={moyens} total={formTtc} rows={paiements} onChange={setPaiements} />
                <p className="hint" style={{ margin: "2px 0 0" }}>
                  Total à régler : <b>{euro(formTtc)}</b>{Number(form.tva_exoneree) ? "" : " TTC"}.
                </p>
              </div>
            </div>
            <button type="submit" className="btn primary" disabled={formTotal <= 0}>Créer</button>
          </form>
        </Card>
      )}

      {complement && (() => {
        const ttc = ttcDe(complement.inv.amount_net, complement.inv.tva_exoneree);
        // Un moyen déjà posé qui n'est plus dans la liste reste proposé : sinon le menu l'effacerait.
        const options = [...new Set([...moyens, ...complement.paiements.map((p) => p.method).filter(Boolean)])];
        return (
          <div ref={refComplement}>
            <Card title={`Compléter ${complement.inv.number}`} className="fade" style={{ marginBottom: 16 }}>
              <p className="hint" style={{ marginTop: 0 }}>
                Le modèle qui mettra ce brouillon en page, et son règlement ({euro(ttc)}). Un document émis ne se modifie plus.
              </p>
              <div className="grid cols-2" style={{ gap: 14, alignItems: "start" }}>
                <SelectField label="Modèle de facture" value={complement.modele}
                  onChange={(e) => setComplement((c) => ({ ...c, modele: e.target.value }))}>
                  <option value="">Choisir automatiquement (selon l'acheteur)</option>
                  {modeles.map((t) => <option key={t.slug} value={t.slug}>{t.label || t.slug}</option>)}
                </SelectField>
                <PaiementSplit options={options} total={ttc} rows={complement.paiements}
                  onChange={(rows) => setComplement((c) => ({ ...c, paiements: rows }))} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button type="button" className="btn ghost" onClick={() => setComplement(null)}>Annuler</button>
                <button type="button" className="btn primary" onClick={enregistrerComplement}>Enregistrer</button>
              </div>
            </Card>
          </div>
        );
      })()}

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
                        {i.status === "BROUILLON" && (
                          <button type="button" onClick={() => ouvrirComplement(i)}><Icon name="edit" size={15} /> Modèle et règlement</button>
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
