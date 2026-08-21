import { useEffect, useState } from "react";
import { getEnrollmentParcours } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";

// Icône SVG d'une étape selon son état / type de document.
function stepIcon(s) {
  if (s.status === "done") return "check";
  if (s.quiz) return "help";
  if (s.signable) return "pencil";
  return "file-text";
}

// Étape « de groupe » (parcours entreprise) : porte des compteurs gen/total/signed.
const isGroup = (s) => s && s.total != null;

// Sous-titre affiché sous chaque étape de la chronologie. En mode groupe (fiche
// entreprise) on montre le compteur de signatures d'un coup d'œil (0/2, 1/2…).
function listSub(s) {
  if (isGroup(s) && s.company_level) {
    // Document de groupe = UNE signature (organisme + entreprise), pas par stagiaire.
    if (s.total > 1) return `${s.signed}/${s.total} document(s) signé(s)`; // plusieurs OPCO
    return s.signed >= 1 ? "Signé (organisme + entreprise)" : "À signer (organisme + entreprise)";
  }
  if (isGroup(s) && s.total > 0) return `${s.signed}/${s.total} signé(s)`;
  if (isGroup(s)) return "Aucun stagiaire concerné";
  return s.sub;
}

// Ligne d'état de l'étape sélectionnée (selon son statut et le document lié).
function lineFor(s) {
  if (isGroup(s)) {
    if (s.company_level) {
      if (s.total > 1) return `Document de groupe (entreprise) · ${s.signed}/${s.total} document(s) signé(s).`;
      return s.signed >= 1 ? "Document de groupe (signé (organisme + entreprise)." : "Document de groupe) à faire signer (organisme + entreprise).";
    }
    return `${s.signed}/${s.total} stagiaire(s) ont signé · ${s.gen}/${s.total} généré(s) · à générer depuis chaque fiche stagiaire.`;
  }
  // Doc destiné à l'entreprise, vu depuis la fiche stagiaire : lecture seule.
  if (s.company_level) {
    if (s.status === "done") return "Document entreprise signé.";
    return "Document destiné à l'entreprise, généré depuis la fiche entreprise.";
  }
  if (s.status === "done") return s.signable || s.quiz ? "Complété / signé." : "Document produit et envoyé.";
  if (s.status === "todo") return "À venir.";
  if (s.quiz) return s.docId ? "En attente de réponse du stagiaire au QCM." : "QCM à envoyer au stagiaire.";
  if (s.signable) {
    if (!s.docId) return "Document à préparer, puis à faire signer.";
    if (s.docStatus === "A_FAIRE") return "Document préparé, à envoyer au stagiaire.";
    return "En attente de signature du stagiaire.";
  }
  if (!s.docId) return "Document à préparer.";
  if (s.docStatus === "A_FAIRE") return "Document préparé, à envoyer.";
  return "En cours.";
}
function actionFor(s) {
  if (isGroup(s)) {
    // Fiche entreprise : seuls les documents de groupe se génèrent ici ; les documents
    // stagiaire sont visibles mais générés depuis chaque fiche stagiaire.
    if (s.company_level) return { label: "Préparer le document", kind: "prepare" };
    return null;
  }
  // Fiche stagiaire : un document destiné à l'entreprise est en lecture seule
  // (consultable s'il existe, mais jamais généré ici).
  if (s.company_level) return s.docId ? { label: s.signable ? "Ouvrir la signature" : "Voir le document", kind: "open" } : null;
  if (s.status !== "current" && s.status !== "todo") return null;
  if (s.docId) return { label: s.signable ? "Ouvrir la signature" : s.quiz ? "Voir le QCM" : "Voir le document", kind: "open" };
  if (s.quiz) return { label: "Envoyer le QCM", kind: "send-quiz" }; // envoi manuel au stagiaire
  return { label: "Préparer ce document", kind: "prepare" };
}

/**
 * Parcours documentaire d'un dossier : chronologie à gauche (les documents/QCM de
 * la formation, dans l'ordre), détail de l'étape sélectionnée à droite.
 * `onOpenDoc(docId)` ouvre l'aperçu/signature ; `onGoto('documents')` remonte à la section Documents.
 */
