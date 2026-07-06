"use client";
import { useEffect, useState, useCallback } from "react";
import { toast } from "@/lib/toast";

interface Program { id: string; code: string; titre: string; jours: number; }
interface SessionRow {
  id: string; annee: number; semaine: number;
  dateDebut: string | null; dateFin: string | null; status: string;
  program: Program; _count?: { enrollments: number };
}

const STATUS_LABEL: Record<string, string> = {
  PLANIFIEE: "Planifiée", CONFIRMEE: "Confirmée", EN_COURS: "En cours",
  TERMINEE: "Terminée", ANNULEE: "Annulée",
};
const COLORS: Record<string, string> = {
  NIV1: "#C1272D", NIV1H: "#E0512B", NIV1PRO: "#D98A1F", NIV2: "#B4552E",
  NIV2C: "#8E5A2D", EXPERT: "#5B7C99", NAPO: "#3E7C5A", TEGLIA: "#7A5C99", RS7404: "#16243D",
};
const colorOf = (code: string) => COLORS[code] ?? "#6E6453";
const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const frDate = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join("/") : "—");

export default function CalendrierClient() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [newDate, setNewDate] = useState<string | null>(null);
  const [pickProgram, setPickProgram] = useState<string>("");
  const [detail, setDetail] = useState<SessionRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        fetch("/api/sessions").then((r) => r.json()),
        fetch("/api/formations").then((r) => r.json()),
      ]);
      setSessions(s.data ?? []);
      setPrograms(p.data ?? []);
    } catch { toast("Impossible de charger le calendrier"); }
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const y = cursor.getFullYear(), m = cursor.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
  const daysIn = new Date(y, m + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDow + 1;
    return { date: new Date(y, m, dayNum), inMonth: dayNum >= 1 && dayNum <= daysIn };
  });
  const todayIso = iso(new Date());

  const sessionsOnDay = (dISO: string) =>
    sessions.filter((s) => s.dateDebut && s.dateFin && dISO >= s.dateDebut.slice(0, 10) && dISO <= s.dateFin.slice(0, 10));

  const move = (n: number) => { const d = new Date(cursor); d.setMonth(d.getMonth() + n); d.setDate(1); setCursor(d); };
  const goToday = () => { const d = new Date(); d.setDate(1); setCursor(d); };

  const createSession = async () => {
    if (!newDate || !pickProgram) { toast("Choisissez une date et une formation"); return; }
    const { year, week } = isoWeek(new Date(newDate + "T00:00:00"));
    setSaving(true);
    const res = await fetch("/api/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId: pickProgram, annee: year, semaine: week }),
    });
    setSaving(false);
    if (res.ok) { setNewDate(null); setPickProgram(""); toast("Session planifiée"); load(); }
    else { const j = await res.json().catch(() => ({})); toast(j.error ?? "Création impossible"); }
  };

  return (
    <div className="fade">
      <div className="pagehead">
        <div>
          <div className="eyebrow">Secrétariat · Planning</div>
          <h1>Calendrier des formations</h1>
          <p className="lead">Planifiez les sessions et suivez les inscriptions. Cliquez un jour pour créer une session, une session pour la gérer.</p>
        </div>
        <button className="btn primary" onClick={() => { setNewDate(todayIso); setPickProgram(""); }}>+ Planifier</button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "6px 0 16px" }}>
        <button className="iconbtn" onClick={() => move(-1)} aria-label="Mois précédent">‹</button>
        <button className="iconbtn" onClick={() => move(1)} aria-label="Mois suivant">›</button>
        <h2 style={{ fontFamily: "var(--font-d)", fontSize: 22, textTransform: "capitalize", margin: 0 }}>{MONTHS[m]} {y}</h2>
        <button className="btn ghost" onClick={goToday}>Aujourd&apos;hui</button>
        <span style={{ flex: 1 }} />
        <span className="badge">{sessions.length} session(s)</span>
      </div>

      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8 }}>
          {Array.from({ length: 21 }).map((_, i) => <div key={i} className="skel" style={{ height: 96, borderRadius: 12 }} />)}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8 }}>
            {DOW.map((d) => <div key={d} style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".05em", textAlign: "center", padding: "4px 0" }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8, marginTop: 6 }}>
            {cells.map((c, i) => {
              const dISO = iso(c.date);
              const evts = sessionsOnDay(dISO);
              return (
                <div key={i} onClick={() => { setNewDate(dISO); setPickProgram(""); }}
                  style={{
                    minHeight: 104, background: c.inMonth ? "var(--surface)" : "var(--surface2)", opacity: c.inMonth ? 1 : 0.55,
                    border: "1px solid " + (dISO === todayIso ? "var(--ember1)" : "var(--border)"),
                    boxShadow: dISO === todayIso ? "0 0 0 2px rgba(193,39,45,.12)" : "none",
                    borderRadius: 12, padding: "7px 8px", display: "flex", flexDirection: "column", gap: 4, cursor: "pointer",
                  }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: dISO === todayIso ? "var(--ember1)" : "var(--muted)" }}>{c.date.getDate()}</div>
                  {evts.map((s) => {
                    const isStart = s.dateDebut ? s.dateDebut.slice(0, 10) === dISO : false;
                    const isEnd = s.dateFin ? s.dateFin.slice(0, 10) === dISO : false;
                    const radius: string | number = s.program.jours <= 1 ? 7 : isStart ? "7px 0 0 7px" : isEnd ? "0 7px 7px 0" : 0;
                    return (
                      <div key={s.id} onClick={(e) => { e.stopPropagation(); setDetail(s); }} title={s.program.titre}
                        style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: colorOf(s.program.code), borderRadius: radius, padding: "3px 7px", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 5 }}>
                        {isStart ? s.program.code : "\u00A0"}
                        {isStart && <span style={{ marginLeft: "auto", background: "rgba(255,255,255,.25)", borderRadius: 99, padding: "0 6px", fontSize: 10 }}>{s._count?.enrollments ?? 0}</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
            {programs.filter((p) => sessions.some((s) => s.program.code === p.code)).map((p) => (
              <span key={p.code} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
                <i style={{ width: 12, height: 12, borderRadius: 4, background: colorOf(p.code), display: "inline-block" }} />{p.code}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Modale création */}
      {newDate && (
        <div className="overlay" onClick={() => setNewDate(null)}>
          <div className="modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3 style={{ fontFamily: "var(--font-d)", margin: 0 }}>Planifier une formation</h3>
              <button className="x" onClick={() => setNewDate(null)}>×</button>
            </div>
            <div className="mbody">
              <div className="field"><label>Date de début</label>
                <input className="inp" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                <div className="hint">La durée et la semaine ISO sont calculées automatiquement.</div>
              </div>
              <div className="field"><label>Formation</label>
                <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
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
              <button className="btn ghost" onClick={() => setNewDate(null)}>Annuler</button>
              <button className="btn primary" disabled={saving} onClick={createSession}>{saving ? "Création…" : "Créer la session"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Détail session */}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal" style={{ maxWidth: 460 }} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="mhead" style={{ alignItems: "flex-start" }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start", flex: 1 }}>
                <div style={{ width: 42, height: 42, borderRadius: 11, background: colorOf(detail.program.code), flex: "0 0 42px" }} />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontFamily: "var(--font-d)", margin: 0, fontSize: 17 }}>{detail.program.titre}</h3>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
                    {frDate(detail.dateDebut)} → {frDate(detail.dateFin)} · Semaine {detail.semaine}/{detail.annee}
                  </div>
                </div>
              </div>
              <button className="x" onClick={() => setDetail(null)}>×</button>
            </div>
            <div className="mbody">
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <span className="badge">{STATUS_LABEL[detail.status] ?? detail.status}</span>
                <span className="badge">{detail._count?.enrollments ?? 0} inscrit(s)</span>
                <span className="badge">{detail.program.jours} jour(s)</span>
              </div>
              <p className="lead" style={{ margin: 0 }}>Gérez les inscriptions de cette session (stagiaires, financement, documents) depuis la page dédiée.</p>
            </div>
            <div className="mfoot">
              <button className="btn ghost" onClick={() => setDetail(null)}>Fermer</button>
              <a className="btn primary" href="/sessions">Gérer les inscriptions</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
