/**
 * RETIRER UN STAGIAIRE D'UNE SESSION — ce qui part, ce qui reste (demandé le 2026-09-24).
 *
 * Le retrait supprimait le dossier d'un clic, sans confirmation, et personne ne savait ce qu'il emportait :
 * pièces, notes et évaluations partaient (clés étrangères en cascade) ; documents et réponses QCM
 * restaient, détachés. Désormais l'écran MONTRE le plan avant d'agir et propose deux gestes :
 *   · RETIRER SEULEMENT — comme avant : les documents restent sur la fiche, détachés de la formation ;
 *   · RETIRER ET EFFACER — en plus, les documents NON signés de ce dossier et toutes ses réponses QCM.
 *
 * JAMAIS EFFACÉ, quel que soit le geste (choix de l'utilisateur, 2026-09-24) :
 *   · un document SIGNÉ, même en partie : c'est une preuve (un contrat signé reste un contrat) ;
 *   · un émargement (et son archive) : preuve Qualiopi ; une facture ou un avoir : pièce comptable ;
 *   · un document de l'entreprise ou de la session (scope COMPANY / SESSION) : il n'est pas au stagiaire ;
 *   · un document partagé avec un AUTRE dossier : il y vit encore ;
 *   · un fichier REÇU (importé) : c'est l'original, parfois le seul exemplaire.
 * Un QCM n'est pas une signature : « répondu » n'en fait pas une preuve, il part avec ses réponses.
 *
 * Le plan (ce que la fenêtre affiche) et l'exécution trient avec la MÊME fonction : l'écran ne peut pas
 * annoncer autre chose que ce qui sera fait. L'exécution recalcule le plan dans sa transaction — un
 * document signé entre-temps est donc gardé, jamais effacé.
 */
const { supprimerDocument } = require('./suppressionDocument.js');
const { colonneExiste } = require('./colonnes.js');

const TYPES_GARDES = {
    EMARGEMENT: 'émargement (preuve Qualiopi)',
    FACTURE: 'facture (pièce comptable)',
    AVOIR: 'avoir (pièce comptable)',
};

/**
 * Pourquoi GARDER ce document, ou `null` s'il s'efface avec le dossier. L'ORDRE compte : un QCM répondu
 * porte `signed_at` (submitQuiz le marque SIGNÉ) — ce n'est pas une signature, d'où le test du QCM AVANT
 * celui de la signature.
 */
function raisonDeGarder(d) {
    if (Number(d.autres_dossiers) > 0) return 'partagé avec un autre dossier';
    if (d.scope && d.scope !== 'LEARNER') return d.scope === 'COMPANY' ? "document de l'entreprise" : 'document de la session';
    if (TYPES_GARDES[d.type]) return TYPES_GARDES[d.type];
    if (Number(d.fichier) > 0) return 'fichier reçu (importé)';
    if (d.quiz_id) return null;
    if (d.status === 'SIGNE' || d.signed_at || Number(d.signatures) > 0) return 'signé';
    return null;
}

function trierDocuments(docs) {
    const effacables = [];
    const gardes = [];
    for (const d of docs || []) {
        const raison = raisonDeGarder(d);
        if (raison) gardes.push({ ...d, raison }); else effacables.push(d);
    }
    return { effacables, gardes };
}

