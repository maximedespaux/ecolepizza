import { useContext, useEffect, useState } from "react";
import { getTeam, createMember, updateMember, deleteMember, getAccessProfiles, createAccessProfile, getStagiaires } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import { GRANTABLE_NAV, EXTRA_ACCESS, PAGE_CAPS, canAccess, OWNER_ROLES, BUILTIN_ROLES, builtinRoleAccess } from "../lib/nav.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

// Libellés + teintes de pastille par rôle.
const ROLE_META = {
  SUPER_ADMIN: { label: "Super administrateur", tone: "r" },
  ADMIN_ORGANISME: { label: "Administrateur", tone: "b" },
  SECRETARIAT: { label: "Secrétariat", tone: "g" },
  FORMATEUR: { label: "Formateur", tone: "a" },
  AUDITEUR: { label: "Auditeur", tone: "n" },
  INTERVENANT: { label: "Intervenant externe", tone: "a" },
};

// Rôles attribuables selon le rôle du demandeur.
function assignableRoles(actorRole) {
  const base = ["ADMIN_ORGANISME", "SECRETARIAT", "FORMATEUR", "AUDITEUR", "INTERVENANT"];
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
  const [items, setItems] = useState(null); // `null` = on charge, `[]` = aucun membre
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

      {credential && (credential.converted ? (
        <Card title="Stagiaire converti en membre">
          <p className="sub" style={{ marginTop: 0 }}>
            Le compte <b className="mono">{credential.email}</b> est désormais un membre de l'équipe.
            {" "}<b>Il conserve son mot de passe stagiaire</b> — aucun nouveau n'a été généré. Il garde
            aussi sa fiche stagiaire (il peut basculer entre les deux espaces).
          </p>
          <button className="btn sm ghost" onClick={() => setCredential(null)}>J'ai noté, masquer</button>
        </Card>
      ) : (
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
      ))}

      <Card title={`Membres${items ? ` (${items.length})` : ""}`}>
        <DataTable
          rows={items}
          rowKey={(m) => m.id}
          /* Un membre désactivé reste listé — son historique compte — mais en retrait. */
          rowProps={(m) => ({ style: { opacity: m.active ? 1 : 0.55 } })}
          vide={<EmptyState icon="team" title="Aucun membre"
            text="Personne d'autre que toi n'a encore de compte sur cet organisme." />}
          cols={[
            { k: "membre", t: "Membre", principal: true,
              cell: (m) => (
                <>
                  <b>{[m.first_name, m.last_name].filter(Boolean).join(" ") || "-"}{m.is_self && <span style={{ color: "var(--muted)", fontWeight: 400 }}> (vous)</span>}</b>
                  <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }} className="mono">{m.email}</span>
                </>
              ) },
            { k: "role", t: "Rôle",
              cell: (m) => { const meta = ROLE_META[m.role] || { label: m.role, tone: "n" }; return <Badge tone={meta.tone}>{meta.label}</Badge>; } },
            { k: "statut", t: "Statut", td: { fontSize: 13 },
              cell: (m) => (m.active
                ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--green)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", flex: "0 0 8px" }} /> Actif</span>
                : <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--muted)" }}><span style={{ width: 8, height: 8, borderRadius: "50%", border: "1.5px solid currentColor", flex: "0 0 8px" }} /> Désactivé</span>) },
            { k: "last", t: "Dernière connexion", td: { fontSize: 13, color: "var(--muted)" },
              cell: (m) => fmtDate(m.last_login_at) },
            { k: "actions", t: "", actions: true, td: { textAlign: "right", whiteSpace: "nowrap" },
              cell: (m) => (canManageRow(m) ? (
                <>
                  <button className="btn sm ghost" title="Modifier" aria-label={`Modifier ${m.email}`} onClick={() => setEditing({ ...m })}><Icon name="pencil" size={15} /></button>{" "}
                  {isSuperAdmin && !m.is_self && m.role !== "SUPER_ADMIN" && (
                    <button className="btn sm ghost" title="Configurer l'accès et les capacités" aria-label={`Configurer l'accès de ${m.email}`}
                      onClick={() => setNavEditing(m)}><Icon name="compass" size={15} /></button>
                  )}{" "}
                  {!m.is_self && (
                    <button className="btn sm ghost" title={m.active ? "Désactiver l'accès" : "Réactiver l'accès"}
                      aria-label={`${m.active ? "Désactiver" : "Réactiver"} l'accès de ${m.email}`}
                      disabled={busy === m.id} onClick={() => toggleActive(m)}>{m.active ? <Icon name="pause" size={14} /> : <Icon name="play" size={14} />}</button>
                  )}{" "}
                  {!m.is_self && (
                    <button className="btn sm ghost danger" title="Supprimer" aria-label={`Supprimer ${m.email}`}
                      disabled={busy === m.id} onClick={() => onDelete(m)}><Icon name="trash" size={15} /></button>
                  )}
                </>
              ) : null) },
          ]}
        />
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
  // Propriétaire (super admin / admin) : les pages sont toujours pleines (bypass du
  // nav_access) → on ne configure que les capacités (ex. Révéler les montants).
  const isOwner = OWNER_ROLES.includes(member.role);
  // Amorce : accès déjà enregistré (objet { chemin: mode }), sinon défauts du rôle.
  const seed = () => {
    const na = member.nav_access;
    let base;
    if (na && !Array.isArray(na) && typeof na === "object") base = { ...na };
    else if (Array.isArray(na)) { base = {}; na.forEach((p) => { base[p] = "write"; }); }
    else base = roleDefaults();
    if (isOwner) { const caps = {}; for (const k of Object.keys(base)) if (k.startsWith("cap:")) caps[k] = base[k]; return caps; }
    return base;
  };
  const [modes, setModes] = useState(seed);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);
  const [sysOv, setSysOv] = useState({});
  useEffect(() => { getAccessProfiles().then((r) => { setRoles(r.data || []); setSysOv(r.systemOverrides || {}); }).catch(() => {}); }, []);

  function applyRole(val) {
    if (val.startsWith("builtin:")) { const code = val.slice(8); setModes(sysOv[code]?.nav_access || builtinRoleAccess(code)); return; }
    const r = roles.find((x) => x.id === val);
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
    if (granted(to)) {
      delete n[to];
      // Retirer une page retire SA capacité. Sans cela elle survivrait à l'écran qu'elle sert,
      // et `peutModerer` ne regarde QUE la capacité : la personne modérerait encore par l'API.
      if (PAGE_CAPS[to]) delete n[PAGE_CAPS[to].cap];
    } else n[to] = "write";
    return n;
  });
  const setMode = (to, mode) => setModes((p) => ({ ...p, [to]: mode }));
  const setAll = (on) => {
    if (!on) { setModes({}); return; }
    // Les capacités sont CONSERVÉES : « Tout cocher » les effaçait, alors qu'il ne parle que
    // des pages. On perdait « Administrer » sans que rien ne le dise.
    const o = Object.fromEntries(Object.entries(modes).filter(([k]) => k.startsWith("cap:")));
    for (const g of GRANTABLE_NAV) for (const it of g.items) o[it.to] = modes[it.to] || "write";
    setModes(o);
  };

  async function save() {
    setSaving(true);
    try {
      await updateMember(member.id, { nav_access: modes });
      onSaved();
    }
    catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  const who = [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>Accès menu, {who}</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <p className="sub" style={{ marginTop: 0 }}>
            {isOwner ? (
              <>Ce membre est <b>administrateur</b> : il garde l'accès complet à toutes les pages. Réglez seulement les <b>capacités</b> ci-dessous (ex. révéler les montants).</>
            ) : (
              <>Cochez les rubriques accessibles, puis choisissez <b>Modifier</b> (peut créer / éditer / supprimer)
              ou <b>Lecture</b> (consultation seule). Les administrateurs conservent toujours l'accès complet.</>
            )}
          </p>
          {!isOwner && (<>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>Appliquer un rôle :</label>
            <select className="inp" style={{ maxWidth: 240 }} value="" onChange={(e) => { if (e.target.value) applyRole(e.target.value); }}>
              <option value="">Choisir un rôle</option>
              <optgroup label="Rôles système">
                {BUILTIN_ROLES.map((b) => <option key={b.role} value={`builtin:${b.role}`}>{b.name}</option>)}
              </optgroup>
              {roles.length > 0 && (
                <optgroup label="Rôles personnalisés">
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
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
                  /* Une page peut porter une CAPACITÉ plutôt qu'un mode. Sur la Communauté,
                     « Lecture / Modifier » n'a pas de sens — c'est un fil, on y participe ou
                     on n'y est pas — et la vraie question est ailleurs : administre-t-on ?
                     Quelqu'un qui publie sans pouvoir retirer un message est un problème, pas
                     un réglage. Le bouton remplace donc la paire, sur la ligne même : la
                     capacité vivait tout en bas de la fenêtre, sans rapport visible avec la
                     ligne à laquelle elle s'applique. */
                  const pc = PAGE_CAPS[it.to];
                  const capOffice = !!pc && pc.defaultRoles.includes(member.role);
                  const capOn = !!pc && (capOffice || granted(pc.cap));
                  return (
                    <div key={it.to} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
                      <label style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, cursor: "pointer" }}>
                        <input type="checkbox" checked={on} onChange={() => toggle(it.to)} />
                        <span style={{ width: 20, display: "inline-grid", placeItems: "center" }}><Icon name={it.ic} size={16} /></span> {it.label}
                      </label>
                      {on && (pc ? (
                        <button type="button" className={"btn sm " + (capOn ? "primary" : "ghost")}
                          disabled={capOffice} onClick={() => toggle(pc.cap)}
                          title={capOffice ? "Accordé d'office à ce rôle." : pc.hint}>
                          <Icon name="shield" size={13} /> {pc.label}{capOn ? " : oui" : " : non"}
                        </button>
                      ) : (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button type="button" className={"btn sm " + (mode !== "read" ? "primary" : "ghost")}
                            onClick={() => setMode(it.to, "write")}>Modifier</button>
                          <button type="button" className={"btn sm " + (mode === "read" ? "primary" : "ghost")}
                            onClick={() => setMode(it.to, "read")}>Lecture</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          </>)}

          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--dim)", marginBottom: 4 }}>Accès supplémentaires</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {EXTRA_ACCESS.map((it) => {
                const byDefault = !!it.defaultRoles?.includes(member.role);
                const on = byDefault || granted(it.to);
                return (
                  <label key={it.to} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, cursor: byDefault ? "default" : "pointer" }}>
                    <input type="checkbox" checked={on} disabled={byDefault} onChange={() => toggle(it.to)} style={{ marginTop: 3 }} />
                    <span style={{ width: 20, display: "inline-grid", placeItems: "center", marginTop: 1 }}><Icon name={it.ic} size={16} /></span>
                    <span>{it.label}
                      <span className="hint" style={{ display: "block", fontWeight: 400, marginTop: 1 }}>{byDefault ? "Accordé d'office à ce rôle. " : ""}{it.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
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
  // « Depuis un stagiaire » : recopie ses infos et CONVERTIT son compte existant en membre —
  // il garde son mot de passe, on n'en génère aucun (le serveur ne le change que si on en envoie un).
  const [fromStagiaire, setFromStagiaire] = useState(false);
  const [stagiaires, setStagiaires] = useState(null); // null = pas encore chargé
  const [stagiaireId, setStagiaireId] = useState("");
  useEffect(() => {
    if (!fromStagiaire || stagiaires) return;
    // Seuls ceux qui ONT un compte se convertissent : sinon rien à promouvoir, et pas de mot de passe à garder.
    getStagiaires().then((r) => setStagiaires((r.data || []).filter((s) => s.has_account))).catch(() => setStagiaires([]));
  }, [fromStagiaire, stagiaires]);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!form.email.trim()) { onError("Adresse e-mail requise."); return; }
    if (isNew && fromStagiaire && !stagiaireId) { onError("Choisissez le stagiaire à convertir."); return; }
    setSaving(true);
    try {
      if (isNew) {
        if (fromStagiaire) {
          // Conversion d'un stagiaire : PAS de mot de passe → le serveur garde le sien.
          await createMember({ ...form });
          onCreated({ email: form.email.trim(), converted: true });
        } else {
          await createMember({ ...form, password });
          onCreated({ email: form.email.trim(), password });
        }
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
          {isNew && (
            <div className="field">
              <label style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <input type="checkbox" checked={fromStagiaire}
                  onChange={(e) => { setFromStagiaire(e.target.checked); if (!e.target.checked) setStagiaireId(""); }} />
                Ajouter depuis un stagiaire existant
              </label>
              {fromStagiaire && (
                <>
                  <select className="inp" style={{ marginTop: 6 }} value={stagiaireId}
                    onChange={(e) => {
                      const id = e.target.value; setStagiaireId(id);
                      const s = (stagiaires || []).find((x) => String(x.id) === id);
                      if (s) setForm((p) => ({ ...p, first_name: s.first_name || "", last_name: s.last_name || "", email: s.email || "", phone: s.phone || "" }));
                    }}>
                    <option value="">{stagiaires === null ? "Chargement…" : (stagiaires.length ? "Choisir un stagiaire…" : "Aucun stagiaire avec un compte")}</option>
                    {(stagiaires || []).map((s) => (
                      <option key={s.id} value={s.id}>{[s.last_name, s.first_name].filter(Boolean).join(" ")} — {s.email}</option>
                    ))}
                  </select>
                  <span className="sub" style={{ fontSize: 11 }}>Ses informations sont recopiées ci-dessous. Il conserve son mot de passe actuel : aucun nouveau n'est généré.</span>
                </>
              )}
            </div>
          )}
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

          {isNew && !fromStagiaire && (
            <div className="field">
              <label>Mot de passe (généré, affiché une seule fois)</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input className="inp mono" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="btn sm ghost" onClick={() => setPassword(generatePassword())}><Icon name="refresh" size={13} /> Générer</button>
              </div>
            </div>
          )}
          {!isNew && (
            <div className="field">
              <label style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <input type="checkbox" checked={resetPw} onChange={(e) => { setResetPw(e.target.checked); if (e.target.checked && !password) setPassword(generatePassword()); }} />
                Réinitialiser le mot de passe
              </label>
              {resetPw && (
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <input className="inp mono" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="btn sm ghost" onClick={() => setPassword(generatePassword())}><Icon name="refresh" size={14} /></button>
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
