import { useContext, useEffect, useMemo, useState } from "react";
import { getAttendance, generateAttendance, setPresence, signAttendanceSheet } from "../api/apiClient.js";
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
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [signSheetRec, setSignSheetRec] = useState(null); // feuille que le formateur signe

  async function load() {
    try {
      const r = await getAttendance(sessionId);
      setSheets(r.data.sheets);
      setRecords(r.data.records);
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

  async function toggle(rec) {
    const present = rec.present ? 0 : 1;
    setRecords((rs) => rs.map((r) => (r.id === rec.id ? { ...r, present } : r)));
    try { await setPresence(rec.id, present); } catch { load(); }
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
                          <input type="checkbox" checked={!!rec.present} onChange={() => toggle(rec)} title="Présent (pointage manuel)" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Ligne de signature du formateur, par demi-journée */}
              <tr>
                <td style={{ whiteSpace: "nowrap", fontWeight: 600, color: "var(--muted)" }}>👨‍🏫 Formateur</td>
                {sheets.map((s) => (
                  <td key={s.id} style={{ textAlign: "center" }}>
                    {s.trainer_signed ? (
                      <span title={`Signé par ${s.trainer_name || ""}${s.trainer_signed_at ? ` · ${s.trainer_signed_at}` : ""}`} style={{ color: "#2e9e5b", fontSize: 15 }}>✍</span>
                    ) : (
                      <button className="btn sm ghost" title="Signer cette demi-journée" onClick={() => setSignSheetRec(s)}>Signer</button>
                    )}
                  </td>
                ))}
              </tr>
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
