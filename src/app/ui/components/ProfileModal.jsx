import { useContext, useEffect, useMemo, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getMyFormations, getMyInfos, updateMyInfos, changeMyEmail, changeMyPassword, getCurrentUser } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
import { initials } from "../lib/format.js";
import { AVATARS, getAvatar, setAvatar, GRADES, gradeFor, readGameStats, scoreOf } from "../lib/gamification.js";

/**
 * Profil stagiaire, en trois onglets :
 *  • Profil  : avatar (picker pizza), grade & progression.
 *  • Mes infos : coordonnées personnelles — modifiables et synchronisées côté organisme.
 *  • Compte  : changement d'e-mail et de mot de passe.
 */
const CIVILITIES = ["", "M.", "Mme"];

export default function ProfileModal({ onClose }) {
  const { user, setUser } = useContext(UserContext);
  const uid = user?.id;
  const [tab, setTab] = useState("profil");
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
  const refreshUser = () => getCurrentUser().then((r) => setUser(r.data)).catch(() => {});

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3 style={{ fontSize: 16 }}>Mon profil</h3>
          <button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button>
        </div>
        <div className="mbody">
          {/* Identité */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <span className="pf-avatar" style={{ background: avatar ? avatar.color : "var(--navy)" }}>
              {avatar ? avatar.emoji : initials(user?.first_name, user?.last_name)}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{who}</div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>{user?.email}</div>
              <div style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, marginTop: 2 }}>{grade.emoji} {grade.name}</div>
            </div>
          </div>

          {/* Onglets */}
          <span className="seg" style={{ marginBottom: 16 }}>
            <button className={"seg-btn" + (tab === "profil" ? " on" : "")} onClick={() => setTab("profil")}>Profil</button>
            <button className={"seg-btn" + (tab === "infos" ? " on" : "")} onClick={() => setTab("infos")}>Mes infos</button>
            <button className={"seg-btn" + (tab === "compte" ? " on" : "")} onClick={() => setTab("compte")}>Compte</button>
          </span>

          {tab === "profil" && (
            <ProfilTab avatar={avatar} choose={choose} grade={grade} next={next} score={score} pct={pct} xp={xp} stars={stars} done={done} enrolled={enrolled} />
          )}
          {tab === "infos" && <InfosTab onSaved={refreshUser} />}
          {tab === "compte" && <CompteTab currentEmail={user?.email} onEmailChanged={refreshUser} />}
        </div>
        <div className="mfoot">
          <button className="btn primary" onClick={onClose}>Terminé</button>
        </div>
      </div>
    </div>
  );
}

function ProfilTab({ avatar, choose, grade, next, score, pct, xp, stars, done, enrolled }) {
  return (
    <>
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
        <p className="hint" style={{ marginTop: 8 }}>Ton avatar et ton grade sont visibles par les autres stagiaires dans la communauté.</p>
      </div>
    </>
  );
}

function InfosTab({ onSaved }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }

  useEffect(() => { getMyInfos().then((r) => setF(r.data || {})).catch(() => setF({})); }, []);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await updateMyInfos({
        civility: f.civility, first_name: f.first_name, last_name: f.last_name, phone: f.phone,
        birthday: f.birthday, birth_place: f.birth_place, address: f.address, zip_code: f.zip_code, town: f.town,
      });
      setMsg({ ok: true, text: "Infos enregistrées. Elles sont aussi mises à jour côté organisme." });
      onSaved && onSaved();
    } catch (e) { setMsg({ ok: false, text: e.message || "Échec de l'enregistrement." }); }
    finally { setBusy(false); }
  }

  if (!f) return <p className="hint">Chargement…</p>;
  return (
    <div>
      <p className="hint" style={{ margin: "0 0 12px" }}>Tes coordonnées. Toute modification est visible par ton organisme de formation.</p>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="field"><label>Civilité</label>
          <select className="inp" value={f.civility || ""} onChange={set("civility")}>{CIVILITIES.map((c) => <option key={c} value={c}>{c || "—"}</option>)}</select></div>
        <div className="field"><label>Téléphone</label><input className="inp" value={f.phone || ""} onChange={set("phone")} /></div>
        <div className="field"><label>Prénom</label><input className="inp" value={f.first_name || ""} onChange={set("first_name")} /></div>
        <div className="field"><label>Nom</label><input className="inp" value={f.last_name || ""} onChange={set("last_name")} /></div>
        <div className="field"><label>Date de naissance</label><input className="inp" type="date" value={f.birthday || ""} onChange={set("birthday")} /></div>
        <div className="field"><label>Lieu de naissance</label><input className="inp" value={f.birth_place || ""} onChange={set("birth_place")} /></div>
      </div>
      <div className="field"><label>Adresse</label><input className="inp" value={f.address || ""} onChange={set("address")} /></div>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="field"><label>Code postal</label><input className="inp" value={f.zip_code || ""} onChange={set("zip_code")} /></div>
        <div className="field"><label>Ville</label><input className="inp" value={f.town || ""} onChange={set("town")} /></div>
      </div>
      {msg && <p className="hint" style={{ color: msg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "2px 0 10px" }}>{msg.text}</p>}
      <button className="btn primary" disabled={busy} onClick={save} style={{ width: "100%", justifyContent: "center" }}><Icon name="check" size={14} /> Enregistrer mes infos</button>
    </div>
  );
}

