"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import {
  SessionDetail, LearnerLite, colorOf, frDate, sessionRange, learnerName, initials,
  STATUS_LABEL, STATUS_BADGE, SESSION_STATUSES, FINANCEMENT_LABEL, CRM_LABEL,
} from "./shared";

export default function SessionDrawer({
  sessionId, onClose, onChanged,
}: {
  sessionId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LearnerLite[]>([]);
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/sessions/${sessionId}`);
      const j = await r.json();
      setDetail(j.data ?? null);
    } catch { toast("Chargement de la session impossible", "err"); }
    setLoading(false);
  }, [sessionId]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  // Recherche de stagiaires à inscrire (exclut ceux déjà inscrits).
  useEffect(() => {
    if (!addOpen) return;
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`/api/stagiaires?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (!cancel) setResults(j.data ?? []);
      } catch { /* silencieux */ }
    })();
    return () => { cancel = true; };
  }, [q, addOpen]);

  const enrolledIds = new Set(detail?.enrollments.map((e) => e.learnerId) ?? []);
  const candidates = results.filter((l) => !enrolledIds.has(l.id)).slice(0, 8);

  const enroll = async (learnerId: string) => {
    if (!detail) return;
    setBusy(true);
    const res = await fetch("/api/enrollments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ learnerId, sessionId: detail.id }),
    });
    setBusy(false);
    if (res.ok) { toast("Stagiaire inscrit", "ok"); setQ(""); await loadDetail(); onChanged(); }
    else { const j = await res.json().catch(() => ({})); toast(j.error ?? "Inscription impossible", "err"); }
  };

  const removeEnrollment = async (id: string, name: string) => {
    if (!confirm(`Retirer ${name} de cette session ?`)) return;
    const res = await fetch(`/api/enrollments/${id}`, { method: "DELETE" });
    if (res.ok) { toast("Inscription retirée", "ok"); await loadDetail(); onChanged(); }
    else { const j = await res.json().catch(() => ({})); toast(j.error ?? "Retrait impossible", "err"); }
  };

  const changeStatus = async (status: string) => {
    if (!detail) return;
    const res = await fetch(`/api/sessions/${detail.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) { setDetail({ ...detail, status }); toast("Statut mis à jour", "ok"); onChanged(); }
    else toast("Mise à jour impossible", "err");
  };

  // Déplacer la session (semaine / année → dates recalculées côté serveur).
  const [move, setMove] = useState({ annee: "", semaine: "" });
  useEffect(() => { if (detail) setMove({ annee: String(detail.annee), semaine: String(detail.semaine) }); }, [detail?.id]);
  const moveSession = async () => {
    if (!detail) return;
    const annee = Number(move.annee), semaine = Number(move.semaine);
    if (!annee || semaine < 1 || semaine > 53) { toast("Semaine (1–53) et année requises", "err"); return; }
    if (annee === detail.annee && semaine === detail.semaine) return;
    setBusy(true);
    const res = await fetch(`/api/sessions/${detail.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ annee, semaine }),
    });
    setBusy(false);
    if (res.ok) { toast("Session déplacée", "ok"); await loadDetail(); onChanged(); }
    else { const j = await res.json().catch(() => ({})); toast(j.error ?? "Déplacement impossible", "err"); }
  };

  const deleteSession = async () => {
    if (!detail) return;
    if (!confirm(`Supprimer la session « ${detail.program.titre} » (Sem. ${detail.semaine}/${detail.annee}) ?`)) return;
    const res = await fetch(`/api/sessions/${detail.id}`, { method: "DELETE" });
    if (res.ok) { toast("Session supprimée", "ok"); onChanged(); onClose(); }
    else { const j = await res.json().catch(() => ({})); toast(j.error ?? "Suppression impossible", "err"); }
  };

  const count = detail?.enrollments.length ?? 0;

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true">
        {loading || !detail ? (
          <div className="dbody">
            <div className="skel" style={{ height: 60, marginBottom: 12 }} />
            <div className="skel" style={{ height: 40, marginBottom: 8 }} />
            <div className="skel" style={{ height: 40 }} />
          </div>
        ) : (
          <>
            <div className="dhead">
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: 1 }}>
                <span className="fmark" style={{ background: colorOf(detail.program.code) }}>{detail.program.code}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontFamily: "var(--font-d)", margin: 0, fontSize: 17 }}>{detail.program.titre}</h3>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
                    {frDate(sessionRange(detail).start)} → {frDate(sessionRange(detail).end)} · Sem. {detail.semaine}/{detail.annee} · {detail.program.jours} j
                  </div>
                </div>
              </div>
              <button className="x" onClick={onClose} aria-label="Fermer">×</button>
            </div>

            <div className="dbody">
              <div className="field">
                <label>Statut de la session</label>
                <select value={detail.status} onChange={(e) => changeStatus(e.target.value)}>
                  {SESSION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>

              {/* Déplacer la session (les dates se recalculent depuis la semaine ISO) */}
              <div className="field">
                <label>Déplacer la session <span className="hint">semaine / année</span></label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input className="inp" style={{ width: 90 }} inputMode="numeric" aria-label="Semaine"
                    value={move.semaine} onChange={(e) => setMove((m) => ({ ...m, semaine: e.target.value }))} placeholder="Sem." />
                  <input className="inp" style={{ width: 100 }} inputMode="numeric" aria-label="Année"
                    value={move.annee} onChange={(e) => setMove((m) => ({ ...m, annee: e.target.value }))} placeholder="Année" />
                  <button className="btn sm" disabled={busy} onClick={moveSession}>Déplacer</button>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 10px" }}>
                <h4 style={{ margin: 0, fontFamily: "var(--font-d)", fontSize: 15 }}>
                  Stagiaires inscrits <span className="badge n" style={{ marginLeft: 6 }}>{count}</span>
                </h4>
                <button className="btn sm primary" onClick={() => { setAddOpen((v) => !v); setQ(""); }}>
                  {addOpen ? "Fermer" : "+ Inscrire"}
                </button>
              </div>

              {addOpen && (
                <div className="addbox">
                  <input className="inp" autoFocus placeholder="Rechercher un stagiaire (nom, ville)…"
                    value={q} onChange={(e) => setQ(e.target.value)} />
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                    {candidates.map((l) => (
                      <button key={l.id} className="cand" disabled={busy} onClick={() => enroll(l.id)}>
                        <span className="avatar" style={{ width: 28, height: 28, fontSize: 11, flex: "0 0 28px" }}>{initials(l)}</span>
                        <span style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{learnerName(l)}</span>
                          <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>
                            {l.company?.raisonSociale || l.ville || l.email || "—"}
                          </span>
                        </span>
                        <span style={{ color: "var(--ember1)", fontWeight: 700, fontSize: 18 }}>+</span>
                      </button>
                    ))}
                    {candidates.length === 0 && <div className="hint" style={{ padding: "6px 2px" }}>Aucun stagiaire disponible. Ajoutez-en dans « Stagiaires ».</div>}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                {detail.enrollments.map((e) => (
                  <div key={e.id} className="enr-row">
                    <span className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{initials(e.learner)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{learnerName(e.learner)}</div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                        {FINANCEMENT_LABEL[e.financement] ?? e.financement} · {CRM_LABEL[e.crmStage] ?? e.crmStage}
                      </div>
                    </div>
                    <button className="iconbtn del" title="Retirer" onClick={() => removeEnrollment(e.id, learnerName(e.learner))}>×</button>
                  </div>
                ))}
                {count === 0 && !addOpen && (
                  <div className="empty" style={{ padding: "28px 12px" }}>
                    <div className="big">🧑‍🍳</div>
                    Aucun stagiaire inscrit.<br />Cliquez « + Inscrire ».
                  </div>
                )}
              </div>
            </div>

            <div className="dfoot">
              <button className="btn ghost danger" onClick={deleteSession} title={count > 0 ? "Retirez les stagiaires d'abord" : "Supprimer la session"}>Supprimer</button>
              <span style={{ flex: 1 }} />
              <a className="btn ghost" href="/documents">Documents</a>
              <button className="btn primary" onClick={onClose}>Terminé</button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
