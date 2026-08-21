/**
 * SONDER UNE COLONNE FACULTATIVE — l'outil du « le code marche avant ET après la migration ».
 *
 * POURQUOI CE FICHIER. Chaque contrôleur qui touche une colonne récente réinventait le même
 * sondage (`colRemise` dans l'inventaire) ou, pire, une CASCADE D'ESSAIS : tenter la requête
 * complète, rattraper `ER_BAD_FIELD_ERROR`, réessayer sans la colonne. La cascade tient pour UNE
 * colonne optionnelle ; à deux elle demande quatre tentatives, à trois huit — et chaque
 * combinaison est une requête de plus à garder juste.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * AUCUN CACHE, ET C'EST DÉLIBÉRÉ.
 *
 * Mémoriser le résultat rendrait le serveur AVEUGLE à une migration jouée pendant qu'il tourne :
 * la colonne existe, la fonctionnalité reste invisible, et rien n'indique qu'il faut redémarrer.
 * Or c'est exactement le déroulé habituel — on joue la migration sur la base pendant que l'appli
 * est ouverte. Un `SELECT` sur `information_schema` coûte bien moins cher qu'une demi-heure à
 * chercher pourquoi une colonne « n'est pas prise en compte ».
 *
 * En cas d'erreur, on répond `false` : ne pas savoir revient à faire comme si la colonne n'était
 * pas là, ce qui dégrade la fonctionnalité au lieu de casser l'écran.
 */
async function colonneExiste(conn, table, colonne) {
    try {
        const [r] = await conn.query(
            `SELECT 1 FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
            [table, colonne]);
        return r.length > 0;
    } catch { return false; }
}

/**
 * Rend `colonne` si elle existe, sinon `NULL AS colonne` — à glisser tel quel dans un `SELECT`.
 *
 * L'ALIAS EST INDISPENSABLE : sans lui, la ligne rendue n'aurait pas la clé du tout, et l'écran ne
 * pourrait pas distinguer « colonne absente » de « valeur vide ». Avec, il reçoit toujours la même
 * forme d'objet et lit `null` — ce qui lui permet, par exemple, de MASQUER une commande plutôt que
 * d'afficher une case qui ne s'enregistrerait pas.
 */
async function colonneOuNull(conn, table, colonne, prefixe = '') {
    return await colonneExiste(conn, table, colonne)
        ? `${prefixe}${colonne}`
        : `NULL AS ${colonne}`;
}

module.exports = { colonneExiste, colonneOuNull };
