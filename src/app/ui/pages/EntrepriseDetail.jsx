import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getCompany, updateCompany, registerCompanyStagiaires, getSessions } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";

const CFIELDS = [
  ["name", "Nom de l'entreprise"], ["siret", "SIRET"], ["address", "Adresse"],
  ["zip_code", "Code postal"], ["town", "Ville"], ["email", "E-mail"], ["phone", "Téléphone"],
  ["representative_name", "Nom du référent"], ["representative_role", "Fonction du référent"],
];
const blankRow = () => ({ civility: "", first_name: "", last_name: "", email: "", phone: "" });
const sessLabel = (s) => `${s.program_code || s.program_title} · S${s.week} ${s.year}`;

export default function EntrepriseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [status, setStatus] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);

  // Inscription de groupe
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [rows, setRows] = useState([blankRow()]);
  const [registering, setRegistering] = useState(false);
  const [result, setResult] = useState(null); // { created: [...] }

  function load() {
    getCompany(id).then((r) => { setData(r.data); setForm(r.data || {}); }).catch((e) => setStatus({ type: "error", message: e.message }));
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => { getSessions().then((r) => setSessions(r.data || [])).catch(() => {}); }, []);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  async function saveInfo() {
    setSavingInfo(true); setStatus(null);
    try { await updateCompany(id, form); setStatus({ type: "success", message: "Entreprise enregistrée." }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSavingInfo(false); }
  }

  const setRow = (i, k) => (e) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const addRow = () => setRows((rs) => [...rs, blankRow()]);
  const delRow = (i) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));
  const filled = rows.filter((r) => r.first_name.trim() || r.last_name.trim());

  async function register() {
    if (!filled.length) { setStatus({ type: "error", message: "Ajoute au moins un stagiaire (nom ou prénom)." }); return; }
    setRegistering(true); setStatus(null); setResult(null);
    try {
      const r = await registerCompanyStagiaires(id, { session_id: sessionId || null, stagiaires: filled });
      setResult(r.data);
      setRows([blankRow()]);
      setStatus({ type: "success", message: r.message || "Groupe inscrit." });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setRegistering(false); }
  }

  if (!data) return <StatusMessage status={status || { type: "info", message: "Chargement…" }} />;

  return (
    <>
      <PageHead eyebrow={<button className="eyebrow" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--muted)" }} onClick={() => navigate("/entreprises")}><Icon name="chevron-left" size={13} /> Entreprises</button>}
        title={data.name}
        lead={[data.town, data.siret && `SIRET ${data.siret}`].filter(Boolean).join(" · ")} />

      <StatusMessage status={status} />

      <div className="grid cols-2" style={{ gap: 22, alignItems: "start" }}>
        {/* Inscription de groupe */}
        <Card title={<span className="card-ttl"><Icon name="users" size={16} /> Inscrire un groupe de stagiaires</span>}>
          <p className="hint" style={{ margin: "0 0 12px" }}>Ajoute les stagiaires envoyés par l'entreprise. Ils seront créés en <b>financement professionnel</b>, rattachés à <b>{data.name}</b>, avec un compte de connexion (si e-mail), et inscrits à la session choisie.</p>
          <div className="field"><label>Session (facultatif)</label>
            <select className="inp" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">— Ne pas inscrire à une session pour l'instant —</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{sessLabel(s)}</option>)}
            </select>
          </div>

          <div className="ent-rows">
            <div className="ent-row ent-head">
              <span>Civ.</span><span>Prénom</span><span>Nom</span><span>E-mail</span><span>Tél.</span><span />
            </div>
            {rows.map((r, i) => (
              <div className="ent-row" key={i}>
                <select className="inp" value={r.civility} onChange={setRow(i, "civility")}><option value="">—</option><option>M.</option><option>Mme</option></select>
                <input className="inp" placeholder="Prénom" value={r.first_name} onChange={setRow(i, "first_name")} />
                <input className="inp" placeholder="Nom" value={r.last_name} onChange={setRow(i, "last_name")} />
                <input className="inp" type="email" placeholder="email@…" value={r.email} onChange={setRow(i, "email")} />
                <input className="inp" placeholder="Tél." value={r.phone} onChange={setRow(i, "phone")} />
                <button className="iconbtn del" title="Retirer" onClick={() => delRow(i)}><Icon name="trash" size={15} /></button>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <button className="btn sm ghost" onClick={addRow}><Icon name="plus" size={14} /> Ajouter une ligne</button>
            <button className="btn primary" onClick={register} disabled={registering || !filled.length}>
              <Icon name="check" size={15} /> Inscrire {filled.length || ""} stagiaire{filled.length > 1 ? "s" : ""}
            </button>
          </div>

          {result && result.created && result.created.length > 0 && (
            <div className="ent-result">
              <b style={{ fontSize: 13 }}>✅ {result.created.length} stagiaire(s) inscrit(s)</b>
              <p className="hint" style={{ margin: "4px 0 8px" }}>Note les mots de passe : ils ne seront plus affichés ensuite.</p>
              {result.created.map((c) => (
                <div key={c.learner_id} className="ent-cred">
                  <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b> {c.email && <span className="hint">· {c.email}</span>}</span>
                  {c.password ? <span className="mono ent-pw">{c.password}</span>
                    : <span className="hint">{c.email ? "compte déjà existant" : "pas d'e-mail"}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Stagiaires rattachés */}
          <Card title={<span className="card-ttl"><Icon name="users" size={16} /> Stagiaires ({data.learners?.length || 0})</span>}>
            {(!data.learners || data.learners.length === 0) ? (
              <EmptyState icon="users">Aucun stagiaire rattaché pour l'instant.</EmptyState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {data.learners.map((l) => (
                  <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{[l.civility, l.first_name, l.last_name].filter(Boolean).join(" ")}</b>
                      {l.email && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email}</span>}
                    </span>
                    <Badge tone={l.enrollment_count > 0 ? "b" : "n"}>{l.enrollment_count || 0} dossier{l.enrollment_count > 1 ? "s" : ""}</Badge>
                    <Link className="btn sm ghost" to={`/stagiaires/${l.id}`}>Ouvrir</Link>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Coordonnées de l'entreprise */}
          <Card title={<span className="card-ttl"><Icon name="building" size={16} /> Coordonnées</span>}>
            <div className="grid cols-2" style={{ gap: 12 }}>
              {CFIELDS.map(([k, label]) => (
                <div className="field" key={k} style={{ marginBottom: 0, gridColumn: k === "address" || k === "name" ? "1 / -1" : "auto" }}>
                  <label>{label}</label>
                  {k === "representative_role"
                    ? <input className="inp" value={form[k] || ""} onChange={set(k)} />
                    : <input className="inp" value={form[k] || ""} onChange={set(k)} />}
                </div>
              ))}
            </div>
            <button className="btn primary" onClick={saveInfo} disabled={savingInfo} style={{ marginTop: 14 }}><Icon name="check" size={15} /> Enregistrer</button>
          </Card>
        </div>
      </div>
    </>
  );
}
