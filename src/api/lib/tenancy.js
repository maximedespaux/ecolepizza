/**
 * Cloisonnement entre organismes.
 *
 * L'application est multi-organisme : chaque `organization` doit être hermétique. Le jeton
 * d'authentification porte l'organisme et n'est pas falsifiable, donc les LECTURES filtrées par
 * `organization_id` sont sûres. Le point faible est ailleurs : les identifiants ÉTRANGERS
 * acceptés dans le CORPS d'une requête de création.
 *
 * Le schéma de la faille est toujours le même. On insère une ligne dans son propre organisme,
 * mais qui pointe vers une ligne d'un autre. La lecture qui suit filtre bien sur
 * `organization_id`… et joint sans filtre pour aller chercher un nom. Le nom de l'autre
 * organisme s'affiche alors chez soi. La barrière n'a pas été franchie par la porte d'entrée,
 * elle a été contournée par une clé étrangère.
 *
 * `belongsToOrg` vérifie qu'un identifiant reçu appartient bien à l'organisme appelant. À
 * appeler pour TOUTE clé étrangère venue du corps d'une requête, avant l'écriture.
 *
 * `null` est accepté : une clé étrangère facultative absente n'est pas une intrusion.
 *
 * Cette fonction vivait en copie unique dans invoice.controller.js, où elle était correctement
 * appliquée. Les autres contrôleurs qui acceptent des clés étrangères ne l'avaient pas — non
 * par négligence de principe, mais parce qu'elle n'était pas à portée de main. Elle l'est
 * maintenant.
 */
async function belongsToOrg(conn, table, id, orgId) {
    if (!id) return true;
    const [[row]] = await conn.query(
        `SELECT 1 AS ok FROM ${table} WHERE id = ? AND organization_id = ? LIMIT 1`, [id, orgId]);
    return !!row;
}

module.exports = { belongsToOrg };
