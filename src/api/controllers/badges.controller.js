const db = require('../config/database.js');
const { CONTRAT_VALABLE } = require('../lib/contratPartenaire.js');

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
 * LES STAGIAIRES QU'ON N'A JAMAIS INTERROGÉS sur la transmission aux partenaires.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * NI ACCEPTÉ NI REFUSÉ = AUCUNE LIGNE AU REGISTRE. Le registre est en ajout seul : une personne
 * qui s'est prononcée y a forcément une ligne, quelle qu'ait été sa réponse. L'absence de ligne
 * est donc le seul état qui signifie « on ne lui a jamais demandé » — et c'est exactement ce que
 * l'écran de session appelle « jamais sollicité ». La pastille compte la même chose que lui.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * SEULEMENT LES SESSIONS EN COURS OU À VENIR. Compter tout le fichier ferait une pastille à
 * quatre chiffres, constante, que personne ne pourrait faire descendre : les stagiaires d'il y a
 * six ans ne repasseront pas. Une pastille qui ne bouge jamais cesse d'être lue. Ne restent que
 * les gens que l'école a effectivement en face d'elle, donc à qui la question peut être posée.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ET RIEN SI PERSONNE NE REÇOIT RIEN. Tant qu'aucun partenaire n'est coché destinataire — c'est
 * le cas au lendemain de la 131, qui démarre à zéro — la question n'a pas d'objet : on
 * demanderait l'autorisation de transmettre à personne. La pastille ferait courir l'école après
 * des signatures pour un flux qui n'existe pas. Le contrat compte aussi : un partenaire dont la
 * convention est échue ne reçoit plus rien.
 *
 * `count()` renvoie 0 sur toute erreur, ce qui couvre les migrations non jouées (130 : pas de
 * registre, 131 : pas de colonne destinataire). Une pastille absente est le bon défaut — elle
 * réclame une action, et réclamer une action impossible ne sert personne.
 */
async function sansReponsePartenaires(conn, org) {
    const destinataires = await count(conn,
        `SELECT COUNT(*) AS n FROM partner p
          WHERE p.organization_id = ? AND p.recoit_coordonnees = 1 AND ${CONTRAT_VALABLE('p')}`,
        [org]);
    if (!destinataires) return 0;

    return count(conn,
        /* DISTINCT : un stagiaire inscrit à deux sessions en cours est UNE personne à qui l'on
           doit poser UNE question. Sans lui, la pastille comptait des inscriptions. */
        `SELECT COUNT(DISTINCT e.learner_id) AS n
           FROM enrollment e
           JOIN training_session s ON s.id = e.session_id
           LEFT JOIN consent_record c
                  ON c.learner_id = e.learner_id
                 AND c.organization_id = e.organization_id
                 AND c.finalite = 'partenaires'
          WHERE e.organization_id = ?
            AND COALESCE(s.end_date, s.start_date) >= CURDATE()
            AND c.id IS NULL`,
        [org]);
}

/**
 * GET /api/badges — pastilles de la navigation (par chemin de page).
 */
const getBadges = async (req, res) => {
    const conn = db.promise();
    const org = req.user.organization_id;
    const [lowStock, unpaid, shopPending, consentManquant] = [
        await count(conn, 'SELECT COUNT(*) AS n FROM inventory_item WHERE organization_id = ? AND quantity <= threshold', [org]),
        await count(conn, "SELECT COUNT(*) AS n FROM invoice WHERE organization_id = ? AND type IN ('FACTURE','ACOMPTE') AND status IN ('EMISE','IMPAYEE')", [org]),
        // Demandes boutique en cours : ni remises (terminées) ni annulées.
        await count(conn, "SELECT COUNT(*) AS n FROM shop_request WHERE organization_id = ? AND status NOT IN ('REMISE', 'ANNULEE')", [org]),
        await sansReponsePartenaires(conn, org),
    ];
    res.json({
        data: {
            '/inventaire': lowStock,
            '/factures': unpaid,
            '/demandes-boutique': shopPending,
            '/sessions': consentManquant,
        },
    });
};

module.exports = { getBadges };
