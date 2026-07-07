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

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); } else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); } else setMonth((m) => m + 1);
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
          <button className="btn sm" onClick={prevMonth}>←</button>
          <h2 className="cal-title">{MONTHS[month]} {year}</h2>
          <button className="btn sm" onClick={nextMonth}>→</button>
          <div className="spacer" />
          <button className="btn sm ghost" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}>
            Aujourd'hui
          </button>
        </div>

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
                        <span className="n">👤 {s.stagiaires}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>

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

export default Sessions;
