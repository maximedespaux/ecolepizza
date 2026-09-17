/**
 * UN QCM, PLUSIEURS FORMATIONS (migration 163, table `quiz_program`).
 *
 * POURQUOI. Un QCM ne se rattachait qu'à une formation (`quiz.program_id`). Pour poser le même
 * questionnaire ailleurs, il fallait le dupliquer : 22 des 23 QCM de l'école sont des copies de
 * 6 d'entre eux. Un QCM peut désormais servir à plusieurs formations, avec, si besoin, un jour
 * propre à chacune (« Hygiène » : jour 3 en HYG, jour 4 en NIV1H).
 *
 * TOUT CE QUI LIT LE RATTACHEMENT PASSE PAR ICI — parcours, envoi manuel, envoi automatique,
 * liste des QCM, résultats. Six lectures qui réinterpréteraient chacune la table finiraient par
 * ne plus désigner les mêmes formations.
 *
 * AVANT ET APRÈS LA MIGRATION. Sans la table, la seule formation est `quiz.program_id` : le
 * comportement d'avant. Avec, `quiz.program_id` reste tenu égal à la première formation — et un
 * `program_id` sans ligne correspondante (QCM rattaché par l'ancien code entre la migration et le
 * déploiement) compte AUSSI : on unit les deux sources, on n'en perd aucune.
 */
const { tableExiste } = require('./colonnes.js');

/**
 * Les formations de chaque QCM de l'organisme : Map quizId → [{ program_id, day, lie_le }].
 *  · `day`    : le jour PROPRE à la formation, ou null (le QCM garde son jour par défaut) ;
 *  · `lie_le` : date (AAAA-MM-JJ) du rattachement — cf. `releaseAutoQuizzes`.
 */
async function formationsDesQcm(conn, orgId, quizIds = null) {
    const parQcm = new Map();
    if (Array.isArray(quizIds) && !quizIds.length) return parQcm;
    const filtre = quizIds ? ' AND q.id IN (?)' : '';
    const params = quizIds ? [orgId, quizIds] : [orgId];
    const ajouter = (r) => {
        if (!r.program_id) return;
        if (!parQcm.has(r.quiz_id)) parQcm.set(r.quiz_id, []);
        const liste = parQcm.get(r.quiz_id);
        if (liste.some((x) => String(x.program_id) === String(r.program_id))) return;
        liste.push({ program_id: r.program_id, day: r.day == null ? null : Number(r.day), lie_le: r.lie_le || null });
    };
    if (await tableExiste(conn, 'quiz_program')) {
        const [liens] = await conn.query(
            `SELECT qp.quiz_id, qp.program_id, qp.day, DATE_FORMAT(qp.created_at, '%Y-%m-%d') AS lie_le
               FROM quiz_program qp JOIN quiz q ON q.id = qp.quiz_id
              WHERE q.organization_id = ?${filtre}
              ORDER BY qp.created_at`, params);
        liens.forEach(ajouter);
    }
    // La formation principale — seule source avant la migration, filet pendant la transition.
    const [principales] = await conn.query(
        `SELECT q.id AS quiz_id, q.program_id, NULL AS day, DATE_FORMAT(q.created_at, '%Y-%m-%d') AS lie_le
           FROM quiz q
          WHERE q.organization_id = ? AND q.program_id IS NOT NULL${filtre}`, params);
    principales.forEach(ajouter);
    return parQcm;
}

/** Le jour d'un QCM pour UNE formation : le sien s'il en a un, sinon celui du QCM, sinon null. */
function jourPour(quiz, lien) {
    if (lien && lien.day != null) return Number(lien.day);
    return quiz.day == null || quiz.day === '' ? null : Number(quiz.day);
}

/**
 * Les formations demandées par l'écran, nettoyées : `formations: [{ program_id, day }]`, ou
 * l'ancien `program_id` seul (client d'avant). Doublons retirés, jour entier ou null, et TOUTE
 * formation d'un autre organisme écartée — on ne rattache pas un QCM à la formation d'autrui en
 * glissant un identifiant dans la requête.
 */
async function formationsDemandees(conn, orgId, body) {
    const brut = Array.isArray(body && body.formations) ? body.formations
        : body && body.program_id ? [{ program_id: body.program_id, day: null }] : [];
    const vues = new Set();
    const nettes = [];
    for (const f of brut) {
        const id = f && f.program_id ? String(f.program_id) : '';
        if (!id || vues.has(id)) continue;
        vues.add(id);
        const d = f.day === '' || f.day == null ? null : Number(f.day);
        nettes.push({ program_id: id, day: Number.isFinite(d) ? Math.trunc(d) : null });
    }
    if (!nettes.length) return [];
    const [connues] = await conn.query(
        'SELECT id FROM training_program WHERE organization_id = ? AND id IN (?)',
        [orgId, nettes.map((f) => f.program_id)]);
    const valides = new Set(connues.map((r) => String(r.id)));
    return nettes.filter((f) => valides.has(f.program_id));
}

