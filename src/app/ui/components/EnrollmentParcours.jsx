import { useEffect, useState } from "react";
import { getEnrollmentParcours } from "../api/apiClient.js";

// Ligne d'état de l'étape sélectionnée (selon son statut et le document lié).
function lineFor(s) {
  if (s.status === "done") return s.signable || s.quiz ? "Complété / signé." : "Document produit et envoyé.";
  if (s.status === "todo") return "À venir.";
  if (s.quiz) return s.docId ? "En attente de réponse du stagiaire au QCM." : "QCM à envoyer au stagiaire.";
  if (s.signable) {
    if (!s.docId) return "Document à préparer, puis à faire signer.";
    if (s.docStatus === "A_FAIRE") return "Document préparé — à envoyer au stagiaire.";
    return "En attente de signature du stagiaire.";
  }
  if (!s.docId) return "Document à préparer.";
  if (s.docStatus === "A_FAIRE") return "Document préparé — à envoyer.";
  return "En cours.";
}
function actionFor(s) {
  if (s.status !== "current" && s.status !== "todo") return null;
  if (s.docId) return { label: s.signable ? "Ouvrir la signature" : s.quiz ? "Voir le QCM" : "Voir le document", kind: "open" };
  if (s.quiz) return null; // l'envoi d'un QCM se fait depuis « Modèles de QCM »
  return { label: "Préparer ce document", kind: "prepare" };
}

/**
 * Parcours documentaire d'un dossier : chronologie à gauche (les documents/QCM de
 * la formation, dans l'ordre), détail de l'étape sélectionnée à droite.
 * `onOpenDoc(docId)` ouvre l'aperçu/signature ; `onGoto('documents')` remonte à la section Documents.
 */
function EnrollmentParcours({ enrollmentId, refresh, onOpenDoc, onPrepare }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setData(null); setError(null);
    getEnrollmentParcours(enrollmentId)
      .then((r) => { if (!active) return; setData(r.data); setSel(r.data.currentKey || r.data.steps[0]?.key || null); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [enrollmentId, refresh]);

  if (error) return <p className="hint" style={{ color: "var(--amber, #b8860b)" }}>{error}</p>;
  if (!data) return <p className="hint">Chargement du parcours…</p>;
  if (!data.steps.length) return <p className="hint">Cette formation n'a pas de parcours documentaire. Définissez-le dans Formations → Parcours documentaire.</p>;

  const step = data.steps.find((s) => s.key === sel) || data.steps[Math.min(data.currentIndex, data.steps.length - 1)];
  const action = actionFor(step);

  function runAction() {
    if (!action) return;
    if (action.kind === "open" && step.docId) onOpenDoc?.(step.docId);
    else if (action.kind === "prepare") onPrepare?.(step.key);
  }

  const h = data.header || {};
  const headLine = [h.code, h.session, h.financing, h.opco].filter(Boolean).join(" · ");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      {/* Chronologie */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Parcours</h3>
          <b style={{ color: "var(--ember1, #c0392b)", fontSize: 18 }}>{data.percent}%</b>
        </div>
        {headLine && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{headLine}</div>}
        <div style={{ height: 8, borderRadius: 6, background: "var(--border-soft)", margin: "10px 0 16px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${data.percent}%`, background: "linear-gradient(90deg,#c0392b,#e0932e)", borderRadius: 6 }} />
        </div>
        <div>
          {data.steps.map((s) => {
            const on = s.key === sel;
            return (
              <button key={s.key} type="button" onClick={() => setSel(s.key)}
                style={{
                  display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left",
                  padding: "10px 12px", marginBottom: 8, borderRadius: 12, cursor: "pointer",
                  background: on ? "var(--surface-2, #fff)" : "transparent",
                  border: on ? "1px solid var(--ember1, #c0392b)" : "1px solid var(--border-soft)",
                }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", flex: "0 0 34px",
                  background: s.status === "todo" ? "var(--border-soft)" : "linear-gradient(135deg,#c0392b,#e0932e)",
                  filter: s.status === "todo" ? "grayscale(1) opacity(.6)" : "none", fontSize: 16,
                }}>{s.status === "done" ? "✓" : s.ic}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block" }}>{s.label}</b>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{s.sub}</span>
                </span>
                {s.status === "current" && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ember1,#c0392b)", whiteSpace: "nowrap" }}>En cours</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Détail de l'étape sélectionnée */}
      <div className="card" style={{ padding: 20, position: "sticky", top: 74, maxHeight: "calc(100vh - 90px)", overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{
            width: 44, height: 44, borderRadius: 11, display: "grid", placeItems: "center",
            background: "linear-gradient(135deg,#c0392b,#e0932e)", fontSize: 20,
          }}>{step.ic}</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--dim)" }}>ÉTAPE</div>
            <h3 style={{ margin: 0, fontSize: 20 }}>{step.label}</h3>
          </div>
        </div>
        {step.sub && <p style={{ color: "var(--muted)", marginTop: 8 }}>{step.sub}</p>}
        <p style={{ fontWeight: 600, marginTop: 14, color: step.status === "done" ? "#2e9e5b" : "inherit" }}>{lineFor(step)}</p>
        {action && (
          <button className="btn primary" onClick={runAction} style={{ marginTop: 4 }}>{action.label}</button>
        )}
      </div>
    </div>
  );
}

export default EnrollmentParcours;
