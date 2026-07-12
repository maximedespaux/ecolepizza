import { useContext, useEffect, useMemo, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getMyFormations } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
import { initials } from "../lib/format.js";
import { AVATARS, getAvatar, setAvatar, GRADES, gradeFor, readGameStats, scoreOf } from "../lib/gamification.js";

/**
 * Profil stagiaire : avatar (picker pizza), infos, XP et grade débloqué selon la
 * progression (XP du jeu + formations terminées). Prépare l'espace communauté.
 */
export default function ProfileModal({ onClose }) {
  const { user } = useContext(UserContext);
  const uid = user?.id;
  const [avatar, setAv] = useState(() => getAvatar(uid));
  const [formations, setFormations] = useState([]);

  useEffect(() => { getMyFormations().then((r) => setFormations(r.data || [])).catch(() => {}); }, []);

  const { xp, stars } = useMemo(() => readGameStats(), []);
  const done = formations.filter((f) => f.enrolled && f.complete).length;
  const enrolled = formations.filter((f) => f.enrolled).length;
  const score = scoreOf({ xp, formationsDone: done });
  const { grade, next } = gradeFor(score);
  const pct = next ? Math.min(100, Math.round(((score - grade.min) / (next.min - grade.min)) * 100)) : 100;

  function choose(a) { setAvatar(uid, a.id); setAv(a); }
  const who = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email || "Stagiaire";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Mon profil</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          {/* Identité + avatar courant */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <span className="pf-avatar" style={{ background: avatar ? avatar.color : "var(--navy)" }}>
              {avatar ? avatar.emoji : initials(user?.first_name, user?.last_name)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{who}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{user?.email}</div>
              <div style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, marginTop: 2 }}>{grade.emoji} {grade.name}</div>
            </div>
          </div>

          {/* Grade + progression */}
          <div className="pf-grade">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <b style={{ fontSize: 14 }}>{grade.emoji} {grade.name}</b>
              <span className="hint">{next ? `${score} / ${next.min} pts` : `${score} pts · grade max 👑`}</span>
            </div>
            <div className="pq-progress" style={{ height: 12 }}><span style={{ width: `${pct}%`, background: "var(--gold)" }} /></div>
            {next && <div className="hint" style={{ marginTop: 5 }}>Encore <b>{next.min - score} pts</b> pour <b>{next.emoji} {next.name}</b></div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <span className="pf-chip"><Icon name="target" size={13} /> {xp} XP</span>
              <span className="pf-chip">⭐ {stars} étoiles</span>
              <span className="pf-chip"><Icon name="graduation" size={13} /> {done}/{enrolled} formation(s) terminée(s)</span>
            </div>
          </div>

          {/* Ladder des grades */}
          <div className="pf-ladder">
            {GRADES.map((g) => {
              const reached = score >= g.min;
              return (
                <div key={g.name} className={"pf-rank" + (g.name === grade.name ? " on" : "")} title={`${g.name} · ${g.min} pts`}>
                  <span style={{ fontSize: 18, opacity: reached ? 1 : 0.35 }}>{g.emoji}</span>
                  <span style={{ fontSize: 10, color: reached ? "var(--text)" : "var(--dim)" }}>{g.name.split(" ")[0]}</span>
                </div>
              );
            })}
          </div>

          {/* Avatar picker */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Choisis ton avatar</span>
              <button className="btn sm ghost" onClick={() => choose(AVATARS[Math.floor(Math.random() * AVATARS.length)])} title="Avatar au hasard">🎲 Surprise</button>
            </div>
            <div className="pf-picker">
              {AVATARS.map((a) => (
                <button key={a.id} className={"pf-opt" + (avatar?.id === a.id ? " sel" : "")}
                  style={{ background: a.color }} onClick={() => choose(a)} title={a.id} aria-label={`Avatar ${a.id}`}>
                  {a.emoji}
                  {avatar?.id === a.id && <span className="pf-check"><Icon name="check" size={12} /></span>}
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 8 }}>Bientôt : espace communauté — ton avatar et ton grade seront visibles par les autres stagiaires.</p>
          </div>
        </div>
        <div className="mfoot">
          <button className="btn primary" onClick={onClose}>Terminé</button>
        </div>
      </div>
    </div>
  );
}
