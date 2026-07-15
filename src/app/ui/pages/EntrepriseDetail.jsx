import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getCompany, updateCompany, deleteCompany, registerCompanyStagiaires, getSessions, getStagiaires,
  detachCompanyLearner, getOpcos, getCompanyParcours, getCompanyLearnerDocuments, createCompanyDocument, getCompanyDocTemplates, listCompanyDocuments, sendDocument, deleteDocument, generateGroupDocuments, createSignLink, documentPdfUrl, createRepresentativeAccount } from "../api/apiClient.js";
import EnrollmentParcours from "../components/EnrollmentParcours.jsx";
import DocumentViewModal from "../components/DocumentViewModal.jsx";
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
const DOC_STATUS = { A_FAIRE: ["Préparé", "n"], ENVOYE: ["Envoyé", "b"], CONSULTE: ["Consulté", "a"], SIGNE: ["Signé", "g"], ARCHIVE: ["Archivé", "n"] };

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
  const [repCreds, setRepCreds] = useState(null); // { email, password } du compte représentant
  // Rattacher un stagiaire existant à l'entreprise
  const [attachQ, setAttachQ] = useState("");
  const [attachRes, setAttachRes] = useState([]);
  const [opcoNames, setOpcoNames] = useState([]);
  // Sélection de stagiaires rattachés à inscrire à une session
  const [selected, setSelected] = useState(() => new Set());
  const toggleSel = (lid) => setSelected((prev) => { const n = new Set(prev); n.has(lid) ? n.delete(lid) : n.add(lid); return n; });
  // Préparer un document de GROUPE (comme la fiche stagiaire) : modèle entreprise +
  // sessions/formations couvertes. Documents de groupe uniquement (pas les stagiaire).
  const [groupTplsBySession, setGroupTplsBySession] = useState({}); // sessionId -> [{slug,label}]
  const [prep, setPrep] = useState({ slug: "", sessionIds: new Set() });
  const [preparing, setPreparing] = useState(false);
  const [companyDocs, setCompanyDocs] = useState([]); // documents entreprise déjà générés
  const [viewId, setViewId] = useState(null); // aperçu d'un document

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
  // Modèles de documents de GROUPE par session de l'entreprise (pour le formulaire).
  const sessionKey = (data?.sessions || []).map((s) => s.id).join(",");
  useEffect(() => {
    const sess = data?.sessions || [];
    if (!sess.length) { setGroupTplsBySession({}); return; }
    Promise.all(sess.map((s) => getCompanyDocTemplates(id, s.id).then((r) => [s.id, r.data || []]).catch(() => [s.id, []])))
      .then((pairs) => setGroupTplsBySession(Object.fromEntries(pairs)));
    // Par défaut : la session courante est cochée.
    setPrep((p) => (p.sessionIds.size ? p : { ...p, sessionIds: new Set(sessionId ? [sessionId] : []) }));
  }, [id, sessionKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Documents « entreprise » déjà générés (rafraîchis après génération/envoi/suppression).
  useEffect(() => {
    listCompanyDocuments(id).then((r) => setCompanyDocs(r.data || [])).catch(() => setCompanyDocs([]));
  }, [id, parcoursRefresh]);

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

  // Parcours documentaire du groupe : génère un document pour tout le groupe.
  //  · document de groupe (company_level) → un doc par OPCO ;
  //  · sinon → un doc par stagiaire concerné, puis envoi (le stagiaire signe dans son espace).
  async function prepareCompanyDoc(slug, step) {
    if (!sessionId) return;
    setStatus(null);
    try {
      if (step && step.company_level) await createCompanyDocument(id, { session_id: sessionId, template_slug: slug });
      else await generateGroupDocuments(id, { session_id: sessionId, slug, send: true });
      setStatus({ type: "success", message: "Documents préparés pour le groupe." });
      setParcoursRefresh((n) => n + 1);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  // Modèles couverts par les sessions cochées (union, dédupliqué par slug).
  const coveredTpls = (() => {
    const map = new Map();
    for (const sid of prep.sessionIds) for (const t of (groupTplsBySession[sid] || [])) if (!map.has(t.slug)) map.set(t.slug, t);
    return [...map.values()];
  })();
  const togglePrepSession = (sid) => setPrep((p) => { const n = new Set(p.sessionIds); n.has(sid) ? n.delete(sid) : n.add(sid); return { ...p, sessionIds: n }; });
  // Génère le document de groupe pour chaque session cochée qui le propose.
  async function prepareGroupDoc(ev) {
    ev.preventDefault();
    if (!prep.slug || prep.sessionIds.size === 0) return;
    setPreparing(true); setStatus(null);
    try {
      let n = 0;
      for (const sid of prep.sessionIds) {
        if (!(groupTplsBySession[sid] || []).some((t) => t.slug === prep.slug)) continue; // pas dans cette formation
        await createCompanyDocument(id, { session_id: sid, template_slug: prep.slug });
        n++;
      }
      setStatus({ type: n ? "success" : "error", message: n ? `Document de groupe préparé (${n} formation(s)).` : "Ce document n'existe pas dans les formations sélectionnées." });
      if (n) { setPrep((p) => ({ ...p, slug: "" })); setParcoursRefresh((k) => k + 1); }
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setPreparing(false); }
  }
  async function openCompanyDoc(docId) {
    try { const url = await documentPdfUrl(docId); window.open(url, "_blank"); }
    catch (e) { setStatus({ type: "error", message: e.message || "Aperçu indisponible." }); }
  }
  async function sendCompanyDoc(docId) {
    setStatus(null);
    try { await sendDocument(docId); setStatus({ type: "success", message: "Document envoyé." }); setParcoursRefresh((n) => n + 1); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  async function deleteCompanyDoc(docId, title, signed) {
    const msg = signed
      ? `Supprimer DÉFINITIVEMENT le document SIGNÉ « ${title || "sans titre"} » ?\nCe document a une valeur légale — sa suppression est irréversible.`
      : `Supprimer le document « ${title || "sans titre"} » ?`;
    if (!window.confirm(msg)) return;
    setStatus(null);
    try { await deleteDocument(docId); setParcoursRefresh((n) => n + 1); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
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
  async function makeRepAccount() {
    if (!window.confirm(`Créer / réinitialiser le compte de connexion du représentant de « ${data?.name} » ?\nUn mot de passe sera généré (affiché une seule fois).`)) return;
    setStatus(null);
    try { const r = await createRepresentativeAccount(id); setRepCreds(r.data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 10, flexWrap: "wrap" }}>
              <button className="btn primary" onClick={saveInfo} disabled={savingInfo}><Icon name="check" size={15} /> Enregistrer</button>
              <button className="btn ghost danger" onClick={removeCompany}><Icon name="trash" size={15} /> Supprimer l'entreprise</button>
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 6 }}>Compte représentant (signature en ligne)</label>
              <p className="hint" style={{ margin: "0 0 8px" }}>Donne au référent un accès pour <b>signer lui-même</b> les documents entreprise. Nécessite l'e-mail de l'entreprise.</p>
              <button className="btn sm ghost" onClick={makeRepAccount} disabled={!form.email}><Icon name="key" size={14} /> {data.user_id ? "Réinitialiser le compte représentant" : "Créer le compte représentant"}</button>
              {repCreds && (
                <div className="ent-result" style={{ marginTop: 10 }}>
                  {repCreds.linked ? (
                    <>
                      <b style={{ fontSize: 13 }}>✅ Accès entreprise rattaché</b>
                      <p className="hint" style={{ margin: "4px 0 0" }}>Cet e-mail correspond déjà à un compte existant ({repCreds.existing_role === "STAGIAIRE" || !repCreds.existing_role ? "stagiaire" : "membre de l'équipe"}). Il conserve sa connexion habituelle et gagne l'onglet <b>Entreprise</b> pour signer les documents.</p>
                    </>
                  ) : (
                    <>
                      <b style={{ fontSize: 13 }}>✅ Compte représentant prêt</b>
                      <p className="hint" style={{ margin: "4px 0 8px" }}>Note ces identifiants : le mot de passe ne sera plus affiché.</p>
                      <div className="ent-cred"><span style={{ flex: 1 }}><b>E-mail</b></span><span className="mono ent-pw">{repCreds.email}</span></div>
                      <div className="ent-cred"><span style={{ flex: 1 }}><b>Mot de passe</b></span><span className="mono ent-pw">{repCreds.password}</span></div>
                    </>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Parcours documentaire COMPLET du groupe (même style que la fiche stagiaire). */}
      <div style={{ marginTop: 22 }}>
        <Card title={<span className="card-ttl"><Icon name="file-text" size={16} /> Parcours documentaire du groupe</span>}>
          <p className="hint" style={{ margin: "0 0 12px" }}>Le parcours <b>complet</b> du groupe (comme la fiche stagiaire). « Générer » produit le document pour <b>tous les stagiaires concernés</b> et l'envoie : le <b>stagiaire</b> signe dans son espace, l'<b>entreprise</b> dans l'espace entreprise, l'<b>organisme</b> contresigne automatiquement. Les documents de groupe (🏢) sont produits une fois par OPCO.</p>
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

      {/* Préparer un document de GROUPE (comme la fiche stagiaire). */}
      <div style={{ marginTop: 22 }}>
        <Card title={<span className="card-ttl"><Icon name="file-text" size={16} /> Préparer un document</span>}>
          <p className="hint" style={{ margin: "0 0 12px" }}>Génère un <b>document de groupe</b> (🏢) pour l'entreprise. Les documents propres au <b>stagiaire</b> se génèrent depuis sa fiche.</p>
          {(data.sessions || []).length === 0 ? (
            <EmptyState icon="file-text">Aucune session pour cette entreprise. Inscris un groupe à une session ci-dessus.</EmptyState>
          ) : (
            <form onSubmit={prepareGroupDoc}>
              <div className="field">
                <label>Modèle de document (groupe)</label>
                <select className="inp" value={prep.slug} onChange={(e) => setPrep((p) => ({ ...p, slug: e.target.value }))}>
                  <option value="">{coveredTpls.length ? "— Choisir un document —" : "— Aucun document de groupe disponible —"}</option>
                  {coveredTpls.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Formations couvertes (une génération par formation cochée)</label>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {(data.sessions || []).map((s) => {
                    const checked = prep.sessionIds.has(s.id);
                    const tplCount = (groupTplsBySession[s.id] || []).length;
                    return (
                      <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border-soft)", cursor: "pointer" }}>
                        <input type="checkbox" checked={checked} onChange={() => togglePrepSession(s.id)} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <b>{s.program_code || s.program_title}</b>
                          <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{s.program_title} · S{s.week} {s.year}</span>
                        </span>
                        <Badge tone={tplCount ? "b" : "n"}>{tplCount} doc{tplCount > 1 ? "s" : ""} groupe</Badge>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button type="submit" className="btn primary" disabled={preparing || !prep.slug || prep.sessionIds.size === 0}>
                  <Icon name="file-text" size={15} /> Générer le document
                </button>
                {prep.sessionIds.size === 0 && <span className="hint">Sélectionne au moins une formation.</span>}
              </div>
            </form>
          )}

          {/* Documents entreprise déjà générés : aperçu / envoi / suppression. */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border-soft)" }}>
            {companyDocs.length === 0 ? (
              <p className="hint" style={{ margin: 0 }}>Aucun document entreprise préparé.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {companyDocs.map((d) => {
                  const [label, tone] = DOC_STATUS[d.status] || [d.status, "n"];
                  return (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b>{d.title}</b>
                        <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                          {d.created_at ? `préparé le ${d.created_at}` : ""}{d.sent_at ? ` · envoyé le ${d.sent_at}` : ""}
                        </span>
                      </span>
                      <Badge tone={tone}>{label}</Badge>
                      <button className="iconbtn" title="Aperçu / vérifier" onClick={() => setViewId(d.id)}><Icon name="eye" size={16} /></button>
                      {d.status === "A_FAIRE" && <button className="iconbtn" title="Envoyer (à l'entreprise)" onClick={() => sendCompanyDoc(d.id)}><Icon name="send" size={16} /></button>}
                      <button className="iconbtn del" title={d.status === "SIGNE" ? "Supprimer (document signé)" : "Supprimer"} onClick={() => deleteCompanyDoc(d.id, d.title, d.status === "SIGNE")}><Icon name="trash" size={15} /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

      {viewId && <DocumentViewModal id={viewId} onClose={() => setViewId(null)} />}
    </>
  );
}
