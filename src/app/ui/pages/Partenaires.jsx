import { useEffect, useState } from "react";
import { getPartenaires, createPartenaire } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import { Field } from "../components/Field.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";

const EMPTY = { name: "", category: "", contact_email: "", website: "" };

function Partenaires() {
  const [partners, setPartners] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState(null);

  async function load() {
    try {
      const response = await getPartenaires();
      setPartners(response.data);
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  useEffect(() => { load(); }, []);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  async function handleCreate(e) {
    e.preventDefault();
    setStatus(null);
    try {
      await createPartenaire(form);
      setForm(EMPTY);
      setStatus({ type: "success", message: "Partenaire ajouté." });
      load();
    } catch (err) {
      setStatus({ type: "error", message: err.message });
    }
  }

  return (
    <>
      <PageHead eyebrow="Réseau" title="Partenaires" lead="L'annuaire des partenaires de l'école." />
      <StatusMessage status={status} />

      <div className="grid cols-2">
        <Card title="Nouveau partenaire">
          <form onSubmit={handleCreate}>
            <div className="row2">
              <Field label="Nom" value={form.name} onChange={update("name")} required />
              <Field label="Catégorie" value={form.category} onChange={update("category")} />
            </div>
            <div className="row2">
              <Field label="Email" type="email" value={form.contact_email} onChange={update("contact_email")} />
              <Field label="Site web" value={form.website} onChange={update("website")} />
            </div>
            <button type="submit" className="btn primary">Ajouter</button>
          </form>
        </Card>

        <Card title={`Annuaire (${partners.length})`}>
          {partners.length === 0 ? (
            <EmptyState icon="🤝">Aucun partenaire.</EmptyState>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {partners.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--border-soft)" }}>
                  <span style={{ flex: 1 }}><b>{p.name}</b></span>
                  {p.category && <Badge tone="n">{p.category}</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export default Partenaires;
