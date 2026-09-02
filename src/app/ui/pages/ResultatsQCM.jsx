import { useContext, useEffect, useState } from "react";
import { getQcmResultats, getQcmResultatDetail, deleteQcmResponse } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { Icon } from "../components/Icon.jsx";
import { dateHeure } from "../lib/format.js";

// Couleur d'un pourcentage de réussite : vert / ambre / rouge.
const pctTone = (p) => (p == null ? "n" : p >= 75 ? "g" : p >= 50 ? "a" : "r");

// Export CSV, format « Excel FR » : POINT-VIRGULE (la virgule y est un séparateur décimal) et BOM
// (sans lui, « Ã© » à la place des accents). Même choix que ExportPartenaire — un CSV illisible
// serait recopié à la main, ce que cet écran veut justement éviter.
function cellCsv(v) {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function telechargerCsv(nom, entetes, lignes) {
  const csv = "﻿" + [entetes, ...lignes].map((r) => r.map(cellCsv).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = nom; a.click();
  URL.revokeObjectURL(url);
}

// Grand chiffre encadré (réponses, score moyen, réussite).
function Stat({ label, value, tone }) {
  const col = tone === "g" ? "var(--green,#2e9e5b)" : tone === "r" ? "var(--ember1,#c0392b)" : tone === "a" ? "var(--amber,#b8860b)" : "var(--text)";
  return (
    <div style={{ border: "1px solid var(--border-soft)", borderRadius: 10, padding: "8px 14px", minWidth: 110 }}>
      <div className="hint" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: col }}>{value}</div>
    </div>
  );
}

