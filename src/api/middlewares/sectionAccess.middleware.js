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
    stagiaires: '/stagiaires', documents: '/stagiaires', enrollments: '/stagiaires',
    formations: '/formations', sessions: '/sessions', attendance: '/sessions',
    partenaires: '/partenaires', ventes: '/ventes', inventaire: '/ventes',
    factures: '/factures', comptabilite: '/comptabilite', carte: '/carte',
    quizzes: '/qcm', templates: '/modeles', suivi: '/suivi', audit: '/audit',
    organisation: '/reglages',
    // Ces quatre rubriques manquaient : passer un secrétariat en « Lecture » les affichait
    // bien en lecture seule dans le menu, mais l'API acceptait quand même ses écritures.
    // Menu fermé, route ouverte — l'écart exact qu'un contrôle par rubrique doit interdire.
    companies: '/entreprises', opcos: '/opcos', quest: '/pizza-quest-admin', boutique: '/demandes-boutique',
    /* AJOUTÉES AVEC LA DÉLÉGATION PAR MENU (cf. accesAccordeParMenu). Tant qu'une base n'est
       rattachée à aucune rubrique, accorder « Modèles » ou « Facturation » en écriture à un rôle
       configurable ne débloquait RIEN : faute de rubrique, il n'y a rien à comparer au menu, et
       la garde de rôle refusait seule. Une base absente d'ici reste donc simplement non
       déléguable — jamais un trou de sécurité, mais un écran qui « ne marche pas ». */
    conditions: '/modeles', 'emargement-templates': '/modeles', equivalences: '/modeles',
    emetteurs: '/reglages-facturation', community: '/communaute',
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
    /* PIÈCES : trois natures sous une même base. DÉPOSER un fichier ou le retirer sont des actes
       de PARTICIPANT — le stagiaire propriétaire, garde de propriété dans piece.controller — et
       jamais l'écriture d'une rubrique : les y rattacher gèlerait le dépôt d'un compte à deux
       casquettes, exactement comme la signature ci-dessus. VÉRIFIER un dépôt est un acte de
       dossier (/stagiaires) ; gérer le RÉFÉRENTIEL des types de pièces se fait dans Modèles. */
    if (base === 'pieces') {
        if (/^(dossier|fichier)(\/|$)/.test(reste || '')) return null;
        if (/^depot(\/|$)/.test(reste || '')) return '/stagiaires';
        return '/modeles';
    }
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

/* RUBRIQUES NON DÉLÉGUABLES — celles qui distribuent les accès eux-mêmes. Accorder « Équipe » en
   écriture à un rôle configurable lui permettrait de se promouvoir, ou de s'ouvrir toutes les
   autres rubriques : l'escalade de privilèges par la porte de service. Leurs bases API
   (/equipe, /user, /access-profiles) ne figurent déjà pas dans SECTION_BY_BASE — cette liste est
   la ceinture en plus des bretelles, pour que l'intention reste lisible si quelqu'un cartographie
   ces bases un jour sans voir la conséquence. */
const SECTIONS_NON_DELEGUEES = ['/equipe', '/roles'];

/* CHEMIN COMPLET — et c'est tout l'enjeu. `req.path` est RELATIF AU POINT DE MONTAGE dès qu'on
   se trouve dans un routeur : sous app.use('/api/carte', …), il vaut « / », pas « /api/carte ».
   Le contrôle global (monté sur l'app) voyait donc le bon chemin, mais authorizeRoles — qui vit
   DANS le routeur — n'y trouvait AUCUNE rubrique, et refusait donc tout : la délégation par le
   menu semblait n'avoir strictement aucun effet, sur toutes les routes à la fois.
   Ce défaut a survécu au premier correctif parce que les tests fabriquaient un faux `req` avec
   le chemin complet — la forme du niveau app, pas celle que voit le vrai code. */
function cheminComplet(req) {
    const brut = req.originalUrl || `${req.baseUrl || ''}${req.path || ''}`;
    return brut.split('?')[0]; // la chaîne de requête ne fait pas partie de la rubrique
}

