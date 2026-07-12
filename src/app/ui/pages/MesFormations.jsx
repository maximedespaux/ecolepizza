import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMyFormations } from "../api/apiClient.js";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { colorOf, euro } from "../lib/format.js";

function MesFormations() {
  const navigate = useNavigate();
  const [formations, setFormations] = useState(null);
  const [status, setStatus] = useState(null);
  const [info, setInfo] = useState(null); // formation affichée en lecture seule

  useEffect(() => {
    getMyFormations().then((r) => setFormations(r.data)).catch((err) => setStatus({ type: "error", message: err.message }));
  }, []);

  // Débloquées (suivies) d'abord, puis les autres.
  const sorted = formations
    ? [...formations].sort((a, b) => (b.enrolled ? 1 : 0) - (a.enrolled ? 1 : 0) || String(a.program_code).localeCompare(String(b.program_code)))
    : null;

  return (
    <>
      <div className="hero">
        <div className="eyebrow">Espace stagiaire</div>
        <h1>Mes formations</h1>
        <p>Chaque formation se déverrouille dès votre inscription à une session. Vous y accédez à tous vos documents et à votre émargement.</p>
      </div>

      <StatusMessage status={status} />

      {!sorted ? (
        !status && <Card><p className="hint" style={{ margin: 0 }}>Chargement…</p></Card>
      ) : sorted.length === 0 ? (
        <Card><EmptyState icon="pizza">Aucune formation au catalogue.</EmptyState></Card>
      ) : (
        <div className="grid cols-3">
          {sorted.map((f) => {
            const color = f.color || colorOf(f.program_code);
            const locked = !f.enrolled; // déverrouillée dès l'inscription à une session
            return (
              <div
                key={f.program_id}
                className={`card hover`}
                style={{ cursor: "pointer", opacity: locked ? 0.72 : 1, borderTop: `3px solid ${color}` }}
                onClick={locked ? () => setInfo(f) : () => navigate(`/formations/${f.enrollment_id}`)}
                title={locked ? "Voir les informations (formation non suivie)" : "Voir mes documents et mon émargement"}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span className="badge n mono" style={{ background: color, color: "#fff", borderColor: "transparent" }}>{f.program_code}</span>
                  <span style={{ fontSize: 18 }}>{locked ? "🔒" : f.complete ? "✅" : "📂"}</span>
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
                  {!f.enrolled
                    ? "Non suivie"
                    : f.complete
                      ? "Terminée — documents & émargement →"
                      : `Documents & émargement · ${f.signed}/${f.total} signé(s) →`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {info && <FormationInfoModal f={info} onClose={() => setInfo(null)} />}
    </>
  );
}

// Aperçu en lecture seule d'une formation non suivie (informations du catalogue).
function InfoRow({ label, value }) {
  if (value === null || value === undefined || value === "" || value === "0.00") return null;
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ whiteSpace: "pre-wrap" }}>{value}</div>
    </div>
  );
}

function FormationInfoModal({ f, onClose }) {
  const color = f.color || colorOf(f.program_code);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="badge n mono" style={{ background: color, color: "#fff", borderColor: "transparent" }}>{f.program_code}</span>
            {f.program_title}
          </h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <p className="hint" style={{ marginTop: 0 }}>Formation non suivie — ces informations sont fournies à titre indicatif. Inscrivez-vous à une session pour y accéder.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <InfoRow label="Durée" value={f.days ? `${f.days} jour(s)` : null} />
            <InfoRow label="Heures" value={f.hours ? `${f.hours} h` : null} />
            <InfoRow label="Tarif" value={f.price ? euro(f.price) : null} />
          </div>
          <InfoRow label="Public visé" value={f.audience} />
          <InfoRow label="Objectif général" value={f.objective_general} />
          <InfoRow label="Objectifs pédagogiques" value={f.objectives} />
          <InfoRow label="Détail des horaires" value={f.duration_detail} />
          <InfoRow label="Déroulé du programme" value={f.program_detail} />
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

export default MesFormations;
