const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const {
    OPERATORS, ELIGIBLE_TABLES, getAllFields, getEnabledFields, validateCondition,
} = require('../lib/conditions.js');

// Slug court, stable, unique par organisme.
const toSlug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function parseValue(raw) {
    if (raw == null) return null;
    try { return JSON.parse(raw); } catch { return raw; }
}

/** GET /api/conditions/catalog — champs ACTIVÉS + opérateurs (sélecteur de conditions). */
const getCatalog = async (req, res) => {
    try {
        const fields = await getEnabledFields(db.promise(), req.user.organization_id);
        res.json({ data: { fields, operators: OPERATORS } });
    } catch (err) {
        console.error('Erreur catalogue conditions :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/conditions/field-values?field=table.column — valeurs existantes (suggestions). */
const getFieldValues = async (req, res) => {
    try {
        const conn = db.promise();
        const catalog = await getEnabledFields(conn, req.user.organization_id);
        const f = catalog.find((x) => x.key === req.query.field);
        if (!f) return res.json({ data: [] });
        // enum : valeurs connues du schéma ; bool/number/virtual : pas de suggestion.
        if (f.type === 'enum') return res.json({ data: (f.options || []).map((o) => o.value) });
        if (f.type !== 'text' || f.table === 'virtual') return res.json({ data: [] });
        // Sécurité : table + colonne proviennent du catalogue (liste blanche), jamais du client.
        if (!ELIGIBLE_TABLES.includes(f.table) || !/^[a-z0-9_]+$/.test(f.column)) return res.json({ data: [] });
        const [rows] = await conn.query(
            `SELECT DISTINCT \`${f.column}\` AS v FROM \`${f.table}\`
             WHERE organization_id = ? AND \`${f.column}\` IS NOT NULL AND \`${f.column}\` <> ''
             ORDER BY v LIMIT 100`,
            [req.user.organization_id]
        );
        res.json({ data: rows.map((r) => r.v) });
    } catch (err) {
        console.error('Erreur valeurs de champ :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/conditions/fields — TOUS les champs éligibles (page Réglages). */
const getFields = async (req, res) => {
    try {
        const fields = await getAllFields(db.promise(), req.user.organization_id);
        res.json({ data: fields });
    } catch (err) {
        console.error('Erreur champs du dossier :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/conditions/fields — enregistre l'activation + libellés. Corps : { fields:[{table,column,enabled,label}] }. */
const saveFields = async (req, res) => {
    const list = Array.isArray(req.body?.fields) ? req.body.fields : null;
    if (!list) return res.status(422).json({ error: 'Liste des champs requise.' });
    const allowed = new Set([...ELIGIBLE_TABLES, 'virtual']);
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        for (const f of list) {
            const table = String(f.table || '');
            const column = String(f.column || '');
            if (!allowed.has(table) || !/^[a-z0-9_]+$/.test(column)) continue; // ignore les entrées douteuses
            // Suppression puis insertion (upsert robuste, indépendant de la clé unique,
            // et nettoie d'éventuels doublons hérités).
            await conn.query(
                'DELETE FROM condition_field WHERE organization_id = ? AND source_table = ? AND column_name = ?',
                [orgId, table, column]
            );
            await conn.query(
                `INSERT INTO condition_field (id, organization_id, source_table, column_name, enabled, label)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), orgId, table, column, f.enabled ? 1 : 0,
                    f.label ? String(f.label).slice(0, 160) : null]
            );
        }
        logAudit(req, 'condition_field.save', 'ConditionField', req.user.organization_id);
        res.json({ success: true, message: 'Champs du dossier enregistrés.' });
    } catch (err) {
        console.error('Erreur enregistrement champs :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/conditions — conditions personnalisées de l'organisme. */
const listConditions = (req, res) => {
    db.query(
        'SELECT id, slug, label, field, op, value FROM document_condition WHERE organization_id = ? ORDER BY label',
        [req.user.organization_id],
        (err, rows) => {
            if (err) {
                console.error('Erreur liste conditions :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.json({ data: rows.map((r) => ({ ...r, value: parseValue(r.value) })) });
        }
    );
};

/** POST /api/conditions — crée une condition. Corps : { label, field, op, value }. */
const createCondition = async (req, res) => {
    try {
        const { label, field, op } = req.body || {};
        if (!label || !String(label).trim()) return res.status(422).json({ error: 'Intitulé requis.' });
        const conn = db.promise();
        const catalog = await getEnabledFields(conn, req.user.organization_id);
        const check = validateCondition(catalog, { field, op, value: req.body?.value });
        if (!check.ok) return res.status(422).json({ error: check.error });

        const base = toSlug(label) || 'condition';
        let slug = base;
        for (let i = 2; i <= 50; i++) {
            const [[dup]] = await conn.query(
                'SELECT 1 AS x FROM document_condition WHERE organization_id = ? AND slug = ? LIMIT 1',
                [req.user.organization_id, slug]
            );
            if (!dup) break;
            slug = `${base}-${i}`.slice(0, 60);
        }
        const id = crypto.randomUUID();
        await conn.query(
            'INSERT INTO document_condition (id, organization_id, slug, label, field, op, value) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, req.user.organization_id, slug, String(label).trim().slice(0, 160), field, op,
                check.value == null ? null : JSON.stringify(check.value)]
        );
        logAudit(req, 'condition.create', 'DocumentCondition', id);
        res.status(201).json({ data: { id, slug, label: String(label).trim(), field, op, value: check.value } });
    } catch (err) {
        console.error('Erreur création condition :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/conditions/:id — supprime une condition (cloisonné à l'organisme). */
const deleteCondition = (req, res) => {
    db.query(
        'DELETE FROM document_condition WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err, result) => {
            if (err) {
                console.error('Erreur suppression condition :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            if (!result.affectedRows) return res.status(404).json({ message: 'Condition introuvable' });
            logAudit(req, 'condition.delete', 'DocumentCondition', req.params.id);
            res.json({ success: true, message: 'Condition supprimée' });
        }
    );
};

module.exports = { getCatalog, getFieldValues, getFields, saveFields, listConditions, createCondition, deleteCondition };
