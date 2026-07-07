"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import ProfilDrawer from "./ProfilDrawer";
import {
  PIPELINE_COLUMNS, columnFor, colorOf, learnerName, initials, frDate, sessionRange,
  LearnerLite, FINANCEMENT_LABEL,
} from "./shared";

interface PipeItem {
  id: string;
  crmStage: string;
  financement: string;
  devisSigne: boolean;
  acompteRecu: boolean;
  learner: LearnerLite;
  session: { annee: number; semaine: number; dateDebut: string | null; dateFin: string | null; program: { code: string; titre: string; jours: number } };
}

export default function PipelineBoard() {
  const [items, setItems] = useState<PipeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null); // profil ouvert
  const didDrag = useRef(false);
  const [overCol, setOverCol] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/enrollments");
      const j = await r.json();
      setItems(j.data ?? []);
    } catch { toast("Chargement du pipeline impossible", "err"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const moveTo = async (id: string, stage: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || columnFor(item.crmStage) === stage) return;
    const prev = item.crmStage;
    // Optimiste : place la carte + reflète les jalons atteints.
    setItems((arr) => arr.map((i) => (i.id === id ? {
      ...i, crmStage: stage,
      devisSigne: i.devisSigne || stage === "DEVIS_SIGNE" || stage === "ACOMPTE_PAYE",
      acompteRecu: i.acompteRecu || stage === "ACOMPTE_PAYE",
    } : i)));
    const res = await fetch(`/api/enrollments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crmStage: stage }),
    });
    if (!res.ok) {
      setItems((arr) => arr.map((i) => (i.id === id ? { ...i, crmStage: prev } : i))); // rollback
      const j = await res.json().catch(() => ({}));
      toast(j.error || "Déplacement impossible", "err");
    } else {
      const j = await res.json().catch(() => ({}));
      if (j.data) setItems((arr) => arr.map((i) => (i.id === id ? { ...i, ...j.data } : i)));
    }
  };

  if (loading) {
    return (
      <div className="kanban">
        {PIPELINE_COLUMNS.slice(0, 6).map((s) => (
          <div key={s.stage} className="kcol">
            <div className="skel" style={{ height: 22, marginBottom: 8 }} />
            <div className="skel" style={{ height: 64, marginBottom: 8 }} />
            <div className="skel" style={{ height: 64 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="kanban">
      {PIPELINE_COLUMNS.map((col) => {
        const cards = items.filter((i) => columnFor(i.crmStage) === col.stage);
        return (
          <div
            key={col.stage}
            className={`kcol${overCol === col.stage ? " drop" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.stage); }}
            onDragLeave={() => setOverCol((c) => (c === col.stage ? null : c))}
            onDrop={(e) => { e.preventDefault(); setOverCol(null); if (dragId) moveTo(dragId, col.stage); }}
          >
            <div className="kcol-head">
              <span className={`badge ${col.badge}`}>{col.label}</span>
              <span className="kcount">{cards.length}</span>
            </div>
            {cards.map((c) => {
              const beforeInscrit = ["CONTACTE", "DEVIS_ENVOYE", "DEVIS_SIGNE", "ACOMPTE_PAYE"].includes(col.stage);
              return (
                <div
                  key={c.id}
                  className={`kcard${dragId === c.id ? " drag" : ""}`}
                  style={{ cursor: "pointer" }}
                  draggable
                  onDragStart={(e) => { setDragId(c.id); didDrag.current = true; e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragId(null); setOverCol(null); setTimeout(() => { didDrag.current = false; }, 50); }}
                  onClick={() => { if (!didDrag.current) setOpenId(c.id); }}
                  title="Ouvrir le profil"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span className="avatar" style={{ width: 30, height: 30, fontSize: 11, flex: "0 0 30px" }}>{initials(c.learner)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{learnerName(c.learner)}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{FINANCEMENT_LABEL[c.financement] ?? c.financement}</div>
                    </div>
                  </div>
                  <div className="kmeta">
                    <span className="fchip" style={{ background: colorOf(c.session.program.code) }}>{c.session.program.code}</span>
                    <span className="hint">Sem. {c.session.semaine} · {frDate(sessionRange(c.session).start)}</span>
                  </div>
                  {/* Jalons devis / acompte (visibilité de ce qui bloque l'inscription) */}
                  {beforeInscrit && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <Milestone ok={c.devisSigne} label="Devis" />
                      <Milestone ok={c.acompteRecu} label="Acompte" />
                    </div>
                  )}
                </div>
              );
            })}
            {cards.length === 0 && <div className="kempty">Glissez ici</div>}
          </div>
        );
      })}
      {openId && <ProfilDrawer enrollmentId={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  );
}

function Milestone({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`badge ${ok ? "g" : "n"}`}
      style={{ fontSize: 10, padding: "1px 7px", opacity: ok ? 1 : 0.7 }}
      title={ok ? `${label} : validé` : `${label} : en attente`}
    >
      {ok ? "✓" : "○"} {label}
    </span>
  );
}
