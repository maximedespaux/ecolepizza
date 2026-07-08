import { useContext, useEffect, useState } from "react";
import { getTeam, createMember, updateMember, deleteMember, getAccessProfiles, createAccessProfile } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import { GRANTABLE_NAV, canAccess, OWNER_ROLES } from "../lib/nav.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

// Libellés + teintes de pastille par rôle.
const ROLE_META = {
  SUPER_ADMIN: { label: "Super administrateur", tone: "r" },
  ADMIN_ORGANISME: { label: "Administrateur", tone: "b" },
  SECRETARIAT: { label: "Secrétariat", tone: "g" },
  FORMATEUR: { label: "Formateur", tone: "a" },
  AUDITEUR: { label: "Auditeur", tone: "n" },
};

// Rôles attribuables selon le rôle du demandeur.
function assignableRoles(actorRole) {
  const base = ["ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR", "AUDITEUR"];
  return actorRole === "SUPER_ADMIN" ? ["SUPER_ADMIN", ...base] : base;
}

// Générateur de mot de passe robuste (sans caractères ambigus).
function generatePassword(len = 14) {
  const sets = {
    lower: "abcdefghijkmnpqrstuvwxyz",
    upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
    digit: "23456789",
    sym: "!@#$%&*?-_",
  };
  const all = Object.values(sets).join("");
  const rnd = (n) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  // Au moins un de chaque catégorie, puis complète au hasard.
  let out = Object.values(sets).map((s) => s[rnd(s.length)]);
  while (out.length < len) out.push(all[rnd(all.length)]);
  // Mélange (Fisher–Yates).
  for (let i = out.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

function fmtDate(v) {
  if (!v) return "Jamais";
  const d = new Date(v);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function Equipe() {
  const { user } = useContext(UserContext);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // membre en édition, ou { _new: true }
  const [navEditing, setNavEditing] = useState(null); // membre dont on configure l'accès menu
  const [credential, setCredential] = useState(null); // { email, password } affiché une fois

  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  async function load() {
    try { const { data } = await getTeam(); setItems(data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function toggleActive(m) {
    setBusy(m.id); setStatus(null);
    try {
      await updateMember(m.id, { active: !m.active });
      setStatus({ type: "success", message: m.active ? "Accès désactivé." : "Accès réactivé." });
      await load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setBusy(null); }
  }

  async function onDelete(m) {
    if (!window.confirm(`Supprimer définitivement le compte de ${m.first_name || ""} ${m.last_name || ""} (${m.email}) ?`)) return;
    setBusy(m.id); setStatus(null);
    try {
      await deleteMember(m.id);
      setStatus({ type: "success", message: "Membre supprimé." });
      await load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setBusy(null); }
  }

  const canManageRow = (m) => !(m.role === "SUPER_ADMIN" && user?.role !== "SUPER_ADMIN");

  return (
    <>
      <PageHead
        eyebrow="Système"
        title="Équipe & accès"
        lead="Gérez les comptes autorisés à accéder au panneau de l'organisme : créez une adresse e-mail avec un mot de passe, attribuez un rôle, désactivez ou supprimez un accès."
        actions={<button className="btn primary" onClick={() => setEditing({ _new: true })}>＋ Ajouter un membre</button>}
      />
      <StatusMessage status={status} />

      {credential && (
        <Card title="Identifiants du nouveau compte">
          <p className="sub" style={{ marginTop: 0 }}>
            Communiquez ces identifiants au membre. <b>Le mot de passe ne sera plus affiché ensuite.</b>
          </p>
          <div className="cred-box">
            <div><span className="cred-k">E-mail</span><span className="mono">{credential.email}</span></div>
            <div><span className="cred-k">Mot de passe</span><span className="mono">{credential.password}</span></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="btn sm" onClick={() => navigator.clipboard?.writeText(`E-mail : ${credential.email}\nMot de passe : ${credential.password}`)}>Copier</button>
            <button className="btn sm ghost" onClick={() => setCredential(null)}>J'ai noté, masquer</button>
          </div>
        </Card>
      )}

      <Card title={`Membres (${items.length})`}>
        <div className="tablewrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Membre</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th>Dernière connexion</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => {
                const meta = ROLE_META[m.role] || { label: m.role, tone: "n" };
                return (
                  <tr key={m.id} style={{ opacity: m.active ? 1 : 0.55 }}>
                    <td>
                      <b>{[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}{m.is_self && <span style={{ color: "var(--dim)", fontWeight: 400 }}> (vous)</span>}</b>
                      <span style={{ display: "block", fontSize: 12, color: "var(--dim)" }} className="mono">{m.email}</span>
                    </td>
                    <td><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    <td style={{ fontSize: 13 }}>
                      {m.active ? <span style={{ color: "var(--ok, #2e9e5b)" }}>● Actif</span>
                        : <span style={{ color: "var(--dim)" }}>○ Désactivé</span>}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--muted)" }}>{fmtDate(m.last_login_at)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {canManageRow(m) && (
                        <>
                          <button className="btn sm ghost" title="Modifier" onClick={() => setEditing({ ...m })}>✎</button>{" "}
                          {isSuperAdmin && !m.is_self && !OWNER_ROLES.includes(m.role) && (
                            <button className="btn sm ghost" title="Configurer l'accès au menu"
                              onClick={() => setNavEditing(m)}>🧭</button>
                          )}{" "}
                          {!m.is_self && (
                            <button className="btn sm ghost" title={m.active ? "Désactiver l'accès" : "Réactiver l'accès"}
                              disabled={busy === m.id} onClick={() => toggleActive(m)}>{m.active ? "⏸" : "▶"}</button>
                          )}{" "}
                          {!m.is_self && (
                            <button className="btn sm ghost danger" title="Supprimer"
                              disabled={busy === m.id} onClick={() => onDelete(m)}>🗑</button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--dim)", padding: 20 }}>Aucun membre.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <MemberModal
          member={editing}
          actorRole={user?.role}
          onClose={() => setEditing(null)}
          onError={(m) => setStatus({ type: "error", message: m })}
          onCreated={(cred) => { setEditing(null); setCredential(cred); setStatus({ type: "success", message: "Membre créé." }); load(); }}
          onSaved={(cred) => { setEditing(null); if (cred) setCredential(cred); setStatus({ type: "success", message: "Membre mis à jour." }); load(); }}
        />
      )}

      {navEditing && (
        <NavAccessModal
          member={navEditing}
          onClose={() => setNavEditing(null)}
          onError={(m) => setStatus({ type: "error", message: m })}
          onSaved={() => { setNavEditing(null); setStatus({ type: "success", message: "Accès menu enregistré." }); load(); }}
        />
      )}
    </>
  );
}

/** Configuration de l'accès au menu d'un membre (super administrateur uniquement). */
function NavAccessModal({ member, onClose, onError, onSaved }) {
  // Défauts du rôle (en écriture) — sert d'amorce et de bouton « réinitialiser ».
  const roleDefaults = () => {
    const o = {};
    for (const g of GRANTABLE_NAV) for (const it of g.items) if (canAccess(member.role, it.roles)) o[it.to] = "write";
    return o;
  };
  // Amorce : accès déjà enregistré (objet { chemin: mode }), sinon défauts du rôle.
  const seed = () => {
    const na = member.nav_access;
    if (na && !Array.isArray(na) && typeof na === "object") return { ...na };
    if (Array.isArray(na)) { const o = {}; na.forEach((p) => { o[p] = "write"; }); return o; }
    return roleDefaults();
  };
  const [modes, setModes] = useState(seed);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);
  useEffect(() => { getAccessProfiles().then((r) => setRoles(r.data || [])).catch(() => {}); }, []);

  function applyRole(id) {
    const r = roles.find((x) => x.id === id);
    if (r) setModes({ ...(r.nav_access || {}) });
  }
  async function saveAsRole() {
    const name = window.prompt("Nom du nouveau rôle :", "");
    if (!name || !name.trim()) return;
    try { await createAccessProfile({ name: name.trim(), nav_access: modes }); const r = await getAccessProfiles(); setRoles(r.data || []); }
    catch (e) { onError(e.message); }
  }

  const granted = (to) => Object.prototype.hasOwnProperty.call(modes, to);
  const toggle = (to) => setModes((p) => {
    const n = { ...p };
    if (granted(to)) delete n[to]; else n[to] = "write";
    return n;
  });
  const setMode = (to, mode) => setModes((p) => ({ ...p, [to]: mode }));
  const setAll = (on) => {
    if (!on) { setModes({}); return; }
    const o = {};
    for (const g of GRANTABLE_NAV) for (const it of g.items) o[it.to] = modes[it.to] || "write";
    setModes(o);
  };

  async function save() {
    setSaving(true);
    try { await updateMember(member.id, { nav_access: modes }); onSaved(); }
    catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  const who = [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>Accès menu — {who}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <p className="sub" style={{ marginTop: 0 }}>
            Cochez les rubriques accessibles, puis choisissez <b>Modifier</b> (peut créer / éditer / supprimer)
            ou <b>Lecture</b> (consultation seule). Les administrateurs conservent toujours l'accès complet.
          </p>
          {roles.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Appliquer un rôle :</label>
              <select className="inp" style={{ maxWidth: 220 }} value="" onChange={(e) => { if (e.target.value) applyRole(e.target.value); }}>
                <option value="">— Choisir un rôle —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn sm ghost" onClick={() => setAll(true)}>Tout cocher</button>
            <button type="button" className="btn sm ghost" onClick={() => setAll(false)}>Tout décocher</button>
            <button type="button" className="btn sm ghost" onClick={() => setModes(roleDefaults())}>Défauts du rôle</button>
            <button type="button" className="btn sm ghost" onClick={saveAsRole}>Enregistrer comme rôle…</button>
          </div>
          {GRANTABLE_NAV.map((g) => (
            <div key={g.grp} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>{g.grp}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {g.items.map((it) => {
                  const on = granted(it.to);
                  const mode = modes[it.to];
                  return (
                    <div key={it.to} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, cursor: "pointer" }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(it.to)} />
                        <span style={{ width: 20, textAlign: "center" }}>{it.ic}</span> {it.label}
                      </label>
                      {on && (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button type="button" className={"btn sm " + (mode !== "read" ? "primary" : "ghost")}
                            onClick={() => setMode(it.to, "write")}>Modifier</button>
                          <button type="button" className={"btn sm " + (mode === "read" ? "primary" : "ghost")}
                            onClick={() => setMode(it.to, "read")}>Lecture</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

function MemberModal({ member, actorRole, onClose, onError, onCreated, onSaved }) {
  const isNew = !!member._new;
  const roles = assignableRoles(actorRole);
  const [form, setForm] = useState({
    first_name: member.first_name || "",
    last_name: member.last_name || "",
    email: member.email || "",
    phone: member.phone || "",
    role: member.role || "SECRETARIAT",
  });
  const [password, setPassword] = useState(isNew ? generatePassword() : "");
  const [resetPw, setResetPw] = useState(false); // édition : réinitialiser le mot de passe
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!form.email.trim()) { onError("Adresse e-mail requise."); return; }
    setSaving(true);
    try {
      if (isNew) {
        await createMember({ ...form, password });
        onCreated({ email: form.email.trim(), password });
      } else {
        const payload = { ...form };
        let cred = null;
        if (resetPw) { payload.password = password; cred = { email: form.email.trim(), password }; }
        await updateMember(member.id, payload);
        onSaved(cred);
      }
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{isNew ? "Nouveau membre" : "Modifier le membre"}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <div className="row2">
            <div className="field"><label>Prénom</label>
              <input className="inp" value={form.first_name} onChange={set("first_name")} /></div>
            <div className="field"><label>Nom</label>
              <input className="inp" value={form.last_name} onChange={set("last_name")} /></div>
          </div>
          <div className="field"><label>Adresse e-mail (identifiant de connexion)</label>
            <input className="inp" type="email" value={form.email} onChange={set("email")} placeholder="prenom@organisme.fr" /></div>
          <div className="row2">
            <div className="field"><label>Téléphone</label>
              <input className="inp" value={form.phone} onChange={set("phone")} /></div>
            <div className="field"><label>Rôle</label>
              <select value={form.role} onChange={set("role")} disabled={member.is_self}>
                {roles.map((r) => <option key={r} value={r}>{(ROLE_META[r] || {}).label || r}</option>)}
              </select>
              {member.is_self && <span className="sub" style={{ fontSize: 11 }}>Vous ne pouvez pas changer votre propre rôle.</span>}
            </div>
          </div>

          {isNew ? (
            <div className="field">
              <label>Mot de passe (généré, affiché une seule fois)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="inp mono" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="btn sm ghost" onClick={() => setPassword(generatePassword())}>↻ Générer</button>
              </div>
            </div>
          ) : (
            <div className="field">
              <label style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <input type="checkbox" checked={resetPw} onChange={(e) => { setResetPw(e.target.checked); if (e.target.checked && !password) setPassword(generatePassword()); }} />
                Réinitialiser le mot de passe
              </label>
              {resetPw && (
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input className="inp mono" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="btn sm ghost" onClick={() => setPassword(generatePassword())}>↻</button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}

export default Equipe;
