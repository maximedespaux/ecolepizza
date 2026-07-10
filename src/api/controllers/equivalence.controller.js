const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { loadEquivalences, validateMembers } = require('../lib/equivalence.js');
const { loadOrgSteps } = require('./template.controller.js');

// Index slug -> étape fusionnée (pour lire les conditions / libellés).
async function stepIndex(orgId) {
    const steps = await loadOrgSteps(orgId);
    return new Map(steps.map((s) => [s.slug, s]));
}

/** GET /api/equivalences — équivalences (défauts + personnalisées) + documents disponibles. */
const listEquivalences = async (req, res) => {
    try {
        const conn = db.promise();
        const [equivalences, bySlug] = await Promise.all([
            loadEquivalences(conn, req.user.organization_id),
            stepIndex(req.user.organization_id),
        ]);
        // Documents attribuables (modèles actifs) pour la création.
        const docs = [...bySlug.values()]
            .filter((s) => s.active)
            .map((s) => ({ slug: s.slug, label: s.label, doc_type: s.doc_type }));
        // Enrichit chaque membre d'un libellé lisible.
        const enriched = equivalences.map((e) => ({
            ...e, memberLabels: e.members.map((m) => (bySlug.get(m)?.label || m)),
        }));
        res.json({ data: { equivalences: enriched, docs } });
    } catch (err) {
        console.error('Erreur liste équivalences :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/equivalences — crée une équivalence. Corps : { label?, members:[slugs] }. */
const createEquivalence = async (req, res) => {
    try {
        const conn = db.promise();
        const bySlug = await stepIndex(req.user.organization_id);
        const check = validateMembers(req.body?.members, bySlug);
        if (!check.ok) return res.status(422).json({ error: check.error });
        const label = (req.body?.label && String(req.body.label).trim())
            || check.value.map((m) => bySlug.get(m)?.label || m).join(' / ');
        const id = crypto.randomUUID();
        try {
            await conn.query(
                'INSERT INTO document_equivalence (id, organization_id, label, members) VALUES (?, ?, ?, ?)',
                [id, req.user.organization_id, label.slice(0, 160), JSON.stringify(check.value)]);
        } catch (e) {
            if (e && e.code === 'ER_NO_SUCH_TABLE') {
                return res.status(422).json({ error: 'Migration requise (054_document_equivalence).' });
            }
            throw e;
        }
        logAudit(req, 'equivalence.create', 'DocumentEquivalence', id);
        res.status(201).json({ data: { id, label, members: check.value } });
    } catch (err) {
        console.error('Erreur création équivalence :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/equivalences/:id — supprime une équivalence personnalisée. */
const deleteEquivalence = (req, res) => {
    db.query(
        'DELETE FROM document_equivalence WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err, result) => {
            if (err) {
                console.error('Erreur suppression équivalence :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            if (!result.affectedRows) return res.status(404).json({ message: 'Équivalence introuvable' });
            logAudit(req, 'equivalence.delete', 'DocumentEquivalence', req.params.id);
            res.json({ success: true, message: 'Équivalence supprimée' });
        }
    );
};

module.exports = { listEquivalences, createEquivalence, deleteEquivalence };
