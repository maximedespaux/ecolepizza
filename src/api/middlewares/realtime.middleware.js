const { publish } = require('../lib/events.js');

// Après CHAQUE requête de modification réussie, diffuse un événement « refresh » aux
// clients de l'organisation : ils rechargent alors leurs données en temps réel, sans
// attendre le prochain sondage. Approche centralisée : pas besoin d'instrumenter chaque
// contrôleur. `req.user` est renseigné par l'authentification de la route (exécutée
// avant la fin de la réponse), donc disponible dans le callback `finish`.
function broadcastMutations(req, res, next) {
    const m = req.method;
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return next();
    res.on('finish', () => {
        try {
            if (res.statusCode >= 200 && res.statusCode < 400 && req.user && req.user.organization_id) {
                publish(req.user.organization_id, 'refresh', { path: req.path, method: m });
            }
        } catch { /* ne jamais casser la requête à cause d'une diffusion */ }
    });
    next();
}

module.exports = { broadcastMutations };