// Rubrique d'une requête, d'après son chemin (/api/<base>/<reste>).
function sectionDeLaRequete(req) {
    const m = cheminComplet(req).match(/^\/api\/([^/]+)\/?(.*)$/);
    return (m && sectionFor(m[1], m[2])) || null;
}

// `nav_access` du membre, lu UNE SEULE FOIS par requête : les deux gardes (celle-ci et
// authorizeRoles) le réclament, et c'est la même ligne de la même table.
async function navAccessDe(req, userId) {
    if (req._navAccess === undefined) {
        const [[row]] = await db.promise().query('SELECT nav_access FROM user WHERE id = ?', [userId]);
        req._navAccess = row ? row.nav_access : null;
    }
    return req._navAccess;
}

/**
 * Décision PURE (donc testable seule) : cet accès au menu autorise-t-il CETTE requête ?
 * Lecture (GET/HEAD) : « read » suffit. Écriture : « write » exigé. Hors rôles configurables,
 * ou sur une rubrique inconnue/non délégable : jamais.
 */
function accesParMenuAutorise({ role, method, section, mode }) {
    if (!CONFIGURABLE_ROLES.includes(role)) return false;
    if (!section || SECTIONS_NON_DELEGUEES.includes(section)) return false;
    if (!mode) return false;
    return MUTATING.has(method) ? mode === 'write' : true;
}

/**
 * L'ACCÈS MENU FAIT FOI, PAS SEULEMENT LE RÔLE.
 *
 * Le défaut corrigé : `nav_access` ne savait que RESTREINDRE. On pouvait donner à un formateur la
 * rubrique « Sessions » en écriture — menu affiché, case « modification » cochée — et l'API lui
 * répondait quand même « Accès refusé », parce que soixante-sept routes mutantes sont gardées par
 * `authorizeRoles(...ADMIN_ROLES)`, liste où FORMATEUR ne figure pas. L'écran promettait un droit
 * que le serveur ne donnait jamais : le réglage n'avait aucun effet, sans le dire.
 *
 * Désormais, ce que l'organisme accorde dans « Équipe & accès » ACCORDE vraiment. Le pouvoir reste
 * borné, et c'est ce qui rend la délégation sûre :
 *   · seuls les rôles CONFIGURABLES (secrétariat, formateur, auditeur) peuvent être élevés — un
 *     stagiaire, une entreprise ou un intervenant ne le sont jamais, quel que soit leur nav_access ;
 *   · il faut une rubrique CONNUE pour le chemin demandé, explicitement accordée (« write » pour
 *     écrire, « read » suffit pour lire) — l'absence de rubrique refuse, elle n'ouvre pas ;
 *   · les rubriques qui distribuent les accès ne se délèguent jamais (SECTIONS_NON_DELEGUEES) ;
 *   · c'est un propriétaire (SUPER_ADMIN / ADMIN_ORGANISME) qui accorde, sur un écran réservé.
 */
async function accesAccordeParMenu(req) {
    const user = req.user; // posé par authenticateToken (rôle relu en base à chaque requête)
    if (!user || !CONFIGURABLE_ROLES.includes(user.role)) return false; // évite la lecture en base
    const section = sectionDeLaRequete(req);
    if (!section || SECTIONS_NON_DELEGUEES.includes(section)) return false;
    const mode = modeFor(await navAccessDe(req, user.id), section);
    return accesParMenuAutorise({ role: user.role, method: req.method, section, mode });
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

        const section = sectionDeLaRequete(req);
        if (!section) return next(); // rubrique non contrôlée

        if (modeFor(await navAccessDe(req, user.id), section) === 'write') return next();
        return res.status(403).json({ error: 'Accès en lecture seule : modification non autorisée pour cette rubrique.' });
    } catch (e) {
        console.error('Erreur contrôle accès rubrique :', e);
        return next(); // fail-open
    }
}

module.exports = {
    enforceSectionMode, sectionFor, sectionDeLaRequete,
    accesAccordeParMenu, accesParMenuAutorise, SECTIONS_NON_DELEGUEES, CONFIGURABLE_ROLES,
};
