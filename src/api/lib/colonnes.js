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

/** La même question pour une TABLE entière (une migration qui en crée une, comme la 163). */
async function tableExiste(conn, table) {
    try {
        const [r] = await conn.query(
            `SELECT 1 FROM information_schema.tables
              WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
            [table]);
        return r.length > 0;
    } catch { return false; }
}

/**
 * LA LARGEUR D'UNE COLONNE TEXTE (nombre de caractères), ou null si elle n'existe pas / se lit mal.
 *
 * Pour les champs chiffrés au repos : une valeur chiffrée (« enc:iv:tag:… ») est bien plus longue
 * que son clair, et l'écrire dans une colonne restée étroite échouerait — ou, hors mode strict,
 * serait TRONQUÉE sans erreur, ce qui la rendrait à jamais illisible. On regarde donc la place
 * avant de chiffrer. Sans cache, pour la raison déjà dite : une migration jouée pendant que le
 * serveur tourne doit être vue tout de suite.
 */
async function largeurColonne(conn, table, colonne) {
    try {
        const [r] = await conn.query(
            `SELECT CHARACTER_MAXIMUM_LENGTH AS n FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
            [table, colonne]);
        return r.length && r[0].n != null ? Number(r[0].n) : null;
    } catch { return null; }
}

module.exports = { colonneExiste, colonneOuNull, tableExiste, largeurColonne };
