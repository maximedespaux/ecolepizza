import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getCompany, updateCompany, deleteCompany, registerCompanyStagiaires, getSessions, getStagiaires,
  detachCompanyLearner, getOpcos, getCompanyParcours, getCompanyLearnerDocuments, createCompanyDocument, createSignLink, documentPdfUrl } from "../api/apiClient.js";
import EnrollmentParcours from "../components/EnrollmentParcours.jsx";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";

const LEGAL_STATUSES = ["SARL", "SAS", "SASU", "EURL", "EI", "Micro / Auto", "SA", "SCI", "Association", "Autre"];
const REP_ROLES = ["Gérant(e)", "Président(e)", "Directeur / Directrice", "Directeur général / Directrice générale", "Chef(fe) d'entreprise", "Responsable formation", "Responsable RH / DRH", "Responsable administratif", "Associé(e)", "Autre"];
const CFIELDS = [
  { k: "name", label: "Nom de l'entreprise", full: true },
  { k: "siret", label: "SIRET" },
  { k: "naf_ape", label: "Code NAF / APE" },
  { k: "legal_status", label: "Forme juridique", type: "select", options: LEGAL_STATUSES },
  { k: "opco", label: "OPCO / financeur", type: "select", dyn: "opco" },
  { k: "address", label: "Adresse", full: true },
  { k: "zip_code", label: "Code postal" },
  { k: "town", label: "Ville" },
  { k: "email", label: "E-mail" },
  { k: "phone", label: "Téléphone" },
  { k: "representative_civ", label: "Civilité du référent", type: "select", options: ["M.", "Mme"] },
  { k: "representative_name", label: "Nom du référent" },
  { k: "representative_role", label: "Fonction du référent", full: true, type: "select", options: REP_ROLES },
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
  const [parcoursRefresh, setParcoursRefresh] = useState(0); // recharge le parcours entreprise
  const [learnerDocs, setLearnerDocs] = useState([]); // docs stagiaires à signer par le représentant
  // Rattacher un stagiaire existant à l'entreprise
  const [attachQ, setAttachQ] = useState("");
  const [attachRes, setAttachRes] = useState([]);
  const [opcoNames, setOpcoNames] = useState([]);
  // Sélection de stagiaires rattachés à inscrire à une session
  const [selected, setSelected] = useState(() => new Set());
  const toggleSel = (lid) => setSelected((prev) => { const n = new Set(prev); n.has(lid) ? n.delete(lid) : n.add(lid); return n; });

  function load() {
    getCompany(id).then((r) => {
      setData(r.data); setForm(r.data || {});
      // Session par défaut = session la plus récente de l'entreprise (pas de sélection manuelle).
      setSessionId((cur) => cur || (r.data?.sessions?.[0]?.id || ""));
    }).catch((e) => setStatus({ type: "error", message: e.message }));
  }
  useEffect(() => { load(); }, [id]);
  useEffect(() => { getSessions().then((r) => setSessions(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { getOpcos().then((r) => setOpcoNames((r.data || []).map((o) => o.name).filter(Boolean))).catch(() => {}); }, []);
  useEffect(() => {
    setLearnerDocs([]);
    if (!sessionId) return;
    getCompanyLearnerDocuments(id, sessionId).then((r) => setLearnerDocs(r.data || [])).catch(() => {});
  }, [id, sessionId, parcoursRefresh]);

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

  // Parcours documentaire entreprise (mêmes actions que la fiche stagiaire).
  async function prepareCompanyDoc(templateSlug) {
    if (!sessionId) return;
    setStatus(null);
    try { await createCompanyDocument(id, { session_id: sessionId, template_slug: templateSlug }); setParcoursRefresh((n) => n + 1); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function openCompanyDoc(docId) {
    try { const url = await documentPdfUrl(docId); window.open(url, "_blank"); }
    catch (e) { setStatus({ type: "error", message: e.message || "Aperçu indisponible." }); }
  }
  async function companySignLink(docId) {
    try {
      const r = await createSignLink(docId, {});
      const url = `${window.location.origin}/signer/${r.data.token}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      setStatus({ type: "success", message: `Lien de signature du représentant copié : ${url}` });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  // Lien de signature d'un document STAGIAIRE : le représentant signe à la place du stagiaire.
  async function learnerSignLink(docId) {
    try {
      const r = await createSignLink(docId, { slot: "stagiaire", label: "Signature du représentant (au nom du stagiaire)" });
      const url = `${window.location.origin}/signer/${r.data.token}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      setStatus({ type: "success", message: `Lien de signature copié : ${url}` });
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  async function saveInfo() {
    setSavingInfo(true); setStatus(null);
    try { await updateCompany(id, form); setStatus({ type: "success", message: "Entreprise enregistrée." }); load(); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSavingInfo(false); }
  }
  async function removeCompany() {
    const n = data?.learners?.length || 0;
    if (!window.confirm(`Supprimer l'entreprise « ${data?.name} » ?\n${n ? `Les ${n} stagiaire(s) rattaché(s) seront détaché(s) (non supprimés).\n` : ""}Cette action est irréversible.`)) return;
    try { await deleteCompany(id); navigate("/entreprises"); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
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
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Coordonnées de l'entreprise */}
          <Card title={<span className="card-ttl"><Icon name="building" size={16} /> Coordonnées</span>}>
            <div className="grid cols-2" style={{ gap: 12 }}>
              {CFIELDS.map(({ k, label, full, type, options, dyn }) => {
                const opts = dyn === "opco" ? opcoNames : (options || []);
                const cur = form[k];
                const allOpts = cur && !opts.includes(cur) ? [cur, ...opts] : opts;
                return (
                <div className="field" key={k} style={{ marginBottom: 0, gridColumn: full ? "1 / -1" : "auto" }}>
                  <label>{label}</label>
                  {type === "select"
                    ? <select className="inp" value={cur || ""} onChange={set(k)}>
                        <option value="">—</option>
                        {allOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    : <input className="inp" value={cur || ""} onChange={set(k)} />}
                </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 10 }}>
              <button className="btn primary" onClick={saveInfo} disabled={savingInfo}><Icon name="check" size={15} /> Enregistrer</button>
              <button className="btn ghost danger" onClick={removeCompany}><Icon name="trash" size={15} /> Supprimer l'entreprise</button>
            </div>
          </Card>
        </div>
      </div>

      {/* Parcours documentaire entreprise (même vue que la fiche stagiaire). */}
      <div style={{ marginTop: 22 }}>
        <Card title={<span className="card-ttl"><Icon name="file-text" size={16} /> Parcours documentaire entreprise</span>}>
          <p className="hint" style={{ margin: "0 0 12px" }}>Documents produits <b>une fois pour le groupe</b> (jeton « Stagiaires »), dans l'ordre du <b>Parcours entreprise</b> de la formation. « Préparer » génère le document, « Lien de signature » permet au représentant de signer.</p>
          {(data.sessions || []).length > 1 && (
            <div className="field" style={{ maxWidth: 360 }}><label>Session</label>
              <select className="inp" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                {data.sessions.map((s) => <option key={s.id} value={s.id}>{`${s.program_code || s.program_title} · S${s.week} ${s.year}`}</option>)}
              </select>
            </div>
          )}
          {!sessionId ? (
            <EmptyState icon="file-text">Aucune session pour cette entreprise. Inscris un groupe à une session ci-dessus.</EmptyState>
          ) : (
            <EnrollmentParcours
              fetcher={() => getCompanyParcours(id, sessionId)}
              resetKey={`${id}:${sessionId}`}
              refresh={parcoursRefresh}
              onPrepare={prepareCompanyDoc}
              onOpenDoc={openCompanyDoc}
              onSignLink={companySignLink}
            />
          )}
        </Card>
      </div>

      {/* Documents des stagiaires à signer par le représentant (à leur place). */}
      {sessionId && (
        <div style={{ marginTop: 22 }}>
          <Card title={<span className="card-ttl"><Icon name="pencil" size={16} /> Signatures stagiaires par le représentant</span>}>
            <p className="hint" style={{ margin: "0 0 12px" }}>Documents des stagiaires du groupe <b>à signer par le représentant</b> de l'entreprise (à leur place). Une fois signé, le stagiaire retrouve <b>sa copie signée</b> dans son espace.</p>
            {learnerDocs.length === 0 ? (
              <EmptyState icon="file-text">Aucun document de stagiaire à signer pour cette session. (Les documents doivent d'abord être générés depuis la fiche stagiaire.)</EmptyState>
            ) : (() => {
              const DS = { A_FAIRE: ["À envoyer", "n"], ENVOYE: ["Envoyé", "a"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé", "g"] };
              const byLearner = new Map();
              for (const d of learnerDocs) {
                if (!byLearner.has(d.learner_id)) byLearner.set(d.learner_id, { name: [d.civility, d.first_name, d.last_name].filter(Boolean).join(" "), list: [] });
                byLearner.get(d.learner_id).list.push(d);
              }
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...byLearner.entries()].map(([lid, g]) => (
                    <div key={lid} className="sess-comp">
                      <div className="sess-comp-hd"><Icon name="user" size={14} /> {g.name} <span className="arch-count">{g.list.length}</span></div>
                      {g.list.map((d) => {
                        const [lbl, tone] = DS[d.status] || [d.status, "n"];
                        return (
                          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border-soft)" }}>
                            <span style={{ flex: 1, minWidth: 0 }}><b>{d.title}</b></span>
                            <Badge tone={tone}>{lbl}</Badge>
                            <button className="btn sm ghost" onClick={() => openCompanyDoc(d.id)}>Aperçu</button>
                            {d.status !== "SIGNE" && <button className="btn sm primary" title="Copier un lien pour que le représentant signe à la place du stagiaire" onClick={() => learnerSignLink(d.id)}>🔗 Lien de signature</button>}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })()}
          </Card>
        </div>
      )}
    </>
  );
}
