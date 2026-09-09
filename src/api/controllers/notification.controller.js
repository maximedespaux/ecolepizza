const crypto = require('crypto');
const db = require('../config/database.js');
const { sendMail, appUrl } = require('../lib/mailer.js');
const { notificationEmail } = require('../lib/mailTemplates.js');
const { sectionsVisibles, entitesVisibles, sectionDeLEntite, estLu } = require('../lib/activite.js');

/**
 * Crée une notification (best-effort). user_id null = visible par tout l'organisme.
 */
function notify(orgId, { userId = null, type = 'INFO', title, body = null, link = null }) {
    /* Renvoie une PROMESSE, pour que l'appelant puisse attendre l'insertion avant de répondre.
     *
     * Pourquoi ça compte : toute réponse réussie déclenche une diffusion SSE `refresh` à
     * l'organisme (broadcastMutations), et chaque poste recharge alors ses notifications dans la
     * seconde. Si l'insertion n'est pas encore validée sur la base DISTANTE à ce moment-là, le
     * compteur n'a pas bougé — donc pas de son, pas de cloche : il faut attendre le sondage de
     * secours, jusqu'à vingt-cinq secondes plus tard. Une course qu'on gagne le plus souvent,
     * mais pas toujours, ce qui donne une alerte tantôt immédiate tantôt tardive.
     *
     * Reste au mieux : l'erreur est journalisée et avalée. Une notification manquée ne doit
     * jamais faire échouer l'action qu'elle accompagne. */
    return db.promise()
        .query(
            `INSERT INTO notification (id, organization_id, user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), orgId, userId, type, title, body, link])
        .then(() => {
            // Miroir e-mail — UNIQUEMENT pour une notification adressée à une personne (userId).
            // Une notification d'organisme (userId null) est visible par tous dans l'app ; l'envoyer
            // par mail écrirait à tout le monde, ce qu'on ne veut pas. Best-effort, jamais bloquant.
            if (userId) emailNotification(orgId, userId, { title, body, link });
        })
        .catch((err) => { console.error('notification:', err.message); });
}

/** Double une notification ciblée par un e-mail, si le destinataire a une adresse. Best-effort. */
async function emailNotification(orgId, userId, { title, body, link }) {
    try {
        const [rows] = await db.promise().query(
            'SELECT first_name, email FROM user WHERE id = ? AND organization_id = ?', [userId, orgId]);
        const u = rows[0];
        if (!u || !u.email) return;
        // Le lien stocké est relatif (« /mon-espace ») : un e-mail a besoin d'une URL absolue.
        const lien = link && link.startsWith('/') ? `${appUrl()}${link}` : link;
        const { subject, html } = notificationEmail({ firstName: u.first_name, title, body, link: lien });
        sendMail({ to: u.email, subject, html, kind: 'notifications' });
    } catch (e) {
        console.error('[mail] notification:', e.message);
    }
}

/**
 * Réglages d'activité de la personne : ce qu'elle a le droit de voir, et jusqu'où elle a lu.
 *
 * `dormant` vaut vrai tant que la migration 142 n'est pas jouée : la colonne manque, on ne sait
 * pas où en est la lecture, donc on considère TOUT comme lu. La rubrique s'affiche, mais aucune
 * pastille ne saute — le code marche avant comme après la migration, sans compteur fantaisiste.
 */
async function profilActivite(userId) {
    try {
        const [[row]] = await db.promise().query(
            'SELECT nav_access, activity_seen_at FROM user WHERE id = ?', [userId]);
        return { navAccess: row ? row.nav_access : null, vue: row ? row.activity_seen_at : null, dormant: false };
    } catch (e) {
        if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
        const [[row]] = await db.promise().query('SELECT nav_access FROM user WHERE id = ?', [userId]);
        return { navAccess: row ? row.nav_access : null, vue: null, dormant: true };
    }
}

/**
 * L'ACTIVITÉ VIENT DU JOURNAL D'AUDIT, PAS D'UNE COPIE.
 *
 * Chaque mutation de l'application y est déjà inscrite (une centaine de points d'appel) : qui,
 * quoi, quand. Écrire en plus une notification par action, ce serait doubler l'écriture de
 * toute l'application pour recopier ce qu'on a déjà — avec le risque de la copie, deux vérités
 * qui divergent. On relit donc la source.
 *
 * JAMAIS MES PROPRES ACTIONS : le carillon les tait déjà (cf. Topbar), et une cloche qui
 * m'annonce ce que je viens de faire n'apprend rien à personne.
 *
 * Le filtre par entité est posé AVANT le `LIMIT` : filtrer après ramènerait trente lignes dont
 * un formateur ne pourrait en voir que deux, et sa cloche paraîtrait vide alors qu'elle ne
 * l'est pas.
 */
async function activiteRecente({ orgId, moi, role, navAccess, vue, dormant }) {
    const entites = entitesVisibles(sectionsVisibles({ role, navAccess }));
    if (entites && entites.length === 0) return [];

    const params = [orgId, moi];
    let filtre = '';
    if (entites) {
        filtre = ` AND a.entity IN (${entites.map(() => '?').join(',')})`;
        params.push(...entites);
    }

    const [rows] = await db.promise().query(
        `SELECT a.id, a.action, a.entity, a.created_at AS quand,
                DATE_FORMAT(a.created_at, '%Y-%m-%d %H:%i') AS created_at,
                u.first_name, u.last_name
           FROM audit_log a
           LEFT JOIN user u ON u.id = a.user_id
          WHERE a.organization_id = ? AND a.user_id IS NOT NULL AND a.user_id <> ?${filtre}
          ORDER BY a.created_at DESC
          LIMIT 30`, params);

    return rows.map((r) => ({
        /* Préfixe `activite:` — l'identifiant vient d'`audit_log`, pas de `notification`. Il ne
           doit jamais être envoyé à « marquer comme lue » : une marque « jusqu'ici » ne sait pas
           dire l'état d'UNE ligne. C'est « Tout marquer comme lu » qui fait avancer la date. */
        id: `activite:${r.id}`,
        type: 'ACTIVITE',
        /* Le code brut, PAS un libellé français : la traduction appartient à l'interface
           (`ui/lib/auditLabels.js`, qui la fait déjà pour le journal et le tableau de bord).
           En tenir une seconde table ici, c'est le défaut déjà payé une fois — celle du tableau
           de bord couvrait huit codes sur soixante-quatre et divergeait en silence. */
        action: r.action,
        entity: r.entity,
        auteur: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Quelqu\u2019un',
        title: null,
        body: null,
        // La rubrique EST une route de menu valide, et c'est une rubrique qu'on a le droit
        // d'ouvrir puisqu'elle vient d'être filtrée sur les accès. Un lien qui marche toujours.
        link: sectionDeLEntite(r.entity),
        is_read: estLu({ quand: r.quand, vue, dormant }) ? 1 : 0,
        created_at: r.created_at,
    }));
}

/**
 * GET /api/notifications — alertes adressées + activité de l'organisme, mêlées par date.
 */
const getNotifications = async (req, res) => {
    try {
        const { organization_id: orgId, id: moi, role } = req.user;
        const { navAccess, vue, dormant } = await profilActivite(moi);

        const [notifs] = await db.promise().query(
            `SELECT id, type, title, body, link, is_read,
                    DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
             FROM notification
             WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL)
             ORDER BY created_at DESC
             LIMIT 40`, [orgId, moi]);

        const activite = await activiteRecente({ orgId, moi, role, navAccess, vue, dormant });

        // Le format « AAAA-MM-JJ hh:mm » se trie comme une date : comparaison de chaînes suffisante.
        const tout = [...notifs, ...activite].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        // Compté sur la liste ENTIÈRE, avant la coupe : un non-lu repoussé au-delà des quarante
        // premières lignes reste un non-lu — sinon la pastille ment par arrondi.
        const unread = tout.filter((r) => !r.is_read).length;
        res.json({ data: tout.slice(0, 40), unread });
    } catch (err) {
        console.error('Erreur notifications :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/notifications/:id/read — marque comme lue.
 */
const markRead = (req, res) => {
    db.query(
        `UPDATE notification SET is_read = 1
         WHERE id = ? AND organization_id = ? AND (user_id = ? OR user_id IS NULL)`,
        [req.params.id, req.user.organization_id, req.user.id],
        (err) => {
            if (err) return res.status(400).json({ message: 'Erreur' });
            res.json({ success: true });
        }
    );
};

/**
 * POST /api/notifications/read-all — marque tout comme lu.
 */
const markAllRead = async (req, res) => {
    try {
        await db.promise().query(
            `UPDATE notification SET is_read = 1
             WHERE organization_id = ? AND (user_id = ? OR user_id IS NULL) AND is_read = 0`,
            [req.user.organization_id, req.user.id]);
        /* Et la marque « j'ai lu l'activité jusqu'ici ». Best-effort volontaire : tant que la
           migration 142 n'est pas jouée, la colonne n'existe pas et l'échec ne doit pas empêcher
           les vraies notifications d'être marquées lues. */
        try {
            await db.promise().query('UPDATE user SET activity_seen_at = NOW() WHERE id = ?', [req.user.id]);
        } catch (e) {
            if (e.code !== 'ER_BAD_FIELD_ERROR') throw e;
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur marquage notifications :', err);
        res.status(400).json({ message: 'Erreur' });
    }
};

module.exports = { getNotifications, markRead, markAllRead, notify };