function CompteTab({ currentEmail, onEmailChanged }) {
  const [email, setEmail] = useState("");
  const [emailPw, setEmailPw] = useState("");
  const [eMsg, setEMsg] = useState(null);
  const [eBusy, setEBusy] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confPw, setConfPw] = useState("");
  const [pMsg, setPMsg] = useState(null);
  const [pBusy, setPBusy] = useState(false);

  async function saveEmail() {
    setEBusy(true); setEMsg(null);
    try {
      await changeMyEmail({ newEmail: email, currentPassword: emailPw });
      setEMsg({ ok: true, text: "Adresse e-mail modifiée." });
      setEmail(""); setEmailPw("");
      onEmailChanged && onEmailChanged();
    } catch (e) { setEMsg({ ok: false, text: e.message || "Échec." }); }
    finally { setEBusy(false); }
  }
  async function savePw() {
    setPMsg(null);
    if (newPw.length < 8) return setPMsg({ ok: false, text: "8 caractères minimum." });
    if (newPw !== confPw) return setPMsg({ ok: false, text: "La confirmation ne correspond pas." });
    setPBusy(true);
    try {
      await changeMyPassword({ currentPassword: curPw, newPassword: newPw });
      setPMsg({ ok: true, text: "Mot de passe modifié." });
      setCurPw(""); setNewPw(""); setConfPw("");
    } catch (e) { setPMsg({ ok: false, text: e.message || "Échec." }); }
    finally { setPBusy(false); }
  }

  return (
    <div>
      {/* E-mail */}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Adresse e-mail</div>
      <p className="hint" style={{ margin: "0 0 10px" }}>Actuelle : <b>{currentEmail}</b></p>
      <div className="field"><label>Nouvel e-mail</label><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nouveau@email.com" /></div>
      <div className="field"><label>Mot de passe actuel</label><input className="inp" type="password" value={emailPw} onChange={(e) => setEmailPw(e.target.value)} autoComplete="current-password" /></div>
      {eMsg && <p className="hint" style={{ color: eMsg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "2px 0 10px" }}>{eMsg.text}</p>}
      <button className="btn ghost" disabled={eBusy || !email || !emailPw} onClick={saveEmail} style={{ width: "100%", justifyContent: "center" }}>Changer l'e-mail</button>

      <div style={{ borderTop: "1px solid var(--border-soft)", margin: "18px 0 14px" }} />

      {/* Mot de passe */}
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Mot de passe</div>
      <div className="field"><label>Mot de passe actuel</label><input className="inp" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" /></div>
      <div className="field"><label>Nouveau mot de passe</label><input className="inp" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" /></div>
      <div className="field"><label>Confirmer le nouveau mot de passe</label><input className="inp" type="password" value={confPw} onChange={(e) => setConfPw(e.target.value)} autoComplete="new-password" /></div>
      {pMsg && <p className="hint" style={{ color: pMsg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "2px 0 10px" }}>{pMsg.text}</p>}
      <button className="btn primary" disabled={pBusy || !curPw || !newPw || !confPw} onClick={savePw} style={{ width: "100%", justifyContent: "center" }}><Icon name="check" size={14} /> Changer le mot de passe</button>
    </div>
  );
}
