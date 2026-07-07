import { useEffect, useState } from "react";
import { getAudit } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";

const ACTION_LABEL = {
  "document.send": ["Document envoyé", "b"],
  "document.sign": ["Document signé", "g"],
  "document.create": ["Document préparé", "n"],
  "sale.create": ["Vente enregistrée", "a"],
  "attendance.generate": ["Émargement généré", "n"],
  "organization.update": ["Organisme modifié", "n"],
  "learner.create": ["Stagiaire ajouté", "n"],
  "session.create": ["Session planifiée", "n"],
};

function Audit() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(null);

  async function load(query = "") {
    try { setRows((await getAudit(query)).data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <PageHead eyebrow="Système" title="Journal d'audit" lead="Traçabilité des actions sensibles (100 dernières)." />
      <StatusMessage status={status} />

      <div className="searchbar">
        <input className="inp" placeholder="Rechercher une action…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <Card title={`Événements (${rows.length})`}>
        {rows.length === 0 ? (
          <EmptyState icon="🔒">Aucun événement.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {rows.map((r) => {
              const [label, tone] = ACTION_LABEL[r.action] || [r.action, "n"];
              const who = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Système";
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--dim)", width: 120 }}>{r.created_at}</span>
                  <Badge tone={tone}>{label}</Badge>
                  <span style={{ flex: 1, fontSize: 13, color: "var(--muted)" }}>{r.entity || ""}</span>
                  <span style={{ fontSize: 12.5 }}>{who}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

export default Audit;
