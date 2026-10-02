const db = require('../config/database.js');
const stats = require('../lib/statsConnexions.js');

const FENETRE = 14; // jours affichés sur la courbe « connexions dans le temps » (deux semaines)

/**
 * GET /api/statistiques/connexions — pour la page Statistiques (Qualité & conformité).
 *
 * Deux vues, stagiaires et équipe séparés :
 *  · la RÉPARTITION PAR RÉCENCE, lue sur `user.last_login_at` (dispo tout de suite) ;
 *  · les CONNEXIONS PAR JOUR sur deux semaines, lues sur `connexion_jour` (migration 200). Sans la
 *    table, `par_jour` vaut null : la page affiche la récence, pas la courbe.
 */
const connexions = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const maintenant = new Date();

        const [comptes] = await conn.query(
            'SELECT role, last_login_at FROM user WHERE organization_id = ?', [orgId]);
        const stagiaires = comptes.filter((c) => c.role === 'STAGIAIRE');
        const equipe = comptes.filter((c) => c.role !== 'STAGIAIRE');

        const vue = (liste) => ({
            total: liste.length,
            connectes30: stats.connectesDepuis(liste, 30, maintenant),
            jamais: liste.filter((c) => !c.last_login_at).length,
            recence: stats.repartition(liste, maintenant),
        });

        // Connexions par jour (deux semaines) — tolère l'absence de la table (migration 200 non jouée).
        let parJour = null;
        try {
            const borne = stats.fenetreJours(FENETRE, maintenant)[0];
            const [lignes] = await conn.query(
                `SELECT DATE_FORMAT(jour, '%Y-%m-%d') AS jour,
                        SUM(est_stagiaire = 1) AS stagiaires, SUM(est_stagiaire = 0) AS equipe
                   FROM connexion_jour
                  WHERE organization_id = ? AND jour >= ?
                  GROUP BY jour`, [orgId, borne]);
            parJour = stats.densifier(lignes, FENETRE, maintenant);
        } catch (e) {
            if (!(e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
        }

        res.json({
            data: {
                stagiaires: vue(stagiaires),
                equipe: vue(equipe),
                par_jour: parJour,
                fenetre: FENETRE,
                tranches: stats.TRANCHES,
            },
        });
    } catch (err) {
        console.error('Statistiques connexions :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { connexions };
