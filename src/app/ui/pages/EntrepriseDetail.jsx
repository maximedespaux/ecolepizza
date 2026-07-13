import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getCompany, updateCompany, registerCompanyStagiaires, getSessions, getStagiaires,
  getCompanyDocTemplates, getCompanyDocuments, createCompanyDocument, sendDocument, documentPdfUrl, createSignLink, detachCompanyLearner } from "../api/apiClient.js";
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
  const [registering, setRegistering] = useState(false);
  const [result, setResult] = useState(null); // { created: [...] }
  // Documents « entreprise »
  const [docSession, setDocSession] = useState("");
  const [docTemplates, setDocTemplates] = useState([]);
  const [companyDocs, setCompanyDocs] = useState([]);
  const [pickTpl, setPickTpl] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  // Rattacher un stagiaire existant à l'entreprise
  const [attachQ, setAttachQ] = useState("");
  const [attachRes, setAttachRes] = useState([]);
  // Sélection de stagiaires rattachés à inscrire à une session
  const [selected, setSelected] = useState(() => new Set());
  const toggleSel = (lid) => setSelected((prev) => { const n = new Set(prev); n.has(lid) ? n.delete(lid) : n.add(lid); return n; });

  function load() {
    getCompany(id).then((r) => { setData(r.data); setForm(r.data || {}); }).catch((e) => setStatus({ type: "error", message: e.message }));
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => { getSessions().then((r) => setSessions(r.data || [])).catch(() => {}); }, []);

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

  // Rattacher des stagiaires existants à l'entreprise (recherche débattue).
  useEffect(() => {
    const term = attachQ.trim();
    if (!term) { setAttachRes([]); return; }
    const t = setTimeout(() => {
      getStagiaires(term).then((r) => {
        const attached = new Set((data?.learners || []).map((l) => l.id));
        setAttachRes((r.data || []).filter((s) => !attached.has(s.id)).slice(0, 8));
      }).catch(() => setAttachRes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [attachQ, data]);

  async function attachExisting(s) {
    setStatus(null);
    try { await registerCompanyStagiaires(id, { learner_ids: [s.id] }); setAttachQ(""); setAttachRes([]); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function enrollSession() {
    if (!sessionId) { setStatus({ type: "error", message: "Choisis une session." }); return; }
    const ids = (data?.learners || []).map((l) => l.id).filter((lid) => selected.has(lid));
    if (!ids.length) { setStatus({ type: "error", message: "Sélectionne au moins un stagiaire." }); return; }
    setRegistering(true); setStatus(null); setResult(null);
    try {
      const r = await registerCompanyStagiaires(id, { session_id: sessionId, learner_ids: ids });
      setResult(r.data);
      const n = (r.data?.created || []).filter((c) => c.enrolled).length;
      setStatus({ type: "success", message: n ? `${n} stagiaire(s) ajouté(s) à la session.` : "Aucun nouveau stagiaire à ajouter (déjà inscrits)." });
      load();
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setRegistering(false); }
  }
  async function detach(learnerId) {
    if (!window.confirm("Détacher ce stagiaire de l'entreprise ?")) return;
    try { await detachCompanyLearner(id, learnerId); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  async function saveInfo() {
    setSavingInfo(true); setStatus(null);
    try { await updateCompany(id, form); setStatus({ type: "success", message: "Entreprise enregistrée." }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSavingInfo(false); }
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
          <p className="hint" style={{ margin: "0 0 12px" }}>Rattache des stagiaires <b>existants</b> à <b>{data.name}</b>, puis inscris tout le groupe à une session en un clic.</p>

          {/* Rattacher un stagiaire existant à l'entreprise */}
          <div className="field" style={{ position: "relative" }}><label>Rattacher un stagiaire</label>
            <span className="gs-search">
              <span aria-hidden style={{ fontSize: 13, opacity: 0.6 }}>🔍</span>
              <input placeholder="Rechercher un stagiaire déjà enregistré…" value={attachQ} onChange={(e) => setAttachQ(e.target.value)} />
              {attachQ && <button className="gs-clear" onClick={() => { setAttachQ(""); setAttachRes([]); }}><Icon name="x" size={13} /></button>}
            </span>
            {attachRes.length > 0 && (
              <div className="cat-pop" style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 5, marginTop: 4 }}>
                {attachRes.map((s) => (
                  <div key={s.id} className="cat-opt" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b>{[s.first_name, s.last_name].filter(Boolean).join(" ")}</b>{s.email && <span className="hint"> · {s.email}</span>}
                    </span>
                    <button type="button" className="btn sm primary" title="Rattacher à l'entreprise" onClick={() => attachExisting(s)}><Icon name="plus" size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="field"><label>Session</label>
            <select className="inp" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
              <option value="">— Choisir une session —</option>
              {sessions.map((s) => <option key={s.id} value={s.id}>{sessLabel(s)}</option>)}
            </select>
          </div>

          {/* Stagiaires rattachés */}
          <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", margin: "4px 0 6px" }}>Stagiaires rattachés ({data.learners?.length || 0})</label>
          {(!data.learners || data.learners.length === 0) ? (
            <EmptyState icon="users">Aucun stagiaire rattaché pour l'instant.</EmptyState>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 12 }}>
              {data.learners.map((l) => (
                <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--border-soft)", cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSel(l.id)} title="Sélectionner pour la session" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{[l.civility, l.first_name, l.last_name].filter(Boolean).join(" ")}</b>
                    {l.email && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email}</span>}
                  </span>
                  <Badge tone={l.enrollment_count > 0 ? "b" : "n"}>{l.enrollment_count || 0} dossier{l.enrollment_count > 1 ? "s" : ""}</Badge>
                  <Link className="btn sm ghost" to={`/stagiaires/${l.id}`}>Ouvrir</Link>
                  <button className="btn sm ghost" title="Détacher de l'entreprise" onClick={(e) => { e.preventDefault(); detach(l.id); }}><Icon name="x" size={14} /></button>
                </label>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn primary" onClick={enrollSession} disabled={registering || !sessionId || selected.size === 0}>
              <Icon name="check" size={15} /> Ajouter la sélection à la session
            </button>
          </div>

          {result && result.created && result.created.length > 0 && (
            <div className="ent-result">
              <b style={{ fontSize: 13 }}>✅ {result.created.filter((c) => c.enrolled).length} stagiaire(s) ajouté(s) à la session</b>
              {result.created.map((c) => (
                <div key={c.learner_id} className="ent-cred">
                  <span style={{ flex: 1, minWidth: 0 }}><b>{c.name}</b> {c.email && <span className="hint">· {c.email}</span>}</span>
                  <span className="hint">{c.enrolled ? "inscrit" : "déjà inscrit"}</span>
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
