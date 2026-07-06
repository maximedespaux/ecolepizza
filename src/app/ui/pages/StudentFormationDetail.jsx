import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getMyFormation } from "../api/apiClient.js";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
import { colorOf } from "../lib/format.js";

const STATUS = { SIGNE: ["Signé ✓", "g"], ENVOYE: ["Reçu", "a"], CONSULTE: ["Consulté", "a"], A_FAIRE: ["—", "n"] };

function StudentFormationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [viewId, setViewId] = useState(null);

  useEffect(() => {
    getMyFormation(id).then((r) => setData(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }, [id]);

  return (
    <>
      <div className="hero" style={{ background: "var(--grad-navy)" }}>
        <button className="eyebrow" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "rgba(255,255,255,.8)" }} onClick={() => navigate("/formations")}>
          ← Mes formations
        </button>
        <h1>{data ? data.program_title : "Formation"}</h1>
        {data && (
          <p>{data.start_date && data.end_date ? `Du ${data.start_date} au ${data.end_date} · ` : ""}Semaine {data?.week} · {data?.year} · {data?.program_hours} h</p>
        )}
      </div>

      <StatusMessage status={status} />

      {data && (
        <Card title="Documents de la formation">
          {(!data.documents || data.documents.length === 0) ? (
            <EmptyState icon="📄">Aucun document disponible.</EmptyState>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {data.documents.map((d) => {
                const [label, tone] = STATUS[d.status] || [d.status, "n"];
                return (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{d.title}</b>
                      {d.signed_at && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>Signé le {d.signed_at}</span>}
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                    <button className="btn sm primary" onClick={() => setViewId(d.id)}>Consulter</button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {viewId && (
        <DocumentViewModal id={viewId} onClose={() => setViewId(null)} />
      )}
    </>
  );
}

export default StudentFormationDetail;
