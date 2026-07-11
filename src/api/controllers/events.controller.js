const { addClient } = require('../lib/events.js');

// GET /api/events — flux SSE (Server-Sent Events) propre à l'organisation de l'utilisateur.
// Le navigateur (EventSource) garde la connexion ouverte et se reconnecte seul.
function stream(req, res) {
    res.set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // désactive le buffering (nginx) pour un push immédiat
    });
    if (res.flushHeaders) res.flushHeaders();

    // Délai de reconnexion conseillé au client + premier message de confirmation.
    res.write('retry: 5000\n\n');
    res.write('event: ready\ndata: {}\n\n');

    const remove = addClient(req.user.organization_id, res);
    req.on('close', () => { remove(); try { res.end(); } catch { /* ignore */ } });
}

module.exports = { stream };