// Un compte tolérant : une table absente (migration non jouée) compte pour zéro.
async function compter(conn, sql, params) {
    try { const [[r]] = await conn.query(sql, params); return Number(r && r.n) || 0; }
    catch (e) { if (e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR')) return 0; throw e; }
}

/** Ce que le retrait emporterait. `e` = { id, session_id, learner_id } du dossier. */
async function planRetrait(conn, orgId, e) {
    // Une signature, même partielle, se lit sur ses emplacements SIGNÉS — un emplacement vide existe d'avance.
    const signatures = await colonneExiste(conn, 'document_signature', 'signed_at')
        ? '(SELECT COUNT(*) FROM document_signature s WHERE s.document_id = gd.id AND s.signed_at IS NOT NULL)' : '0';
    const fichier = await colonneExiste(conn, 'document_fichier', 'document_id')
        ? '(SELECT COUNT(*) FROM document_fichier f WHERE f.document_id = gd.id)' : '0';
    const [docs] = await conn.query(
        `SELECT gd.id, gd.title, gd.type, gd.status, gd.quiz_id, gd.scope, gd.enrollment_id,
                DATE_FORMAT(gd.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                (SELECT COUNT(*) FROM document_formation o WHERE o.document_id = gd.id AND o.enrollment_id <> ?)
                  + (gd.enrollment_id IS NOT NULL AND gd.enrollment_id <> ?) AS autres_dossiers,
                ${signatures} AS signatures, ${fichier} AS fichier
           FROM generated_document gd
          WHERE gd.organization_id = ?
            AND (gd.enrollment_id = ? OR EXISTS (SELECT 1 FROM document_formation df WHERE df.document_id = gd.id AND df.enrollment_id = ?))
          ORDER BY gd.created_at`,
        [e.id, e.id, orgId, e.id, e.id]);
    const [reponsesQcm, pieces, notes, notesEvaluation, verdicts, remises, presences] = await Promise.all([
        compter(conn, 'SELECT COUNT(*) AS n FROM quiz_response WHERE enrollment_id = ? AND organization_id = ?', [e.id, orgId]),
        compter(conn, 'SELECT COUNT(*) AS n FROM piece_depot WHERE enrollment_id = ?', [e.id]),
        compter(conn, 'SELECT COUNT(*) AS n FROM enrollment_note WHERE enrollment_id = ?', [e.id]),
        compter(conn, 'SELECT COUNT(*) AS n FROM evaluation_note WHERE enrollment_id = ?', [e.id]),
        compter(conn, 'SELECT COUNT(*) AS n FROM evaluation_verdict WHERE enrollment_id = ?', [e.id]),
        compter(conn, 'SELECT COUNT(*) AS n FROM remise_document WHERE enrollment_id = ?', [e.id]),
        compter(conn, `SELECT COUNT(*) AS n FROM attendance_record ar JOIN attendance_sheet s ON s.id = ar.sheet_id
                        WHERE s.session_id = ? AND ar.learner_id = ?`, [e.session_id, e.learner_id]),
    ]);
    return {
        documents: trierDocuments(docs),
        reponses_qcm: reponsesQcm,
        // Ce que les clés étrangères emportent avec le dossier, quel que soit le geste.
        toujours_supprimes: { pieces, notes, notes_evaluation: notesEvaluation, verdicts, remises, presences },
    };
}

/**
 * Retire le dossier, dans UNE transaction : rien n'est à moitié fait. `pool` = db.promise().
 * Rend ce qui a été effacé ({ documents, reponses } : identifiants), à journaliser APRÈS la validation.
 */
async function executerRetrait(pool, orgId, e, { effacer = false } = {}) {
    const effaces = { documents: [], reponses: [] };
    const cx = await pool.getConnection();
    try {
        await cx.beginTransaction();
        if (effacer) {
            const plan = await planRetrait(cx, orgId, e);
            for (const d of plan.documents.effacables) {
                const { reponses } = await supprimerDocument(cx, orgId, d);
                effaces.documents.push(d.id);
                effaces.reponses.push(...reponses);
            }
            // Réponses QCM restantes du dossier : un QCM déjà supprimé, ou sans document.
            const [reste] = await cx.query('SELECT id FROM quiz_response WHERE enrollment_id = ? AND organization_id = ?', [e.id, orgId]);
            if (reste.length) {
                await cx.query('DELETE FROM quiz_response WHERE enrollment_id = ? AND organization_id = ?', [e.id, orgId]);
                effaces.reponses.push(...reste.map((r) => r.id));
            }
        }
        // Présences de la session (grille éditable). La feuille ARCHIVÉE reste : preuve Qualiopi.
        await cx.query(
            `DELETE ar FROM attendance_record ar JOIN attendance_sheet s ON s.id = ar.sheet_id
             WHERE s.session_id = ? AND ar.learner_id = ?`, [e.session_id, e.learner_id]);
        await cx.query('DELETE FROM enrollment WHERE id = ? AND organization_id = ?', [e.id, orgId]);
        await cx.commit();
    } catch (err) {
        await cx.rollback().catch(() => {});
        throw err;
    } finally {
        cx.release();
    }
    return effaces;
}

module.exports = { trierDocuments, planRetrait, executerRetrait };
