import { useEffect, useRef, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import { Link } from "react-router-dom";
import { getStagiaires, resetStagiairePassword, deleteStagiaire, deleteStagiaireAccount, getOpcos, getFormations } from "../api/apiClient.js";
import { OPCOS } from "../lib/opco.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import EditStagiaireModal from "../components/EditStagiaireModal.jsx";
import { initials } from "../lib/format.js";
import { colorForLevel, setBadgeColors } from "../lib/levels.js";

const STATUTS = ["En activité", "Demandeur d'emploi", "Sans activité", "Étudiant", "Retraité", "Autre"];

function Stagiaires() {
  const [learners, setLearners] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null);
  const [editId, setEditId] = useState(undefined); // undefined = fermé, null = nouveau, id = édition
  const [opcos, setOpcos] = useState([]);
  const [formations, setFormations] = useState([]);
  const [filters, setFilters] = useState({ level: [], financing: "", status: "", opco: "", account: "" });
  const [badgeOpen, setBadgeOpen] = useState(false);
  const badgeRef = useRef(null);
  useEffect(() => {
    if (!badgeOpen) return;
    const close = (e) => { if (badgeRef.current && !badgeRef.current.contains(e.target)) setBadgeOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [badgeOpen]);
  const toggleBadgeFilter = (code) =>
    setFilters((f) => ({ ...f, level: f.level.includes(code) ? f.level.filter((x) => x !== code) : [...f.level, code] }));

  // Codes de formation (badges attribuables) + couleur associée.
  useEffect(() => {
    getFormations().then((r) => {
      const list = r.data || [];
      setFormations(list);
      const map = {};
      for (const f of list) if (f.color) { if (f.code) map[f.code] = f.color; if (f.level) map[f.level] = f.color; }
      setBadgeColors(map);
    }).catch(() => {});
  }, []);
  const codeColor = (code) => {
    const f = formations.find((x) => x.code === code);
    return (f && f.color) || colorForLevel(code);
  };

  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const clearFilters = () => setFilters({ level: [], financing: "", status: "", opco: "", account: "" });
  const activeFilters = (filters.level.length ? 1 : 0) + [filters.financing, filters.status, filters.opco, filters.account].filter(Boolean).length;

  const badgeOptions = [...new Set([
    ...formations.map((f) => f.code).filter(Boolean),
    ...learners.flatMap((l) => (l.levels || "").split(",").map((s) => s.trim()).filter(Boolean)),
  ])];

  // Filtrage local (en plus de la recherche texte serveur) sur les infos du stagiaire.
  const filtered = learners.filter((l) => {
    const badges = (l.levels || "").split(",").map((s) => s.trim());
    if (filters.level.length && !filters.level.some((b) => badges.includes(b))) return false;
    if (filters.financing && (l.financing || "PARTICULIER") !== filters.financing) return false;
    if (filters.status && l.professional_status !== filters.status) return false;
    if (filters.opco && l.opco !== filters.opco) return false;
    if (filters.account === "yes" && !l.has_account) return false;
    if (filters.account === "no" && l.has_account) return false;
    return true;
  });

  useEffect(() => { getOpcos().then((r) => setOpcos(r.data || [])).catch(() => {}); }, []);
  const opcoNames = opcos.length ? opcos.filter((o) => o.active).map((o) => o.name) : OPCOS;


  async function removeLearner(l) {
    if (!window.confirm(`Supprimer définitivement le stagiaire ${l.first_name} ${l.last_name} ?\nSes dossiers et documents seront également supprimés. Cette action est irréversible.`)) return;
    setStatus(null);
    try {
      await deleteStagiaire(l.id);
      setStatus({ type: "success", message: "Stagiaire supprimé." });
      load(query);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Réinitialise le mot de passe (ou CRÉE le compte s'il n'existe pas encore).
  async function resetPassword(l) {
    setStatus(null);
    try {
      const r = await resetStagiairePassword(l.id);
      setStatus({ type: "success", message: `${l.has_account ? "Nouveau mot de passe" : "Compte créé — mot de passe"} : ${r.password}` });
      load(query);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Supprime UNIQUEMENT le compte de connexion (la fiche est conservée).
  async function removeAccount(l) {
    if (!window.confirm(`Supprimer le compte de connexion de ${l.first_name} ${l.last_name} ?\nLa fiche, les dossiers et documents sont conservés ; seul l'accès à l'application est retiré.`)) return;
    setStatus(null);
    try {
      await deleteStagiaireAccount(l.id);
      setStatus({ type: "success", message: "Compte de connexion supprimé (fiche conservée)." });
      load(query);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  async function load(q = "") {
    try {
      const response = await getStagiaires(q);
      setLearners(response.data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  // Recherche en direct (debounce) — relance à chaque frappe.
  useEffect(() => {
    const t = setTimeout(() => load(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const openNew = () => setEditId(null);
  const openEdit = (id) => setEditId(id);
  const isOpen = editId !== undefined;

  return (
    <>
      <PageHead
        eyebrow="CRM"
        title="Stagiaires"
        lead="Fiche d'expression du stagiaire : contact, parcours, statut, projet."
        actions={
          <button className="btn primary" onClick={openNew}>＋ Nouveau stagiaire</button>
        }
      />
      <StatusMessage status={status} />

      <div className="searchbar">
        <input
          className="inp"
          placeholder="Rechercher un stagiaire (nom, prénom ou email)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "10px 0 4px" }}>
        <span ref={badgeRef} style={{ position: "relative" }}>
          <button type="button" className="inp" style={{ cursor: "pointer", textAlign: "left", minWidth: 160, maxWidth: 220 }}
            onClick={() => setBadgeOpen((o) => !o)}>
            {filters.level.length ? `Badges (${filters.level.length})` : "Tous les badges"} <Icon name="chevron-down" size={13} style={{ verticalAlign: "-2px" }} />
          </button>
          {badgeOpen && (
            <div style={{
              position: "absolute", top: "100%", left: 0, zIndex: 40, marginTop: 4, minWidth: 200, maxHeight: 280, overflowY: "auto",
              padding: 6, background: "var(--panel, #fff)", border: "1px solid var(--line, #e3e3e6)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.16)",
            }}>
              {badgeOptions.length === 0 ? (
                <div style={{ padding: "8px", fontSize: 12, color: "var(--muted)" }}>Aucun badge.</div>
              ) : badgeOptions.map((code) => (
                <label key={code} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", cursor: "pointer", borderRadius: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={filters.level.includes(code)} onChange={() => toggleBadgeFilter(code)} />
                  <i style={{ width: 11, height: 11, borderRadius: "50%", background: codeColor(code), display: "inline-block" }} /> {code}
                </label>
              ))}
              {filters.level.length > 0 && (
                <button type="button" className="btn sm ghost" style={{ width: "100%", marginTop: 4 }}
                  onClick={() => setFilters((f) => ({ ...f, level: [] }))}>Tout décocher</button>
              )}
            </div>
          )}
        </span>
        <select className="inp" style={{ maxWidth: 190 }} value={filters.financing} onChange={setFilter("financing")}>
          <option value="">Tout financement</option>
          <option value="PARTICULIER">Particulier</option>
          <option value="PROFESSIONNEL">Professionnel</option>
        </select>
        <select className="inp" style={{ maxWidth: 190 }} value={filters.status} onChange={setFilter("status")}>
          <option value="">Tout statut</option>
          {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="inp" style={{ maxWidth: 190 }} value={filters.opco} onChange={setFilter("opco")}>
          <option value="">Tout OPCO</option>
          {opcoNames.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="inp" style={{ maxWidth: 190 }} value={filters.account} onChange={setFilter("account")}>
          <option value="">Tout compte</option>
          <option value="yes">Avec compte</option>
          <option value="no">Sans compte</option>
        </select>
        {activeFilters > 0 && (
          <button type="button" className="btn sm ghost" onClick={clearFilters}><Icon name="x" size={13} /> Effacer les filtres ({activeFilters})</button>
        )}
      </div>


      <Card title={`Liste (${filtered.length}${activeFilters ? ` / ${learners.length}` : ""})`}>
        {filtered.length === 0 ? (
          <EmptyState>{learners.length === 0 ? "Aucun stagiaire pour le moment." : "Aucun stagiaire ne correspond aux filtres."}</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((l) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <Link to={`/stagiaires/${l.id}`} className="rowlink" title="Ouvrir le dossier (workflow documents)"
                  style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, color: "inherit" }}>
                  <span className="avatar">{initials(l.first_name, l.last_name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.last_name} {l.first_name}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email || "—"} · {l.phone || "—"}</span>
                  </span>
                </Link>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end", maxWidth: 300 }}>
                  {(l.levels || "").split(",").map((s) => s.trim()).filter(Boolean).map((lv) => (
                    <span key={lv} className="lvl-chip" title={lv} style={{ background: codeColor(lv) }}>{lv}</span>
                  ))}
                </span>
                {l.professional_status && <Badge tone="n">{l.professional_status}</Badge>}
                {l.has_account ? (
                  <>
                    <button type="button" className="iconbtn" title="Réinitialiser le mot de passe" aria-label={`Réinitialiser le mot de passe de ${l.last_name} ${l.first_name}`} onClick={() => resetPassword(l)}><Icon name="key" size={15} /></button>
                    <button type="button" className="iconbtn" title="Supprimer le compte de connexion (fiche conservée)"
                      aria-label={`Supprimer le compte de ${l.first_name} ${l.last_name}`} onClick={() => removeAccount(l)}><Icon name="ban" size={16} /></button>
                  </>
                ) : (
                  <button type="button" className="btn sm ghost" title="Créer un compte de connexion pour ce stagiaire" onClick={() => resetPassword(l)}>＋ Compte</button>
                )}
                <button
                  type="button"
                  className="iconbtn"
                  title="Modifier le stagiaire"
                  aria-label={`Modifier ${l.first_name} ${l.last_name}`}
                  onClick={() => openEdit(l.id)}
                >
                  <Icon name="pencil" size={15} />
                </button>
                <button
                  type="button"
                  className="iconbtn del"
                  title="Supprimer le stagiaire"
                  aria-label={`Supprimer ${l.first_name} ${l.last_name}`}
                  onClick={() => removeLearner(l)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isOpen && (
        <EditStagiaireModal
          id={editId}
          onClose={() => setEditId(undefined)}
          onSaved={(msg) => { setEditId(undefined); setStatus({ type: "success", message: msg }); load(query); }}
          onError={(m) => setStatus({ type: "error", message: m })}
        />
      )}
    </>
  );
}

export default Stagiaires;
