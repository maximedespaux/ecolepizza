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

async function resultatsParDossier(conn, orgId, enrollmentIds) {
    const map = new Map();
    if (!enrollmentIds || !enrollmentIds.length) return map;
    try {
        const [liens] = await conn.query(
            `SELECT e.id AS eid, g.id AS grille_id, g.pass_score
               FROM enrollment e
               JOIN training_session s ON s.id = e.session_id
               JOIN evaluation_grille g ON g.program_id = s.program_id
                    AND g.organization_id = e.organization_id AND g.active = 1
              WHERE e.organization_id = ? AND e.id IN (?)`,
            [orgId, enrollmentIds]);
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

        for (const l of liens) {
            const exs = parGrille.get(l.grille_id) || [];
            const totaux = totalGrille(exs, parDossier.get(l.eid) || {});
            map.set(l.eid, { ...totaux, pass_score: l.pass_score, reussi: reussite(l, totaux) });
        }
    } catch (err) {
        if (err && (err.code === 'ER_NO_SUCH_TABLE' || err.code === 'ER_BAD_FIELD_ERROR')) return map;
        throw err;
    }
    return map;
}

module.exports = { resultatsParDossier };
