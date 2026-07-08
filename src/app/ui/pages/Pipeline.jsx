import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSessions, getSessionBoard } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

// Tableau par session : chaque colonne est un document du parcours de la
// formation, chaque stagiaire (carte) est positionné sur son prochain document.
function Pipeline() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getSessions()
      .then((r) => { setSessions(r.data || []); if (r.data && r.data.length) setSessionId(r.data[0].id); })
      .catch((e) => setStatus({ type: "error", message: e.message }));
  }, []);

  useEffect(() => {
    if (!sessionId) { setBoard(null); return; }
    setLoading(true);
    getSessionBoard(sessionId)
      .then((r) => setBoard(r.data))
      .catch((e) => setStatus({ type: "error", message: e.message }))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Colonnes du parcours + une colonne finale « Terminé ».
  const columns = useMemo(() => {
    if (!board) return [];
    return [...board.columns, { index: board.columns.length, key: "__done", label: "Terminé ✓", final: true }];
  }, [board]);
  const cardsByCol = useMemo(() => {
    const m = {};
    for (const c of (board?.cards || [])) (m[c.column] = m[c.column] || []).push(c);
    return m;
  }, [board]);

  const sessLabel = (s) => `${s.program_code} — S${s.week} ${s.year} · ${s.stagiaires} stag.`;

  return (
    <>
      <PageHead
        eyebrow="Secrétariat · Suivi"
        title="Pipeline de session"
        lead="Choisissez une session : chaque colonne est un document du parcours de la formation, chaque stagiaire avance jusqu'à son prochain document à produire."
        actions={
          <select className="inp" style={{ minWidth: 260 }} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.length === 0 && <option value="">— Aucune session —</option>}
            {sessions.map((s) => <option key={s.id} value={s.id}>{sessLabel(s)}</option>)}
          </select>
        }
      />
      <StatusMessage status={status} />

      {loading ? (
        <p className="lead">Chargement…</p>
      ) : !board ? (
        <p className="lead">Sélectionnez une session.</p>
      ) : board.columns.length === 0 ? (
        <p className="lead">Cette formation n'a aucun document dans son parcours. Définissez-le dans Formations → Parcours documentaire.</p>
      ) : (
        <div className="pipe">
          {columns.map((col) => {
            const items = cardsByCol[col.index] || [];
            return (
              <div className={"pipe-col" + (col.final ? " pipe-done" : "")} key={col.key}>
                <div className="pipe-head">
                  <span>{col.label}</span>
                  <b className="tnum">{items.length}</b>
                </div>
                <div className="pipe-body">
                  {items.length === 0 ? (
                    <p className="sub" style={{ textAlign: "center", padding: "8px 0", color: "var(--dim)" }}>—</p>
                  ) : items.map((r) => (
                    <div className="pipe-card" key={r.enrollment_id}>
                      <Link to={`/stagiaires/${r.learner_id}`} className="pipe-name">{r.name}</Link>
                      <div className="pipe-docs" style={{ marginTop: 6 }}>📄 {r.done}/{r.total} fait{r.done > 1 ? "s" : ""}</div>
                    </div>
                  ))}
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
