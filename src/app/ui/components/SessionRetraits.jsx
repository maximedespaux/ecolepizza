import { useEffect, useState } from "react";
import Card from "../components/Card.jsx";
import { Icon } from "../components/Icon.jsx";
import { getPickups } from "../api/apiClient.js";

/**
 * « Récupérer le matériel » — les retraits que les stagiaires ont réservés pendant cette
 * session, sur la page de la session.
 *
 * Pourquoi ici : le stagiaire choisit son créneau depuis la boutique, mais c'est le formateur
 * qui est devant lui le jour J. Sans cette carte, le rendez-vous vit dans une zone admin que
 * personne n'ouvre le matin — et le stagiaire repart sans sa veste.
 *
 * La carte ne s'affiche QUE s'il y a des retraits : une carte vide sur chaque session serait
 * du bruit sur un écran déjà chargé.
 */

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const STATUT = { NOUVELLE: "Reçue", EN_PREPARATION: "En préparation", PRETE: "Prête", REMISE: "Remise", FACTUREE: "Facturée" };

/* « 2026-07-22 » se lit à la main : new Date("2026-07-22") serait interprété en UTC et
   pourrait afficher le 21 selon le fuseau (cf. api/lib/horaires.js). */
function jourLabel(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${JOURS[dt.getDay()]} ${d}/${String(m).padStart(2, "0")}`;
}

function SessionRetraits({ startDate, endDate }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!startDate || !endDate) return;
    getPickups(startDate, endDate).then((r) => setRows(r.data || [])).catch(() => setRows([]));
  }, [startDate, endDate]);

  if (!rows || !rows.length) return null;

  return (
    <Card title={
      <span className="card-ttl">
        <Icon name="package" size={16} /> Récupérer le matériel
        <span className="badge a" style={{ marginLeft: 8 }}>{rows.length}</span>
      </span>
    }>
      <p className="hint" style={{ marginTop: 0 }}>
        Ces stagiaires ont réservé un créneau pour retirer leur commande pendant cette session.
      </p>
      {rows.map((r) => (
        <div key={r.id} className="dem-row">
          <b style={{ minWidth: 130 }}>
            <Icon name="calendar" size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />
            {jourLabel(r.pickup_at)} à {String(r.pickup_at).slice(11, 16)}
          </b>
          <span style={{ flex: 1, minWidth: 0 }}>
            {r.learner.last_name} {r.learner.first_name}
            <span className="hint"> · {r.n_lines} article{r.n_lines > 1 ? "s" : ""}</span>
          </span>
          <span className="chiffres hint">{r.ref}</span>
          <span className={"badge " + (r.status === "PRETE" ? "g" : "n")}>{STATUT[r.status] || r.status}</span>
        </div>
      ))}
    </Card>
  );
}

export default SessionRetraits;