// Répartition d'UNE question : options (QCU/QCM), échelle, ou grille (v1 : compte seul).
function DetailQuestion({ q, num }) {
  if (q.scale) {
    const maxN = Math.max(1, ...Object.values(q.scale.dist));
    return (
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <b>{num}. {q.text}</b>
          <span className="hint" style={{ flex: "none" }}>{q.responses} rép.{q.scale.avg != null ? ` · moyenne ${q.scale.avg}/${q.scale.max}` : ""}</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", marginTop: 8 }}>
          {Object.entries(q.scale.dist).map(([v, n]) => (
            <div key={v} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 48, display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", height: `${(n / maxN) * 100}%`, minHeight: n ? 3 : 0,
                  background: "linear-gradient(180deg,#e0932e,#c0392b)", borderRadius: "4px 4px 0 0" }} />
              </div>
              <div className="hint" style={{ fontSize: 11 }}>{v}<br />{n}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (q.grille) {
    return <div><b>{num}. {q.text}</b> <span className="hint">· grille · {q.responses} réponse(s) (détail par cellule à venir)</span></div>;
  }
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <b>{num}. {q.text}</b>
        <span className="hint" style={{ flex: "none" }}>{q.responses} rép.{q.correct_pct != null ? ` · ${q.correct_pct}% de bonnes réponses` : ""}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
        {q.options.map((o, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: "0 0 40%", minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
              {o.is_correct && <span title="Bonne réponse" style={{ color: "var(--green,#2e9e5b)", flex: "none" }}><Icon name="check" size={14} /></span>}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: o.is_correct ? 600 : 400 }}>{o.text}</span>
            </span>
            <span style={{ flex: 1, height: 10, borderRadius: 5, background: "var(--border-soft)", overflow: "hidden", minWidth: 50 }}>
              <span style={{ display: "block", height: "100%", width: `${Math.max(0, Math.min(100, o.pct))}%`,
                background: o.is_correct ? "var(--green,#2e9e5b)" : "linear-gradient(90deg,#c0392b,#e0932e)" }} />
            </span>
            <span className="hint" style={{ flex: "0 0 62px", textAlign: "right", fontSize: 12 }}>{o.pct}% ({o.count})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Par stagiaire : une ligne par réponse (score + réussi/échoué pour un QCM noté, date). Une reprise
// apparaît comme une ligne de plus, avec sa date — on voit qui a repassé et progressé.
function StagiairesTable({ learners, quiz, isAdmin, onDelete }) {
  const note = quiz.kind === "GRADED";
  if (!learners.length) return <p className="hint" style={{ margin: 0 }}>Aucune réponse.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {learners.map((l, i) => {
        const reussi = note && l.pct != null && quiz.pass_score != null ? l.pct >= quiz.pass_score : null;
        return (
          <div key={l.id || i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", border: "1px solid var(--border-soft)", borderRadius: 8 }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
            {note && <span style={{ flex: "none", minWidth: 50, textAlign: "right", fontWeight: 600 }}>{l.pct != null ? `${l.pct}%` : "—"}</span>}
            {reussi != null && <Badge tone={reussi ? "g" : "r"}>{reussi ? "Réussi" : "Échoué"}</Badge>}
            <span className="hint" style={{ flex: "none", fontSize: 12 }}>{dateHeure(l.completed_at)}</span>
            {isAdmin && l.id && (
              <button type="button" className="icon-btn" title="Supprimer cette réponse" aria-label="Supprimer cette réponse"
                onClick={() => onDelete(l.id)} style={{ flex: "none" }}><Icon name="x" size={14} /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Résultats QCM (Qualité & conformité) : ce que les stagiaires répondent aux QCM de « Modèles de
 * QCM » (sans rapport avec le Pizza Quest). Vue d'ensemble par QCM, puis par question / par stagiaire.
 */
function ResultatsQCM() {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState(null);
  const [sel, setSel] = useState(null);        // id du QCM ouvert
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [vue, setVue] = useState("questions"); // "questions" | "stagiaires"
  const [filtres, setFiltres] = useState({ sessions: [], years: [] }); // options disponibles
  const [selSession, setSelSession] = useState("");
  const [selYear, setSelYear] = useState("");
  const { user } = useContext(UserContext);
  const isAdmin = ["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"].includes(user?.role); // l'auditeur ne supprime pas

  // Recharge la vue d'ensemble à chaque changement de filtre ; un détail ouvert suit le filtre.
  useEffect(() => {
    getQcmResultats(selSession || null, selYear || null)
      .then((r) => { setRows(r.data || []); if (r.filtres) setFiltres(r.filtres); })
      .catch((e) => setStatus({ type: "error", message: e.message }));
    if (sel) getQcmResultatDetail(sel, selSession || null, selYear || null).then((r) => setDetail(r.data)).catch(() => {});
  }, [selSession, selYear]);

  function ouvrir(id) {
    if (id === sel) { setSel(null); setDetail(null); return; } // re-clic = replier
    setSel(id); setDetail(null); setVue("questions"); setLoadingDetail(true);
    getQcmResultatDetail(id, selSession || null, selYear || null)
      .then((r) => setDetail(r.data))
      .catch((e) => setStatus({ type: "error", message: e.message }))
      .finally(() => setLoadingDetail(false));
  }

  async function supprimerReponse(id) {
    if (!window.confirm("Supprimer cette réponse ? Les statistiques seront recalculées.")) return;
    try {
      await deleteQcmResponse(id);
      // Le compteur du QCM change aussi : on recharge la vue d'ensemble ET le détail ouvert.
      const [ov, det] = await Promise.all([getQcmResultats(selSession || null, selYear || null), getQcmResultatDetail(sel, selSession || null, selYear || null)]);
      setRows(ov.data || []);
      setDetail(det.data);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  // Suffixe de nom de fichier reflétant le filtre courant (session lisible + année).
  function suffixeFiltre() {
    const s = selSession ? filtres.sessions.find((x) => x.id === selSession) : null;
    const parts = [];
    if (s) parts.push([s.code, s.start_date].filter(Boolean).join("-"));
    if (selYear) parts.push(selYear);
    return parts.length ? "-" + parts.join("-").replace(/[^\w-]+/g, "-") : "";
  }
  function exporterVue() {
    if (!rows || !rows.length) return;
    const entetes = ["QCM", "Type", "Réponses", "Score moyen %", "Taux de réussite %"];
    const lignes = rows.map((q) => [q.title, q.kind === "GRADED" ? "Noté" : "Enquête", q.responses, q.avg_pct ?? "", q.pass_rate ?? ""]);
    telechargerCsv(`resultats-qcm${suffixeFiltre()}.csv`, entetes, lignes);
  }
  function exporterStagiaires() {
    if (!detail || !detail.learners.length) return;
    const note = detail.quiz.kind === "GRADED";
    const entetes = note ? ["Stagiaire", "Score %", "Résultat", "Date"] : ["Stagiaire", "Date"];
    const lignes = detail.learners.map((l) => {
      const reussi = note && l.pct != null && detail.quiz.pass_score != null ? (l.pct >= detail.quiz.pass_score ? "Réussi" : "Échoué") : "";
      return note ? [l.name, l.pct ?? "", reussi, dateHeure(l.completed_at)] : [l.name, dateHeure(l.completed_at)];
    });
    const base = (detail.quiz.title || "qcm").replace(/[^\w-]+/g, "-").toLowerCase().slice(0, 40);
    telechargerCsv(`${base}${suffixeFiltre()}.csv`, entetes, lignes);
  }

  return (
    <>
      <PageHead eyebrow="Qualité & conformité" title="Résultats QCM"
        lead="Ce que les stagiaires répondent aux QCM — moyenne, réussite, et le détail par question pour repérer ce qui coince." />
      <StatusMessage status={status} />

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "0 0 14px" }}>
          {filtres.sessions.length > 0 && (
            <select className="inp" value={selSession} onChange={(e) => setSelSession(e.target.value)} style={{ maxWidth: 300 }}
              aria-label="Filtrer par session">
              <option value="">Toutes les sessions</option>
              {filtres.sessions.map((s) => <option key={s.id} value={s.id}>{[s.code, s.start_date].filter(Boolean).join(" · ")}</option>)}
            </select>
          )}
          {filtres.years.length > 0 && (
            <select className="inp" value={selYear} onChange={(e) => setSelYear(e.target.value)} style={{ maxWidth: 150 }}
              aria-label="Filtrer par année">
              <option value="">Toutes les années</option>
              {filtres.years.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          )}
          {(selSession || selYear) && (
            <button type="button" className="btn sm ghost" onClick={() => { setSelSession(""); setSelYear(""); }}>Réinitialiser</button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn sm" onClick={exporterVue} title="Exporter la vue d'ensemble filtrée (CSV)">⬇ Exporter (CSV)</button>
        </div>
      )}

      {!rows ? (
        <p className="hint">Chargement…</p>
      ) : rows.length === 0 ? (
        <Card title="Résultats QCM"><p className="hint" style={{ margin: 0 }}>Aucun QCM au référentiel. Créez-en dans Configuration → Modèles de QCM.</p></Card>
      ) : (
        <Card title={`QCM (${rows.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {rows.map((q) => {
              const on = q.id === sel;
              const note = q.kind === "GRADED";
              return (
                <button type="button" key={q.id} onClick={() => ouvrir(q.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", padding: "10px 12px", borderRadius: 10, cursor: "pointer", color: "var(--text)",
                    background: on ? "var(--surface2)" : "transparent", border: on ? "1px solid var(--ember1,#c0392b)" : "1px solid var(--border-soft)", opacity: q.active ? 1 : 0.55 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{q.title}</b>{!q.active && <span className="hint"> · inactif</span>}
                    <div className="hint" style={{ fontSize: 12 }}>{q.responses} réponse{q.responses > 1 ? "s" : ""}</div>
                  </span>
                  <Badge tone={note ? "b" : "n"}>{note ? "Noté" : "Enquête"}</Badge>
                  {note && (
                    <span style={{ flex: "none", minWidth: 86, textAlign: "right" }}>
                      {q.responses > 0 ? <><b>{q.avg_pct ?? "—"}%</b><span className="hint"> moy.</span></> : <span className="hint">—</span>}
                    </span>
                  )}
                  {note && (
                    <span style={{ flex: "none", minWidth: 104, textAlign: "right" }}>
                      {q.pass_rate != null ? <Badge tone={pctTone(q.pass_rate)}>{q.pass_rate}% réussite</Badge> : <span className="hint">—</span>}
                    </span>
                  )}
                  <Icon name="chevron-right" size={16} />
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {sel && (
        <Card title={detail ? detail.quiz.title : "Détail"}>
          {loadingDetail ? (
            <p className="hint">Chargement…</p>
          ) : !detail ? null : (
            <>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: detail.responses ? 16 : 0 }}>
                <Stat label="Réponses" value={detail.responses} />
                {detail.quiz.kind === "GRADED" && <Stat label="Score moyen" value={detail.responses ? `${detail.avg_pct ?? "—"}%` : "—"} />}
                {detail.quiz.kind === "GRADED" && detail.quiz.pass_score != null && (
                  <Stat label={`Réussite (≥ ${detail.quiz.pass_score} %)`} value={detail.pass_rate != null ? `${detail.pass_rate}%` : "—"} tone={pctTone(detail.pass_rate)} />
                )}
              </div>
              {detail.responses === 0 ? (
                <p className="hint" style={{ margin: 0 }}>Aucun stagiaire n'a encore répondu à ce QCM.</p>
              ) : (
                <>
                  <div className="tabs" role="tablist" style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border-soft)" }}>
                    <button type="button" role="tab" className={"tab" + (vue === "questions" ? " on" : "")} onClick={() => setVue("questions")}>Par question</button>
                    <button type="button" role="tab" className={"tab" + (vue === "stagiaires" ? " on" : "")} onClick={() => setVue("stagiaires")}>Par stagiaire ({detail.learners.length})</button>
                  </div>
                  {vue === "questions" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                      {detail.questions.map((q, i) => <DetailQuestion key={q.id} q={q} num={i + 1} />)}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                        <button type="button" className="btn sm" onClick={exporterStagiaires} title="Exporter la liste par stagiaire (CSV)">⬇ Exporter (CSV)</button>
                      </div>
                      <StagiairesTable learners={detail.learners} quiz={detail.quiz} isAdmin={isAdmin} onDelete={supprimerReponse} />
                    </>
                  )}
                </>
              )}
            </>
          )}
        </Card>
      )}
    </>
  );
}

export default ResultatsQCM;
