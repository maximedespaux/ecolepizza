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
    return [...board.columns, { index: board.columns.length, key: "__done", label: "Terminé", final: true }];
  }, [board]);
  const cardsByCol = useMemo(() => {
    const m = {};
    for (const c of (board?.cards || [])) (m[c.column] = m[c.column] || []).push(c);
    return m;
  }, [board]);

  const sessLabel = (s) => `${s.program_code} — S${s.week} ${s.year} · ${s.stagiaires} stag.`;

  /* DIX-NEUF COLONNES, DIX-HUIT VIDES. Un parcours complet compte autant d'étapes qu'il y a de
     documents ; avec un ou deux stagiaires, presque toutes annoncent « Personne à cette étape ».
     Retrouver où en est quelqu'un demandait alors près de CINQ MILLE PIXELS de défilement
     horizontal — la question à laquelle ce tableau doit répondre d'un coup d'œil.

     Les étapes vides QUI SE SUIVENT sont donc repliées en une seule bande étroite. Repliées et
     non masquées : le parcours reste une suite, et sauter des étapes sans le dire ferait croire
     qu'elles n'existent pas. La bande se déplie au clic. */
  const groupes = useMemo(() => {
    const out = [];
    for (const col of columns) {
      const items = cardsByCol[col.index] || [];
      if (items.length > 0) { out.push({ type: "col", col, items }); continue; }
      const prec = out[out.length - 1];
      if (prec && prec.type === "vide") prec.cols.push(col);
      else out.push({ type: "vide", cle: `v${col.index}`, cols: [col] });
    }
    return out;
  }, [columns, cardsByCol]);
  const [deplies, setDeplies] = useState({});

  return (
    <>
      <PageHead
        eyebrow="Secrétariat · Suivi"
        title="Pipeline de session"
        lead="Où en est chaque stagiaire de la session, étape par étape."
        actions={
          <select className="inp" aria-label="Choisir la session à afficher" style={{ minWidth: 260 }} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
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
        <p className="lead">Aucune étape à afficher.</p>
      ) : (
        <div className="pipe">
          {groupes.map((g) => {
            if (g.type === "vide" && !deplies[g.cle]) {
              return (
                <button type="button" className="pipe-plie" key={g.cle}
                  onClick={() => setDeplies((d) => ({ ...d, [g.cle]: true }))}
                  title={g.cols.map((c) => c.label).join(" · ")}>
                  <b className="tnum">{g.cols.length}</b>
                  <span>étape{g.cols.length > 1 ? "s" : ""} sans personne</span>
                </button>
              );
            }
            const cols = g.type === "col" ? [g.col] : g.cols;
            return cols.map((col) => {
              const items = cardsByCol[col.index] || [];
              return (
                <div className={"pipe-col" + (col.final ? " pipe-done" : "")} key={col.key}>
                  {/* Le libellé vient du MODÈLE de document (choisi par l'école) et peut faire
                      trois lignes — « Contrat de formation / Convention de formation
                      simplifiée ». Il s'affichait tronqué net au bord de la colonne, sans
                      infobulle : on ne savait pas de quelle étape il s'agissait. Il tient
                      maintenant sur deux lignes, le reste en points de suspension, et le titre
                      complet reste lisible au survol. */}
                  <div className="pipe-head">
                    <span className="pipe-head-t" title={col.label}>{col.ic ? `${col.ic} ` : ""}{col.label}</span>
                    <b className="tnum pipe-n">{items.length}</b>
                  </div>
                  <div className="pipe-body">
                    {items.length === 0 ? (
                      // Un « — » nu ne dit pas si l'étape est vide ou si rien n'a chargé.
                      <p className="pipe-vide">Personne à cette étape</p>
                    ) : items.map((r) => (
                      <div className="pipe-card" key={r.enrollment_id}>
                        <Link to={`/stagiaires/${r.learner_id}`} className="pipe-name">{r.name}</Link>
                        <div className="pipe-docs" style={{ marginTop: 6 }}>Étape {Math.min(r.done + 1, r.total)}/{r.total}{r.percent != null ? ` · ${r.percent}%` : ""}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })}
        </div>
      )}
    </>
  );
}

export default Pipeline;
