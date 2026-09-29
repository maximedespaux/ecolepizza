/**
 * UNE FICHE QU'ON PEUT OUVRIR : la sienne, ou une fiche PARTAGÉE de son organisme.
 *
 * La règle vit ici, et nulle part ailleurs, parce que deux contrôleurs la posent : les
 * interactions d'une fiche (j'aime, commentaires — recipe.controller.js) et sa photo
 * (photoFiche.controller.js). Deux copies d'une règle d'accès finissent par diverger, et c'est
 * toujours la plus permissive qu'on découvre en production.
 *
 * Rend la fiche, `null` si elle n'existe pas, `false` si elle existe mais n'est pas ouvrable.
 */
async function accessibleRecipe(conn, id, user) {
    const [[r]] = await conn.query('SELECT id, author_user_id, organization_id, visibility FROM recipe WHERE id = ?', [id]);
    if (!r) return null;
    const ok = r.author_user_id === user.id || (r.visibility === 'SHARED' && r.organization_id === user.organization_id);
    return ok ? r : false;
}

module.exports = { accessibleRecipe };
