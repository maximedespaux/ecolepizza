import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getEnrollments, updateEnrollment } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

// Étapes du tunnel commercial (ordre = progression du dossier).
const STAGES = [
  { v: "PROSPECT", label: "Prospect", color: "#8a8fa8" },
  { v: "CONTACTE", label: "Contacté", color: "#6a86c4" },
  { v: "DEVIS_ENVOYE", label: "Devis envoyé", color: "#4c6fb3" },
  { v: "DEVIS_SIGNE", label: "Devis signé", color: "#4c6fb3" },
  { v: "ACOMPTE_PAYE", label: "Acompte payé", color: "#c9922b" },
  { v: "INSCRIT", label: "Inscrit", color: "#2f8f6b" },
  { v: "EN_FORMATION", label: "En formation", color: "#2f8f6b" },
  { v: "TERMINE", label: "Terminé", color: "#2c3371" },
  { v: "EVALUATION_ENVOYEE", label: "Éval. envoyée", color: "#2c3371" },
  { v: "ARCHIVE", label: "Archivé", color: "#8a8fa8" },
];
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.v, i]));
const CONF_CLASS = { VERT: "g", ORANGE: "n", ROUGE: "r" };
const CONF_LABEL = { VERT: "Complet", ORANGE: "À compléter", ROUGE: "Incomplet" };

function Pipeline() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data } = await getEnrollments();
      setRows(data);
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const byStage = useMemo(() => {
    const map = Object.fromEntries(STAGES.map((s) => [s.v, []]));
    for (const r of rows) (map[r.crm_stage] || map.PROSPECT).push(r);
    return map;
  }, [rows]);

  async function move(row, dir) {
    const idx = STAGE_INDEX[row.crm_stage] ?? 0;
    const next = STAGES[idx + dir];
    if (!next) return;
    // Optimiste : on déplace la carte tout de suite.
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, crm_stage: next.v } : r)));
    try {
      await updateEnrollment(row.id, { crm_stage: next.v });
    } catch (e) {
      setStatus({ type: "error", message: e.message });
      load(); // resynchronise en cas d'échec
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Secrétariat · CRM"
        title="Pipeline commercial"
        lead="Suivez chaque dossier du premier contact jusqu'à l'archivage. Utilisez les flèches pour faire avancer ou reculer un dossier d'étape."
      />
      <StatusMessage status={status} />

      {loading ? (
        <p className="lead">Chargement…</p>
      ) : (
        <div className="pipe">
          {STAGES.map((st) => {
            const items = byStage[st.v] || [];
            return (
              <div className="pipe-col" key={st.v}>
                <div className="pipe-head">
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <i style={{ width: 9, height: 9, borderRadius: 999, background: st.color }} />
                    {st.label}
                  </span>
                  <b className="tnum">{items.length}</b>
                </div>
                <div className="pipe-body">
                  {items.length === 0 ? (
                    <p className="sub" style={{ textAlign: "center", padding: "10px 0", color: "var(--dim)" }}>—</p>
                  ) : items.map((r) => {
                    const idx = STAGE_INDEX[r.crm_stage] ?? 0;
                    return (
                      <div className="pipe-card" key={r.id}>
                        <Link to={`/stagiaires/${r.learner_id}`} className="pipe-name">
                          {r.first_name} {r.last_name}
                        </Link>
                        <div className="pipe-meta">
                          {r.program_code && <span className="chip">{r.program_code}</span>}
                          {r.year && <span className="sub">S{r.week}·{r.year}</span>}
                        </div>
                        {r.doc_total > 0 && (
                          <div className="pipe-docs" title="Documents créés / signés">
                            📄 {r.doc_signed}/{r.doc_total} signé{r.doc_signed > 1 ? "s" : ""}
                            {r.doc_total - r.doc_signed > 0 && <span className="sub"> · {r.doc_total - r.doc_signed} à signer</span>}
                          </div>
                        )}
                        <div className="pipe-foot">
                          <span className={`badge ${CONF_CLASS[r.conformite_score] || "r"}`}>{CONF_LABEL[r.conformite_score] || "Incomplet"}</span>
                          <span className="pipe-moves">
                            <button className="iconbtn" title="Reculer" disabled={idx === 0} onClick={() => move(r, -1)}>◀</button>
                            <button className="iconbtn" title="Avancer" disabled={idx === STAGES.length - 1} onClick={() => move(r, +1)}>▶</button>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default Pipeline;
