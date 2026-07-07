import { useCallback, useEffect, useState } from "react";
import { getRevenues, createRevenue, deleteRevenue, getPartenaires } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

// Surface allégée réservée au formateur : enregistrer un « produit divers »
// (commission, subvention, remboursement…) sans accès au tableau de gestion.
const REVENU_CATS = [
  { v: "COMMISSION", label: "Commission partenaire" },
  { v: "SUBVENTION", label: "Subvention" },
  { v: "AUTRE", label: "Autre produit" },
];
const euro = (n) => Math.round(n).toLocaleString("fr-FR") + " €";
const today = () => new Date().toISOString().slice(0, 10);
const YEARS = (() => { const y = new Date().getFullYear(); return [y, y - 1, y - 2]; })();

function ProduitDivers() {
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rev, setRev] = useState({ label: "", categorie: "COMMISSION", montant: "", date: today(), partner_id: "" });
  const [partners, setPartners] = useState([]);

  useEffect(() => { getPartenaires().then((r) => setPartners(r.data)).catch(() => {}); }, []);

  const load = useCallback(async (an) => {
    setLoading(true);
    try {
      const { data, total: t } = await getRevenues(an);
      setRows(data);
      setTotal(t || 0);
    } catch (e) {
      setStatus({ type: "error", message: e.message });
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(annee); }, [annee, load]);

  async function submit() {
    if (!rev.label.trim() || !rev.montant) { setStatus({ type: "error", message: "Libellé et montant requis." }); return; }
    setSaving(true);
    try {
      await createRevenue(rev);
      setRev({ label: "", categorie: rev.categorie, montant: "", date: today(), partner_id: "" });
      setStatus({ type: "success", message: "Produit enregistré." });
      load(annee);
    } catch (e) { setStatus({ type: "error", message: e.message }); }
    finally { setSaving(false); }
  }

  async function del(v) {
    if (!window.confirm(`Supprimer « ${v.label} » ?`)) return;
    try { await deleteRevenue(v.id); load(annee); } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  return (
    <>
      <PageHead
        eyebrow="Gestion"
        title="Produit divers"
        lead="Enregistrez une commission partenaire, une subvention ou un remboursement. Ces montants alimentent le chiffre d'affaires de l'organisme."
        actions={
          <select className="inp" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} aria-label="Année">
            {YEARS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        }
      />
      <StatusMessage status={status} />

      <div className="grid cols-2">
        <Card title="Enregistrer un produit divers">
          <p className="ca-add" style={{ marginTop: -4, marginBottom: 12 }}>+ Ajouté au chiffre d'affaires</p>
          <div className="field"><label>Libellé</label>
            <input className="inp" value={rev.label} onChange={(e) => setRev({ ...rev, label: e.target.value })} placeholder="Commission Le 5 Stagioni…" /></div>
          <div className="row2">
            <div className="field"><label>Type</label>
              <select value={rev.categorie} onChange={(e) => setRev({ ...rev, categorie: e.target.value })}>
                {REVENU_CATS.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
              </select></div>
            <div className="field"><label>Montant (€)</label>
              <input className="inp" inputMode="decimal" value={rev.montant} onChange={(e) => setRev({ ...rev, montant: e.target.value })} placeholder="0" /></div>
          </div>
          {rev.categorie === "COMMISSION" && (
            <div className="field"><label>Partenaire concerné</label>
              <select value={rev.partner_id} onChange={(e) => setRev({ ...rev, partner_id: e.target.value })}>
                <option value="">— Aucun / non précisé —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
          )}
          <div className="field"><label>Date</label>
            <input className="inp" type="date" value={rev.date} onChange={(e) => setRev({ ...rev, date: e.target.value })} /></div>
          <button className="btn primary" style={{ width: "100%" }} disabled={saving} onClick={submit}>
            {saving ? "Enregistrement…" : "+ Ajouter le produit"}
          </button>
        </Card>

        <Card title={`Produits divers ${annee}`} more={<b className="tnum" style={{ color: "var(--navy)" }}>{euro(total)}</b>}>
          {loading ? <p className="lead" style={{ margin: 0 }}>Chargement…</p>
            : rows.length === 0 ? <p className="lead" style={{ margin: 0 }}>Aucun produit divers saisi.</p> : (
              <div>{rows.map((v) => (
                <div className="list-row" key={v.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</div>
                    <div className="sub" style={{ color: "var(--dim)" }}>
                      {REVENU_CATS.find((c) => c.v === v.category)?.label ?? v.category}
                      {v.partner_name ? ` · ${v.partner_name}` : ""} · {new Date(v.date).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <b className="tnum" style={{ color: "var(--navy)" }}>{euro(v.amount)}</b>
                  <button className="iconbtn del" title="Supprimer" onClick={() => del(v)}>🗑</button>
                </div>
              ))}</div>
            )}
        </Card>
      </div>
    </>
  );
}

export default ProduitDivers;
