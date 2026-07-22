/**
 * L'entité émettrice d'une facture — le vendeur sous lequel elle sort.
 *
 * Un seul endroit pour trois questions qui, éparpillées, divergeraient : quelle entité applique
 * une facture, sous quel numéro, et avec quelle identité. La facture et la vente en caisse
 * appellent toutes deux ces helpers, plutôt que d'en réimplémenter chacune sa version.
 *
 * TOUT EST OPTIONNEL AU DEGRÉ PRÈS DE LA MIGRATION. Tant que la 113 n'est pas jouée, la table
 * n'existe pas : chaque fonction retombe silencieusement sur l'organisme, comportement d'avant.
 */

const isMissingSchema = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

/** Charge une entité émettrice par son id (bornée à l'organisme). null si absente / non migrée. */
async function loadEmitter(conn, orgId, profileId) {
    if (!profileId) return null;
    try {
        const [[row]] = await conn.query(
            'SELECT * FROM billing_profile WHERE id = ? AND organization_id = ?', [profileId, orgId]);
        return row || null;
    } catch (e) {
        if (isMissingSchema(e)) return null;
        throw e;
    }
}

/** L'émettrice par défaut de l'organisme, ou null (aucune, ou migration non jouée). */
async function defaultEmitter(conn, orgId) {
    try {
        const [[row]] = await conn.query(
            'SELECT * FROM billing_profile WHERE organization_id = ? AND is_default = 1 LIMIT 1', [orgId]);
        return row || null;
    } catch (e) {
        if (isMissingSchema(e)) return null;
        throw e;
    }
}

/**
 * Résout l'émettrice à appliquer : celle demandée si elle appartient à l'organisme, sinon la
 * défaut, sinon rien (l'appelant retombe alors sur l'organisme).
 */
async function resolveEmitter(conn, orgId, requestedId) {
    if (requestedId) {
        const asked = await loadEmitter(conn, orgId, requestedId);
        if (asked) return asked;
    }
    return defaultEmitter(conn, orgId);
}

/**
 * Numéro suivant pour une émettrice, et incrément de SON compteur.
 *
 * Chaque entité tient une séquence CONTINUE (la loi l'exige) : on n'entremêle pas les compteurs.
 * Le numéro porte le préfixe de l'entité — distinct d'une entité à l'autre (contrainte
 * uq_billing_prefix), ce qui garantit aussi l'unicité globale du numéro de facture.
 *
 * L'incrément est fait AVANT d'insérer la facture : deux ventes simultanées ne doivent pas lire
 * le même compteur. On rend le numéro déjà réservé.
 */
async function nextNumberForEmitter(conn, emitter) {
    const year = new Date().getFullYear();
    const n = Number(emitter.next_number) || 1;
    const prefix = emitter.invoice_prefix || 'F';
    const number = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
    await conn.query('UPDATE billing_profile SET next_number = ? WHERE id = ?', [n + 1, emitter.id]);
    return number;
}

module.exports = { loadEmitter, defaultEmitter, resolveEmitter, nextNumberForEmitter, isMissingSchema };
