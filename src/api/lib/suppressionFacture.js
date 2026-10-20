/**
 * SUPPRIMER UNE FACTURE PAR SON ID — le cœur partagé par les deux chemins qui suppriment une facture.
 *
 *   (1) la suppression DIRECTE d'une facture (deleteInvoice, page Facturation) ;
 *   (2) la suppression de la DERNIÈRE ligne de vente d'une facture boutique (deleteSale, Ventes &
 *       Inventaire) — une facture boutique et ses lignes de vente sont une même transaction.
 *
 * Dans l'ordre : on retire la facture (ses `invoice_line` et ses paiements partent par CASCADE,
 * clés étrangères de schema.sql), PUIS les lignes de vente liées (`material_sale`, migration 069 —
 * cette colonne n'a PAS de clé étrangère, d'où ce nettoyage explicite ; sans lui le montant resterait
 * en comptabilité « Ventes de matériel » alors que la facture a disparu). Le stock n'est pas remonté :
 * supprimer une facture corrige le chiffre, pas l'inventaire. On règle ensuite le compteur de
 * numérotation (un BROUILLON peut rendre son numéro, cf. rendreLeNumero), puis on journalise.
 *
 * Tolérant : sans la 113 (entité émettrice) la 1re requête échoue sur la colonne et on retombe sur la
 * variante sans elle ; sans la 069, on ne touche pas `material_sale`.
 *
 * Rend de quoi composer le message de l'appelant : le numéro de la facture, si ce numéro est rendu
 * (et sinon pourquoi), et le nombre de lignes de vente retirées. `{ trouve: false }` si aucune
 * facture de cet organisme ne porte cet id — l'appelant répond alors 404, et RIEN n'a été supprimé.
 */
const { rendreLeNumero } = require('./emitter.js');
const { logAudit } = require('./audit.js');
const { colonneExiste } = require('./colonnes.js');

async function supprimerFactureParId(conn, orgId, id, req) {
    let inv;
    try {
        [[inv]] = await conn.query(
            'SELECT id, number, status, billing_profile_id FROM invoice WHERE id = ? AND organization_id = ?',
            [id, orgId]);
    } catch (e) {
        // Sans la migration 113, aucune entité émettrice : il n'y a pas de compteur à reculer.
        if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e;
        [[inv]] = await conn.query(
            'SELECT id, number, status, NULL AS billing_profile_id FROM invoice WHERE id = ? AND organization_id = ?',
            [id, orgId]);
    }
    if (!inv) return { trouve: false };
    await conn.query('DELETE FROM invoice WHERE id = ? AND organization_id = ?', [inv.id, orgId]);

    let ventesRetirees = 0;
    if (await colonneExiste(conn, 'material_sale', 'invoice_id')) {
        const [r] = await conn.query(
            'DELETE FROM material_sale WHERE invoice_id = ? AND organization_id = ?', [inv.id, orgId]);
        ventesRetirees = r.affectedRows || 0;
    }

    const sort = inv.status === 'BROUILLON'
        ? await rendreLeNumero(conn, orgId, inv.billing_profile_id, inv.number)
        : { rendu: false, raison: 'emis' };
    logAudit(req, 'invoice.delete', 'Invoice', inv.id, { libelle: inv.number });
    return { trouve: true, number: inv.number, numero_rendu: !!sort.rendu, raison: sort.raison, ventes_retirees: ventesRetirees };
}

module.exports = { supprimerFactureParId };
