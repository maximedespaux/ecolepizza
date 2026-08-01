import { useContext, useEffect, useMemo, useState } from "react";
import { UserContext } from "../context/UserContext.jsx";
import { getMyFormations, getMyInfos, updateMyInfos, updateMyVisibility, changeMyEmail, changeMyPassword, getCurrentUser, getMyProfile } from "../api/apiClient.js";
import { Icon } from "./Icon.jsx";
import { initials, colorOf } from "../lib/format.js";
import {AVATARS, getAvatar, setAvatar} from "../lib/gamification.js";
import { CADRES, cadreFor, cadrePossede, cadrePorte, cadreDeQuest, cadreClass, cadreStyle, parseCadre, estCadreQuest, getCadreChoisi, setCadreChoisi } from "../lib/cadres.js";
import { useEchap } from "../lib/useEchap.js";

/**
 * Profil stagiaire, en trois onglets :
 *  • Profil  : avatar (picker pizza), cadre & progression.
 *  • Mes infos : coordonnées personnelles — modifiables et synchronisées côté organisme.
 *  • Compte  : changement d'e-mail et de mot de passe.
 */
const CIVILITIES = ["", "M.", "Mme"];
// Fonds proposés (charte pizza) — plus le sélecteur libre pour une couleur personnalisée.
const PALETTE = ["#dc3e37", "#ff6900", "#fcb900", "#2f9e6f", "#3aa0e0", "#2c3371", "#7b3f9e", "#8a5a2b", "#e0533e", "#111827"];

