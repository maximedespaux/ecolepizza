/* PURGE DES PROFILS DÉSACTIVÉS DEPUIS 15 SEMAINES (migration 199).
 *
 * Un stagiaire qui a demandé la désactivation de son profil (`user.deactivated_at` posé) et ne
 * s'est PAS reconnecté depuis — toute connexion efface la date — voit, au bout de 15 SEMAINES, ses
 * données NON ESSENTIELLES supprimées, et sa connexion désactivée (`active = 0`).
 *
 * CE QUI PART : la progression Pizza Quest, la mercuriale, les fiches techniques (et ce que le
 *   stagiaire a écrit autour : photos, j'aime, commentaires — les siens).
 * CE QUI RESTE, TOUJOURS : documents générés, pièces, parcours/inscriptions, émargement, factures,
 *   consentements. Tout ce qui a une valeur de PREUVE (Qualiopi, RGPD, comptable).
 *
 * TOLÉRANT : une table absente (fonctionnalité non déployée — les cœurs de quête, retirés ; la
 *   mercuriale) ne fait pas échouer la purge des autres tables. Sans la colonne `deactivated_at`,
 *   le passage sort sans rien faire.
 * IDÉMPOTENT : un compte purgé passe à `active = 0`, donc n'est plus sélectionné — pas de
 *   re-traitement au passage suivant. Un échec sur un compte n'arrête pas les autres.
 */
const SEMAINES = 15;
const MS_PAR_SEMAINE = 7 * 24 * 60 * 60 * 1000;

/** Supprime/écrit en tolérant une table ou une colonne absente (fonctionnalité non déployée). */
async function tolerant(conn, sql, params) {
    try { await conn.query(sql, params); }
    catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; }
}

/** Les données non essentielles d'UN compte (user_id) et de sa fiche (learner_id, s'il en a une). */
async function purgerUn(conn, { user_id, learner_id }) {
    // Fiches techniques : supprimer la fiche cascade sur ses ingrédients, sa photo, et les j'aime /
    // commentaires / lectures portés SUR elle (clés `recipe_id ON DELETE CASCADE`).
    await tolerant(conn, 'DELETE FROM recipe WHERE author_user_id = ?', [user_id]);
    // Ce que le stagiaire a écrit sur les fiches des AUTRES : pas de cascade (clés sans contrainte).
    await tolerant(conn, 'DELETE FROM recipe_like WHERE user_id = ?', [user_id]);
    await tolerant(conn, 'DELETE FROM recipe_comment WHERE user_id = ?', [user_id]);
    await tolerant(conn, 'DELETE FROM recipe_read WHERE user_id = ?', [user_id]);
    // Mercuriale (table parfois absente selon le déploiement).
    await tolerant(conn, 'DELETE FROM mercuriale_item WHERE user_id = ?', [user_id]);
    // Pizza Quest : la progression (étoiles par monde/étape) et les cœurs — clé = learner_id.
    if (learner_id) {
        await tolerant(conn, 'DELETE FROM learner_quest_progress WHERE learner_id = ?', [learner_id]);
        await tolerant(conn, 'DELETE FROM learner_quest_life WHERE learner_id = ?', [learner_id]); // feature retirée (115) : parfois absente
        /* Le profil de jeu porté par la fiche : avatar et cadre (groupés avec la progression dans la
           page Confidentialité). On GARDE `levels` / `completed_levels` (accès aux formations) et
           `cadres_exclusifs` (cadres accordés par l'ÉCOLE, migration 113), qui ne sont pas du jeu. */
        await tolerant(conn, 'UPDATE learner SET avatar = NULL, cadre = NULL WHERE id = ?', [learner_id]);
    }
}

/**
 * Passe en revue les profils désactivés depuis plus de 15 semaines, les purge et coupe leur accès.
 * @param conn        connexion promise
 * @param maintenant  Date de référence (injectable pour les tests)
 * @returns le nombre de comptes purgés
 */
async function purgerComptesDesactives({ conn, maintenant = new Date() } = {}) {
    const cutoff = new Date(maintenant.getTime() - SEMAINES * MS_PAR_SEMAINE);
    let comptes;
    try {
        [comptes] = await conn.query(
            `SELECT u.id AS user_id, u.organization_id, l.id AS learner_id
               FROM user u
               LEFT JOIN learner l ON l.user_id = u.id
              WHERE u.deactivated_at IS NOT NULL AND u.deactivated_at <= ? AND u.active = 1`,
            [cutoff]);
    } catch (e) {
        // Sans la colonne `deactivated_at` (migration 199 non jouée), il n'y a rien à faire.
        if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE')) return 0;
        throw e;
    }
    let n = 0;
    for (const c of comptes) {
        try {
            await purgerUn(conn, c);
            // Accès coupé (active = 0, migration 011) : le compte n'est plus sélectionné ensuite.
            await conn.query('UPDATE user SET active = 0 WHERE id = ?', [c.user_id]);
            console.log(`[désactivation] compte ${c.user_id} purgé et désactivé`);
            n++;
        } catch (e) {
            // Un compte qui échoue n'arrête pas les autres ; il repassera (toujours active = 1).
            console.error('[désactivation] échec purge compte', c.user_id, ':', e.message);
        }
    }
    return n;
}

module.exports = { purgerComptesDesactives, SEMAINES };
