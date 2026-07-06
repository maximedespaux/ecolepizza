"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import {
  CRM_STAGES, colorOf, learnerName, initials, frDate, sessionRange,
  LearnerLite, FINANCEMENT_LABEL,
} from "./shared";

interface PipeItem {
  id: string;
  crmStage: string;
  financement: string;
  learner: LearnerLite;
  session: { annee: number; semaine: number; dateDebut: string | null; dateFin: string | null; program: { code: string; titre: string; jours: number } };
}

export default function PipelineBoard() {
  const [items, setItems] = useState<PipeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
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
    if (!item || item.crmStage === stage) return;
    const prev = item.crmStage;
    setItems((arr) => arr.map((i) => (i.id === id ? { ...i, crmStage: stage } : i))); // optimiste
    const res = await fetch(`/api/enrollments/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ crmStage: stage }),
    });
    if (!res.ok) {
      setItems((arr) => arr.map((i) => (i.id === id ? { ...i, crmStage: prev } : i))); // rollback
      toast("Déplacement impossible", "err");
    }
  };

  if (loading) {
    return (
      <div className="kanban">
        {CRM_STAGES.slice(0, 6).map((s) => (
          <div key={s.value} className="kcol">
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
      {CRM_STAGES.map((stage) => {
        const cards = items.filter((i) => i.crmStage === stage.value);
        return (
          <div
            key={stage.value}
            className={`kcol${overCol === stage.value ? " drop" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOverCol(stage.value); }}
            onDragLeave={() => setOverCol((c) => (c === stage.value ? null : c))}
            onDrop={(e) => { e.preventDefault(); setOverCol(null); if (dragId) moveTo(dragId, stage.value); }}
          >
            <div className="kcol-head">
              <span className={`badge ${stage.badge}`}>{stage.label}</span>
              <span className="kcount">{cards.length}</span>
            </div>
            {cards.map((c) => (
              <div
                key={c.id}
                className={`kcard${dragId === c.id ? " drag" : ""}`}
                draggable
                onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragEnd={() => { setDragId(null); setOverCol(null); }}
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
              </div>
            ))}
            {cards.length === 0 && <div className="kempty">Glissez ici</div>}
          </div>
        );
      })}
    </div>
  );
}
