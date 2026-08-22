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
import ListePlus from "../components/ListePlus.jsx";
import { initials } from "../lib/format.js";
import { colorForLevel, setBadgeColors } from "../lib/levels.js";
import { useListeBornee } from "../lib/listeBornee.js";

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
  const [filtresOuverts, setFiltresOuverts] = useState(false);
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

  // La clé rassemble tout ce qui change le RÉSULTAT : une nouvelle recherche comme un nouveau
  // filtre doivent ramener la liste à ses cinquante premières.
  const { max, borne, reste, plus } = useListeBornee(filtered.length, query + JSON.stringify(filters));

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
      setStatus({ type: "success", message: `${l.has_account ? "Nouveau mot de passe" : "Compte créé, mot de passe"} : ${r.password}` });
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

      {/* LA RECHERCHE EST LE SUJET DE LA PAGE. On y vient pour retrouver UNE personne, pas pour
          parcourir mille fiches — le champ prend donc toute la largeur et reçoit le curseur à
          l'ouverture : on tape, sans avoir à viser.
          Les cinq filtres se replient derrière un bouton qui porte leur nombre. Ils servent une
          fois sur dix, et occupaient en permanence autant de place que la recherche. */}
      <div className="recherche">
        <label className="rech-champ">
          <Icon name="search" size={18} />
          <input
            autoFocus
            aria-label="Rechercher un stagiaire par nom, prénom ou e-mail"
            placeholder="Rechercher un stagiaire, nom, prénom, e-mail…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="rech-x" onClick={() => setQuery("")} aria-label="Effacer la recherche">
              <Icon name="x" size={15} />
            </button>
          )}
        </label>
        <button type="button" className={"btn rech-filtre" + (activeFilters ? " on" : "")}
          onClick={() => setFiltresOuverts((v) => !v)} aria-expanded={filtresOuverts}>
          <Icon name="sliders" size={15} /> Filtrer{activeFilters ? ` (${activeFilters})` : ""}
        </button>
      </div>

      {/* Rendu conditionnel et non `hidden` : `.filtres` porte un `display:flex` qui l'emporte
          sur le `display:none` de l'attribut, si bien que le panneau restait visible replié.
          Le retirer du document évite au passage d'y laisser cinq listes et leurs options. */}
      {filtresOuverts && (
      <div className="filtres">
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
        <select className="inp" aria-label="Filtrer par financement" style={{ maxWidth: 190 }} value={filters.financing} onChange={setFilter("financing")}>
          <option value="">Tout financement</option>
          <option value="PARTICULIER">Particulier</option>
          <option value="PROFESSIONNEL">Professionnel</option>
        </select>
        <select className="inp" aria-label="Filtrer par statut" style={{ maxWidth: 190 }} value={filters.status} onChange={setFilter("status")}>
          <option value="">Tout statut</option>
          {STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="inp" aria-label="Filtrer par OPCO" style={{ maxWidth: 190 }} value={filters.opco} onChange={setFilter("opco")}>
          <option value="">Tout OPCO</option>
          {opcoNames.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="inp" aria-label="Filtrer par état du compte" style={{ maxWidth: 190 }} value={filters.account} onChange={setFilter("account")}>
          <option value="">Tout compte</option>
          <option value="yes">Avec compte</option>
          <option value="no">Sans compte</option>
        </select>
        {activeFilters > 0 && (
          <button type="button" className="btn sm ghost filtres-fin" onClick={clearFilters}><Icon name="x" size={13} /> Effacer les filtres ({activeFilters})</button>
        )}
      </div>
      )}


      <Card title={`Liste (${filtered.length}${activeFilters ? ` / ${learners.length}` : ""})`}>
        {filtered.length === 0 ? (
          <EmptyState>{learners.length === 0 ? "Aucun stagiaire pour le moment." : "Aucun stagiaire ne correspond aux filtres."}</EmptyState>
        ) : (
          <>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.slice(0, max).map((l) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                <Link to={`/stagiaires/${l.id}`} className="rowlink" title="Ouvrir le dossier (workflow documents)"
                  style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, color: "inherit" }}>
                  <span className="avatar">{initials(l.first_name, l.last_name)}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{l.last_name} {l.first_name}</b>
                    <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{l.email || "-"} · {l.phone || "-"}</span>
                  </span>
                </Link>
                {/* Pastilles de niveau : information SECONDAIRE. Elles s'effacent sous 760 px
                    au profit du nom et des actions — c'est ce qu'on vient chercher dans une
                    liste, et la fiche les rappelle de toute façon. */}
                <span className="niveaux-chips">
                  {(l.levels || "").split(",").map((s) => s.trim()).filter(Boolean).map((lv) => (
                    <span key={lv} className="lvl-chip" title={lv} style={{ background: codeColor(lv) }}>{lv}</span>
                  ))}
                </span>
                {/* `statut-chip` : sans elle, un statut long — « Gérant, Président, en nom
                    propre » — réclamait toute la largeur qu'il voulait et écrasait la colonne
                    du NOM à zéro pixel. Le nom se coupait alors caractère par caractère, sur
                    la seule ligne où la personne dirige une entreprise. Le badge ne grandit
                    plus, se tronque, et garde son texte entier en infobulle. */}
                {l.professional_status && (
                  <Badge tone="n" className="statut-chip" title={l.professional_status}>{l.professional_status}</Badge>
                )}
                {/* Rattaché à une entreprise : petit lien vers sa fiche. `stopPropagation` inutile
                    ici — la ligne n'a pas d'onClick, seul le NOM est un lien voisin. */}
                {l.company_id && (
                  <Link to={`/entreprises/${l.company_id}`} className="iconbtn"
                    title={l.company_name ? `Entreprise : ${l.company_name}` : "Voir l'entreprise"}
                    aria-label={l.company_name ? `Voir l'entreprise ${l.company_name}` : "Voir l'entreprise"}>
                    <Icon name="building" size={15} />
                  </Link>
                )}
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
          {borne && <ListePlus montres={max} total={filtered.length} reste={reste} onPlus={plus} />}
          </>
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
