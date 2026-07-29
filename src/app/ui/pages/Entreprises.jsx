import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCompanies, createCompany } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ListePlus from "../components/ListePlus.jsx";
import { Icon } from "../components/Icon.jsx";
import { useListeBornee } from "../lib/listeBornee.js";

/**
 * Entreprises — clients / financeurs de l'organisme. Une entreprise regroupe plusieurs
 * stagiaires (inscription de groupe). Cliquer une entreprise ouvre sa fiche (stagiaires,
 * inscription d'un groupe à une session).
 */
export default function Entreprises() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = () => getCompanies().then((r) => setRows(r.data || [])).catch((e) => setStatus({ type: "error", message: e.message }));
  useEffect(() => { load(); }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((c) => [c.name, c.siret, c.town, c.email, c.representative_name].some((f) => String(f || "").toLowerCase().includes(q)));
  }, [rows, query]);

  // Même mécanisme que /stagiaires — le MÊME, pas un semblable : la page souffrait du même
  // défaut (469 lignes d'un bloc, 49 écrans) et doit hériter de la même correction.
  const { max, borne, reste, plus } = useListeBornee(shown.length, query);

  return (
    <>
      <PageHead eyebrow="Formation" title="Entreprises"
        lead="Les entreprises clientes de l'organisme. Regroupe des stagiaires sous une même entreprise et inscris-les en une fois."
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Nouvelle entreprise</button>} />

      <StatusMessage status={status} />

      {/* La recherche quitte le coin du titre pour prendre la largeur, comme sur /stagiaires :
          sur quatre cent soixante-neuf entreprises, on vient en retrouver UNE. Deux pages qui
          font le même geste doivent se présenter pareil. */}
      <div className="recherche">
        <label className="rech-champ">
          <Icon name="search" size={18} />
          <input autoFocus aria-label="Rechercher une entreprise"
            placeholder="Rechercher une entreprise — nom, SIRET, ville, référent…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button type="button" className="rech-x" onClick={() => setQuery("")} aria-label="Effacer la recherche">
              <Icon name="x" size={15} />
            </button>
          )}
        </label>
      </div>

      <Card title={<span className="card-ttl"><Icon name="building" size={16} /> {shown.length} entreprise{shown.length > 1 ? "s" : ""}{query ? ` sur ${rows.length}` : ""}</span>}>
        {shown.length === 0 ? (
          <EmptyState icon="building">{rows.length === 0 ? "Aucune entreprise. Crée-en une pour inscrire un groupe de stagiaires." : "Aucune entreprise ne correspond à ta recherche."}</EmptyState>
        ) : (
          <>
          <DataTable
            rows={shown.slice(0, max)}
            rowKey={(c) => c.id}
            /* La ligne entière ouvre la fiche : `role`/`tabIndex`/Entrée pour que ce soit vrai
               aussi au clavier — une ligne cliquable à la souris seule est une impasse. */
            rowProps={(c) => ({
              style: { cursor: "pointer" },
              role: "link",
              tabIndex: 0,
              "aria-label": `Ouvrir la fiche de ${c.name}`,
              onClick: () => navigate(`/entreprises/${c.id}`),
              onKeyDown: (e) => { if (e.key === "Enter") navigate(`/entreprises/${c.id}`); },
            })}
            cols={[
              { k: "name", t: "Entreprise", principal: true,
                cell: (c) => <><b>{c.name}</b>{c.email && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{c.email}</span>}</> },
              { k: "siret", t: "SIRET", td: { fontSize: 12 }, cell: (c) => (c.siret ? <span className="mono">{c.siret}</span> : null) },
              { k: "town", t: "Ville", cell: (c) => c.town || null },
              { k: "ref", t: "Référent", cell: (c) => [c.representative_civ, c.representative_name].filter(Boolean).join(" ") || null },
              { k: "nb", t: "Stagiaires", cell: (c) => <Badge tone={c.learner_count > 0 ? "b" : "n"}>{c.learner_count || 0}</Badge> },
              // Le chevron ne sert qu'au mode TABLEAU : en carte, c'est la carte entière qui
              // s'ouvre, et une flèche seule en pied ressemble à un bouton qui ferait autre
              // chose. `sansCarte` la retire — c'est exactement ce marqueur qui manquait.
              { k: "go", t: "", sansCarte: true, td: { textAlign: "right" }, cell: () => <Icon name="chevron-right" size={16} aria-hidden="true" /> },
            ]}
          />
          {borne && <ListePlus montres={max} total={shown.length} reste={reste} onPlus={plus} />}
          </>
        )}
      </Card>

      {creating && <CreateCompanyModal onClose={() => setCreating(false)}
        onCreated={(id) => { setCreating(false); navigate(`/entreprises/${id}`); }}
        onError={(m) => setStatus({ type: "error", message: m })} />}
    </>
  );
}

function CreateCompanyModal({ onClose, onCreated, onError }) {
  const [f, setF] = useState({ name: "", siret: "", address: "", zip_code: "", town: "", email: "", phone: "", representative_civ: "", representative_name: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    if (!f.name.trim()) { onError("Nom de l'entreprise requis."); return; }
    setBusy(true);
    try { const r = await createCompany(f); onCreated(r.data?.id); }
    catch (e) { onError(e.message); setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead"><h3>Nouvelle entreprise</h3><button className="x" onClick={onClose} aria-label="Fermer"><Icon name="x" size={16} /></button></div>
        <div className="mbody">
          <div className="field"><label>Nom de l'entreprise *</label><input className="inp" value={f.name} onChange={set("name")} autoFocus /></div>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="field"><label>SIRET</label><input className="inp" value={f.siret} onChange={set("siret")} /></div>
            <div className="field"><label>Téléphone</label><input className="inp" value={f.phone} onChange={set("phone")} /></div>
          </div>
          <div className="field"><label>Adresse</label><input className="inp" value={f.address} onChange={set("address")} /></div>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="field"><label>Code postal</label><input className="inp" value={f.zip_code} onChange={set("zip_code")} /></div>
            <div className="field"><label>Ville</label><input className="inp" value={f.town} onChange={set("town")} /></div>
          </div>
          <div className="field"><label>E-mail</label><input className="inp" type="email" value={f.email} onChange={set("email")} /></div>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <div className="field"><label>Civilité référent</label>
              <select className="inp" value={f.representative_civ} onChange={set("representative_civ")}><option value="">—</option><option>M.</option><option>Mme</option></select></div>
            <div className="field"><label>Nom du référent</label><input className="inp" value={f.representative_name} onChange={set("representative_name")} /></div>
          </div>
        </div>
        <div className="mfoot">
          <button className="btn ghost" onClick={onClose}>Annuler</button>
          <button className="btn primary" onClick={save} disabled={busy}><Icon name="check" size={15} /> Créer</button>
        </div>
      </div>
    </div>
  );
}
