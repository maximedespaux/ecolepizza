import { useContext, useEffect, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getMonEspace } from "../api/apiClient.js";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";

const STATUS = { ENVOYE: ["À signer", "a"], CONSULTE: ["À signer", "a"], SIGNE: ["Signé ✓", "g"] };

function MonEspace() {
  const { user } = useContext(UserContext);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState(null);
  const [viewId, setViewId] = useState(null);

  async function load() {
    try {
      const r = await getMonEspace();
      setData(r.data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }
  useEffect(() => { load(); }, []);

  const fullName = `${user?.first_name || ""} ${user?.last_name || ""}`.trim();
  const toSign = (data?.documents || []).filter((d) => d.status !== "SIGNE").length;

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Espace stagiaire</div>
        <h1>Bonjour {user?.first_name} 👋</h1>
        <p>Voici les documents que l'administration vous a envoyés. Consultez-les et signez ceux qui le nécessitent.</p>
        {toSign > 0 && <div className="badge-row"><span className="pill">{toSign} document(s) à signer</span></div>}
      </div>

      <StatusMessage status={status} />

      {!data ? null : data.documents.length === 0 ? (
        <Card><EmptyState icon="🍕">Aucun document pour le moment. Le secrétariat vous enverra vos documents avant la formation.</EmptyState></Card>
      ) : (
        <Card title="Mes documents">
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {data.documents.map((d) => {
              const [label, tone] = STATUS[d.status] || [d.status, "n"];
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{d.title}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                      {d.formations || ""}{d.signed_at ? ` · signé le ${d.signed_at}` : d.sent_at ? ` · reçu le ${d.sent_at}` : ""}
                    </span>
                  </span>
                  <Badge tone={tone}>{label}</Badge>
                  <button className="btn sm primary" onClick={() => setViewId(d.id)}>
                    {d.status === "SIGNE" ? "Consulter" : "Consulter / signer"}
                  </button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {viewId && (
        <DocumentViewModal
          id={viewId}
          canSign
          defaultName={fullName}
          onClose={() => setViewId(null)}
          onChanged={load}
        />
      )}
    </>
  );
}

export default MonEspace;
