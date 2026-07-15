import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getCompanies, createCompany } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Icon } from "../components/Icon.jsx";

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

  return (
    <>
      <PageHead eyebrow="Formation" title="Entreprises"
        lead="Les entreprises clientes de l'organisme. Regroupe des stagiaires sous une même entreprise et inscris-les en une fois."
        actions={<button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> Nouvelle entreprise</button>} />

      <StatusMessage status={status} />

      <Card title={<span className="card-ttl"><Icon name="building" size={16} /> {rows.length} entreprise{rows.length > 1 ? "s" : ""}</span>}
        more={<span className="gs-search" style={{ maxWidth: 280 }}>
          <span aria-hidden style={{ fontSize: 13, opacity: 0.6 }}>🔍</span>
          <input placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <button className="gs-clear" onClick={() => setQuery("")}><Icon name="x" size={13} /></button>}
        </span>}>
        {shown.length === 0 ? (
          <EmptyState icon="building">{rows.length === 0 ? "Aucune entreprise. Crée-en une pour inscrire un groupe de stagiaires." : "Aucune entreprise ne correspond à ta recherche."}</EmptyState>
        ) : (
          <div className="tablewrap" style={{ border: "none" }}>
            <table>
              <thead><tr><th>Entreprise</th><th>SIRET</th><th>Ville</th><th>Référent</th><th>Stagiaires</th><th /></tr></thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/entreprises/${c.id}`)}>
                    <td><b>{c.name}</b>{c.email && <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>{c.email}</span>}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{c.siret || "—"}</td>
                    <td>{c.town || "—"}</td>
                    <td>{[c.representative_civ, c.representative_name].filter(Boolean).join(" ") || "—"}</td>
                    <td><Badge tone={c.learner_count > 0 ? "b" : "n"}>{c.learner_count || 0}</Badge></td>
                    <td style={{ textAlign: "right" }}><Icon name="chevron-right" size={16} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
