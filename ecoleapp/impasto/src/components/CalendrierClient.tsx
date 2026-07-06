"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import SessionDrawer from "./calendrier/SessionDrawer";
import PipelineBoard from "./calendrier/PipelineBoard";
import {
  SessionRow, Program, colorOf, isoWeek, mondayOfISOWeek, iso, frDate,
  sessionRange, DOW, MONTHS,
} from "./calendrier/shared";

type View = "mois" | "semaine" | "pipeline";

export default function CalendrierClient() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("mois");
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [filterCode, setFilterCode] = useState("");
  const [createDate, setCreateDate] = useState<string | null>(null);
  const [pickProgram, setPickProgram] = useState("");
  const [saving, setSaving] = useState(false);
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        fetch("/api/sessions").then((r) => r.json()),
        fetch("/api/formations").then((r) => r.json()),
      ]);
      setSessions(s.data ?? []);
      setPrograms(p.data ?? []);
    } catch { toast("Impossible de charger le calendrier", "err"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(
    () => (filterCode ? sessions.filter((s) => s.program.code === filterCode) : sessions),
    [sessions, filterCode],
  );
  const sessionsOnDay = useCallback(
    (dISO: string) => shown.filter((s) => { const r = sessionRange(s); return dISO >= r.start && dISO <= r.end; }),
    [shown],
  );

  const y = cursor.getFullYear(), m = cursor.getMonth();
  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const usedCodes = useMemo(() => Array.from(new Set(sessions.map((s) => s.program.code))), [sessions]);
  const totalInscrits = useMemo(() => shown.reduce((n, s) => n + (s._count?.enrollments ?? 0), 0), [shown]);

  // Grille mois (42 cases)
  const monthCells = useMemo(() => {
    const firstDow = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
    const daysIn = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Array.from({ length: 42 }, (_, i) => {
      const dayNum = i - firstDow + 1;
      return { date: new Date(Date.UTC(y, m, dayNum)), inMonth: dayNum >= 1 && dayNum <= daysIn };
    });
  }, [y, m]);

  // Semaine ISO courante
  const wk = isoWeek(cursor);
  const monday = mondayOfISOWeek(wk.year, wk.week);
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setUTCDate(monday.getUTCDate() + i); return d; });

  const move = (n: number) => {
    const d = new Date(cursor);
    if (view === "semaine") d.setDate(d.getDate() + n * 7);
    else { d.setMonth(d.getMonth() + n); d.setDate(1); }
    setCursor(d);
  };
  const goToday = () => setCursor(view === "semaine" ? new Date() : (() => { const d = new Date(); d.setDate(1); return d; })());

  const openCreate = (dISO: string) => { setCreateDate(dISO); setPickProgram(""); };
  const createSession = async () => {
    if (!createDate || !pickProgram) { toast("Choisissez une date et une formation", "err"); return; }
    const { year, week } = isoWeek(new Date(createDate + "T00:00:00"));
    setSaving(true);
    const res = await fetch("/api/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId: pickProgram, annee: year, semaine: week }),
    });
    setSaving(false);
    if (res.ok) { setCreateDate(null); setPickProgram(""); toast("Session planifiée", "ok"); load(); }
    else { const j = await res.json().catch(() => ({})); toast(j.error ?? "Création impossible", "err"); }
  };

  const headLabel = view === "semaine"
    ? `Semaine ${wk.week} · ${frDate(iso(weekDays[0]))} → ${frDate(iso(weekDays[6]))}`
    : `${MONTHS[m]} ${y}`;

  return (
    <div className="fade">
      <div className="pagehead">
        <div>
          <div className="eyebrow">Secrétariat · Planning</div>
          <h1>Calendrier des formations</h1>
          <p className="lead">Planifiez les sessions, inscrivez les stagiaires et suivez chaque dossier. Cliquez un jour pour créer une session, une session pour la gérer.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="seg">
            <button className={view === "mois" ? "on" : ""} onClick={() => setView("mois")}>Mois</button>
            <button className={view === "semaine" ? "on" : ""} onClick={() => setView("semaine")}>Semaine</button>
            <button className={view === "pipeline" ? "on" : ""} onClick={() => setView("pipeline")}>Pipeline</button>
          </div>
          <button className="btn primary" onClick={() => openCreate(todayIso)}>+ Planifier</button>
        </div>
      </div>

      {view === "pipeline" ? (
        <PipelineBoard />
      ) : (
        <>
          <div className="cal-toolbar">
            <button className="iconbtn" onClick={() => move(-1)} aria-label="Précédent">‹</button>
            <button className="iconbtn" onClick={() => move(1)} aria-label="Suivant">›</button>
            <h2 className="cal-title">{headLabel}</h2>
            <button className="btn ghost sm" onClick={goToday}>Aujourd&apos;hui</button>
            <span style={{ flex: 1 }} />
            {usedCodes.length > 0 && (
              <select value={filterCode} onChange={(e) => setFilterCode(e.target.value)} style={{ width: "auto", maxWidth: 220 }}>
                <option value="">Toutes les formations</option>
                {usedCodes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <span className="badge n">{shown.length} session(s)</span>
            <span className="badge a">{totalInscrits} inscrit(s)</span>
          </div>

          {loading ? (
            <div className="cal-grid">
              {Array.from({ length: 14 }).map((_, i) => <div key={i} className="skel" style={{ height: 104, borderRadius: 12 }} />)}
            </div>
          ) : view === "mois" ? (
            <>
              <div className="cal-grid cal-dow-row">
                {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
              </div>
              <div className="cal-grid" style={{ marginTop: 6 }}>
                {monthCells.map((c, i) => {
                  const dISO = iso(c.date);
                  const evts = sessionsOnDay(dISO);
                  const isToday = dISO === todayIso;
                  return (
                    <div key={i} className={`cal-cell${c.inMonth ? "" : " out"}${isToday ? " today" : ""}`} onClick={() => openCreate(dISO)}>
                      <div className="cal-daynum" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>{c.date.getUTCDate()}</span>
                        {i % 7 === 0 && <span className="cal-wknum-inline">S{isoWeek(c.date).week}</span>}
                      </div>
                      {evts.map((s) => {
                        const r = sessionRange(s);
                        const isStart = r.start === dISO;
                        const isEnd = r.end === dISO;
                        const radius = s.program.jours <= 1 ? "7px" : isStart ? "7px 0 0 7px" : isEnd ? "0 7px 7px 0" : "0";
                        return (
                          <div key={s.id} className="cal-evt" title={s.program.titre}
                            style={{ background: colorOf(s.program.code), borderRadius: radius }}
                            onClick={(e) => { e.stopPropagation(); setOpenSessionId(s.id); }}>
                            {isStart ? s.program.code : " "}
                            {isStart && <span className="n">{s._count?.enrollments ?? 0}</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="cal-week">
              {weekDays.map((d, i) => {
                const dISO = iso(d);
                const evts = sessionsOnDay(dISO);
                const isToday = dISO === todayIso;
                return (
                  <div key={i} className={`cal-daycol${isToday ? " today" : ""}`} onClick={() => openCreate(dISO)}>
                    <div className="cal-daycol-head">{DOW[i]}<b>{d.getUTCDate()}</b></div>
                    <div className="cal-daycol-body">
                      {evts.map((s) => (
                        <div key={s.id} className="cal-wcard" style={{ borderLeftColor: colorOf(s.program.code) }}
                          onClick={(e) => { e.stopPropagation(); setOpenSessionId(s.id); }}>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>{s.program.code}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.program.titre}</div>
                          <span className="badge a" style={{ marginTop: 4 }}>{s._count?.enrollments ?? 0} inscrit(s)</span>
                        </div>
                      ))}
                      {evts.length === 0 && <div className="cal-wempty">+</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!loading && usedCodes.length > 0 && (
            <div className="cal-legend">
              {programs.filter((p) => usedCodes.includes(p.code)).map((p) => (
                <span key={p.code} className="cal-legitem">
                  <i style={{ background: colorOf(p.code) }} />{p.code}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modale création */}
      {createDate && (
        <div className="overlay" onClick={() => setCreateDate(null)}>
          <div className="modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3 style={{ fontFamily: "var(--font-d)", margin: 0 }}>Planifier une formation</h3>
              <button className="x" onClick={() => setCreateDate(null)}>×</button>
            </div>
            <div className="mbody">
              <div className="field"><label>Date de début</label>
                <input className="inp" type="date" value={createDate} onChange={(e) => setCreateDate(e.target.value)} />
                <div className="hint">La durée et la semaine ISO sont calculées automatiquement.</div>
              </div>
              <div className="field"><label>Formation</label>
                <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
                  {programs.map((p) => {
                    const on = pickProgram === p.id;
                    return (
                      <div key={p.id} onClick={() => setPickProgram(p.id)}
                        style={{ border: "1px solid " + (on ? "transparent" : "var(--border)"), background: on ? colorOf(p.code) : "var(--surface)", color: on ? "#fff" : "var(--text)", borderRadius: 10, padding: "9px 11px", cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ width: 12, height: 12, borderRadius: 4, background: colorOf(p.code), flex: "0 0 12px" }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{p.titre}</div>
                          <div style={{ fontSize: 11, opacity: 0.8 }}>{p.jours} jour(s)</div>
                        </div>
                      </div>
                    );
                  })}
                  {programs.length === 0 && <div className="empty">Aucune formation — ajoutez-en dans « Formations ».</div>}
                </div>
              </div>
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={() => setCreateDate(null)}>Annuler</button>
              <button className="btn primary" disabled={saving} onClick={createSession}>{saving ? "Création…" : "Créer la session"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Panneau latéral de gestion de session */}
      {openSessionId && (
        <SessionDrawer sessionId={openSessionId} onClose={() => setOpenSessionId(null)} onChanged={load} />
      )}
    </div>
  );
}
