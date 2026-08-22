/**
 * Limiteur anti-force brute — en mémoire, sans dépendance.
 *
 * Suffisant pour un mono-serveur ; en multi-instance, chaque processus aurait son propre compteur
 * (il faudrait alors Redis, ou un compteur en base).
 *
 * TROIS DÉFAUTS CORRIGÉS, dont un qui annulait la protection entière.
 *
 * 1. L'IP VENAIT DE `x-forwarded-for`, LU SANS CONDITION. Cet en-tête est fourni par le CLIENT.
 *    Aucun `trust proxy` n'étant configuré, il suffisait d'en envoyer un différent à chaque
 *    requête — `X-Forwarded-For: 1.2.3.4`, puis `1.2.3.5`… — pour obtenir une clé neuve à chaque
 *    fois et ne jamais atteindre le plafond. La protection se désactivait en une ligne de curl.
 *    On passe par `req.ip`, qui n'honore cet en-tête que si `trust proxy` est réglé (cf.
 *    server.js) : derrière un vrai proxy c'est juste, sans proxy c'est l'adresse de la socket,
 *    et le client ne décide plus de sa propre identité.
 *
 * 2. LE COMPTEUR MONTAIT AUSSI SUR LES SUCCÈS. Chaque connexion réussie consommait le budget.
 *    Or une école de formation est derrière UN SEUL IP public : une promotion qui se connecte le
 *    matin épuisait 10 jetons en quelques secondes, et se voyait refuser l'accès pour une minute
 *    — alors que personne n'avait rien tenté de forcer. On ne compte plus que les ÉCHECS, et un
 *    succès efface l'ardoise.
 *
 * 3. LA CLÉ ÉTAIT L'IP SEULE. Même cause : les fautes de frappe d'un stagiaire pénalisaient toute
 *    sa classe. La clé principale devient IP + identifiant tenté, si bien qu'on ne gêne que celui
 *    qui se trompe. Un SECOND seau, à l'IP seule et bien plus large, reste nécessaire : sans lui,
 *    on pourrait essayer un même mot de passe sur cent comptes différents sans jamais être
 *    ralenti (« password spraying »).
 *
 * L'identifiant tenté entre dans la clé, qu'il existe ou non : le comportement est donc le même
 * pour un compte réel et pour un e-mail inventé — sans quoi le 429 dirait quels comptes existent.
 */

/** Adresse du client. `req.ip` respecte `trust proxy` ; jamais l'en-tête brut. */
const ipDe = (req) => req.ip || req.socket?.remoteAddress || 'inconnue';

/** Seau glissant : liste d'horodatages, purgée à la lecture. */
function seau(map, cle, fenetreMs, maintenant) {
    const gardes = (map.get(cle) || []).filter((t) => maintenant - t < fenetreMs);
    if (gardes.length) map.set(cle, gardes); else map.delete(cle);
    return gardes;
}

/**
 * @param windowMs   largeur de la fenêtre glissante
 * @param max        échecs tolérés par (IP + identifiant) dans la fenêtre
 * @param maxIp      échecs tolérés par IP, tous identifiants confondus (anti-spraying).
 *                   Large exprès : une promotion entière partage l'IP de l'école.
 * @param key        préfixe, pour ne pas mélanger connexion et changement de mot de passe
 * @param identifiant  extrait la cible tentée de la requête (e-mail…). Retourne '' si absente.
 */
function rateLimit({ windowMs = 60000, max = 10, maxIp = 0, key = 'default', countAll = false,
                     identifiant = (req) => String(req.body?.email || '').toLowerCase().trim() } = {}) {
    const echecs = new Map();   // "clé" -> [horodatages]

    // Nettoyage périodique : une Map qui ne se vide jamais est elle-même un déni de service.
    // `unref` pour ne pas retenir le processus — sans lui, `npm test` ne rendrait pas la main.
    setInterval(() => {
        const limite = Date.now() - windowMs;
        for (const [k, arr] of echecs) {
            const gardes = arr.filter((t) => t > limite);
            if (gardes.length) echecs.set(k, gardes); else echecs.delete(k);
        }
    }, windowMs).unref?.();

    return (req, res, next) => {
        const ip = ipDe(req);
        const qui = identifiant(req);
        const cleFine = `${key}:${ip}:${qui}`;
        const cleIp = `${key}:${ip}`;
        const now = Date.now();

        const parCompte = seau(echecs, cleFine, windowMs, now);
        const parIp = maxIp ? seau(echecs, cleIp, windowMs, now) : [];
        const bloque = parCompte.length >= max || (maxIp && parIp.length >= maxIp);
        if (bloque) {
            // Attente restante RÉELLE, calculée sur le plus ancien échec encore dans la fenêtre :
            // annoncer la fenêtre entière ferait patienter pour rien celui qui touche au but.
            const plusVieux = Math.min(...[...parCompte, ...parIp].filter(Number.isFinite));
            const reste = Math.max(1, Math.ceil((windowMs - (now - plusVieux)) / 1000));
            res.set('Retry-After', String(reste));
            return res.status(429).json({ message: `Trop de tentatives. Réessayez dans ${reste} seconde${reste > 1 ? 's' : ''}.` });
        }

        /* countAll : compter LA REQUÊTE elle-même, tout de suite. Pour un point d'entrée dont
         * TOUTES les réponses se ressemblent — « mot de passe oublié » répond toujours 200 pour ne
         * pas révéler si l'e-mail existe. Compter seulement les échecs n'y bornerait rien, et
         * laisserait bombarder un destinataire d'e-mails de réinitialisation. */
        if (countAll) {
            echecs.set(cleFine, [...seau(echecs, cleFine, windowMs, Date.now()), Date.now()]);
            if (maxIp) echecs.set(cleIp, [...seau(echecs, cleIp, windowMs, Date.now()), Date.now()]);
            return next();
        }

        /* On compte APRÈS coup, et seulement les échecs. `finish` se déclenche quelle que soit
         * l'issue — y compris sur une erreur serveur, qu'on ne compte pas non plus : ce n'est pas
         * la faute de celui qui se connecte. */
        res.on('finish', () => {
            const rate = res.statusCode === 401 || res.statusCode === 403;
            if (rate) {
                echecs.set(cleFine, [...seau(echecs, cleFine, windowMs, Date.now()), Date.now()]);
                if (maxIp) echecs.set(cleIp, [...seau(echecs, cleIp, windowMs, Date.now()), Date.now()]);
            } else if (res.statusCode < 400) {
                echecs.delete(cleFine); // un succès efface l'ardoise de cette personne
            }
        });
        next();
    };
}

module.exports = { rateLimit };