function EnrollmentParcours({ enrollmentId, fetcher, resetKey, refresh, onOpenDoc, onPrepare, onSendQuiz, onSignLink }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState(null);
  const [error, setError] = useState(null);
  // Clé de réinitialisation : dossier stagiaire (enrollmentId) ou clé fournie (ex. session entreprise).
  const key = resetKey ?? enrollmentId;

  // Au changement de contexte seulement : on remet l'affichage en état de chargement.
  // (Un simple rafraîchissement ne vide PAS l'affichage : évite le clignotement.)
  useEffect(() => { setData(null); setSel(null); setError(null); }, [key]);

  useEffect(() => {
    let active = true;
    (fetcher ? fetcher() : getEnrollmentParcours(enrollmentId))
      .then((r) => {
        if (!active) return;
        setData(r.data);
        setError(null);
        // Ne réinitialise la sélection que si aucune étape n'est encore choisie
        // (sinon un rafraîchissement automatique ferait « sauter » la sélection).
        setSel((cur) => cur || r.data.currentKey || r.data.steps[0]?.key || null);
      })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [key, refresh]);

  if (error) return <p className="hint" style={{ color: "var(--amber, #b8860b)" }}>{error}</p>;
  if (!data) return <p className="hint">Chargement du parcours…</p>;
  if (!data.steps.length) return <p className="hint">Cette formation n'a pas de parcours documentaire. Définissez-le dans Formations → Parcours documentaire.</p>;

  const step = data.steps.find((s) => s.key === sel) || data.steps[Math.min(data.currentIndex, data.steps.length - 1)];
  const action = actionFor(step);

  function runAction() {
    if (!action) return;
    if (action.kind === "open" && step.docId) onOpenDoc?.(step.docId);
    else if (action.kind === "prepare") onPrepare?.(step.key, step); // step transmis (mode groupe)
    else if (action.kind === "send-quiz" && step.key?.startsWith("quiz:")) onSendQuiz?.(step.key.slice(5));
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
          {data.steps.map((s, idx, arr) => {
            const on = s.key === sel;
            // Séparateur de section (parcours entreprise) : uniquement si l'API
            // renvoie deux sections distinctes (company / learner).
            const hasSections = arr.some((x) => x.section === "company") && arr.some((x) => x.section === "learner");
            const showDivider = hasSections && s.section && (idx === 0 || arr[idx - 1].section !== s.section);
            const divider = showDivider ? (
              <div key={`sec-${s.section}`} style={{ display: "flex", alignItems: "center", gap: 8, margin: idx === 0 ? "2px 2px 8px" : "14px 2px 8px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", color: "var(--dim)" }}>
                <span>{s.section === "company" ? "🏢 À L'ARRIVÉE VIA L'ENTREPRISE" : "SUITE DU PARCOURS · STAGIAIRE"}</span>
                <span style={{ flex: 1, height: 1, background: "var(--border-soft)" }} />
              </div>
            ) : null;
            return (
              <div key={s.key}>
              {divider}
              <button type="button" onClick={() => setSel(s.key)}
                style={{
                  display: "flex", gap: 12, alignItems: "center", width: "100%", textAlign: "left",
                  padding: "10px 12px", marginBottom: 8, borderRadius: 12, cursor: "pointer",
                  color: "var(--text)",
                  background: on ? "var(--surface2)" : "transparent",
                  border: on ? "1px solid var(--ember1, #c0392b)" : "1px solid var(--border-soft)",
                }}>
                <span style={{
                  width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", flex: "0 0 34px",
                  background: s.status === "todo" ? "var(--border-soft)" : "linear-gradient(135deg,#c0392b,#e0932e)",
                  filter: s.status === "todo" ? "grayscale(1) opacity(.6)" : "none",
                  color: s.status === "todo" ? "var(--muted)" : "#fff",
                }}><Icon name={stepIcon(s)} size={17} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: "block", color: s.status === "todo" ? "var(--dim)" : "var(--text)" }}>{s.label}</b>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{listSub(s)}</span>
                </span>
                {s.status === "current" && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--ember1,#c0392b)", whiteSpace: "nowrap" }}>En cours</span>
                )}
              </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Détail de l'étape sélectionnée */}
      <div className="card" style={{ padding: 20, position: "sticky", top: 74, maxHeight: "calc(100vh - 90px)", overflowY: "auto" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{
            width: 44, height: 44, borderRadius: 11, display: "grid", placeItems: "center",
            background: "linear-gradient(135deg,#c0392b,#e0932e)", color: "#fff",
          }}><Icon name={stepIcon(step)} size={20} /></span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "var(--dim)" }}>ÉTAPE</div>
            <h3 style={{ margin: 0, fontSize: 20 }}>{step.label}</h3>
          </div>
        </div>
        {step.sub && <p style={{ color: "var(--muted)", marginTop: 8 }}>{step.sub}</p>}
        <p style={{ fontWeight: 600, marginTop: 14, color: step.status === "done" ? "#2e9e5b" : "inherit" }}>{lineFor(step)}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
          {action && (
            <button className="btn primary" onClick={runAction}>{action.label}</button>
          )}
          {onSignLink && step.docId && (
            <button className="btn ghost" onClick={() => onSignLink(step.docId)} title="Copier un lien pour que le représentant signe">🔗 Lien de signature</button>
          )}
        </div>
      </div>
    </div>
  );
}

export default EnrollmentParcours;
