import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../api/apiClient.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Squelette } from "../components/Squelette.jsx";
import { Icon } from "../components/Icon.jsx";

const TONE = { SIGNATURE: "g", PAIEMENT: "a", RELANCE: "r", QUALIOPI: "b", BOUTIQUE: "b", INFO: "n", SYSTEME: "n" };

function Notifications() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null); // `null` = on charge, `[]` = aucune notification
  const [status, setStatus] = useState(null);

  async function load() {
    try { setRows((await getNotifications()).data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);
  useAutoRefresh(load, { interval: 25000 });

  // Ces deux actions échouaient EN SILENCE. « Tout marquer comme lu » ne faisait alors
  // simplement rien : ni changement à l'écran, ni message. On recliquait, sans comprendre.
  async function readAll() {
    try { await markAllNotificationsRead(); setStatus(null); load(); }
    catch (e) { setStatus({ type: "error", message: e.message || "Impossible de tout marquer comme lu." }); }
  }

  // Clic sur une notification : la marque comme lue puis redirige (si un lien existe).
  async function open(n) {
    if (!n.is_read) {
      try { await markNotificationRead(n.id); }
      catch (e) { setStatus({ type: "error", message: e.message || "Impossible de marquer comme lue." }); }
    }
    if (n.link) navigate(n.link);
    else load();
  }

  return (
    <>
      <PageHead
        eyebrow="Système"
        title="Notifications"
        actions={<button className="btn sm" onClick={readAll}>Tout marquer comme lu</button>}
      />
      <StatusMessage status={status} />

      <Card>
        {rows == null ? (
          <Squelette lignes={6} h={52} />
        ) : rows.length === 0 ? (
          <EmptyState icon="bell" title="Aucune notification"
            text="Les signatures, relances et alertes de conformité s'afficheront ici." />
        ) : (
          <div className="notif-liste">
            {rows.map((n) => {
              const agissable = n.link || !n.is_read;
              const agir = () => agissable && open(n);
              return (
                // Une notification se lisait à la souris seule : `<div onClick>` sans rôle ni
                // tabindex. Or c'est une LISTE D'ACTIONS — chaque ligne mène quelque part.
                // Le nom accessible reprend le titre ET le corps : onze lignes « Document
                // signé » ne se distinguent que par « signé par qui ».
                <div
                  key={n.id}
                  className={"notif-ligne" + (n.is_read ? "" : " neuf")}
                  role={agissable ? "button" : undefined}
                  tabIndex={agissable ? 0 : undefined}
                  aria-label={agissable ? `${n.title}${n.body ? `, ${n.body}` : ""}${n.is_read ? "" : " (non lue)"}` : undefined}
                  onClick={agir}
                  onKeyDown={agissable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); agir(); } } : undefined}
                  title={n.link ? "Ouvrir" : (n.is_read ? undefined : "Marquer comme lu")}
                >
                  <Badge tone={TONE[n.type] || "n"}>{n.type}</Badge>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{n.title}</b>
                    {n.body && <span className="notif-corps">{n.body}</span>}
                  </span>
                  {/* Le « ↗ » littéral devient l'icône du jeu, comme partout ailleurs, et
                      `aria-hidden` : il redit ce que le nom de la ligne annonce déjà. */}
                  {n.link && <Icon name="chevron-right" size={15} aria-hidden="true" />}
                  <span className="notif-date">{n.created_at}</span>
                  {!n.is_read && <span className="notif-point" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}

export default Notifications;
