const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const path = require('path');
const db = require('../config/database.js');

dotenv.config({ path: path.join(__dirname, '..', 'config', '.env') });
const JWT_SECRET = process.env.JWT_SECRET;

// Rôles dont l'accès menu est configurable (par le super administrateur).
// Les propriétaires (SUPER_ADMIN / ADMIN_ORGANISME) et les autres rôles
// (STAGIAIRE, ENTREPRISE…) ne sont pas concernés par ce contrôle.
const CONFIGURABLE_ROLES = ['SECRETARIAT', 'FORMATEUR', 'AUDITEUR'];
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Base d'URL API -> rubrique de navigation. Une base absente = non contrôlée
// (on laisse passer, pour ne jamais casser un endpoint non cartographié).
const SECTION_BY_BASE = {
    stagiaires: '/stagiaires', documents: '/stagiaires',
    formations: '/formations', sessions: '/sessions',
    partenaires: '/partenaires', ventes: '/ventes', inventaire: '/ventes',
    factures: '/factures', comptabilite: '/comptabilite', carte: '/carte',
    quizzes: '/qcm', templates: '/modeles', suivi: '/suivi', audit: '/audit',
    organisation: '/reglages',
    // Ces quatre rubriques manquaient : passer un secrétariat en « Lecture » les affichait
    // bien en lecture seule dans le menu, mais l'API acceptait quand même ses écritures.
    // Menu fermé, route ouverte — l'écart exact qu'un contrôle par rubrique doit interdire.
    companies: '/entreprises', opcos: '/opcos', quest: '/pizza-quest-admin', boutique: '/demandes-boutique',
};

/**
 * Rubrique d'une requête, à partir de sa base d'URL — avec les exceptions de sous-chemin.
 *
 * `comptabilite/revenus*` n'appartient PAS à /comptabilite. L'exception visait /produit-divers,
 * la page du formateur : lui n'a jamais /comptabilite en écriture, et se voyait donc refuser la
 * suppression sur SA page, avec en prime un message désignant la mauvaise rubrique.
 *
 * Cette page a été supprimée — elle ne montrait plus qu'un sous-ensemble de Comptabilité, la
 * saisie étant passée sur Partenaires. L'exception, elle, RESTE INDISPENSABLE, et pointe
 * désormais là où le geste se fait : un secrétariat ayant /partenaires en écriture doit pouvoir
 * enregistrer une commission. La laisser sur /produit-divers l'aurait rattachée à une rubrique
 * qui n'existe plus dans le menu — donc introuvable dans `nav_access`, donc 403 pour tous les
 * rôles configurables.
 */
function sectionFor(base, reste) {
    if (base === 'comptabilite' && /^revenus(\/|$)/.test(reste || '')) return '/partenaires';
    // SIGNER un document (POST /documents/:id/sign) n'est PAS une écriture « backoffice » de la
    // rubrique /stagiaires : c'est un acte de PARTICIPANT (le stagiaire propriétaire, ou le
    // personnel signataire), déjà autorisé sur la PROPRIÉTÉ du document par signDocument
    // (l.user_id = req.user.id, sinon rôle bureau). Sans cette exception, un compte à DEUX
    // CASQUETTES (rôle configurable FORMATEUR/SECRÉTARIAT/AUDITEUR *et* stagiaire) ne pouvait pas
    // signer SON PROPRE document depuis son espace : la rubrique /stagiaires étant en lecture seule
    // pour son rôle, le geste tombait en « Accès en lecture seule ». On NE dé-cadenasse PAS
    // /sign-link (création d'un lien de signature partageable = acte bureau, resté sous /stagiaires).
    if (base === 'documents' && /\/sign\/?$/.test(reste || '')) return null;
    return SECTION_BY_BASE[base];
}

function decodeUser(req) {
    const cookieToken = req.cookies?.auth_token;
    const headerToken = req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7) : null;
    const token = cookieToken || headerToken;
    if (!token) return null;
    try { return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); } catch { return null; }
}

// Mode ("read"/"write"/null) pour une rubrique, à partir de la valeur stockée.
function modeFor(navAccess, section) {
    if (!navAccess) return null;
    let map = navAccess;
    if (typeof navAccess === 'string') { try { map = JSON.parse(navAccess); } catch { return null; } }
    if (Array.isArray(map)) return map.includes(section) ? 'write' : null; // ancien format = écriture
    if (map && typeof map === 'object') { const v = map[section]; return v === 'read' ? 'read' : (v ? 'write' : null); }
    return null;
}

/**
 * Bloque les requêtes de MODIFICATION (POST/PUT/PATCH/DELETE) sur une rubrique
 * accordée en lecture seule (ou non accordée) aux rôles configurables.
 * Ne dépend pas de authenticateToken (monté globalement) : décode le jeton lui-même
 * et échoue en mode « ouvert » (laisse passer) si le jeton est absent/invalide,
 * la route appliquant alors sa propre authentification.
 */
async function enforceSectionMode(req, res, next) {
    try {
        if (!MUTATING.has(req.method)) return next();
        const user = decodeUser(req);
        if (!user || !CONFIGURABLE_ROLES.includes(user.role)) return next();

        const m = req.path.match(/^\/api\/([^/]+)\/?(.*)$/);
        const section = m && sectionFor(m[1], m[2]);
        if (!section) return next(); // rubrique non contrôlée

        const [[row]] = await db.promise().query('SELECT nav_access FROM user WHERE id = ?', [user.id]);
        if (row && modeFor(row.nav_access, section) === 'write') return next();
        return res.status(403).json({ error: 'Accès en lecture seule : modification non autorisée pour cette rubrique.' });
    } catch (e) {
        console.error('Erreur contrôle accès rubrique :', e);
        return next(); // fail-open
    }
}

module.exports = { enforceSectionMode, sectionFor };
