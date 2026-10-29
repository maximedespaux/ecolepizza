import { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Card from "./Card.jsx";
import Badge from "./Badge.jsx";
import HelpDot from "./HelpDot.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { Squelette } from "./Squelette.jsx";
import { Icon } from "./Icon.jsx";
import { UserContext } from "../context/UserContext.jsx";
import { peutEcrire } from "../lib/nav.js";
import { dateFr } from "../lib/format.js";
import {
  getCommission, saveCommission, saveDecisionJury, cloturerCommission, setNumeroCertification, ouvrirPvJury, poserModelesJury, getPvApercu, telechargerPvJury, getPvSignatures,
} from "../api/apiClient.js";

/**
 * LA COMMISSION DE DÉLIBÉRATION D'UNE SESSION — et son procès-verbal.
 *
 * DISTINCTE DE LA GRILLE DU JURY, et ce n'est pas une nuance de vocabulaire. La grille évalue
 * UNE personne sur des critères, devant le jury ; le procès-verbal constate ce que la
 * COMMISSION a décidé pour TOUS les candidats, à une date et une heure, avec sa composition
 * nommée. L'un se signe par candidat, l'autre une fois pour la session.
 *
 * TROIS MEMBRES AU MINIMUM, et la moitié au moins extérieure à l'organisme : ce ne sont pas des
 * cases de confort, ce sont des conditions de validité. « En l'absence d'un membre, la session
 * ne se tient pas » (règlement d'examen, article 6) — un PV signé par deux personnes là où
 * trois sont exigées se retourne contre l'organisme.
 */

const VOIES = [
  { v: "FORMATION_CONTINUE", l: "Formation continue" },
  { v: "CANDIDATURE_INDIVIDUELLE", l: "Candidature individuelle" },
  { v: "VAE", l: "Validation des acquis de l'expérience" },
];
const DECISIONS = [
  { v: "EN_COURS", l: "— à décider —" },
  { v: "CERTIFIE", l: "Admis (certifié)" },
  { v: "BLOCS_ACQUIS", l: "Admis (blocs acquis)" },
  { v: "AJOURNE", l: "Ajourné" },
  { v: "ABSENT", l: "Absent" },
  { v: "EXCLU", l: "Exclu" },
];
const DEFAVORABLE = new Set(["AJOURNE", "EXCLU"]);
/* Les décisions qui donnent droit à un numéro de certification (parchemin) : admis, blocs acquis.
   Le champ « N° de certification » n'apparaît que pour eux (même ensemble que le serveur). */
const ADMIS = new Set(["CERTIFIE", "BLOCS_ACQUIS"]);
/* LA QUALITÉ EST PRÉ-REMPLIE avec la formule du procès-verbal papier (« présidente de la
   présente commission de délibération »). Elle est reprise TELLE QUELLE dans le document : la
   laisser vide obligerait à la retaper à chaque commission, et la moindre variation de
   formulation se verrait d'un PV à l'autre. */
const QUALITE_PRESIDENT = "présidente de la présente commission de délibération";
const QUALITE_MEMBRE = "membre du jury de la présente commission de délibération";
const membreVide = (premier) => ({
  user_id: null, nom: "", prenom: "", qualite: premier ? QUALITE_PRESIDENT : QUALITE_MEMBRE,
  employeur: "", externe: false, na_pas_forme: true,
});

function CommissionJury({ sessionId }) {
  const { user } = useContext(UserContext);
  // Commission, décisions, clôture : /examens, que le serveur range sous /sessions (cf. peutEcrire).
  const peutEditer = peutEcrire(user, "/sessions");
  /* Le modèle de PV s'écrit dans /modeles, pas dans la session : le bouton était offert à tous,
     et répondait « Accès refusé » à qui n'a pas Modèles en modification. */
  const peutPoserModele = peutEcrire(user, "/modeles");
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [status, setStatus] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState(null);      // formulaire de la commission
  const [apercu, setApercu] = useState(null);     // { html, cloture } de l'aperçu ouvert
  const [apercuEnCours, setApercuEnCours] = useState(false);
  const [signatures, setSignatures] = useState(null); // état des signatures du PV (après clôture)
  const [copie, setCopie] = useState(null);           // lien copié à l'instant (retour visuel)

  async function charger() {
    try {
      const r = await getCommission(sessionId);
      setData(r.data);
      setErreur(null);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); }, [sessionId]);

  /* LES SIGNATURES DU PV n'ont de sens qu'une fois la commission CLÔTURÉE (le PV est figé) : c'est
     alors que les liens existent et que membres et candidats signent, à distance et quand ils veulent.
     On recharge donc l'état à la clôture — et à la demande (bouton « Actualiser »), les signatures
     arrivant hors de l'application. */
  const loadSignatures = () => getPvSignatures(sessionId).then((r) => setSignatures(r.data)).catch(() => setSignatures(null));
  useEffect(() => {
    if (data?.commission?.status === "CLOTUREE") loadSignatures();
    else setSignatures(null);
  }, [data?.commission?.status, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  async function copierLien(url, ref) {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(ref); setTimeout(() => setCopie((c) => (c === ref ? null : c)), 2000);
    } catch { setStatus({ type: "error", message: "Copie impossible — sélectionnez et copiez le lien à la main." }); }
  }

  /* Le formulaire part de la commission existante, ou de valeurs déduites de la session : la
     date de début, le nom de l'organisme, le code RS de la formation. Faire retaper ce que
     l'application sait déjà est le meilleur moyen d'obtenir une faute de frappe. */
  useEffect(() => {
    if (!data || f) return;
    const c = data.commission;
    setF(c ? {
      ...c, jury: (c.jury || []).length ? c.jury : [membreVide(true), membreVide(), membreVide()],
    } : {
      certification: data.session?.title || "", rncp_code: data.session?.rs_code || "",
      voie_acces: "FORMATION_CONTINUE", pv_ref: "", date_examen: data.session?.start_date || "",
      heure: "", lieu: "", centre: "", representant: "", representant_fonction: "", aleas: "",
      jury: [membreVide(true), membreVide(), membreVide()],
    });
  }, [data, f]);

  const commission = data?.commission || null;
  const close = commission?.status === "CLOTUREE";
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const setJure = (i, patch) => setF((p) => ({ ...p, jury: p.jury.map((m, k) => (k === i ? { ...m, ...patch } : m)) }));

  /* LES PERSONNES À PROPOSER pour le jury — l'équipe et les intervenants de l'organisme (elles ont
     un compte, donc elles pourront signer le PV, et on sait si elles ont formé cette session). On
     choisit dans cette liste au lieu de retaper le nom. */
  const personnes = data?.personnes || [];
  const personnesParId = new Map(personnes.map((p) => [p.user_id, p]));
  /* Choisir une personne pour le membre i : on fige son nom/prénom (instantané imprimé) et on
     décoche « n'a pas formé » si elle a justement formé cette session (conflit à lever). */
  const choisirMembre = (i, userId) => {
    const p = personnesParId.get(userId);
    if (!p) { setJure(i, { user_id: null }); return; }
    setJure(i, { user_id: userId, nom: p.last_name || "", prenom: p.first_name || "", na_pas_forme: !p.a_forme });
  };

  async function enregistrer() {
    setStatus(null);
    try {
      const r = await saveCommission(sessionId, f);
      setData((d) => ({ ...d, commission: r.data }));
      setStatus({ type: "success", message: "Commission enregistrée." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  async function decider(learnerId, decision, observations) {
    setStatus(null);
    try {
      const r = await saveDecisionJury({ session_id: sessionId, learner_id: learnerId, decision, observations });
      setData((d) => ({ ...d, commission: r.data }));
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  /* Le numéro de certification d'un candidat (migration 205). Il vit sur le CANDIDAT (pas sur la
     commission) : on recharge pour le relire — y compris les numéros posés automatiquement à la
     clôture. Vide efface. */
  async function setNumero(learnerId, numero) {
    setStatus(null);
    try {
      await setNumeroCertification({ session_id: sessionId, learner_id: learnerId, numero: numero === "" ? null : numero });
      await charger();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  async function cloturer() {
    if (!window.confirm("Clôturer la commission ?\n\nLe procès-verbal sera figé : ni les décisions ni la composition du jury ne pourront plus changer.")) return;
    setStatus(null);
    try {
      await cloturerCommission(sessionId);
      // La clôture attribue les numéros de certification : on recharge pour les afficher.
      await charger();
      setStatus({ type: "success", message: "Commission clôturée. Le procès-verbal peut être édité." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  async function editerPv() {
    setStatus(null);
    try { await ouvrirPvJury(sessionId); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  /* Télécharge le PDF du PV (bouton « Télécharger », dans l'aperçu) — nommé d'après son numéro.
     Avant clôture, « (projet) » dans le nom rappelle que ce n'est pas encore le document signé. */
  async function telecharger() {
    setStatus(null);
    try {
      const base = `Procès-verbal ${commission?.pv_ref || ""}${close ? "" : " (projet)"}`.trim().replace(/[\\/:*?"<>|]/g, "");
      await telechargerPvJury(sessionId, `${base || "proces-verbal"}.pdf`);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  /* L'APERÇU : ce que donnera le PV, rendu en HTML (sans LibreOffice) à partir de la commission
     ENREGISTRÉE. Ouvert même commission non clôturée — c'est tout l'intérêt : voir avant de figer.
     Une erreur (modèle pas encore créé) s'affiche en message, on n'ouvre pas une fenêtre vide. */
  async function voirApercu() {
    setStatus(null);
    setApercuEnCours(true);
    try {
      const r = await getPvApercu(sessionId);
      setApercu({ html: r.data.html, cloture: !!r.data.cloture });
    } catch (e) {
      setStatus({ type: "error", message: e.message || "Aperçu impossible." });
    } finally { setApercuEnCours(false); }
  }

  async function poserModele() {
    try {
      const r = await poserModelesJury();
      setStatus({ type: "success", message: (r.data?.poses || []).includes("pv-jury")
        ? "Modèle « Procès-verbal de jury » créé. Vous pouvez le retoucher dans Modèles."
        : "Le modèle existait déjà, il n'a pas été modifié." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  if (erreur) return <Card title="Procès-verbal de jury"><p className="hint" style={{ margin: 0 }}>{erreur}</p></Card>;
  if (!data || !f) return <Card title="Procès-verbal de jury"><Squelette lignes={2} h={48} /></Card>;

  const decisions = new Map((commission?.resultats || []).map((r) => [r.learner_id, r]));
  const prises = (data.candidats || []).filter((c) => (decisions.get(c.learner_id)?.decision || "EN_COURS") !== "EN_COURS");

  return (
    <Card title="Procès-verbal de jury"
      more={
        <button type="button" className="card-more" onClick={() => setOuvert((o) => !o)}>
          {ouvert ? "Replier" : commission ? "Ouvrir" : "Créer la commission"}
        </button>
      }>
      <StatusMessage status={status} />

      <p className="hint" style={{ marginTop: 0 }}>
        {commission ? (
          <>
            N° <b>{commission.pv_ref}</b> · {commission.date_examen}{commission.heure ? ` à ${commission.heure}` : ""} ·{" "}
            {prises.length} / {(data.candidats || []).length} décision(s) prise(s){" "}
            {close ? <Badge tone="g">Clôturée</Badge> : <Badge tone="a">Ouverte</Badge>}
          </>
        ) : (
          <>Aucune commission pour cette session. Le procès-verbal atteste qui a délibéré, sur quelle
            certification et avec quelle décision pour chaque candidat.</>
        )}
      </p>

      {ouvert && (
        <>
          <fieldset disabled={close || !peutEditer} style={{ border: "none", padding: 0, margin: 0 }}>
            <div className="row2">
              <div className="field"><label>Certification visée</label>
                <input className="inp" value={f.certification || ""} onChange={(e) => set("certification", e.target.value)} /></div>
              <div className="field"><label>Code RNCP / RS</label>
                <input className="inp mono" value={f.rncp_code || ""} onChange={(e) => set("rncp_code", e.target.value)} placeholder="RS7404" /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              <div className="field"><label>N° de procès-verbal
                <HelpDot text={"Votre propre numérotation, unique dans l'organisme.\n\nC'est lui qui identifie la session dans les archives : son absence est précisément ce qui a rendu les PV de 2023 inexploitables."} /></label>
                <input className="inp mono" value={f.pv_ref || ""} onChange={(e) => set("pv_ref", e.target.value)} placeholder="EPJJD-EX-2026-014" /></div>
              <div className="field"><label>Date de la commission</label>
                <input className="inp" type="date" value={f.date_examen || ""} onChange={(e) => set("date_examen", e.target.value)} /></div>
              <div className="field"><label>Heure</label>
                <input className="inp" value={f.heure || ""} onChange={(e) => set("heure", e.target.value)} placeholder="9 h 30" /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Lieu (adresse complète)</label>
                <input className="inp" value={f.lieu || ""} onChange={(e) => set("lieu", e.target.value)} placeholder="101 rue Alsace Lorraine, 65300 Lannemezan" /></div>
              <div className="field"><label>Centre habilité</label>
                <input className="inp" value={f.centre || ""} onChange={(e) => set("centre", e.target.value)} /></div>
            </div>
            <div className="row2">
              <div className="field"><label>Voie d'accès</label>
                <select className="inp" value={f.voie_acces} onChange={(e) => set("voie_acces", e.target.value)}>
                  {VOIES.map((v) => <option key={v.v} value={v.v}>{v.l}</option>)}
                </select></div>
              <div className="field"><label>Représentant du certificateur</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input className="inp" style={{ flex: 1, minWidth: 0 }} value={f.representant || ""}
                    onChange={(e) => set("representant", e.target.value)} placeholder="Nom et prénom" />
                  <input className="inp" style={{ flex: 1, minWidth: 0 }} value={f.representant_fonction || ""}
                    onChange={(e) => set("representant_fonction", e.target.value)} placeholder="Fonction" />
                </div></div>
            </div>

            {/* LA COMPOSITION EST UNE CONDITION DE VALIDITÉ, pas un état civil : « extérieur » et
                « n'a pas formé » décident si la session tient, et s'impriment sur le PV. */}
            <div className="field">
              <label>Composition de la commission
                <HelpDot text={"Trois membres au minimum.\n\nLa majorité doit être EXTÉRIEURE à l'organisme, et aucun membre ne peut évaluer un candidat qu'il a formé. Ces deux règles s'impriment sur le procès-verbal — c'est ce qui les rend opposables."} /></label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(f.jury || []).map((m, i) => {
                  const perso = m.user_id ? personnesParId.get(m.user_id) : null;
                  const conflit = !!perso?.a_forme; // a formé un candidat de cette session → ne peut l'évaluer
                  return (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    {/* ON CHOISIT UNE PERSONNE ENREGISTRÉE (équipe / intervenant) plutôt que de retaper
                        son nom : elle a un compte, donc elle pourra signer le PV, et on sait si elle a
                        formé les candidats. Un externe est un intervenant enregistré comme tel. Un
                        ancien membre saisi à la main (sans compte) reste affiché, le temps de le choisir. */}
                    <select className="inp" style={{ flex: "1 1 240px", minWidth: 0 }} value={m.user_id || ""}
                      onChange={(e) => choisirMembre(i, e.target.value)} aria-label="Membre (équipe ou intervenant)">
                      <option value="">{!m.user_id && m.nom ? `actuellement : ${m.nom} ${m.prenom || ""}`.trim() : "— choisir une personne —"}</option>
                      {personnes
                        .filter((p) => p.user_id === m.user_id || !(f.jury || []).some((x, k) => k !== i && x.user_id === p.user_id))
                        .map((p) => (
                          <option key={p.user_id} value={p.user_id}>
                            {p.last_name} {p.first_name}{p.intervenant ? " · intervenant" : ""}{p.a_forme ? " · a formé cette session" : ""}
                          </option>
                        ))}
                    </select>
                    <input className="inp" style={{ flex: "1 1 160px", minWidth: 0 }} value={m.qualite}
                      onChange={(e) => setJure(i, { qualite: e.target.value })} placeholder={i === 0 ? "présidente de la présente commission de délibération" : "membre du jury de la présente commission de délibération"} />
                    <input className="inp" style={{ flex: "1 1 130px", minWidth: 0 }} value={m.employeur}
                      onChange={(e) => setJure(i, { employeur: e.target.value })} placeholder="Employeur" />
                    <label style={{ display: "inline-flex", gap: 5, alignItems: "center", fontSize: 12 }}>
                      <input type="checkbox" checked={!!m.externe} onChange={(e) => setJure(i, { externe: e.target.checked })} /> extérieur
                    </label>
                    <label style={{ display: "inline-flex", gap: 5, alignItems: "center", fontSize: 12 }}>
                      <input type="checkbox" checked={!!m.na_pas_forme} onChange={(e) => setJure(i, { na_pas_forme: e.target.checked })} /> n'a pas formé
                    </label>
                    <button type="button" className="iconbtn del" title="Retirer"
                      onClick={() => setF((p) => ({ ...p, jury: p.jury.filter((_, k) => k !== i) }))}>
                      <Icon name="trash" size={14} />
                    </button>
                    {/* LE CONTRÔLE « N'A PAS FORMÉ » automatique : si la personne choisie a enseigné cette
                        session, elle ne peut pas évaluer ses candidats (règlement d'examen). On le dit,
                        et « n'a pas formé » est décoché d'office — à ne cocher qu'en connaissance de cause. */}
                    {conflit && (
                      <span className="hint" style={{ flex: "1 1 100%", margin: "2px 0 0", color: "var(--ember1)", fontSize: 11.5 }}>
                        ⚠ Cette personne a formé des candidats de cette session : elle ne peut pas les évaluer (règlement d’examen, art. 6).
                      </span>
                    )}
                  </div>
                  );
                })}
                <div><button type="button" className="btn sm ghost"
                  onClick={() => setF((p) => ({ ...p, jury: [...p.jury, membreVide()] }))}>＋ Membre</button></div>
              </div>
            </div>

            <div className="field"><label>Aléas et dysfonctionnements</label>
              <textarea className="inp" rows={2} value={f.aleas || ""} onChange={(e) => set("aleas", e.target.value)}
                placeholder="Néant." /></div>

            {peutEditer && !close && (
              <div><button type="button" className="btn primary" onClick={enregistrer}>Enregistrer la commission</button></div>
            )}
          </fieldset>

          {commission && (
            <>
              <h3 style={{ fontSize: 15, margin: "16px 0 8px" }}>Décision par candidat</h3>
              {(data.candidats || []).length === 0 ? (
                <p className="hint" style={{ margin: 0 }}>Aucun candidat inscrit à cette session.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {data.candidats.map((c) => {
                    const r = decisions.get(c.learner_id) || { decision: "EN_COURS", observations: "" };
                    return (
                      <div key={c.learner_id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-soft)", flexWrap: "wrap" }}>
                        <b style={{ flex: "1 1 180px", minWidth: 0 }}>{c.last_name} {c.first_name}</b>
                        <select className="inp" style={{ width: 200 }} value={r.decision} disabled={close || !peutEditer}
                          onChange={(e) => decider(c.learner_id, e.target.value, r.observations)}>
                          {DECISIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                        </select>
                        {/* UNE DÉCISION DÉFAVORABLE SE MOTIVE, sinon elle n'est pas opposable au
                            recours — le serveur la refuse sans motif. Le champ n'apparaît donc
                            que là où il est exigé. */}
                        {DEFAVORABLE.has(r.decision) && (
                          <input className="inp" style={{ flex: "1 1 220px", minWidth: 0 }} defaultValue={r.observations || ""}
                            disabled={close || !peutEditer} placeholder="Motif (obligatoire)"
                            onBlur={(e) => { if (e.target.value !== (r.observations || "")) decider(c.learner_id, r.decision, e.target.value); }} />
                        )}
                        {/* LE NUMÉRO DE CERTIFICATION (migration 205) : posé automatiquement à la
                            clôture pour les candidats admis, et modifiable à la main — y compris
                            APRÈS clôture (la clôture fige la décision, pas le numéro du parchemin).
                            Le `key` le rafraîchit quand le numéro change (clôture, saisie). */}
                        {ADMIS.has(r.decision) && (
                          <label style={{ display: "flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}
                            title="Numéro unique du parchemin, imprimé sur le diplôme ({Numéro de certification}).">
                            <span className="hint" style={{ margin: 0 }}>N° certif.</span>
                            <input className="inp" style={{ width: 86 }} inputMode="numeric" placeholder="auto"
                              key={`num-${c.learner_id}-${c.numero_certification ?? ""}`}
                              defaultValue={c.numero_certification ?? ""} disabled={!peutEditer}
                              onBlur={(e) => { const v = e.target.value.trim(); if (v !== String(c.numero_certification ?? "")) setNumero(c.learner_id, v); }} />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
                <span className="hint" style={{ margin: 0 }}>
                  {close ? "Procès-verbal figé." : `${prises.length} / ${(data.candidats || []).length} décision(s) · ${(f.jury || []).filter((m) => m.nom).length} membre(s)`}
                </span>
                <span style={{ flex: 1 }} />
                {/* L'APERÇU est offert à tout moment : c'est une VUE, pas le document officiel.
                    Voir le PV avant de clôturer évite de figer une commission sur une coquille. */}
                <button type="button" className="btn sm ghost" onClick={voirApercu} disabled={apercuEnCours}>
                  <Icon name="eye" size={14} /> {apercuEnCours ? "Aperçu…" : "Aperçu du PV"}
                </button>
                {peutPoserModele && (
                  <button type="button" className="btn sm ghost" onClick={poserModele}>Créer le modèle de PV</button>
                )}
                {/* LE PDF SE GÉNÈRE À TOUT MOMENT : l'école l'envoie au jury AVANT la séance. Tiré
                    avant la clôture, il porte la mention « PROJET » (bandeau rouge + « -projet »
                    dans le nom) pour ne pas se confondre avec le procès-verbal signé. */}
                <button type="button" className="btn sm" onClick={editerPv}
                  title={close ? "" : "Avant clôture : PDF marqué « projet »"}>Générer le PV (PDF)</button>
                {peutEditer && !close && (
                  <button type="button" className="btn primary" onClick={cloturer}>Clôturer la commission</button>
                )}
              </div>

              {/* SIGNATURES DU PV, à distance : visibles une fois la commission clôturée. Chaque membre
                  (par son compte) et chaque candidat a son propre lien, que l'école copie et lui envoie ;
                  il signe sans compte. L'état (signé / en attente) s'actualise à la demande — les
                  signatures arrivent hors de l'application. */}
              {close && signatures && (
                <div style={{ marginTop: 16, borderTop: "1px solid var(--border-soft)", paddingTop: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: 15, margin: 0, display: "flex", alignItems: "center", gap: 7 }}>
                      <Icon name="pencil" size={16} /> Signatures du procès-verbal
                    </h3>
                    <span style={{ flex: 1 }} />
                    <button type="button" className="btn sm ghost" onClick={loadSignatures}>
                      <Icon name="refresh" size={13} /> Actualiser
                    </button>
                  </div>
                  <p className="hint" style={{ marginTop: 4 }}>
                    Chaque personne signe par son lien, sans compte.
                    {signatures.membres_sans_compte > 0 && (
                      <> ⚠ {signatures.membres_sans_compte} membre(s) saisi(s) à la main (sans compte) ne peuvent pas signer à distance — choisissez-les dans la liste du jury pour leur donner un lien.</>
                    )}
                  </p>
                  {[["membres", "Commission"], ["candidats", "Candidats"]].map(([grp, titre]) => (
                    <div key={grp} style={{ marginTop: 8 }}>
                      <div className="eyebrow">{titre}</div>
                      {(signatures[grp] || []).length === 0 ? (
                        <p className="hint" style={{ margin: "2px 0" }}>Aucun.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          {signatures[grp].map((s) => {
                            const ref = `${s.kind}:${s.ref}`;
                            return (
                              <div key={ref} style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--border-soft)", flexWrap: "wrap" }}>
                                <span style={{ flex: "1 1 160px", minWidth: 0 }}>{s.nom}</span>
                                {s.signe ? (
                                  <Badge tone="g">Signé{s.signe_le ? ` · ${dateFr(s.signe_le)}` : ""}</Badge>
                                ) : (
                                  <>
                                    <Badge tone="a">En attente</Badge>
                                    {s.url && (
                                      <button type="button" className="btn sm ghost" onClick={() => copierLien(s.url, ref)}
                                        title="Copier le lien de signature à envoyer à cette personne">
                                        <Icon name={copie === ref ? "check" : "link"} size={13} /> {copie === ref ? "Lien copié" : "Copier le lien"}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* L'APERÇU DU PV, en grand : un iframe `srcDoc` isolé (comme l'aperçu d'un document), pour
          que le CSS du PV ne déborde pas sur l'application. Rendu dans document.body (createPortal)
          comme les autres fenêtres. */}
      {apercu && createPortal(
        <div className="overlay">
          <div className="modal wide">
            <div className="mhead">
              <h2 style={{ margin: 0, fontSize: 17 }}>Aperçu du procès-verbal</h2>
              <button className="x" onClick={() => setApercu(null)} aria-label="Fermer">×</button>
            </div>
            {!apercu.cloture && (
              <div className="status info" style={{ margin: "10px 14px 0" }}>
                <b>Brouillon.</b> La commission n'est pas clôturée : décisions et composition peuvent
                encore changer. L'aperçu reflète la commission <b>enregistrée</b>, et le PDF — qu'on
                peut déjà envoyer au jury — porte la mention <b>« projet »</b>.
              </div>
            )}
            <div className="mbody" style={{ padding: 0, background: "var(--surface3)" }}>
              <iframe srcDoc={apercu.html} title="Aperçu du procès-verbal" className="doc-pdf-frame" sandbox="allow-same-origin" />
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={() => setApercu(null)}>Fermer</button>
              {/* Disponible à tout moment : avant clôture, le PDF est marqué « projet » (cf. le
                  bandeau rouge). Ouvrir dans un onglet, ou enregistrer le fichier pour l'envoyer. */}
              <button type="button" className="btn ghost" onClick={editerPv}
                title={apercu.cloture ? "" : "Avant clôture : PDF marqué « projet »"}>Ouvrir le PDF</button>
              <button type="button" className="btn" onClick={telecharger}
                title={apercu.cloture ? "" : "Avant clôture : PDF marqué « projet »"}>
                <Icon name="download" size={14} /> Télécharger le PDF
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Card>
  );
}

export default CommissionJury;
