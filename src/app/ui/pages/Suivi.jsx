import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSuivi } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Kpi from "../components/Kpi.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Roadmap from "../components/Roadmap.jsx";
import { scoreBadge, colorOf } from "../lib/format.js";

function Suivi() {
  const navigate = useNavigate();
  const [dossiers, setDossiers] = useState([]);
  const [status, setStatus] = useState(null);
  const [open, setOpen] = useState({});

  useEffect(() => {
    getSuivi().then((r) => setDossiers(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }, []);

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const count = (score) => dossiers.filter((d) => d.score === score).length;

  return (
    <>
      <PageHead
        eyebrow="Qualiopi"
        title="Suivi de conformité"
        lead="Les dossiers incomplets sont affichés en premier. Cliquez pour dérouler les documents, puis gérez leur envoi."
      />
      <StatusMessage status={status} />

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <Kpi label="🔴 Incomplets" value={count("ROUGE")} />
        <Kpi label="🟠 En cours" value={count("ORANGE")} />
        <Kpi label="🟢 Complets" value={count("VERT")} />
      </div>

      <Card title={`Dossiers (${dossiers.length})`}>
        {dossiers.length === 0 ? (
          <EmptyState icon="▤">Aucun dossier à suivre.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dossiers.map((d) => {
              const isOpen = !!open[d.enrollment_id];
              return (
                <div key={d.enrollment_id} className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {/* En-tête cliquable */}
                  <button
                    type="button"
                    onClick={() => toggle(d.enrollment_id)}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ transition: ".15s", transform: isOpen ? "rotate(90deg)" : "none", color: "var(--dim)" }}>▶</span>
                    <span className="badge n mono" style={{ background: colorOf(d.program_code), color: "#fff", borderColor: "transparent" }}>{d.program_code}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{d.last_name} {d.first_name}</b>
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{d.program_title} · {d.signed}/{d.to_sign} signé(s)</span>
                    </span>
                    <Badge tone={scoreBadge(d.score)}>{d.score}</Badge>
                  </button>

                  {/* Contenu déroulant */}
                  {isOpen && (
                    <div style={{ padding: "12px 16px 14px 40px", borderTop: "1px solid var(--border-soft)" }}>
                      <Roadmap steps={d.documents} />
                      <button className="btn sm primary" style={{ marginTop: 6 }} onClick={() => navigate(`/stagiaires/${d.learner_id}`)}>
                        Gérer &amp; envoyer les documents →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

export default Suivi;
