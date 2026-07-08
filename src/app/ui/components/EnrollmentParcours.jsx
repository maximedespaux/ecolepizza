import { useEffect, useState } from "react";
import { getEnrollmentParcours } from "../api/apiClient.js";

// Texte d'état + action contextuelle de l'étape en cours.
const CURRENT_DETAIL = {
  inscription: { line: "⏳ Expression du stagiaire à confirmer par le secrétariat." },
  generation: { line: "⏳ Documents à générer.", action: { label: "Aller aux documents", kind: "documents" } },
  envoi: { line: "⏳ Documents à envoyer au stagiaire.", action: { label: "Aller aux documents", kind: "documents" } },
  signature: { line: "⏳ En attente de signature du stagiaire", action: { label: "Ouvrir la signature", kind: "sign" } },
  acompte: { line: "⏳ Acompte / prise en charge à confirmer par le secrétariat." },
  convocation: { line: "⏳ Convocation à envoyer (J-30)." },
  rappel: { line: "⏳ Rappel à envoyer (J-3)." },
  formation: { line: "⏳ Formation en cours — émargement & questionnaire." },
  evaluation: { line: "⏳ Évaluation à chaud à recueillir." },
  fin: { line: "⏳ Documents de fin de stage à délivrer." },
  suivi: { line: "⏳ Suivi à 6 mois à réaliser par le formateur." },
};

/**
 * Parcours (cycle de vie) d'un dossier : chronologie à gauche, détail de l'étape
 * sélectionnée à droite. `onOpenDoc(docId)` ouvre l'aperçu/signature d'un document ;
 * `onGoto('documents')` remonte vers la section Documents.
 */
function EnrollmentParcours({ enrollmentId, onOpenDoc, onGoto }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null); // clé de l'étape sélectionnée
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setData(null); setError(null);
    getEnrollmentParcours(enrollmentId)
      .then((r) => { if (!active) return; setData(r.data); setSel(r.data.currentKey || r.data.steps[0]?.key); })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [enrollmentId]);

  if (error) return <p className="hint" style={{ color: "var(--amber, #b8860b)" }}>{error}</p>;
  if (!data) return <p className="hint">Chargement du parcours…</p>;

  const step = data.steps.find((s) => s.key === sel) || data.steps[data.currentIndex] || data.steps[0];
  const isCurrent = step && step.key === data.currentKey;
  const detail = isCurrent ? (CURRENT_DETAIL[step.key] || {}) : null;

  function runAction() {
    if (!detail?.action) return;
    if (detail.action.kind === "sign" && data.signableDocId) onOpenDoc?.(data.signableDocId);
    else if (detail.action.kind === "documents") onGoto?.("documents");
  }
  const canAct = detail?.action && (detail.action.kind !== "sign" || !!data.signableDocId);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
      {/* Chronologie */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Parcours</h3>
          <b style={{ color: "var(--ember1, #c0392b)", fontSize: 18 }}>{data.percent}%</b>
        </div>
        <div style={{ height: 8, borderRadius: 6, background: "var(--border-soft)", margin: "10px 0 16px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${data.percent}%`, background: "linear-gradient(90deg,#c0392b,#e0932e)", borderRadius: 6 }} />
        </div>
        <div style={{ position: "relative" }}>
          {data.steps.map((s) => {
            const on = s.key === sel;
            const tone = s.status === "done" ? "#2e9e5b" : s.status === "current" ? "#c0392b" : "var(--dim)";
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: tone, whiteSpace: "nowrap" }}>En cours</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Détail de l'étape sélectionnée */}
      <div className="card" style={{ padding: 20, position: "sticky", top: 12 }}>
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
        <p style={{ color: "var(--muted)", marginTop: 8 }}>{step.sub}</p>

        {step.status === "done" && <p style={{ color: "#2e9e5b", fontWeight: 600 }}>✓ Étape terminée.</p>}
        {step.status === "todo" && <p className="hint">À venir.</p>}
        {step.status === "current" && (
          <>
            <p style={{ fontWeight: 600, marginTop: 14 }}>{detail?.line || "En cours."}</p>
            {detail?.action && (
              <button className="btn primary" disabled={!canAct} onClick={runAction} style={{ marginTop: 4 }}>
                ✍ {detail.action.label}
              </button>
            )}
            {detail?.action?.kind === "sign" && !data.signableDocId && (
              <p className="hint" style={{ marginTop: 6 }}>Aucun document à signer n'est encore prêt.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default EnrollmentParcours;
