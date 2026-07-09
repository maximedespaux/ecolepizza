import { useContext, useEffect, useMemo, useState } from "react";
import { getAttendance, generateAttendance, signAttendanceSheet } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import Card from "./Card.jsx";
import StatusMessage from "./StatusMessage.jsx";
import SignatureModal from "./SignatureModal.jsx";
import { initials } from "../lib/format.js";

const SLOT_SHORT = { MATIN: "Matin", APRES_MIDI: "Après-m.", EXAMEN: "Examen", DISTANCIEL: "Distanciel" };

/** Feuille d'émargement d'une session : grille stagiaires × demi-journées. */
function Emargement({ sessionId }) {
  const { user } = useContext(UserContext);
  const [sheets, setSheets] = useState([]);
  const [records, setRecords] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [trainerSigns, setTrainerSigns] = useState([]);
  const [intervenants, setIntervenants] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signSheetRec, setSignSheetRec] = useState(null); // feuille que le formateur signe

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
      await generateAttendance(sessionId);
      await load();
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
    <Card
      title="Émargement"
      more={<button className="btn sm" onClick={generate} disabled={busy}>{busy ? "…" : sheets.length ? "Régénérer" : "Générer les feuilles"}</button>}
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
                  <th key={s.id} style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                    {s.date.slice(8, 10)}/{s.date.slice(5, 7)}<br /><span style={{ fontWeight: 400, textTransform: "none" }}>{SLOT_SHORT[s.slot]}</span>
                  </th>
                ))}
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
                    return (
                      <td key={s.id} style={{ textAlign: "center" }}>
                        {!rec ? "—" : rec.has_signature ? (
                          <span title={`Signé par ${rec.signer_name || l.last_name}${rec.signed_at ? ` · ${rec.signed_at}` : ""}`} style={{ color: "#2e9e5b", fontSize: 15 }}>✍</span>
                        ) : (
                          <span title="En attente de la signature du stagiaire" style={{ color: "var(--dim)" }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Séparateur : section formateur(s), distincte des stagiaires */}
              <tr>
                <td colSpan={sheets.length + 1}
                  style={{ padding: "12px 0 4px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dim)", borderTop: "2px solid var(--border-soft)" }}>
                  Formateur{trainers.length > 1 ? "s" : ""}
                </td>
              </tr>
              {/* Une ligne de signature par formateur affecté à la session */}
              {trainers.length === 0 ? (
                <tr>
                  <td colSpan={sheets.length + 1} style={{ color: "var(--dim)", fontSize: 12, padding: "8px 0" }}>
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
                      <td key={s.id} style={{ textAlign: "center" }}>
                        {sg && sg.signed ? (
                          <span title={`Signé par ${sg.signer_name || ""}${sg.signed_at ? ` · ${sg.signed_at}` : ""}`} style={{ color: "#2e9e5b", fontSize: 15 }}>✍</span>
                        ) : isMe ? (
                          <button className="btn sm ghost" title="Signer cette demi-journée" onClick={() => setSignSheetRec(s)}>Signer</button>
                        ) : (
                          <span style={{ color: "var(--dim)" }} title="En attente de la signature du formateur">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Section intervenants externes (une ligne chacun, sur leurs demi-journées) */}
              {intervenants.length > 0 && (
                <tr>
                  <td colSpan={sheets.length + 1}
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
                            <span title={`Signé par ${sg.signer_name || ""}${sg.signed_at ? ` · ${sg.signed_at}` : ""}`} style={{ color: "#2e9e5b", fontSize: 15 }}>✍</span>
                          ) : (
                            <span style={{ color: "var(--dim)" }} title="En attente de la signature de l'intervenant">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {signSheetRec && (
        <SignatureModal
          doc={{ label: `Émargement formateur — ${signSheetRec.date?.slice(8, 10)}/${signSheetRec.date?.slice(5, 7)} ${SLOT_SHORT[signSheetRec.slot] || ""}` }}
          defaultName={`${user?.first_name || ""} ${user?.last_name || ""}`.trim()}
          onConfirm={onSignSheet}
          onClose={() => setSignSheetRec(null)}
        />
      )}
    </Card>
  );
}

export default Emargement;
