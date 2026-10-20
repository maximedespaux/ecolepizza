/**
 * L'ENTITÉ ÉMETTRICE (billing_profile) D'UNE ÉCRITURE COMPTABLE MANUELLE — dépense, produit divers,
 * apport de partenaire (migration 210). Une seule règle, partagée par les trois points de saisie.
 *
 * ON N'ÉCRIT LA COLONNE QUE SI ELLE EXISTE : sans la 210, l'INSERT la mentionnant échouerait
 * (ER_BAD_FIELD_ERROR). Et un id d'entité absent ou étranger à l'organisme devient `null` (non
 * rattachée), jamais une erreur de clé étrangère — l'écriture compte alors dans « Toutes les
 * entités » seulement. Rend de quoi bâtir un INSERT dynamique : `{ exists, value }`.
 */
const { colonneExiste } = require('./colonnes.js');
const { belongsToOrg } = require('./tenancy.js');

async function colonneEntite(conn, orgId, table, id) {
    if (!await colonneExiste(conn, table, 'billing_profile_id')) return { exists: false, value: null };
    const value = id && await belongsToOrg(conn, 'billing_profile', id, orgId) ? id : null;
    return { exists: true, value };
}

module.exports = { colonneEntite };
