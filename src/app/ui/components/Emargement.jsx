import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon.jsx";
import { getAttendance, generateAttendance, signAttendanceSheet, regenerateEmargement } from "../api/apiClient.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import { UserContext } from "../context/UserContext.jsx";
import Card from "./Card.jsx";
import StatusMessage from "./StatusMessage.jsx";
import SignatureModal from "./SignatureModal.jsx";
import RattrapageModal from "./RattrapageModal.jsx";
import { initials, dateHeure } from "../lib/format.js";

const SLOT_SHORT = { MATIN: "Matin", APRES_MIDI: "Après-m.", EXAMEN: "Examen", DISTANCIEL: "Distanciel" };

/** Feuille d'émargement d'une session : grille stagiaires × demi-journées.
 *  `feuilleVisee` (facultatif) : la demi-journée d'une alerte « Émargement à signer ». La carte
 *  vient à l'écran une fois les feuilles chargées, et la colonne se surligne — le bouton
 *  « Signer » attendu est dedans. */
function Emargement({ sessionId, feuilleVisee = null }) {
  const { user } = useContext(UserContext);
  const [sheets, setSheets] = useState([]);
  const [records, setRecords] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [trainerSigns, setTrainerSigns] = useState([]);
  const [intervenants, setIntervenants] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signSheetRec, setSignSheetRec] = useState(null); // feuille que le formateur signe
  const [rattrapage, setRattrapage] = useState(null); // { rec, sheet, learner } : présence à rattraper
  const carteRef = useRef(null);
  const dejaPlace = useRef(null); // la feuille vers laquelle on a déjà défilé (une seule fois)

  async function load() {
    try {
      const r = await getAttendance(sessionId);
      setSheets(r.data.sheets);
      setRecords(r.data.records);
      setTrainers(r.data.trainers || []);
      setTrainerSigns(r.data.trainerSigns || []);
      setIntervenants(r.data.intervenants || []);
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    }
  }
  useEffect(() => { load(); }, [sessionId]);
  useAutoRefresh(load, { interval: 15000 }); // signatures (stagiaire / formateur) en direct

  /* UNE SEULE FOIS par feuille visée : le rafraîchissement automatique recharge la grille toutes
     les quinze secondes, et ramener l'écran sur la carte à chaque fois empêcherait de lire le
     reste de la page. */
  const visee = feuilleVisee && sheets.some((s) => s.id === feuilleVisee) ? feuilleVisee : null;
  useEffect(() => {
    if (!visee || dejaPlace.current === visee) return;
    dejaPlace.current = visee;
    carteRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [visee]);
  const surligne = (sheetId) => (sheetId === visee ? { background: "color-mix(in srgb, var(--ember1) 10%, transparent)" } : null);

  // Stagiaires distincts (depuis les présences).
  const learners = useMemo(() => {
    const map = new Map();
    for (const r of records) if (r.learner_id && !map.has(r.learner_id)) {
      map.set(r.learner_id, { id: r.learner_id, first_name: r.first_name, last_name: r.last_name });
    }
    return [...map.values()].sort((a, b) => (a.last_name || "").localeCompare(b.last_name || ""));
  }, [records]);

  // Index signatures formateur : sheetId|userId -> signature.
  const trainerByKey = useMemo(() => {
    const m = {};
    for (const t of trainerSigns) m[`${t.sheet_id}|${t.user_id}`] = t;
    return m;
  }, [trainerSigns]);

  // Index présence : learnerId|sheetId -> record.
  const byKey = useMemo(() => {
    const m = {};
    for (const r of records) m[`${r.learner_id}|${r.sheet_id}`] = r;
    return m;
  }, [records]);

  async function generate() {
    setBusy(true);
    setStatus(null);
    try {
      /* Le serveur dit ce qu'il a fait : demi-journées ajoutées, retirées (hors des horaires de la
         formation), ou gardées parce qu'elles portent déjà une signature. */
      const r = await generateAttendance(sessionId);
      if (r && r.message) setStatus({ type: "success", message: r.message });
      await load();
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  }

  // Régénère les feuilles d'émargement PDF archivées (mise en page / infos à jour).
  async function regenDocs() {
    setBusy(true);
    setStatus(null);
    try {
      const r = await regenerateEmargement(sessionId);
      setStatus({ type: "success", message: r.message || "Feuilles d'émargement régénérées." });
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function onSignSheet({ signer_name, signature_data }) {
    try {
      await signAttendanceSheet(signSheetRec.id, { signer_name, signature_data });
      setSignSheetRec(null);
      setStatus({ type: "success", message: "Feuille signée." });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  return (
    <div ref={carteRef} style={{ scrollMarginTop: 72 }}>
    <Card
      title="Émargement"
      more={
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost" onClick={generate} disabled={busy}
            title="Met à jour la grille : ajoute les lignes des nouveaux stagiaires, formateurs ou intervenants affectés à la session.">
            {busy ? "…" : sheets.length ? "Mettre à jour les feuilles" : "Générer les feuilles"}
          </button>
          {sheets.length > 0 && (
            <button className="btn sm" onClick={regenDocs} disabled={busy}
              title="Crée / régénère la feuille d'émargement archivée (visible dans le suivi Qualiopi du stagiaire).">
              {busy ? "…" : "Générer le document"}
            </button>
          )}
        </div>
      }
    >
      <StatusMessage status={status} />
      {sheets.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>Aucune feuille. Cliquez sur « Générer les feuilles » pour créer les demi-journées de la session.</p>
      ) : learners.length === 0 ? (
        <p className="hint" style={{ margin: 0 }}>Aucun stagiaire inscrit à émarger.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th>Stagiaire</th>
                {sheets.map((s) => (
                  <th key={s.id} style={{ textAlign: "center", whiteSpace: "nowrap", ...surligne(s.id) }}>
                    {s.date.slice(8, 10)}/{s.date.slice(5, 7)}<br /><span style={{ fontWeight: 400, textTransform: "none" }}>{SLOT_SHORT[s.slot]}</span>
                  </th>
                ))}
                <th style={{ textAlign: "center" }} title="Demi-journées signées ou rattrapées, sur le total">Total</th>
              </tr>
            </thead>
            <tbody>
              {learners.map((l) => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className="avatar" style={{ width: 24, height: 24, fontSize: 10, marginRight: 8, display: "inline-grid", verticalAlign: "middle" }}>{initials(l.first_name, l.last_name)}</span>
                    {l.last_name} {l.first_name}
                  </td>
                  {sheets.map((s) => {
                    const rec = byKey[`${l.id}|${s.id}`];
                    /* RATTRAPÉE par l'école (migration 184) : une coche d'une autre couleur, le motif au
                       survol — c'est ce que la feuille imprime dans la case. */
                    const motif = rec && rec.rattrapage_motif
                      ? `Rattrapage : ${rec.rattrapage_motif}${rec.rattrapage_par ? ` (${rec.rattrapage_par})` : ""}` : null;
                    return (
                      <td key={s.id} style={{ textAlign: "center" }}>
                        {!rec ? "-" : motif ? (
                          <span title={`${motif}${rec.has_signature ? " · signé sur le poste de l'école" : " · présence attestée sans signature"}`} style={{ color: "#c07a1a", fontSize: 15 }}><Icon name="check" size={15} /></span>
                        ) : rec.has_signature ? (
                          <span title={`Signé par ${rec.signer_name || l.last_name}${rec.signed_at ? ` · ${dateHeure(rec.signed_at)}` : ""}`} style={{ color: "#2e9e5b", fontSize: 15 }}><Icon name="check" size={15} /></span>
                        ) : s.etat === "close" ? (
                          /* LA DEMI-JOURNÉE EST CLOSE : le stagiaire ne peut plus la signer (décidé par
                             l'école le 2026-09-26). Seule l'école la rattrape, avec un motif. */
                          <button className="btn sm ghost" title="Demi-journée terminée sans signature : enregistrer la présence, avec un motif"
                            onClick={() => setRattrapage({ rec, sheet: s, learner: l })}>Rattraper</button>
                        ) : s.etat === "ouverte" ? (
                          <button className="btn sm ghost" style={{ padding: "2px 6px" }}
                            title="En cours : le stagiaire peut signer lui-même jusqu'à minuit. Sans appareil ? Enregistrez sa présence ici."
                            aria-label={`Enregistrer la présence de ${l.last_name} ${l.first_name}`}
                            onClick={() => setRattrapage({ rec, sheet: s, learner: l })}><Icon name="pencil" size={13} /></button>
                        ) : (
                          <span title={s.etat === "pas_encore" && s.ouvre_a ? `Signature ouverte à partir de ${s.ouvre_a}` : "À venir"} style={{ color: "var(--dim)" }}>-</span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "center", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {sheets.filter((s) => { const r = byKey[`${l.id}|${s.id}`]; return r && (r.has_signature || r.rattrapage_motif); }).length}/{sheets.length}
                  </td>
                </tr>
              ))}
              {/* Séparateur : section formateur(s), distincte des stagiaires */}
              <tr>
                <td colSpan={sheets.length + 2}
                  style={{ padding: "12px 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dim)", borderTop: "2px solid var(--border-soft)" }}>
                  Formateur{trainers.length > 1 ? "s" : ""}
                </td>
              </tr>
              {/* Une ligne de signature par formateur affecté à la session */}
              {trainers.length === 0 ? (
                <tr>
                  <td colSpan={sheets.length + 2} style={{ color: "var(--dim)", fontSize: 12, padding: "8px 0" }}>
                    Aucun formateur affecté. Ajoutez-en dans la section « Formateurs » ci-dessus.
                  </td>
                </tr>
              ) : trainers.map((t) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 600, color: "var(--muted)" }}>
                    {t.first_name} {t.last_name}
                  </td>
                  {sheets.map((s) => {
                    const sg = trainerByKey[`${s.id}|${t.id}`];
                    const isMe = user?.id === t.id;
                    return (
                      <td key={s.id} style={{ textAlign: "center", ...surligne(s.id) }}>
                        {sg && sg.signed ? (
                          <span title={`Signé par ${sg.signer_name || ""}${sg.signed_at ? ` · ${dateHeure(sg.signed_at)}` : ""}`} style={{ color: "#2e9e5b", fontSize: 15 }}><Icon name="check" size={15} /></span>
                        ) : isMe ? (
                          <button className="btn sm ghost" title="Signer cette demi-journée" onClick={() => setSignSheetRec(s)}>Signer</button>
                        ) : (
                          <span style={{ color: "var(--dim)" }} title="En attente de la signature du formateur">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td />
                </tr>
              ))}

              {/* Section intervenants externes (une ligne chacun, sur leurs demi-journées) */}
              {intervenants.length > 0 && (
                <tr>
                  <td colSpan={sheets.length + 2}
                    style={{ padding: "12px 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dim)", borderTop: "2px solid var(--border-soft)" }}>
                    Intervenant{intervenants.length > 1 ? "s" : ""} externe{intervenants.length > 1 ? "s" : ""}
                  </td>
                </tr>
              )}
              {intervenants.map((iv) => {
                const slotSet = new Set((iv.slots || []).map((x) => `${x.date}|${x.slot}`));
                return (
                  <tr key={`iv-${iv.id}`}>
                    <td style={{ whiteSpace: "nowrap", fontWeight: 600, color: "var(--muted)" }}>
                      {iv.first_name} {iv.last_name}
                      {iv.specialty ? <span style={{ display: "block", fontSize: 10, fontWeight: 400, color: "var(--dim)" }}>{iv.specialty}</span> : null}
                    </td>
                    {sheets.map((s) => {
                      const assigned = slotSet.has(`${s.date}|${s.slot}`);
                      const sg = trainerByKey[`${s.id}|${iv.id}`];
                      return (
                        <td key={s.id} style={{ textAlign: "center" }}>
                          {!assigned ? (
                            <span style={{ color: "var(--border-soft)" }}></span>
                          ) : sg && sg.signed ? (
                            <span title={`Signé par ${sg.signer_name || ""}${sg.signed_at ? ` · ${dateHeure(sg.signed_at)}` : ""}`} style={{ color: "#2e9e5b", fontSize: 15 }}><Icon name="check" size={15} /></span>
                          ) : (
                            <span style={{ color: "var(--dim)" }} title="En attente de la signature de l'intervenant">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rattrapage && (
        <RattrapageModal
          record={rattrapage.rec}
          stagiaire={`${rattrapage.learner.last_name || ""} ${rattrapage.learner.first_name || ""}`.trim()}
          demiJournee={`${rattrapage.sheet.date.slice(8, 10)}/${rattrapage.sheet.date.slice(5, 7)} ${SLOT_SHORT[rattrapage.sheet.slot] || ""}`}
          onDone={(message) => { setRattrapage(null); setStatus({ type: "success", message }); load(); }}
          onClose={() => setRattrapage(null)}
        />
      )}

      {signSheetRec && (
        <SignatureModal
          doc={{ label: `Émargement formateur, ${signSheetRec.date?.slice(8, 10)}/${signSheetRec.date?.slice(5, 7)} ${SLOT_SHORT[signSheetRec.slot] || ""}` }}
          defaultName={`${user?.first_name || ""} ${user?.last_name || ""}`.trim()}
          onConfirm={onSignSheet}
          onClose={() => setSignSheetRec(null)}
        />
      )}
    </Card>
    </div>
  );
}

export default Emargement;
