import { useContext, useEffect, useState } from "react";
import { getOrganizations, createOrganization } from "../api/apiClient.js";
import { UserContext } from "../context/UserContext.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import DataTable from "../components/DataTable.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Badge from "../components/Badge.jsx";
import { Icon } from "../components/Icon.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

const LOGO = `${import.meta.env.BASE_URL}brand/logo.png`;

// Mot de passe robuste (sans caractères ambigus).
function generatePassword(len = 14) {
  const sets = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%&*?-_"];
  const all = sets.join("");
  const rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  let out = sets.map((s) => s[rnd(s.length)]);
  while (out.length < len) out.push(all[rnd(all.length)]);
  for (let i = out.length - 1; i > 0; i--) { const j = rnd(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out.join("");
}

/** Console plateforme : liste et création d'organismes (revente). */
function Platform() {
  const { logout, user } = useContext(UserContext);
  const [orgs, setOrgs] = useState(null); // `null` = on charge, `[]` = aucun organisme
  const [status, setStatus] = useState(null);
  const [creating, setCreating] = useState(false);
  const [credential, setCredential] = useState(null);

  async function load() {
    try { const { data } = await getOrganizations(); setOrgs(data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="app">
      <div className="main" style={{ marginLeft: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--border-soft)" }}>
          <img src={LOGO} alt="" style={{ width: 34, height: 34, borderRadius: 8 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Impastio · Plateforme</div>
            <div style={{ fontSize: 12, color: "var(--dim)" }}>{user?.email}</div>
          </div>
          <button className="btn sm ghost" onClick={logout}>Déconnexion</button>
        </div>

        <main className="content">
          <PageHead
            eyebrow="Plateforme"
            title="Organismes"
            lead="Créez un nouvel organisme et son premier administrateur, ou consultez les organismes existants. Chaque organisme est isolé et possède son propre code de connexion."
            actions={<button className="btn primary" onClick={() => setCreating(true)}>＋ Nouvel organisme</button>}
          />
          <StatusMessage status={status} />

          {credential && (
            <Card title="Identifiants du premier administrateur">
              <p className="sub" style={{ marginTop: 0 }}>
                Communiquez ces identifiants au client. <b>Le mot de passe ne sera plus affiché.</b>
              </p>
              <div className="cred-box">
                <div><span className="cred-k">Code organisme</span><span className="mono">{credential.code}</span></div>
                <div><span className="cred-k">E-mail</span><span className="mono">{credential.email}</span></div>
                <div><span className="cred-k">Mot de passe</span><span className="mono">{credential.password}</span></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn sm" onClick={() => navigator.clipboard?.writeText(
                  `Code organisme : ${credential.code}\nE-mail : ${credential.email}\nMot de passe : ${credential.password}`
                )}>Copier</button>
                <button className="btn sm ghost" onClick={() => setCredential(null)}>J'ai noté, masquer</button>
              </div>
            </Card>
          )}

          <Card title={`Organismes${orgs ? ` (${orgs.length})` : ""}`}>
            <DataTable
              rows={orgs}
              rowKey={(o) => o.id}
              vide={<EmptyState icon="building" title="Aucun organisme"
                text="Aucune école n'est encore déclarée sur cette instance." />}
              cols={[
                { k: "nom", t: "Organisme", principal: true,
                  cell: (o) => <><b>{o.legal_name}</b>{o.short_name && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{o.short_name}</span>}</> },
                { k: "code", t: "Code", cell: (o) => <Badge tone="b">{o.code || "-"}</Badge> },
                { k: "ville", t: "Ville", td: { fontSize: 13, color: "var(--muted)" }, cell: (o) => o.town || "-" },
                { k: "users", t: "Comptes", cell: (o) => <span className="chiffres">{o.users}</span> },
                { k: "learners", t: "Stagiaires", cell: (o) => <span className="chiffres">{o.learners}</span> },
                { k: "cree", t: "Créé le", td: { fontSize: 13, color: "var(--muted)" }, cell: (o) => o.created_at },
              ]}
            />
          </Card>
        </main>
      </div>

      {creating && (
        <OrgModal
          onClose={() => setCreating(false)}
          onError={(m) => setStatus({ type: "error", message: m })}
          onCreated={(cred) => { setCreating(false); setCredential(cred); setStatus({ type: "success", message: "Organisme créé." }); load(); }}
        />
      )}
    </div>
  );
}

function OrgModal({ onClose, onError, onCreated }) {
  const [form, setForm] = useState({
    legal_name: "", short_name: "", code: "",
    first_name: "", last_name: "", email: "", password: generatePassword(),
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!form.legal_name.trim()) { onError("Nom de l'organisme requis."); return; }
    if (!form.code.trim()) { onError("Code organisme requis."); return; }
    if (!form.email.trim()) { onError("E-mail de l'administrateur requis."); return; }
    setSaving(true);
    try {
      const { data } = await createOrganization({
        legal_name: form.legal_name, short_name: form.short_name, code: form.code,
        admin: { first_name: form.first_name, last_name: form.last_name, email: form.email, password: form.password },
      });
      onCreated({ code: data.organization.code, email: data.admin.email, password: data.admin.password });
    } catch (e) { onError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>Nouvel organisme</h3>
          <button className="x" onClick={onClose} aria-label="Fermer">×</button>
        </div>
        <div className="mbody">
          <div className="row2">
            <div className="field"><label>Raison sociale</label>
              <input className="inp" value={form.legal_name} onChange={set("legal_name")} placeholder="École Pizza Bordeaux" /></div>
            <div className="field"><label>Nom court</label>
              <input className="inp" value={form.short_name} onChange={set("short_name")} placeholder="EPB" /></div>
          </div>
          <div className="field"><label>Code organisme (connexion)</label>
            <input className="inp mono" value={form.code} onChange={set("code")} placeholder="EPB33" />
            <span className="sub" style={{ fontSize: 11 }}>Majuscules, chiffres et tirets. Communiqué aux utilisateurs pour se connecter.</span>
          </div>
          <div className="divider" />
          <h3 style={{ fontSize: 15, margin: "0 0 6px" }}>Premier administrateur</h3>
          <div className="row2">
            <div className="field"><label>Prénom</label>
              <input className="inp" value={form.first_name} onChange={set("first_name")} /></div>
            <div className="field"><label>Nom</label>
              <input className="inp" value={form.last_name} onChange={set("last_name")} /></div>
          </div>
          <div className="field"><label>E-mail (identifiant)</label>
            <input className="inp" type="email" value={form.email} onChange={set("email")} placeholder="admin@organisme.fr" /></div>
          <div className="field"><label>Mot de passe (affiché une seule fois)</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="inp mono" value={form.password} onChange={set("password")} />
              <button type="button" className="btn sm ghost" onClick={() => setForm((p) => ({ ...p, password: generatePassword() }))}><Icon name="refresh" size={13} /> Générer</button>
            </div>
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Création…" : "Créer l'organisme"}</button>
        </div>
      </div>
    </div>
  );
}

export default Platform;
