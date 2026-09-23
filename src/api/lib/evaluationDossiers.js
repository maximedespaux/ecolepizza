/**
 * RÉSULTATS D'ÉVALUATION PRATIQUE POUR UN LOT DE DOSSIERS.
 *
 * POURQUOI UN LOT plutôt qu'un dossier à la fois : les conditions de parcours sont évaluées
 * pour toute une liste — une session entière, un tableau de suivi. Une requête par dossier
 * ferait trente allers-retours pour afficher une page.
 *
 * LE CALCUL N'EST PAS ICI. `totalGrille` et `reussite` vivent dans `lib/bareme.js` et sont les
 * MÊMES que ceux de l'écran de saisie et des jetons de document. Ce fichier ne fait que lire la
 * base et leur passer ce qu'il a lu : une seconde implémentation du barème finirait par
 * diverger, et c'est l'affichage le plus consulté qu'on croirait.
 *
 * TOLÈRE LA MIGRATION 148 NON JOUÉE — la Map revient vide, les conditions qui s'y réfèrent
 * restent simplement fausses, et rien ne tombe.
 */
const { totalGrille, reussite } = require('./bareme.js');

/* LA REQUÊTE DES LIENS, avec le rôle quand la colonne existe (migration 149).
   SANS LE RÔLE, LA GRILLE DU JURY ENTRAIT DANS LE COMPTE — et comme la boucle écrasait le
   résultat du dossier à chaque ligne, « évaluation réussie » se décidait sur la grille arrivée
   en dernier, celle du jury une fois sur deux. Le jury ne compte pas des points : il valide des
   compétences (cf. resultatJuryDossier). */
const LIENS = (avecRole) => `SELECT e.id AS eid, g.id AS grille_id, g.pass_score
     FROM enrollment e
     JOIN training_session s ON s.id = e.session_id
     JOIN evaluation_grille g ON g.program_id = s.program_id
          AND g.organization_id = e.organization_id AND g.active = 1
          ${avecRole ? "AND g.role = 'FORMATEUR'" : ''}
    WHERE e.organization_id = ? AND e.id IN (?)
    ORDER BY g.created_at, g.label`;

/**
 * PLUSIEURS GRILLES POUR UN MÊME DOSSIER : ce qu'on en dit d'un seul mot.
 *
 * Une formation peut avoir « Évaluation pratique — pâte » et « — four » (2026-09-23). Une
 * condition de parcours, elle, ne connaît qu'un booléen et qu'un pourcentage. La règle :
 *   · on ne regarde QUE les grilles où le stagiaire a des notes — une grille jamais commencée
 *     n'est pas un échec, et la compter bloquerait à jamais les documents qui en dépendent ;
 *   · réussi seulement si TOUTES les grilles notées le sont : rien ne se rattrape d'une grille
 *     à l'autre, c'est ce que l'école a tranché ;
 *   · le pourcentage retenu est LE PLUS FAIBLE. Une moyenne additionnerait des totaux qui n'ont
 *     ni le même maximum ni le même sens, et « en dessous de 50 % » doit attraper la grille qui
 *     ne va pas, pas la moyenne qui la cache.
 */
function agreger(resultats) {
    const notees = resultats.filter((r) => r.notes > 0);
    if (!notees.length) return { points: 0, max: 0, percent: null, notes: 0, pass_score: null, reussi: null };
    const pire = notees.reduce((m, r) => (m === null || r.percent < m ? r.percent : m), null);
    const reussi = notees.some((r) => r.reussi === false) ? false
        : notees.some((r) => r.reussi === null) ? null : true;
    return {
        points: notees.reduce((n, r) => n + r.points, 0),
        max: notees.reduce((n, r) => n + r.max, 0),
        percent: pire,
        notes: notees.reduce((n, r) => n + r.notes, 0),
        pass_score: notees.length === 1 ? notees[0].pass_score : null,
        reussi,
        grilles: notees.length,
    };
}

async function resultatsParDossier(conn, orgId, enrollmentIds) {
    const map = new Map();
    if (!enrollmentIds || !enrollmentIds.length) return map;
    try {
        let liens;
        try {
            [liens] = await conn.query(LIENS(true), [orgId, enrollmentIds]);
        } catch (err) {
            /* Migration 149 non jouée : pas de colonne `role`, donc une seule grille possible. */
            if (!(err && err.code === 'ER_BAD_FIELD_ERROR')) throw err;
            [liens] = await conn.query(LIENS(false), [orgId, enrollmentIds]);
        }
        if (!liens.length) return map;

        const grilleIds = [...new Set(liens.map((l) => l.grille_id))];
        const [exercices] = await conn.query(
            `SELECT id, grille_id, bareme, max_points, paliers, active
               FROM evaluation_exercice WHERE grille_id IN (?) AND active = 1`, [grilleIds]);
        const parGrille = new Map();
        for (const ex of exercices) {
            if (!parGrille.has(ex.grille_id)) parGrille.set(ex.grille_id, []);
            parGrille.get(ex.grille_id).push(ex);
        }

        const [notes] = await conn.query(
            'SELECT enrollment_id, exercice_id, points FROM evaluation_note WHERE enrollment_id IN (?)',
            [liens.map((l) => l.eid)]);
        const parDossier = new Map();
        for (const n of notes) {
            if (!parDossier.has(n.enrollment_id)) parDossier.set(n.enrollment_id, {});
            parDossier.get(n.enrollment_id)[n.exercice_id] = n.points;
        }

        /* UN DOSSIER PEUT AVOIR PLUSIEURS LIGNES — une par grille. On les rassemble avant de
           conclure : écrire directement dans la Map, comme avant, faisait gagner la dernière
           grille lue et perdre toutes les autres, sans rien signaler. */
        const parEleve = new Map();
        for (const l of liens) {
            const exs = parGrille.get(l.grille_id) || [];
            const totaux = totalGrille(exs, parDossier.get(l.eid) || {});
            if (!parEleve.has(l.eid)) parEleve.set(l.eid, []);
            parEleve.get(l.eid).push({ ...totaux, pass_score: l.pass_score, reussi: reussite(l, totaux) });
        }
        for (const [eid, resultats] of parEleve) {
            map.set(eid, resultats.length === 1 ? resultats[0] : agreger(resultats));
        }
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) return map;
        throw err;
    }
    return map;
}

module.exports = { resultatsParDossier, agreger };
