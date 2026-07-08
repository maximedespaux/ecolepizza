import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyFormations } from "../api/apiClient.js";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { colorOf } from "../lib/format.js";

function MesFormations() {
  const navigate = useNavigate();
  const [formations, setFormations] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    getMyFormations().then((r) => setFormations(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }, []);

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Espace stagiaire</div>
        <h1>Mes formations</h1>
        <p>Chaque formation se déverrouille une fois terminée et tous les documents signés. Vous y retrouvez alors l'ensemble de vos documents.</p>
      </div>

      <StatusMessage status={status} />

      {!formations ? (
        !status && <Card><p className="hint" style={{ margin: 0 }}>Chargement…</p></Card>
      ) : formations.length === 0 ? (
        <Card><EmptyState icon="🍕">Aucune formation au catalogue.</EmptyState></Card>
      ) : (
        <div className="grid cols-3">
          {formations.map((f) => {
            const color = colorOf(f.program_code);
            const locked = !f.complete;
            return (
              <div
                key={f.program_id}
                className={`card${locked ? "" : " hover"}`}
                style={{ cursor: locked ? "default" : "pointer", opacity: locked ? 0.66 : 1, borderTop: `3px solid ${color}` }}
                onClick={locked ? undefined : () => navigate(`/formations/${f.enrollment_id}`)}
                title={locked ? (f.enrolled ? "Disponible une fois la formation terminée" : "Formation non suivie") : "Voir mes documents"}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="badge n mono" style={{ background: color, color: "#fff", borderColor: "transparent" }}>{f.program_code}</span>
                  <span style={{ fontSize: 18 }}>{locked ? "🔒" : "✅"}</span>
                </div>
                <h3 style={{ fontSize: 15, margin: "10px 0 4px" }}>{f.program_title}</h3>
                <p style={{ fontSize: 12.5, color: "var(--muted)", margin: 0 }}>
                  {!f.enrolled
                    ? "Non suivie"
                    : f.start_date && f.end_date
                      ? `Du ${f.start_date} au ${f.end_date}`
                      : `Semaine ${f.week} · ${f.year}`}
                </p>

                {f.enrolled && (
                  <div className="progress" style={{ margin: "12px 0 6px" }}>
                    <span style={{ width: `${f.total ? (f.signed / f.total) * 100 : 0}%` }} />
                  </div>
                )}
                <p style={{ fontSize: 12, color: f.complete ? "var(--green)" : "var(--muted)", margin: f.enrolled ? 0 : "12px 0 0", fontWeight: 600 }}>
                  {f.complete
                    ? "Terminée — documents disponibles →"
                    : !f.enrolled
                      ? "Non suivie"
                      : !f.dayPassed
                        ? "En cours"
                        : `${f.signed}/${f.total} document(s) signé(s)`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

export default MesFormations;
