import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon.jsx";
import MoneyToggle from "../components/MoneyToggle.jsx";
import { useNavigate } from "react-router-dom";
import { getRevenues, deleteRevenue } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import { Squelette } from "../components/Squelette.jsx";
import EmptyState from "../components/EmptyState.jsx";
import StatusMessage from "../components/StatusMessage.jsx";

// Historique des produits divers (commissions, subventions…). La SAISIE se fait
// désormais depuis la page « Partenaires ».
const REVENU_CATS = [
  { v: "COMMISSION", label: "Commission partenaire" },
  { v: "SUBVENTION", label: "Subvention" },
  { v: "AUTRE", label: "Autre produit" },
];
const euro = (n) => Math.round(n).toLocaleString("fr-FR") + " €";
const YEARS = (() => { const y = new Date().getFullYear(); return [y, y - 1, y - 2]; })();

function ProduitDivers() {
  const navigate = useNavigate();
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

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

  async function del(v) {
    if (!window.confirm(`Supprimer « ${v.label} » ?`)) return;
    try { await deleteRevenue(v.id); load(annee); } catch (e) { setStatus({ type: "error", message: e.message }); }
  }

  return (
    <>
      <PageHead
        eyebrow="Gestion"
        title="Produit divers"
        lead="Historique des commissions, subventions et autres produits. Pour enregistrer une commission, rendez-vous sur la page Partenaires."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <MoneyToggle />
            <button className="btn ghost" onClick={() => navigate("/partenaires")}>＋ Enregistrer (Partenaires)</button>
            <select className="inp" value={annee} onChange={(e) => setAnnee(Number(e.target.value))} aria-label="Année">
              {YEARS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        }
      />
      <StatusMessage status={status} />

      <Card title={`Produits divers ${annee}`} more={<b className="tnum" style={{ color: "var(--blue)" }}>{euro(total)}</b>}>
        {/* « Chargement… » en texte ne réserve pas la place : la carte sautait à l'arrivée
            des données. Le squelette tient la hauteur, et l'état vide devient un vrai
            EmptyState — c'est le contenu PRINCIPAL de la page, pas un encart. */}
        {loading ? <Squelette lignes={4} h={44} />
          : rows.length === 0 ? (
            <EmptyState icon="coins" title="Aucun produit divers saisi"
              text="Commissions, apports et recettes hors formation apparaissent ici. Ils se saisissent depuis la page Partenaires." />
          ) : (
            <div>{rows.map((v) => (
              <div className="list-row" key={v.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.label}</div>
                  <div className="sub" style={{ color: "var(--dim)" }}>
                    {REVENU_CATS.find((c) => c.v === v.category)?.label ?? v.category}
                    {v.partner_name ? ` · ${v.partner_name}` : ""} · {new Date(v.date).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <b className="tnum" style={{ color: "var(--blue)" }}>{euro(v.amount)}</b>
                <button className="iconbtn del" title="Supprimer" onClick={() => del(v)}><Icon name="trash" size={15} /></button>
              </div>
            ))}</div>
          )}
      </Card>
    </>
  );
}

export default ProduitDivers;