/**
 * Enregistre les formations d'un QCM (la formation principale, `quiz.program_id`, est écrite par
 * l'appelant dans le même UPDATE que le reste du QCM).
 *
 * UPSERT, JAMAIS « TOUT SUPPRIMER PUIS RÉINSÉRER » : la date de rattachement d'une formation déjà
 * présente doit survivre à l'enregistrement. Réinsérée, elle passerait à aujourd'hui, et les
 * envois automatiques des jours déjà écoulés de la session en cours seraient bloqués pour qui n'a
 * pas encore ouvert son espace.
 *
 * `complet` = l'écran a envoyé la LISTE ENTIÈRE (`formations`) : ce qui n'y est plus est retiré.
 * Sinon — un écran d'avant, qui ne connaît que `program_id` — on ajoute sans rien retirer : un
 * onglet resté ouvert depuis la veille ne doit pas effacer quatre formations en enregistrant.
 */
async function enregistrerFormations(conn, quizId, formations, complet) {
    if (!(await tableExiste(conn, 'quiz_program'))) {
        return formations.length > 1
            ? { avertissement: 'Migration 163 non jouée : seule la première formation cochée est enregistrée.' }
            : {};
    }
    const ids = formations.map((f) => f.program_id);
    if (complet && ids.length) await conn.query('DELETE FROM quiz_program WHERE quiz_id = ? AND program_id NOT IN (?)', [quizId, ids]);
    else if (complet) await conn.query('DELETE FROM quiz_program WHERE quiz_id = ?', [quizId]);
    for (const f of formations) {
        await conn.query(
            `INSERT INTO quiz_program (quiz_id, program_id, day) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE day = VALUES(day)`,
            [quizId, f.program_id, f.day]);
    }
    return {};
}

/**
 * Un QCM sans AUCUNE formation, activé dans le parcours de l'une : il lui est rattaché — le geste
 * d'avant (`saveFormationSteps`), qui ne vaut plus que pour un QCM vraiment orphelin. Un QCM déjà
 * rattaché ailleurs n'est pas proposé ici, on ne l'y ajoute donc pas en douce.
 */
async function rattacherSiOrphelin(conn, orgId, quizId, programId) {
    const [[qcm]] = await conn.query('SELECT id FROM quiz WHERE id = ? AND organization_id = ?', [quizId, orgId]);
    if (!qcm) return false;
    if ((await formationsDesQcm(conn, orgId, [quizId])).has(quizId)) return false;
    await conn.query('UPDATE quiz SET program_id = ? WHERE id = ? AND organization_id = ? AND program_id IS NULL',
        [programId, quizId, orgId]);
    if (await tableExiste(conn, 'quiz_program')) {
        await conn.query('INSERT IGNORE INTO quiz_program (quiz_id, program_id) VALUES (?, ?)', [quizId, programId]);
    }
    return true;
}

/**
 * Une formation va être SUPPRIMÉE : ses QCM gardent leurs autres formations.
 *
 * À APPELER AVANT la suppression, et ce n'est pas une précaution de style : `quiz.program_id`
 * porte `ON DELETE CASCADE` (migration 020) — supprimer la formation principale d'un QCM
 * supprimerait le QCM. La principale passe donc à la plus ancienne formation restante, ou à NULL.
 */
async function detacherFormation(conn, orgId, programId) {
    if (await tableExiste(conn, 'quiz_program')) {
        await conn.query('DELETE FROM quiz_program WHERE program_id = ?', [programId]);
        await conn.query(
            `UPDATE quiz q
                SET q.program_id = (SELECT qp.program_id FROM quiz_program qp
                                     WHERE qp.quiz_id = q.id ORDER BY qp.created_at LIMIT 1)
              WHERE q.program_id = ? AND q.organization_id = ?`,
            [programId, orgId]);
        return;
    }
    await conn.query('UPDATE quiz SET program_id = NULL WHERE program_id = ? AND organization_id = ?', [programId, orgId]);
}

module.exports = { formationsDesQcm, jourPour, formationsDemandees, enregistrerFormations, rattacherSiOrphelin, detacherFormation };
