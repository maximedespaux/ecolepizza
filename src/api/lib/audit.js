const crypto = require('crypto');
const db = require('../config/database.js');

/**
 * Journalise une action sensible (best-effort, non bloquant).
 * @param {object} req  requête Express (pour organization_id + user id)
 * @param {string} action  ex. « document.send », « learner.create »
 * @param {string} [entity]  ex. « GeneratedDocument »
 * @param {string} [entityId]
 */
function logAudit(req, action, entity = null, entityId = null) {
    try {
        db.query(
            `INSERT INTO audit_log (id, organization_id, user_id, action, entity, entity_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), req.user?.organization_id || null, req.user?.id || null, action, entity, entityId],
            (err) => { if (err) console.error('audit_log:', err.message); }
        );
    } catch (e) {
        console.error('audit_log:', e.message);
    }
}

module.exports = { logAudit };
