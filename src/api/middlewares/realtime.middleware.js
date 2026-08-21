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
                /* CHARGE VIDE, ET C'EST VOLONTAIRE. On envoyait `{path, method}` : un stagiaire
                   abonné au flux (il l'est, pour rafraîchir son espace) recevait donc la trace de
                   CHAQUE action du personnel — la méthode et le moment. Fuite de métadonnées
                   relevée au pentest. Le client n'en a aucun besoin : `notify()` appelle ses
                   abonnés SANS argument, ils se contentent de recharger leurs propres données
                   (déjà filtrées par le serveur). On ne diffuse donc plus qu'un signal nu. */
                publish(req.user.organization_id, 'refresh', {});
            }
        } catch { /* ne jamais casser la requête à cause d'une diffusion */ }
    });
    next();
}

module.exports = { broadcastMutations };
