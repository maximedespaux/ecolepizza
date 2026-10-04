/**
 * LA PASTILLE « NOUVEAUX POSTS » DE LA COMMUNAUTÉ — le nombre de publications (questions et
 * annonces) parues DEPUIS la dernière visite d'une personne, ses propres posts exclus.
 *
 * Sert les DEUX côtés avec le même compte : le bureau (via `GET /api/badges`, pastille sur la
 * rubrique Communauté) et le stagiaire (via `getMyAccess`, mêlée aux nouveautés de ses fiches).
 *
 * « VU » = AVOIR OUVERT LA COMMUNAUTÉ. On se repère sur `user.community_seen_at` (migration 106),
 * que la page remet à NOW() à l'ouverture (`markCommunitySeen`). C'est le bon grain pour des posts :
 * le fil se parcourt d'un coup, à la différence d'un commentaire de fiche qui ne se lit qu'en
 * ouvrant la fiche (lui garde son repère plus fin, `recipe_read`). Jamais venu (`community_seen_at`
 * NUL) → tout est neuf, le bon accueil pour une première visite.
 *
 * SES PROPRES POSTS NE COMPTENT PAS : s'auto-notifier de ce qu'on vient d'écrire n'a aucun sens.
 *
 * Tolérant : table `community_post` (114) ou colonne `community_seen_at` (106) absente → 0. Une
 * pastille qui manque vaut mieux qu'un menu en erreur — c'est la règle de tout ce fichier de comptes.
 */
const estSchemaAbsent = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');

async function compterNouveauxPosts(conn, userId, orgId) {
    try {
        const [[row]] = await conn.query(
            `SELECT COUNT(*) AS n
               FROM community_post p
               JOIN user u ON u.id = ?
              WHERE p.organization_id = ?
                AND p.author_user_id <> u.id
                AND p.created_at > COALESCE(u.community_seen_at, '1970-01-01')`,
            [userId, orgId]);
        return Number(row?.n) || 0;
    } catch (e) {
        if (estSchemaAbsent(e)) return 0;
        console.error('Erreur comptage nouveaux posts Communauté :', e.message);
        return 0;
    }
}

module.exports = { compterNouveauxPosts };