export default function ProfileModal({ onClose }) {
  useEchap(onClose);
  const { user, setUser } = useContext(UserContext);
  const uid = user?.id;
  const [tab, setTab] = useState("profil");
  const [avatar, setAv] = useState(() => getAvatar(uid));
  const [formations, setFormations] = useState([]);

  useEffect(() => { getMyFormations().then((r) => setFormations(r.data || [])).catch(() => {}); }, []);

  // Niveaux attribués = les BADGES du stagiaire (mêmes que ceux qui débloquent Pizza Quest),
  // avec repli sur les formations suivies.
  const access = formations.filter((f) => f.finished || ((f.has_badge || f.enrolled) && !f.revoked));
  // Terminées = formations marquées finies (manuel) ou complétées (auto) parmi les attribuées.
  const done = access.filter((f) => f.finished).length;
  const enrolled = access.length; // dénominateur = formations attribuées
  const roleLabel = user?.role === "INTERVENANT" ? "Intervenant" : "Stagiaire";
  // L'XP et les cœurs ont disparu : la progression se lit aux CADRES, gagnés sur les
  // formations réellement terminées (cf. lib/cadres.js).
  const { cadre: palier, suivant } = cadreFor(done);
  // `attribues` : les cadres exclusifs accordés par l'école (migration 113). Tant qu'aucun
  // n'est accordé la liste reste vide et ils s'affichent verrouillés AVEC leur condition —
  // un objectif visible vaut mieux qu'une case cachée.
  const [attribues, setAttribues] = useState([]);
  /* Cadres de PIZZA QUEST : gagnés en jouant, un par formation, à SA couleur. Ils ne sont pas
     dans `CADRES` — ils n'existent qu'une fois la formation connue — et c'est le serveur qui
     dit lesquels sont acquis (il recalcule sur la banque de questions du moment). */
  const [quest, setQuest] = useState([]);
  useEffect(() => {
    getMyProfile().then((r) => {
      setAttribues(r?.data?.cadres_exclusifs || []);
      const q = r?.data?.quest_cadres || [];
      setQuest(q);
      recolorerSiBesoin(q);
    }).catch(() => {});
  }, []);

  const [choisi, setChoisi] = useState(() => getCadreChoisi(uid));
  /* QUAND L'ÉCOLE RECOLORE UNE FORMATION, le cadre porté garde l'ancienne teinte — et la teinte
     fait partie de la possession (sinon on porterait la couleur d'une formation jamais jouée).
     Le cadre devenait donc orphelin : plus surligné dans la liste, et refusé par le serveur à la
     prochaine écriture. Observé pour de vrai, une formation venant d'être recolorée.
     On réaligne quand il n'y a AUCUN doute : un seul cadre possédé sur ce palier. À plusieurs, on
     ne devine pas — deviner reviendrait à repeindre le cadre d'une autre formation. */
  function recolorerSiBesoin(possedes) {
    const actuel = getCadreChoisi(uid);
    const { id } = parseCadre(actuel);
    if (!estCadreQuest(id) || possedes.some((c) => c.valeur === actuel)) return;
    const memePalier = possedes.filter((c) => c.palier === id);
    if (memePalier.length !== 1) return;
    setCadreChoisi(uid, memePalier[0].valeur);
    setChoisi(memePalier[0].valeur);
  }
  const cadre = cadrePorte(uid, done, attribues, quest);
  const choisirCadre = (id) => { setCadreChoisi(uid, id); setChoisi(id); };
  const haut = suivant ? suivant.min : palier.min;
  const pct = suivant ? Math.min(100, Math.round(((done - palier.min) / (haut - palier.min)) * 100)) : 100;

  function choose(a) { const c = avatar?.color; setAvatar(uid, a.id, c); setAv({ ...a, color: c || a.color }); }
  function chooseColor(c) { const base = avatar || AVATARS[0]; setAvatar(uid, base.id, c); setAv({ ...base, color: c }); }
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
          {/* Identité (gauche) + accès / niveaux attribués (droite).
              Les deux colonnes se replient l'une sous l'autre quand la modale est étroite :
              « Mes accès » avait une largeur fixe de 150px qu'elle ne rendait jamais, si bien
              que sur un téléphone le nom héritait de 80px et s'affichait « Guilla… ». */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <span className="pf-avatar" style={{ background: avatar ? avatar.color : "var(--navy)", flex: "none" }}>
              {avatar ? avatar.emoji : initials(user?.first_name, user?.last_name)}
            </span>
            <div style={{ flex: "1 1 170px", minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{who}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
              <div style={{ fontSize: 12.5, color: "var(--blue)", fontWeight: 700, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                <span className={"stu-rank-cadre " + cadreClass(cadre.valeur || cadre.id)}
                  style={cadreStyle(cadre.valeur)} aria-hidden="true" />
                {cadre.id === "aucun" ? "Aucun cadre" : `Cadre ${cadre.nom}`}
              </div>
            </div>
            <div style={{ flex: "1 1 150px", textAlign: "right" }}>
              <div className="hint" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 800, marginBottom: 3 }}>Mes accès</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>{roleLabel}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
                {access.length === 0 ? (
                  <span className="hint" style={{ fontSize: 11 }}>Aucun niveau</span>
                ) : access.map((f) => (
                  <span key={f.program_id} className="badge n mono" title={f.program_title}
                    style={{ background: f.color || colorOf(f.program_code), color: "#fff", borderColor: "transparent", fontSize: 10, padding: "2px 7px" }}>
                    {f.program_code}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Onglets */}
          <span className="seg" style={{ marginBottom: 16, flexWrap: "wrap" }}>
            <button className={"seg-btn" + (tab === "profil" ? " on" : "")} onClick={() => setTab("profil")}>Profil</button>
            <button className={"seg-btn" + (tab === "infos" ? " on" : "")} onClick={() => setTab("infos")}>Mes infos</button>
            <button className={"seg-btn" + (tab === "visibilite" ? " on" : "")} onClick={() => setTab("visibilite")}>Visibilité</button>
            <button className={"seg-btn" + (tab === "compte" ? " on" : "")} onClick={() => setTab("compte")}>Compte</button>
          </span>

          {tab === "profil" && (
            <ProfilTab avatar={avatar} choose={choose} chooseColor={chooseColor} cadre={cadre} palier={palier} suivant={suivant} pct={pct} done={done} enrolled={enrolled} attribues={attribues} quest={quest} choisirCadre={choisirCadre} />
          )}
          {tab === "infos" && <InfosTab onSaved={refreshUser} />}
          {tab === "visibilite" && <VisibiliteTab who={who} />}
          {tab === "compte" && <CompteTab currentEmail={user?.email} onEmailChanged={refreshUser} />}
        </div>
        <div className="mfoot">
          <button className="btn primary" onClick={onClose}>Terminé</button>
        </div>
      </div>
    </div>
  );
}

function ProfilTab({ avatar, choose, chooseColor, cadre, palier, suivant, pct, done, enrolled, attribues, quest, choisirCadre }) {
  return (
    <>
      <div className="pf-grade">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <b style={{ fontSize: 14, display: "inline-flex", alignItems: "center", gap: 7 }}>
            {/* L'anneau du PALIER, pas celui qu'on porte : ce bloc parle de la progression en
                formations (x/y, palier suivant). Les mêler affichait un anneau « Sans faute »
                jaune sous la légende « Cadre Braise ». */}
            <span className={"stu-rank-cadre " + cadreClass(palier.id)} aria-hidden="true" />
            {palier.id === "aucun" ? "Aucun cadre" : `Cadre ${palier.nom}`}
          </b>
          <span className="hint">{done}/{enrolled} formation(s) terminée(s)</span>
        </div>
        <div className="pq-progress" style={{ height: 12 }}><span style={{ width: `${pct}%`, background: "var(--gold)" }} /></div>
        {suivant && <div className="hint" style={{ marginTop: 5 }}>Encore <b>{suivant.min - done} formation(s)</b> pour le cadre <b>{suivant.nom}</b></div>}
      </div>

      {/* Sélecteur : on choisit CE QU'ON PORTE parmi ce qu'on possède. Le dernier cadre
          obtenu n'est pas forcément celui qu'on veut montrer. Les exclusifs restent
          affichés, verrouillés, avec leur condition — ils existent comme objectif. */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>Choisis ton cadre</div>
        <p className="hint" style={{ margin: 0 }}>Il entoure ton avatar partout, y compris dans la Communauté.</p>
        <div className="pf-cadres">
          {/* Les cadres de quête viennent EN TÊTE : ils bougent à la semaine, alors que les
              cadres de parcours se comptent en formations terminées, donc en mois. Ce qui a
              changé récemment se cherche en premier. Ils ne sont listés que s'il y en a —
              une section « Pizza Quest » vide donnerait l'impression d'un chargement raté. */}
          {[...quest.map(cadreDeQuest), ...CADRES].map((c) => {
            // Un cadre de quête porte une VALEUR (palier + couleur) ; les autres, leur seul id.
            const cle = c.valeur || c.id;
            const possede = c.quest || cadrePossede(c, done, attribues, quest);
            const actif = (cadre.valeur || cadre.id) === cle;
            return (
              <button key={cle} type="button"
                className={`pf-cadre${actif ? " on" : ""}${c.exclusif ? " exclusif" : ""}`}
                disabled={!possede}
                onClick={() => choisirCadre(cle)}
                title={possede ? c.desc || c.nom : (c.condition || c.desc)}>
                <span className={`pf-cadre-apercu ${possede && c.id !== "aucun" ? `cadre cadre-${c.id}` : ""}`}
                  style={cadreStyle(cle)}>
                  <span aria-hidden="true">{avatar ? avatar.emoji : "🍕"}</span>
                  {!possede && <span className="pf-lock"><Icon name="lock" size={9} /></span>}
                </span>
                <span className="pf-cadre-nom">{c.nom}</span>
                {!possede && <span className="pf-cadre-cond">{c.condition || c.desc}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Choisis ton avatar</span>
          <button className="btn sm ghost" onClick={() => choose(AVATARS[Math.floor(Math.random() * AVATARS.length)])} title="Avatar au hasard">🎲 Surprise</button>
        </div>
        <div className="pf-picker">
          {AVATARS.map((a) => (
            <button key={a.id} className={"pf-opt" + (avatar?.id === a.id ? " sel" : "")}
              style={{ background: avatar?.id === a.id ? (avatar.color || a.color) : a.color }} onClick={() => choose(a)} title={a.id} aria-label={`Avatar ${a.id}`}>
              {a.emoji}
              {avatar?.id === a.id && <span className="pf-check"><Icon name="check" size={12} /></span>}
            </button>
          ))}
        </div>

        {/* Couleur du fond */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "14px 0 8px" }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Couleur du fond</span>
          <label className="btn sm ghost" style={{ cursor: "pointer" }} title="Couleur personnalisée">
            🎨 Personnalisée
            <input type="color" value={avatar?.color || "#dc3e37"} onChange={(e) => chooseColor(e.target.value)} style={{ width: 0, height: 0, opacity: 0, position: "absolute" }} />
          </label>
        </div>
        <div className="pf-colors">
          {PALETTE.map((c) => (
            <button key={c} className={"pf-color" + (avatar?.color?.toLowerCase() === c.toLowerCase() ? " sel" : "")}
              style={{ background: c }} onClick={() => chooseColor(c)} title={c} aria-label={`Fond ${c}`}>
              {avatar?.color?.toLowerCase() === c.toLowerCase() && <Icon name="check" size={12} />}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>Ton avatar, sa couleur et ton cadre sont visibles par les autres stagiaires dans la communauté.</p>
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
        birthday: f.birthday, birth_place: f.birth_place,
        company_name: f.company, company_address: f.company_address, company_zip: f.company_zip, company_town: f.company_town,
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

      <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 0 8px" }}>Entreprise</div>
      <div className="field"><label>Nom de l'entreprise</label><input className="inp" value={f.company || ""} onChange={set("company")} placeholder="Ex. Pizzeria Bella" /></div>
      <div className="field"><label>Adresse de l'entreprise</label><input className="inp" value={f.company_address || ""} onChange={set("company_address")} /></div>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <div className="field"><label>Code postal</label><input className="inp" value={f.company_zip || ""} onChange={set("company_zip")} /></div>
        <div className="field"><label>Ville</label><input className="inp" value={f.company_town || ""} onChange={set("company_town")} /></div>
      </div>
      {msg && <p className="hint" style={{ color: msg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "2px 0 10px" }}>{msg.text}</p>}
      <button className="btn primary" disabled={busy} onClick={save} style={{ width: "100%", justifyContent: "center" }}><Icon name="check" size={14} /> Enregistrer mes infos</button>
    </div>
  );
}

function VisibiliteTab({ who }) {
  const [f, setF] = useState(null); // { company, phone, email, visibility, ... }
  const [vis, setVis] = useState({ company: true, phone: false, email: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => { getMyInfos().then((r) => { setF(r.data || {}); setVis((r.data && r.data.visibility) || { company: true, phone: false, email: false }); }).catch(() => setF({})); }, []);
  const toggle = (k) => setVis((v) => ({ ...v, [k]: !v[k] }));

  async function save() {
    setBusy(true); setMsg(null);
    try { await updateMyVisibility(vis); setMsg({ ok: true, text: "Visibilité enregistrée." }); }
    catch (e) { setMsg({ ok: false, text: e.message || "Échec." }); }
    finally { setBusy(false); }
  }

  if (!f) return <p className="hint">Chargement…</p>;
  const Row = ({ k, label, value }) => (
    <label className="vis-row">
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 13.5 }}>{label}</b>
        <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{value || "—"}</span>
      </span>
      <input type="checkbox" checked={!!vis[k]} onChange={() => toggle(k)} />
    </label>
  );

  return (
    <div>
      <p className="hint" style={{ margin: "0 0 12px" }}>Choisis ce que les autres stagiaires voient sur ton profil dans la communauté. Ton nom, ton avatar, ton cadre et tes fiches partagées restent toujours visibles.</p>
      <div className="vis-list">
        <Row k="company" label="Entreprise" value={f.company} />
        <Row k="phone" label="Téléphone" value={f.phone} />
        <Row k="email" label="Adresse e-mail" value={f.email} />
      </div>
      {msg && <p className="hint" style={{ color: msg.ok ? "var(--green, #2f9e6f)" : "var(--ember1)", margin: "8px 0 10px" }}>{msg.text}</p>}
      <button className="btn primary" disabled={busy} onClick={save} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}><Icon name="check" size={14} /> Enregistrer la visibilité</button>
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
