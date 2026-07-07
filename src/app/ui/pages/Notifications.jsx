import { useEffect, useState } from "react";
import { getNotifications, markNotificationRead, markAllNotificationsRead } from "../api/apiClient.js";
import PageHead from "../components/PageHead.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatusMessage from "../components/StatusMessage.jsx";
import EmptyState from "../components/EmptyState.jsx";

const TONE = { SIGNATURE: "g", PAIEMENT: "a", RELANCE: "r", QUALIOPI: "b", INFO: "n", SYSTEME: "n" };

function Notifications() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(null);

  async function load() {
    try { setRows((await getNotifications()).data); }
    catch (e) { setStatus({ type: "error", message: e.message }); }
  }
  useEffect(() => { load(); }, []);

  async function read(id) { try { await markNotificationRead(id); load(); } catch { /* ignore */ } }
  async function readAll() { try { await markAllNotificationsRead(); load(); } catch { /* ignore */ } }

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
          <EmptyState icon="🔔">Aucune notification.</EmptyState>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {rows.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.is_read && read(n.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderBottom: "1px solid var(--border-soft)", cursor: n.is_read ? "default" : "pointer", background: n.is_read ? "transparent" : "var(--surface2)", borderRadius: 8 }}
              >
                <Badge tone={TONE[n.type] || "n"}>{n.type}</Badge>
                <span style={{ flex: 1 }}>
                  <b style={{ fontWeight: n.is_read ? 500 : 700 }}>{n.title}</b>
                  {n.body && <span style={{ display: "block", fontSize: 12.5, color: "var(--muted)" }}>{n.body}</span>}
                </span>
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
