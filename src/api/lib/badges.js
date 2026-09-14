/**
 * BADGES DE FORMATION portés par un stagiaire (`learner.levels`, une liste CSV).
 *
 * CE QUI N'ALLAIT PAS. Le badge attribué à l'inscription valait
 * `COALESCE(NULLIF(p.level, ''), p.code)` : le NIVEAU de la formation primait sur son CODE.
 * Sur neuf formations, une seule renseigne `level` — RS7404, à « RS ». Elle était donc la seule
 * à ne jamais donner son code : le stagiaire recevait « RS » quand tous les autres recevaient
 * « NIV1 », « NIV1H », « NIV2 »… Et `level` n'a AUCUN champ de saisie dans l'écran Formations :
 * personne ne pouvait ni le voir ni le corriger.
 *
 * L'ORDRE DE PRIORITÉ ÉTAIT D'AILLEURS INVERSÉ D'UN ÉCRAN À L'AUTRE. La carte lit
 * `program_code || level` — le code d'abord. Les pastilles de la Communauté remontent déjà au
 * programme pour afficher `p.code`. Seule l'attribution faisait le contraire. Le badge EST
 * désormais le code, partout et à l'écriture.
 *
 * `level` reste ce que dit son commentaire de schéma : un regroupement de COULEUR pour la carte.
 * On ne le supprime pas — il sert encore à retrouver un programme depuis un badge ancien.
 *
 * LES BADGES DÉJÀ ÉCRITS NE SONT PAS RÉÉCRITS. Un « RS » posé il y a six mois vit dans une
 * colonne CSV, et une migration de données qui découpe du texte pour y remplacer un jeton est
 * précisément le genre d'opération qui rate en silence sur une valeur inattendue. On le résout
 * donc À LA LECTURE : `resolveurBadges` rend le code du programme pour un badge stocké, qu'il
 * ait été écrit sous forme de niveau ou de code.
 */

/* Fragment SQL de l'attribution : le CODE de la formation, rien d'autre. Partagé par les deux
   contrôleurs qui inscrivent (dossier stagiaire, inscription de groupe par l'entreprise) —
   la règle y était écrite DEUX fois, et deux copies d'une même règle finissent par diverger. */
const SQL_BADGE_FORMATION = 'p.code AS badge';

/**
 * Construit un traducteur « badge stocké → code de formation » pour un organisme.
 * Un badge inconnu (formation supprimée, étiquette posée à la main) est rendu tel quel :
 * mieux vaut afficher « RS » que rien.
 */
async function resolveurBadges(conn, orgId) {
    const parBadge = new Map();
    try {
        const [progs] = await conn.query(
            'SELECT code, level FROM training_program WHERE organization_id = ?', [orgId]);
        for (const p of progs) {
            if (!p.code) continue;
            /* Le niveau d'ABORD, le code ENSUITE : si deux formations partagent un niveau, la
               dernière gagne pour ce niveau-là, mais chaque code reste exact pour lui-même. */
            const niveau = p.level && String(p.level).trim();
            if (niveau) parBadge.set(niveau, p.code);
            parBadge.set(p.code, p.code);
        }
    } catch (e) {
        if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
    }
    return (badge) => {
        const b = String(badge || '').trim();
        return b ? (parBadge.get(b) || b) : b;
    };
}

/** Applique le traducteur à une liste CSV, sans doublon ni trou, et rend la liste CSV. */
function resoudreCsv(csv, resoudre) {
    const vus = new Set();
    for (const brut of String(csv || '').split(',')) {
        const b = brut.trim();
        if (!b) continue;
        /* DÉDOUBLONNAGE APRÈS traduction : un stagiaire inscrit avant ET après le correctif
           porte « RS » et « RS7404 », qui désignent la même formation. Deux pastilles
           identiques côte à côte donneraient l'impression de deux formations suivies. */
        vus.add(resoudre(b));
    }
    return [...vus].join(',');
}

module.exports = { SQL_BADGE_FORMATION, resolveurBadges, resoudreCsv };
