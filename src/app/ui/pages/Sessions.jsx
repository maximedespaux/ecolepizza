import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSessions, getFormations, createSession, getLocations, getEnrollments } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";
import { SelectField, Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { colorOf, initials } from "../lib/format.js";
import { MONTHS, DOW, monthMatrix, ymd, isWeekend, inRange, isToday, isoWeek } from "../lib/calendar.js";

function Sessions() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState("mois"); // mois | trimestre | semestre | annee
  const [sessions, setSessions] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [locations, setLocations] = useState([]);
  const [status, setStatus] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ program_id: "", start_date: ymd(now) });

  async function loadSessions() {
    try {
      const r = await getSessions();
      setSessions(r.data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  useEffect(() => {
    loadSessions();
    getFormations().then((r) => setPrograms(r.data)).catch(() => {});
    getLocations().then((r) => setLocations(r.data || [])).catch(() => {});
    getEnrollments().then((r) => setEnrollments(r.data)).catch(() => {});
  }, []);

  const frDate = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—");

  // Stagiaires inscrits regroupés par session (pour l'agenda).
  const studentsBySession = useMemo(() => {
    const map = {};
    for (const e of enrollments) (map[e.session_id] ||= []).push(e);
    return map;
  }, [enrollments]);

  // Prochaines sessions (à venir / en cours), triées par date de début.
  const upcoming = useMemo(() => {
    const today = ymd(new Date());
    return sessions
      .filter((s) => s.start_date && (s.end_date || s.start_date) >= today)
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  }, [sessions]);

  const weeks = useMemo(() => monthMatrix(year, month), [year, month]);

  // Attribue à chaque session une « voie » (ligne) stable : deux sessions qui se
  // chevauchent ont des voies différentes, mais une session garde la même voie sur
  // tous ses jours → les formations restent alignées sur la même ligne horizontale.
  const laneOf = useMemo(() => {
    const dur = (s) => (new Date(s.end_date || s.start_date) - new Date(s.start_date)) || 0;
    // Les formations les plus LONGUES d'abord : elles obtiennent les voies du haut,
    // les plus courtes se placent en dessous.
    const sorted = [...sessions]
      .filter((s) => s.start_date)
      .sort((a, b) => dur(b) - dur(a) || (a.start_date || "").localeCompare(b.start_date || ""));
    const laneEnds = []; // date de fin de la dernière session de chaque voie
    const map = {};
    for (const s of sorted) {
      const start = s.start_date, end = s.end_date || s.start_date;
      let placed = false;
      for (let i = 0; i < laneEnds.length; i++) {
        if (laneEnds[i] < start) { laneEnds[i] = end; map[s.id] = i; placed = true; break; }
      }
      if (!placed) { map[s.id] = laneEnds.length; laneEnds.push(end); }
    }
    return map;
  }, [sessions]);

  // Mois affichés selon la vue (mois / trimestre / semestre / année).
  const monthsToShow = useMemo(() => {
    if (view === "mois") return [{ y: year, m: month }];
    let start, count;
    if (view === "trimestre") { start = Math.floor(month / 3) * 3; count = 3; }
    else if (view === "semestre") { start = month < 6 ? 0 : 6; count = 6; }
    else { start = 0; count = 12; }
    return Array.from({ length: count }, (_, i) => ({ y: year, m: start + i }));
  }, [view, year, month]);

  const periodTitle = view === "mois" ? `${MONTHS[month]} ${year}`
    : view === "trimestre" ? `T${Math.floor(month / 3) + 1} · ${year}`
    : view === "semestre" ? `S${month < 6 ? 1 : 2} · ${year}`
    : `${year}`;

  function shift(dir) {
    const step = view === "trimestre" ? 3 : view === "semestre" ? 6 : view === "annee" ? 12 : 1;
    let m = month + dir * step, y = year;
    while (m < 0) { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }
    setYear(y); setMonth(m);
  }

  // Sessions actives un jour donné (hors week-end).
  function sessionsOn(dayStr) {
    return sessions.filter((s) => inRange(dayStr, s.start_date, s.end_date));
  }

  // Ouvre le modal d'ajout avec le jour cliqué pré-rempli (modifiable).
  function openAdd(dateStr) {
    setStatus(null);
    setAddForm({ program_id: "", start_date: dateStr || ymd(now) });
    setShowAdd(true);
  }

  async function handleAdd(e) {
    e.preventDefault();
    setStatus(null);
    if (!addForm.program_id || !addForm.start_date) {
      setStatus({ type: "error", message: "Choisissez une formation et son premier jour." });
      return;
    }
    try {
      await createSession(addForm);
      setAddForm({ program_id: "", start_date: ymd(now) });
      setShowAdd(false);
      setStatus({ type: "success", message: "Formation ajoutée au calendrier." });
      loadSessions();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Programmes réellement planifiés ce mois (pour la légende).
  const legend = useMemo(() => {
    const m = new Map();
    for (const s of sessions) {
      const cur = m.get(s.program_code) || { title: s.program_title, n: 0 };
      cur.n += 1; m.set(s.program_code, cur);
    }
    return [...m.entries()];
  }, [sessions]);

  return (
    <>
      <PageHead
        eyebrow="Planning"
        title="Sessions"
        lead="Calendrier des formations. Cliquez un jour libre pour ajouter une formation, ou une case occupée pour ouvrir la session. La durée colore les jours suivants."
        actions={
          <button className="btn primary" onClick={() => openAdd(ymd(now))}>
            <Icon name="plus" size={14} /> Ajouter une formation
          </button>
        }
      />
      <StatusMessage status={status} />

      {showAdd && (
        <div className="overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="mhead">
              <h3>Ajouter une formation</h3>
              <button className="x" onClick={() => setShowAdd(false)} aria-label="Fermer"><Icon name="x" size={16} /></button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="mbody">
                <p className="sub" style={{ marginTop: 0 }}>
                  Choisissez la formation — le premier jour est pré-rempli (modifiable). La durée colore les jours suivants.
                </p>
                <StatusMessage status={status} />
                <SelectField
                  label="Formation"
                  value={addForm.program_id}
                  onChange={(e) => setAddForm((f) => ({ ...f, program_id: e.target.value }))}
                  required
                >
                  <option value="">— Choisir —</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} — {p.title} ({p.days} j)</option>
                  ))}
                </SelectField>
                <Field
                  label="Premier jour"
                  type="date"
                  value={addForm.start_date}
                  onChange={(e) => setAddForm((f) => ({ ...f, start_date: e.target.value }))}
                  required
                />
                {locations.length > 0 && (
                  <SelectField
                    label="Lieu de formation"
                    value={addForm.location_id || ""}
                    onChange={(e) => setAddForm((f) => ({ ...f, location_id: e.target.value }))}
                  >
                    <option value="">— Aucun / à définir —</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}{l.town ? ` — ${l.town}` : ""}</option>
                    ))}
                  </SelectField>
                )}
              </div>
              <div className="mfoot">
                <button type="button" className="btn ghost" onClick={() => setShowAdd(false)}>Annuler</button>
                <button type="submit" className="btn primary"><Icon name="plus" size={14} /> Ajouter au calendrier</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Card>
        <div className="cal-toolbar">
          <button className="btn sm" onClick={() => shift(-1)} aria-label="Période précédente"><Icon name="chevron-left" size={16} /></button>
          <h2 className="cal-title" style={{ textTransform: "capitalize" }}>{periodTitle}</h2>
          <button className="btn sm" onClick={() => shift(1)} aria-label="Période suivante"><Icon name="chevron-right" size={16} /></button>
          <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
            {[["mois", "Mois"], ["trimestre", "Trimestre"], ["semestre", "Semestre"], ["annee", "Année"]].map(([v, l]) => (
              <button key={v} className={"btn sm " + (view === v ? "primary" : "ghost")} onClick={() => setView(v)}>{l}</button>
            ))}
          </div>
          <div className="spacer" />
          <button className="btn sm ghost" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>
            Aujourd'hui
          </button>
        </div>

        {view !== "mois" ? (
          <div className="cal-multi">
            {monthsToShow.map(({ y, m }) => (
              <MiniMonth key={`${y}-${m}`} y={y} m={m} sessionsOn={sessionsOn} onOpen={(id) => navigate(`/sessions/${id}`)} onAdd={openAdd} />
            ))}
          </div>
        ) : (
        <div className="cal-grid withweeks">
          <div className="cal-dow cal-wk-h">Sem.</div>
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {weeks.map((week, wi) => {
            // Nombre de voies à afficher pour cette semaine (max des voies utilisées).
            const weekLaneCount = week.reduce((mx, d) => {
              if (isWeekend(d)) return mx;
              return sessionsOn(ymd(d)).reduce((m, s) => Math.max(m, (laneOf[s.id] ?? 0) + 1), mx);
            }, 0);
            return (
            <Fragment key={wi}>
              <div className="cal-week" title={`Semaine ${isoWeek(week[0])}`}>{isoWeek(week[0])}</div>
              {week.map((day) => {
                const dayStr = ymd(day);
                const inMonth = day.getMonth() === month;
                const wknd = isWeekend(day);
                const daySessions = wknd ? [] : sessionsOn(dayStr);
                const byLane = {};
                for (const s of daySessions) byLane[laneOf[s.id] ?? 0] = s;
                const addable = inMonth && !wknd;
                return (
                  <div
                    key={dayStr}
                    className={`cal-cell${inMonth ? "" : " out"}${wknd ? " wknd" : ""}${isToday(day) ? " today" : ""}${addable ? " addable" : ""}`}
                    onClick={addable ? () => openAdd(dayStr) : undefined}
                    title={addable ? "Ajouter une formation ce jour" : undefined}
                  >
                    <div className="cal-daynum">{day.getDate()}</div>
                    {Array.from({ length: weekLaneCount }, (_, i) => {
                      const s = byLane[i];
                      if (!s) return <div key={i} className="cal-evt cal-evt-ghost" aria-hidden="true">&nbsp;</div>;
                      return (
                        <div
                          key={i}
                          className="cal-evt"
                          style={{ background: colorOf(s.program_code) }}
                          title={`${s.program_title} — ${s.stagiaires} stagiaire(s)`}
                          onClick={(e) => { e.stopPropagation(); navigate(`/sessions/${s.id}`); }}
                        >
                          {s.program_code}
                          <span className="n">{s.stagiaires}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </Fragment>
            );
          })}
        </div>
        )}

        {legend.length > 0 && (
          <div className="cal-legend">
            {legend.map(([code, { title, n }]) => (
              <span key={code} className="cal-legitem">
                <i style={{ background: colorOf(code) }} /> <b>{code}</b> {title} <span className="cal-legn">{n}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card title="Prochaines sessions" style={{ marginTop: 16 }} more={<span className="hint">{upcoming.length} à venir</span>}>
        {upcoming.length === 0 ? (
          <EmptyState icon="calendar">Aucune session à venir.</EmptyState>
        ) : (
          <div className="sess-list">
            {upcoming.map((s) => {
              const studs = studentsBySession[s.id] || [];
              const count = studs.length || s.stagiaires || 0;
              const col = colorOf(s.program_code);
              const open = () => navigate(`/sessions/${s.id}`);
              return (
                <div
                  key={s.id}
                  className="sess-item"
                  role="button"
                  tabIndex={0}
                  onClick={open}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
                >
                  <span className="sess-bar" style={{ background: col }} />
                  <div className="sess-main">
                    <div className="sess-top">
                      <span className="sess-code" style={{ color: col, background: `color-mix(in srgb, ${col} 14%, transparent)` }}>{s.program_code}</span>
                      <span className="sess-title">{s.program_title}</span>
                    </div>
                    <div className="sess-meta">
                      <span className="sess-metaitem"><Icon name="calendar" size={13} /> {frDate(s.start_date)} → {frDate(s.end_date)}</span>
                      <span className="sess-metaitem">S{s.week} · {s.year}</span>
                    </div>
                  </div>
                  <div className="sess-people">
                    <Avatars students={studs} />
                    <span className="sess-count" style={{ color: col }}><Icon name="users" size={13} /> {count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

// Palette d'avatars (initiales des stagiaires) — teintes de la charte.
const AV_COLORS = ["#2c3371", "#dc3e37", "#ff6900", "#2f9e6f", "#7b3f9e", "#0072b2", "#b8860b", "#c0392b"];
const avColor = (name) => AV_COLORS[[...(name || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length];

// Pile d'avatars (initiales) des stagiaires inscrits, avec « +N » au-delà de 6.
function Avatars({ students }) {
  if (students.length === 0) return <span className="sess-empty">Aucun inscrit</span>;
  const shown = students.slice(0, 6);
  const extra = students.length - shown.length;
  return (
    <div className="avatars">
      {shown.map((st) => (
        <span
          key={st.id}
          className="avatar-chip"
          title={`${st.first_name} ${st.last_name}`}
          style={{ background: avColor(`${st.first_name}${st.last_name}`) }}
        >
          {initials(st.first_name, st.last_name)}
        </span>
      ))}
      {extra > 0 && <span className="avatar-chip more" title={`${extra} autre(s)`}>+{extra}</span>}
    </div>
  );
}

// Mini-calendrier compact d'un mois (vues trimestre / semestre / année).
// Case occupée → clic n'importe où ouvre la session (le point précis reste
// cliquable si plusieurs) ; case libre → clic ajoute une formation ce jour.
function MiniMonth({ y, m, sessionsOn, onOpen, onAdd }) {
  const days = monthMatrix(y, m).flat();
  return (
    <div className="cal-mini">
      <div className="cal-mini-title">{MONTHS[m]} {y}</div>
      <div className="cal-mini-grid">
        {DOW.map((d) => <div key={d} className="cal-mini-dow">{d[0]}</div>)}
        {days.map((day) => {
          const dayStr = ymd(day);
          const inMonth = day.getMonth() === m;
          const weekend = isWeekend(day);
          const evts = weekend ? [] : sessionsOn(dayStr);
          const has = evts.length > 0;
          const addable = inMonth && !weekend && !has;
          return (
            <div
              key={dayStr}
              className={`cal-mini-cell${inMonth ? "" : " out"}${isToday(day) ? " today" : ""}${has ? " openable" : ""}${addable ? " addable" : ""}`}
              onClick={has ? () => onOpen(evts[0].id) : (addable ? () => onAdd(dayStr) : undefined)}
              title={has
                ? (evts.length > 1 ? `${evts.length} sessions — cliquez pour ouvrir (ou un point précis)` : "Cliquez pour ouvrir la session")
                : (addable ? "Ajouter une formation ce jour" : undefined)}
            >
              <span className="d">{day.getDate()}</span>
              {has && (
                <span className="dots">
                  {evts.slice(0, 4).map((s) => (
                    <i key={s.id} style={{ background: colorOf(s.program_code) }}
                      title={`${s.program_code} — ${s.program_title} · ${s.stagiaires} stag.`}
                      onClick={(e) => { e.stopPropagation(); onOpen(s.id); }} />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Sessions;
