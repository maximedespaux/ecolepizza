// Bus d'événements temps réel (SSE) en mémoire.
//
// Chaque client (onglet connecté) ouvre un flux `GET /api/events` ; on garde sa
// réponse HTTP ouverte et on lui pousse des messages. Les clients sont rangés par
// organisation : un événement n'est diffusé qu'aux connexions de la MÊME organisation
// (isolation multi-tenant). Mono-processus : suffisant pour un seul serveur. Pour
// plusieurs instances, il faudrait un adaptateur pub/sub (ex. Redis) — non requis ici.

const clients = new Map(); // organizationId -> Set<res>

// Enregistre un flux client pour une organisation. Renvoie une fonction de retrait.
function addClient(orgId, res) {
    if (!orgId) return () => {};
    let set = clients.get(orgId);
    if (!set) { set = new Set(); clients.set(orgId, set); }
    set.add(res);
    return () => {
        const s = clients.get(orgId);
        if (!s) return;
        s.delete(res);
        if (s.size === 0) clients.delete(orgId);
    };
}

// Diffuse un événement nommé à tous les clients d'une organisation.
function publish(orgId, event, payload) {
    if (!orgId) return;
    const set = clients.get(orgId);
    if (!set || set.size === 0) return;
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`;
    for (const res of set) {
        try { res.write(frame); } catch { /* connexion morte : ignorée, retirée au close */ }
    }
}

// Battement de cœur : un commentaire SSE périodique garde la connexion ouverte
// (certains proxys coupent les connexions inactives).
const heartbeat = setInterval(() => {
    for (const set of clients.values()) {
        for (const res of set) { try { res.write(': ping\n\n'); } catch { /* ignore */ } }
    }
}, 25000);
if (heartbeat.unref) heartbeat.unref();

module.exports = { addClient, publish };
