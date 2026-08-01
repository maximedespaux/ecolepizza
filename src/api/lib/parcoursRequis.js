/**
 * ON N'INSCRIT PAS DANS UNE FORMATION SANS PARCOURS DOCUMENTAIRE.
 *
 * POURQUOI C'EST UNE GARDE ET PAS UN CONFORT. Le parcours documentaire est ce qui produit le
 * devis, le contrat, la convention, l'émargement. Une formation dont le parcours est vide accepte
 * pourtant l'inscription : le dossier se crée, le stagiaire apparaît dans la session, et il n'y a
 * RIEN à lui envoyer. Personne ne s'en aperçoit — le pipeline affiche un dossier « à 0 % » comme
 * n'importe quel autre début de parcours — jusqu'au jour où l'on cherche son contrat.
 *
 * Pour un organisme certifié Qualiopi, c'est un stagiaire formé sans contrat de formation. Le
 * défaut ne se répare pas après coup : les documents portent des dates, et une convention signée
 * après la fin de la session ne vaut rien.
 *
 * DEUX PARCOURS, DEUX GARDES — c'est ce qui distingue les deux voies d'arrivée :
 *   · le parcours DU DOSSIER (`program_step` actives) vaut pour tout le monde. Sans lui, aucun
 *     document n'est prévu pour le stagiaire, quelle que soit la manière dont il arrive ;
 *   · le parcours ENTREPRISE (`training_program.company_steps`) ne concerne que les inscriptions
 *     passant par une entreprise. Sans lui, c'est l'ENTREPRISE qui n'a ni convention ni devis —
 *     et c'est elle qui paie.
 *
 * La garde REFUSE plutôt qu'elle n'avertit : un avertissement à la création d'un dossier se
 * clique sans se lire, et le dossier existe quand même. Le message dit quoi faire et où.
 */
const noSchema = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

/**
 * @param conn        connexion `db.promise()`
 * @param orgId       organisme
 * @param sessionId   session visée (elle porte la formation)
 * @param viaEntreprise  l'inscription arrive-t-elle par une entreprise ?
 * @returns {Promise<string|null>} message de refus, ou null si l'inscription peut se faire
 */
async function parcoursManquant(conn, orgId, sessionId, viaEntreprise = false) {
    let prog;
    try {
        const [[p]] = await conn.query(
            `SELECT p.id, p.code, p.title, p.company_steps
               FROM training_session s JOIN training_program p ON p.id = s.program_id
              WHERE s.id = ? AND s.organization_id = ?`,
            [sessionId, orgId]);
        prog = p;
    } catch (e) {
        // Schéma inattendu : on ne bloque pas une inscription pour un contrôle qu'on ne sait pas
        // faire. Refuser sur une erreur technique serait pire que le défaut qu'on prévient.
        if (noSchema(e)) return null;
        throw e;
    }
    if (!prog) return null; // session inconnue : c'est à l'appelant de le dire, pas à cette garde

    const nom = `« ${prog.title || prog.code} »`;
    const [[n]] = await conn.query(
        'SELECT COUNT(*) AS n FROM program_step WHERE program_id = ? AND organization_id = ? AND active = 1',
        [prog.id, orgId]);
    if (!n.n) {
        return `La formation ${nom} n'a aucun parcours documentaire : le dossier serait créé sans devis, `
            + 'sans contrat et sans convention. Ouvrez Formations → Modifier → « Parcours documentaire » '
            + 'et ajoutez au moins une étape avant d\'inscrire.';
    }

    if (viaEntreprise) {
        let etapes = prog.company_steps;
        if (typeof etapes === 'string') { try { etapes = JSON.parse(etapes); } catch { etapes = null; } }
        if (!Array.isArray(etapes) || etapes.length === 0) {
            return `La formation ${nom} n'a pas de parcours « À l'arrivée via une entreprise » : `
                + 'l\'entreprise ne recevrait ni convention ni devis, alors que c\'est elle qui paie. '
                + 'Ouvrez Formations → Modifier → « Parcours documentaire » → onglet '
                + '« À l\'arrivée via une entreprise » et ajoutez au moins une étape.';
        }
    }
    return null;
}

module.exports = { parcoursManquant };
