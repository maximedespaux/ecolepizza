/**
 * SUPPRIMER UN DOCUMENT GÉNÉRÉ, ET CE QUI NE VIT QUE PAR LUI.
 *
 * Une seule règle pour deux gestes : la corbeille d'un document (deleteDocument) et le retrait d'un
 * stagiaire « en effaçant » (lib/retraitDossier.js). Deux copies finiraient par diverger — le défaut du
 * 2026-09-24 en venait : la réponse d'un QCM survivait à son document parce que personne n'y pensait.
 *
 * Travail en base SEULEMENT, sur la connexion reçue (transaction comprise). Le journal est l'affaire de
 * l'appelant, qui ne doit écrire « supprimé » qu'une fois la suppression acquise — d'où le retour : les
 * identifiants des réponses QCM effacées, à journaliser.
 */
async function supprimerDocument(conn, orgId, doc) {
    // Émargement : son archive part avec lui (ref emarg:<dossier>[:<slug>]).
    if (doc.type === 'EMARGEMENT') {
        let enr = doc.enrollment_id;
        if (!enr) { const [[df]] = await conn.query('SELECT enrollment_id FROM document_formation WHERE document_id = ? LIMIT 1', [doc.id]); enr = df && df.enrollment_id; }
        if (enr) await conn.query('DELETE FROM archive_document WHERE organization_id = ? AND (ref = ? OR ref LIKE ?)', [orgId, `emarg:${enr}`, `emarg:${enr}:%`]);
    }
    try { await conn.query('DELETE FROM document_signed_pdf WHERE document_id = ?', [doc.id]); }
    catch (e) { if (!(e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR'))) throw e; }
    /* LA RÉPONSE PART AVEC SON QCM. `quiz_response.document_id` n'a pas de clé étrangère (seul le
       questionnaire est en cascade) : supprimer le QCM d'un stagiaire laissait sa réponse (note, réponses
       données, preuve de la migration 144) rattachée à un document disparu, et Notation comme Résultats
       QCM continuaient de la compter. Constaté le 2026-09-24 : le QCM du mardi d'une stagiaire, supprimé,
       gardait sa note. Ses réponses données (quiz_answer) suivent en cascade. */
    let reponses = [];
    if (doc.quiz_id) {
        [reponses] = await conn.query('SELECT id FROM quiz_response WHERE document_id = ? AND organization_id = ?', [doc.id, orgId]);
        if (reponses.length) await conn.query('DELETE FROM quiz_response WHERE document_id = ? AND organization_id = ?', [doc.id, orgId]);
    }
    await conn.query('DELETE FROM generated_document WHERE id = ? AND organization_id = ?', [doc.id, orgId]);
    return { reponses: reponses.map((r) => r.id) };
}

module.exports = { supprimerDocument };
