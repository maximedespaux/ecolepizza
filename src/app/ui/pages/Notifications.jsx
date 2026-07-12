import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../api/apiClient.js";
import { useAutoRefresh } from "../lib/useAutoRefresh.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";

const TONE = { SIGNATURE: "g", PAIEMENT: "a", RELANCE: "r", QUALIOPI: "b", INFO: "n", SYSTEME: "n" };

function Notifications() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(null);

  async function load() {
    try { setRows((await getNotifications()).data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);
  useAutoRefresh(load, { interval: 25000 });

  async function readAll() { try { await markAllNotificationsRead(); load(); } catch { /* ignore */ } }

  // Clic sur une notification : la marque comme lue puis redirige (si un lien existe).
  async function open(n) {
    if (!n.is_read) { try { await markNotificationRead(n.id); } catch { /* ignore */ } }
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
        {rows.length === 0 ? (
          <EmptyState icon="bell">Aucune notification.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {rows.map((n) => (
              <div
                key={n.id}
                onClick={() => open(n)}
                title={n.link ? "Ouvrir" : (n.is_read ? "" : "Marquer comme lu")}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderBottom: "1px solid var(--border-soft)", cursor: (n.link || !n.is_read) ? "pointer" : "default", background: n.is_read ? "transparent" : "var(--surface2)", borderRadius: 8 }}
              >
                <Badge tone={TONE[n.type] || "n"}>{n.type}</Badge>
                <span style={{ flex: 1 }}>
                  <b style={{ fontWeight: n.is_read ? 500 : 700 }}>{n.title}</b>
                  {n.body && <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)" }}>{n.body}</span>}
                </span>
                {n.link && <span style={{ fontSize: 12, color: "var(--dim)" }}>↗</span>}
                <span style={{ fontSize: 12, color: "var(--dim)" }}>{n.created_at}</span>
                {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--grad-ember)" }} />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export default Notifications;
