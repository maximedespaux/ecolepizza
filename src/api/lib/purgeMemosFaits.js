/* PURGE DES MÉMOS FAITS DEPUIS PLUS D'UN JOUR (demandé le 2026-10-03).
 *
 * Un mémo coché « fait » (colonne `fait_le` posée par `updateMemo`, memo.controller) est un
 * pense-bête accompli. On le GARDE un jour — le temps qu'un collègue le voie passer « fait » sur la
 * liste partagée —, puis on le SUPPRIME, EN BASE : la ligne `memo`, et avec elle ses liens
 * (`memo_lien`, migration 177) et ses pièces jointes (`memo_fichier`, migration 193), qui la suivent
 * par `ON DELETE CASCADE`. Un seul DELETE suffit donc — rien d'autre ne référence `memo`.
 *
 * DÉCOCHER efface `fait_le` (le mémo redevient à faire) : il échappe alors à la purge — voulu.
 * TOLÉRANT : sans la table `memo` (migration 176 non jouée), le passage sort sans rien faire.
 * Le délai est injectable (`maintenant`) pour les tests ; comparé à `fait_le`, une datetime serveur.
 */
const JOURS = 1;
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/**
 * Supprime les mémos faits il y a plus d'un jour (et, par cascade, leurs liens et pièces jointes).
 * @param conn        connexion promise
 * @param maintenant  Date de référence (injectable pour les tests)
 * @returns le nombre de mémos supprimés
 */
async function purgerMemosFaits({ conn, maintenant = new Date() } = {}) {
    const cutoff = new Date(maintenant.getTime() - JOURS * MS_PAR_JOUR);
    try {
        const [r] = await conn.query(
            'DELETE FROM memo WHERE fait_le IS NOT NULL AND fait_le <= ?', [cutoff]);
        return (r && r.affectedRows) || 0;
    } catch (e) {
        // Sans la table `memo` (migration 176 non jouée), il n'y a rien à purger.
        if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE')) return 0;
        throw e;
    }
}

module.exports = { purgerMemosFaits, JOURS };
