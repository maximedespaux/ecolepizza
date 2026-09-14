import { useContext, useEffect, useState } from "react";
import Card from "./Card.jsx";
import Badge from "./Badge.jsx";
import HelpDot from "./HelpDot.jsx";
import StatusMessage from "./StatusMessage.jsx";
import { Squelette } from "./Squelette.jsx";
import { Icon } from "./Icon.jsx";
import { UserContext } from "../context/UserContext.jsx";
import {
  getCommission, saveCommission, saveDecisionJury, cloturerCommission, ouvrirPvJury, poserModelesJury,
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
/* LA QUALITÉ EST PRÉ-REMPLIE avec la formule du procès-verbal papier (« présidente de la
   présente commission de délibération »). Elle est reprise TELLE QUELLE dans le document : la
   laisser vide obligerait à la retaper à chaque commission, et la moindre variation de
   formulation se verrait d'un PV à l'autre. */
const QUALITE_PRESIDENT = "présidente de la présente commission de délibération";
const QUALITE_MEMBRE = "membre du jury de la présente commission de délibération";
const membreVide = (premier) => ({
  nom: "", qualite: premier ? QUALITE_PRESIDENT : QUALITE_MEMBRE,
  employeur: "", externe: false, na_pas_forme: true,
});

function CommissionJury({ sessionId }) {
  const { user } = useContext(UserContext);
  const peutEditer = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"].includes(user?.role);
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [status, setStatus] = useState(null);
  const [ouvert, setOuvert] = useState(false);
  const [f, setF] = useState(null);      // formulaire de la commission

  async function charger() {
    try {
      const r = await getCommission(sessionId);
      setData(r.data);
      setErreur(null);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); }, [sessionId]);

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

  async function cloturer() {
    if (!window.confirm("Clôturer la commission ?\n\nLe procès-verbal sera figé : ni les décisions ni la composition du jury ne pourront plus changer.")) return;
    setStatus(null);
    try {
      const r = await cloturerCommission(sessionId);
      setData((d) => ({ ...d, commission: r.data }));
      setStatus({ type: "success", message: "Commission clôturée. Le procès-verbal peut être édité." });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  async function editerPv() {
    setStatus(null);
    try { await ouvrirPvJury(sessionId); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
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
                {(f.jury || []).map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <input className="inp" style={{ flex: "1 1 180px", minWidth: 0 }} value={m.nom}
                      onChange={(e) => setJure(i, { nom: e.target.value })} placeholder="NOM Prénom" />
                    <input className="inp" style={{ flex: "1 1 160px", minWidth: 0 }} value={m.qualite}
                      onChange={(e) => setJure(i, { qualite: e.target.value })} placeholder={i === 0 ? "présidente de la présente commission de délibération" : "membre du jury de la présente commission de délibération"} />
                    <input className="inp" style={{ flex: "1 1 140px", minWidth: 0 }} value={m.employeur}
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
                  </div>
                ))}
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
                <button type="button" className="btn sm ghost" onClick={poserModele}>Créer le modèle de PV</button>
                {/* LE PV S'ÉDITE APRÈS CLÔTURE SEULEMENT : un procès-verbal tiré d'une
                    délibération en cours porterait des décisions qui peuvent encore changer.
                    Désactivé plutôt que caché, avec la raison écrite à côté. */}
                <button type="button" className="btn sm" disabled={!close} onClick={editerPv}
                  title={close ? "" : "Clôturez la commission d'abord"}>Éditer le PV</button>
                {peutEditer && !close && (
                  <button type="button" className="btn primary" onClick={cloturer}>Clôturer la commission</button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}

export default CommissionJury;
