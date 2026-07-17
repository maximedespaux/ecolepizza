const db = require('../config/database.js');

// Compte résilient : renvoie 0 si la table n'existe pas encore (migration non jouée).
async function count(conn, sql, params) {
    try {
        const [rows] = await conn.query(sql, params);
        return rows[0].n || 0;
    } catch {
        return 0;
    }
}

/**
 * GET /api/badges — pastilles de la navigation (par chemin de page).
 */
const getBadges = async (req, res) => {
    const conn = db.promise();
    const org = req.user.organization_id;
    const [lowStock, unpaid, shopPending] = [
        await count(conn, 'SELECT COUNT(*) AS n FROM inventory_item WHERE organization_id = ? AND quantity <= threshold', [org]),
        await count(conn, "SELECT COUNT(*) AS n FROM invoice WHERE organization_id = ? AND type IN ('FACTURE','ACOMPTE') AND status IN ('EMISE','IMPAYEE')", [org]),
        // Demandes boutique en cours : ni remises (terminées) ni annulées.
        await count(conn, "SELECT COUNT(*) AS n FROM shop_request WHERE organization_id = ? AND status NOT IN ('REMISE', 'ANNULEE')", [org]),
    ];
    res.json({
        data: {
            '/inventaire': lowStock,
            '/factures': unpaid,
            '/demandes-boutique': shopPending,
        },
    });
};

module.exports = { getBadges };
