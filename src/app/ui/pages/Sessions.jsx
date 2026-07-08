import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSessions, getFormations, createSession } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { SelectField, Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import { colorOf } from "../lib/format.js";
import { MONTHS, DOW, monthMatrix, ymd, isWeekend, inRange, isToday, isoWeek } from "../lib/calendar.js";

function Sessions() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState("mois"); // mois | trimestre | semestre | annee
  const [sessions, setSessions] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [status, setStatus] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ program_id: "", start_date: "" });

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
  }, []);

  const weeks = useMemo(() => monthMatrix(year, month), [year, month]);

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

  async function handleAdd(e) {
    e.preventDefault();
    setStatus(null);
    if (!addForm.program_id || !addForm.start_date) {
      setStatus({ type: "error", message: "Choisissez une formation et son premier jour." });
      return;
    }
    try {
      await createSession(addForm);
      setAddForm({ program_id: "", start_date: "" });
      setShowAdd(false);
      setStatus({ type: "success", message: "Formation ajoutée au calendrier." });
      loadSessions();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Programmes réellement planifiés ce mois (pour la légende).
  const legend = useMemo(() => {
    const seen = new Map();
    for (const s of sessions) seen.set(s.program_code, s.program_title);
    return [...seen.entries()];
  }, [sessions]);

  return (
    <>
      <PageHead
        eyebrow="Planning"
        title="Sessions"
        lead="Calendrier des formations. Ajoutez une formation en choisissant son premier jour ; la durée colore les jours suivants."
        actions={
          <button className="btn primary" onClick={() => setShowAdd((v) => !v)}>
            {showAdd ? "✕ Fermer" : "＋ Ajouter une formation"}
          </button>
        }
      />
      <StatusMessage status={status} />

      {showAdd && (
        <Card title="Ajouter une formation" className="fade" more={<button className="btn sm ghost" onClick={() => setShowAdd(false)}>✕</button>}>
          <form onSubmit={handleAdd}>
            <div className="row2">
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
            </div>
            <button type="submit" className="btn primary">Ajouter au calendrier</button>
          </form>
        </Card>
      )}

      <Card>
        <div className="cal-toolbar">
          <button className="btn sm" onClick={() => shift(-1)}>←</button>
          <h2 className="cal-title" style={{ textTransform: "capitalize" }}>{periodTitle}</h2>
          <button className="btn sm" onClick={() => shift(1)}>→</button>
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
              <MiniMonth key={`${y}-${m}`} y={y} m={m} sessionsOn={sessionsOn} onOpen={(id) => navigate(`/sessions/${id}`)} />
            ))}
          </div>
        ) : (
        <div className="cal-grid withweeks">
          <div className="cal-dow cal-wk-h">Sem.</div>
          {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
          {weeks.map((week, wi) => (
            <Fragment key={wi}>
              <div className="cal-week" title={`Semaine ${isoWeek(week[0])}`}>{isoWeek(week[0])}</div>
              {week.map((day) => {
                const dayStr = ymd(day);
                const inMonth = day.getMonth() === month;
                const wknd = isWeekend(day);
                const daySessions = wknd ? [] : sessionsOn(dayStr);
                return (
                  <div
                    key={dayStr}
                    className={`cal-cell${inMonth ? "" : " out"}${wknd ? " wknd" : ""}${isToday(day) ? " today" : ""}`}
                  >
                    <div className="cal-daynum">{day.getDate()}</div>
                    {daySessions.map((s) => (
                      <div
                        key={s.id}
                        className="cal-evt"
                        style={{ background: colorOf(s.program_code) }}
                        title={`${s.program_title} — ${s.stagiaires} stagiaire(s)`}
                        onClick={() => navigate(`/sessions/${s.id}`)}
                      >
                        {s.program_code}
                        <span className="n">{s.stagiaires}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        )}

        {legend.length > 0 && (
          <div className="cal-legend">
            {legend.map(([code, title]) => (
              <span key={code} className="cal-legitem">
                <i style={{ background: colorOf(code) }} /> {code} — {title}
              </span>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// Mini-calendrier compact d'un mois (vues trimestre / semestre / année).
function MiniMonth({ y, m, sessionsOn, onOpen }) {
  const days = monthMatrix(y, m).flat();
  return (
    <div className="cal-mini">
      <div className="cal-mini-title">{MONTHS[m]} {y}</div>
      <div className="cal-mini-grid">
        {DOW.map((d) => <div key={d} className="cal-mini-dow">{d[0]}</div>)}
        {days.map((day) => {
          const dayStr = ymd(day);
          const inMonth = day.getMonth() === m;
          const evts = isWeekend(day) ? [] : sessionsOn(dayStr);
          return (
            <div key={dayStr} className={`cal-mini-cell${inMonth ? "" : " out"}${isToday(day) ? " today" : ""}`}>
              <span className="d">{day.getDate()}</span>
              {evts.length > 0 && (
                <span className="dots">
                  {evts.slice(0, 4).map((s) => (
                    <i key={s.id} style={{ background: colorOf(s.program_code) }}
                      title={`${s.program_code} — ${s.program_title} · ${s.stagiaires} stag.`}
                      onClick={() => onOpen(s.id)} />
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
