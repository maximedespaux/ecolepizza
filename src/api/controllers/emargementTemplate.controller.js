const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { mergeEmargConfig } = require('../lib/emargement.js');

const MIGRATION_HINT = 'Migration requise (058_emargement_template).';

// Slug court, stable et unique par organisme, dérivé du nom.
function slugify(name) {
    const base = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'emargement';
    return `esheet-${base}`.slice(0, 52);
}

/** GET /api/emargement-templates — liste des modèles d'émargement de l'organisme. */
const listTemplates = async (req, res) => {
    try {
        let rows;
        try {
            [rows] = await db.promise().query(
                'SELECT id, slug, name, config, applies_when, active, sort_order FROM emargement_template WHERE organization_id = ? ORDER BY sort_order, name',
                [req.user.organization_id]
            );
        } catch (e) {
            if (e && e.code === 'ER_BAD_FIELD_ERROR') {
                // Colonne applies_when absente (migration 060 non jouée) : on lit sans.
                [rows] = await db.promise().query(
                    'SELECT id, slug, name, config, active, sort_order FROM emargement_template WHERE organization_id = ? ORDER BY sort_order, name',
                    [req.user.organization_id]
                );
            } else { throw e; }
        }
        const parseAW = (v) => { if (!v) return {}; try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return {}; } };
        const data = rows.map((r) => ({
            id: r.id, slug: r.slug, name: r.name, active: !!r.active, sort_order: r.sort_order,
            config: mergeEmargConfig(r.config), applies_when: parseAW(r.applies_when),
        }));
        res.json({ data });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') return res.json({ data: [], migration: MIGRATION_HINT });
        console.error('Erreur liste modèles émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/emargement-templates — crée un modèle. Corps : { name, config? }. */
const createTemplate = async (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(422).json({ error: "Nom requis." });
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        // Slug unique : suffixe -2, -3… si collision.
        let slug = slugify(name);
        const [ex] = await conn.query('SELECT slug FROM emargement_template WHERE organization_id = ?', [orgId]);
        const taken = new Set(ex.map((r) => r.slug));
        if (taken.has(slug)) { let i = 2; while (taken.has(`${slug}-${i}`)) i++; slug = `${slug}-${i}`; }
        const [[mx]] = await conn.query('SELECT COALESCE(MAX(sort_order),90) AS m FROM emargement_template WHERE organization_id = ?', [orgId]);
        const id = crypto.randomUUID();
        const config = JSON.stringify(mergeEmargConfig(req.body?.config));
        const aw = JSON.stringify(req.body?.applies_when && typeof req.body.applies_when === 'object' ? req.body.applies_when : {});
        const sortOrder = (mx.m || 90) + 10;
        try {
            await conn.query(
                'INSERT INTO emargement_template (id, organization_id, slug, name, config, applies_when, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, ?)',
                [id, orgId, slug, name.slice(0, 255), config, aw, sortOrder]
            );
        } catch (e) {
            if (e && e.code === 'ER_BAD_FIELD_ERROR') { // applies_when absent (migration 060) : insert sans
                await conn.query(
                    'INSERT INTO emargement_template (id, organization_id, slug, name, config, active, sort_order) VALUES (?, ?, ?, ?, ?, 1, ?)',
                    [id, orgId, slug, name.slice(0, 255), config, sortOrder]
                );
            } else { throw e; }
        }
        logAudit(req, 'emargement_template.create', 'EmargementTemplate', id);
        res.status(201).json({ data: { id, slug, name, active: true, config: mergeEmargConfig(config) } });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') return res.status(422).json({ error: MIGRATION_HINT });
        console.error('Erreur création modèle émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/emargement-templates/:id — met à jour nom / config / actif. */
const updateTemplate = async (req, res) => {
    try {
        const sets = [];
        const vals = [];
        if (req.body?.name !== undefined) { sets.push('name = ?'); vals.push(String(req.body.name).trim().slice(0, 255) || 'Émargement'); }
        if (req.body?.config !== undefined) { sets.push('config = ?'); vals.push(JSON.stringify(mergeEmargConfig(req.body.config))); }
        if (req.body?.applies_when !== undefined) { sets.push('applies_when = ?'); vals.push(JSON.stringify(req.body.applies_when && typeof req.body.applies_when === 'object' ? req.body.applies_when : {})); }
        if (req.body?.active !== undefined) { sets.push('active = ?'); vals.push(req.body.active ? 1 : 0); }
        if (!sets.length) return res.status(400).json({ message: 'Rien à mettre à jour' });
        const run = async (setList, valList) => {
            const v = [...valList, req.params.id, req.user.organization_id];
            return db.promise().query(`UPDATE emargement_template SET ${setList.join(', ')} WHERE id = ? AND organization_id = ?`, v);
        };
        let r;
        try { [r] = await run(sets, vals); }
        catch (e) {
            if (e && e.code === 'ER_BAD_FIELD_ERROR') { // applies_when absent : on réessaie sans
                const fs = [], fv = [];
                sets.forEach((s, i) => { if (!s.startsWith('applies_when')) { fs.push(s); fv.push(vals[i]); } });
                if (!fs.length) return res.json({ success: true, message: 'Modèle enregistré' });
                [r] = await run(fs, fv);
            } else { throw e; }
        }
        if (!r.affectedRows) return res.status(404).json({ message: 'Modèle introuvable' });
        logAudit(req, 'emargement_template.update', 'EmargementTemplate', req.params.id);
        res.json({ success: true, message: 'Modèle enregistré' });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') return res.status(422).json({ error: MIGRATION_HINT });
        console.error('Erreur mise à jour modèle émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/emargement-templates/:id — supprime un modèle (et son rattachement parcours). */
const deleteTemplate = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[t]] = await conn.query('SELECT slug FROM emargement_template WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!t) return res.status(404).json({ message: 'Modèle introuvable' });
        await conn.query('DELETE FROM emargement_template WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        // Détache le modèle des parcours qui le référençaient.
        await conn.query('DELETE FROM program_step WHERE organization_id = ? AND slug = ?', [orgId, t.slug]);
        logAudit(req, 'emargement_template.delete', 'EmargementTemplate', req.params.id);
        res.json({ success: true, message: 'Modèle supprimé' });
    } catch (err) {
        if (err && err.code === 'ER_NO_SUCH_TABLE') return res.status(422).json({ error: MIGRATION_HINT });
        console.error('Erreur suppression modèle émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listTemplates, createTemplate, updateTemplate, deleteTemplate };
