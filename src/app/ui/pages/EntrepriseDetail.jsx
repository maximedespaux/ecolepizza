import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getCompany, updateCompany, registerCompanyStagiaires, getSessions, getStagiaires,
  getCompanyDocTemplates, getCompanyDocuments, createCompanyDocument, sendDocument, documentPdfUrl, createSignLink } from "../api/apiClient.js";
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
  // Sélection de stagiaires EXISTANTS
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState([]); // [{ id, name, email }]
  // Documents « entreprise »
  const [docSession, setDocSession] = useState("");
  const [docTemplates, setDocTemplates] = useState([]);
  const [companyDocs, setCompanyDocs] = useState([]);
  const [pickTpl, setPickTpl] = useState("");
  const [genBusy, setGenBusy] = useState(false);

  function load() {
    getCompany(id).then((r) => { setData(r.data); setForm(r.data || {}); }).catch((e) => setStatus({ type: "error", message: e.message }));
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => { getSessions().then((r) => setSessions(r.data || [])).catch(() => {}); }, []);
  // Recherche de stagiaires existants (débattue), en excluant les déjà rattachés / déjà choisis.
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    const t = setTimeout(() => {
      getStagiaires(term).then((r) => {
        const attached = new Set((data?.learners || []).map((l) => l.id));
        const chosen = new Set(picked.map((p) => p.id));
        setResults((r.data || []).filter((s) => !attached.has(s.id) && !chosen.has(s.id)).slice(0, 8));
      }).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, data, picked]);

  const addPicked = (s) => { setPicked((p) => [...p, { id: s.id, name: [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email, email: s.email }]); setQ(""); setResults([]); };
  const removePicked = (id) => setPicked((p) => p.filter((x) => x.id !== id));

  // Documents entreprise : modèles applicables + docs déjà générés pour la session choisie.
  const reloadDocs = () => { if (docSession) getCompanyDocuments(id, docSession).then((r) => setCompanyDocs(r.data || [])).catch(() => {}); };
  useEffect(() => {
    setCompanyDocs([]); setDocTemplates([]); setPickTpl("");
    if (!docSession) return;
    getCompanyDocTemplates(id, docSession).then((r) => setDocTemplates(r.data || [])).catch(() => {});
    getCompanyDocuments(id, docSession).then((r) => setCompanyDocs(r.data || [])).catch(() => {});
  }, [id, docSession]);

  async function generateDoc() {
    if (!pickTpl) return;
    setGenBusy(true); setStatus(null);
    try { await createCompanyDocument(id, { session_id: docSession, template_slug: pickTpl }); setStatus({ type: "success", message: "Document entreprise préparé." }); setPickTpl(""); reloadDocs(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setGenBusy(false); }
  }
  async function sendDoc(docId) {
    try { await sendDocument(docId); setStatus({ type: "success", message: "Document envoyé." }); reloadDocs(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function previewDoc(docId) {
    try { const url = await documentPdfUrl(docId); window.open(url, "_blank"); }
    catch (e) { setStatus({ type: "error", message: e.message || "Aperçu indisponible." }); }
  }
  async function makeSignLink(docId) {
    try {
      const r = await createSignLink(docId, {});
      const url = `${window.location.origin}/signer/${r.data.token}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      setStatus({ type: "success", message: `Lien de signature du représentant copié : ${url}` });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  const DOC_STATUS = { A_FAIRE: ["À envoyer", "n"], ENVOYE: ["Envoyé", "a"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé", "g"] };

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
  const totalToAdd = filled.length + picked.length;

  async function register() {
    if (!totalToAdd) { setStatus({ type: "error", message: "Choisis des stagiaires existants ou saisis-en de nouveaux." }); return; }
    setRegistering(true); setStatus(null); setResult(null);
    try {
      const r = await registerCompanyStagiaires(id, { session_id: sessionId || null, stagiaires: filled, learner_ids: picked.map((p) => p.id) });
      setResult(r.data);
      setRows([blankRow()]); setPicked([]);
      setStatus({ type: "success", message: r.message || "Groupe inscrit." });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setRegistering(false); }
  }

  if (!data) return <StatusMessage status={status || { type: "info", message: "Chargement…" }} />;

  return (
    <>
      <PageHead eyebrow={<button className="eyebrow" style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--muted)", WebkitTextFillColor: "var(--muted)" }} onClick={() => navigate("/entreprises")}><Icon name="chevron-left" size={13} /> Entreprises</button>}
        title={data.name}
        lead={[data.town, data.siret && `SIRET ${data.siret}`].filter(Boolean).join(" · ")} />

      <StatusMessage status={status} />

      <div className="grid cols-2" style={{ gap: 22, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Inscription de groupe */}
        <Card title={<span className="card-ttl"><Icon name="users" size={16} /> Inscrire un groupe de stagiaires</span>}>
          <p className="hint" style={{ margin: "0 0 12px" }}>Rattache des stagiaires <b>existants</b>, ou saisis-en de <b>nouveaux</b>. Tous passent en <b>financement professionnel</b>, rattachés à <b>{data.name}</b> (compte de connexion créé si e-mail), et inscrits à la session choisie.</p>

          {/* Stagiaires existants */}
          <div className="field" style={{ position: "relative" }}><label>Stagiaires existants</label>
            <span className="gs-search">
              <span aria-hidden style={{ fontSize: 13, opacity: 0.6 }}>🔍</span>
              <input placeholder="Rechercher un stagiaire déjà enregistré…" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && <button className="gs-clear" onClick={() => { setQ(""); setResults([]); }}><Icon name="x" size={13} /></button>}
            </span>
            {results.length > 0 && (
              <div className="cat-pop" style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 5, marginTop: 4 }}>
                {results.map((s) => (
                  <button key={s.id} type="button" className="cat-opt" onClick={() => addPicked(s)}>
                    <b>{[s.first_name, s.last_name].filter(Boolean).join(" ")}</b>{s.email && <span className="hint"> · {s.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {picked.length > 0 && (
            <div className="tag-row" style={{ margin: "0 0 12px" }}>
              {picked.map((p) => (
                <span key={p.id} className="picked-chip">{p.name}<button type="button" onClick={() => removePicked(p.id)} title="Retirer"><Icon name="x" size={11} /></button></span>
              ))}
            </div>
          )}

          <div className="field"><label>Session (facultatif)</label>
            <select className="inp" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">— Ne pas inscrire à une session pour l'instant —</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{sessLabel(s)}</option>)}
            </select>
          </div>

          <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", margin: "4px 0 6px" }}>Nouveaux stagiaires</label>
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
            <button className="btn primary" onClick={register} disabled={registering || !totalToAdd}>
              <Icon name="check" size={15} /> Inscrire {totalToAdd || ""} stagiaire{totalToAdd > 1 ? "s" : ""}
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

        {/* Documents entreprise (groupe) */}
        <Card title={<span className="card-ttl"><Icon name="file-text" size={16} /> Documents entreprise</span>}>
          <p className="hint" style={{ margin: "0 0 12px" }}>Documents produits <b>une fois pour le groupe</b> (ils listent tous les stagiaires via le jeton « Stagiaires »). Marque un modèle « Document entreprise » dans <b>Modèles</b> pour qu'il apparaisse ici.</p>
          <div className="field"><label>Session</label>
            <select className="inp" value={docSession} onChange={(e) => setDocSession(e.target.value)}>
              <option value="">— Choisir une session —</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{sessLabel(s)}</option>)}
            </select>
          </div>
          {docSession && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <select className="inp" value={pickTpl} onChange={(e) => setPickTpl(e.target.value)} style={{ flex: 1 }}>
                  <option value="">— Modèle entreprise —</option>
                  {docTemplates.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
                </select>
                <button className="btn primary" disabled={!pickTpl || genBusy} onClick={generateDoc}><Icon name="plus" size={14} /> Générer</button>
              </div>
              {docTemplates.length === 0 && <p className="hint" style={{ margin: "8px 0 0" }}>Aucun modèle « entreprise » applicable à cette session.</p>}

              <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
                {companyDocs.length === 0 ? (
                  <p className="hint" style={{ margin: 0 }}>Aucun document entreprise pour cette session.</p>
                ) : companyDocs.map((d) => {
                  const [lbl, tone] = DOC_STATUS[d.status] || [d.status, "n"];
                  return (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border-soft)" }}>
                      <span style={{ flex: 1, minWidth: 0 }}><b>{d.title}</b></span>
                      <Badge tone={tone}>{lbl}</Badge>
                      <button className="btn sm ghost" onClick={() => previewDoc(d.id)}>Aperçu</button>
                      {d.status !== "SIGNE" && <button className="btn sm ghost" title="Copier un lien pour que le représentant signe" onClick={() => makeSignLink(d.id)}>🔗 Lien signature</button>}
                      {d.status === "A_FAIRE" && <button className="btn sm primary" onClick={() => sendDoc(d.id)}>Envoyer</button>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>
        </div>

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
