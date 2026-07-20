/**
 * Structure de Pizza Quest — côté organisme (phase 1).
 *
 * Deux axes de classement (`quest_category.kind`) et un graphe de prérequis :
 *   · THEME → de quoi parle la formation (Pizza, Gestion, Hygiène) ;
 *   · TIER  → à quel niveau elle se situe (Débutant, Confirmé, Expert) ;
 *   · prérequis → quelle formation doit être TERMINÉE avant d'attaquer celle-ci.
 *
 * Tout est facultatif : une formation sans thème, sans palier et sans prérequis se comporte
 * exactement comme avant (monde libre sur la carte). L'organisme structure s'il le souhaite.
 *
 * Migration 101 non jouée → les lectures renvoient une structure vide et les écritures un 503
 * explicite, plutôt qu'une 500 opaque.
 */
const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { wouldCycle } = require('../lib/questgraph.js');

const isMissingSchema = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE');
const MIGRATION_HINT = 'Migration requise : appliquez 101_quest_structure.sql.';
const KINDS = ['THEME', 'TIER'];
const toSlug = (s) => String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // « Hygiène » → « hygiene »
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);

/** Toutes les arêtes de prérequis de l'organisme (pour la détection de cycle). */
async function loadEdges(conn, orgId) {
    try {
        const [rows] = await conn.query(
            'SELECT program_id, requires_program_id FROM quest_prerequisite WHERE organization_id = ?', [orgId]);
        return rows;
    } catch (e) { if (isMissingSchema(e)) return []; throw e; }
}

/**
 * GET /api/quest/structure — tout ce qu'il faut à l'écran de gestion, en un appel :
 * catégories (par axe), formations avec leur rattachement, et les prérequis.
 */
const getQuestStructure = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;

        let categories = [];
        try {
            const [rows] = await conn.query(
                `SELECT id, kind, name, slug, color, icon, sort_order
                 FROM quest_category WHERE organization_id = ? ORDER BY kind, sort_order, name`,
                [orgId]
            );
            categories = rows;
        } catch (e) { if (!isMissingSchema(e)) throw e; }

        // Les formations restent listées même sans les colonnes quest_* (migration non jouée) :
        // l'écran s'affiche, simplement rien n'est encore rattaché.
        let programs = [];
        try {
            const [rows] = await conn.query(
                `SELECT id, code, title, color, quest_theme_id, quest_tier_id
                 FROM training_program WHERE organization_id = ? ORDER BY sort_order, code`,
                [orgId]
            );
            programs = rows;
        } catch (e) {
            if (!isMissingSchema(e)) throw e;
            const [rows] = await conn.query(
                'SELECT id, code, title, color FROM training_program WHERE organization_id = ? ORDER BY sort_order, code', [orgId]);
            programs = rows.map((p) => ({ ...p, quest_theme_id: null, quest_tier_id: null }));
        }

        let prerequisites = [];
        try {
            const [rows] = await conn.query(
                `SELECT id, program_id, requires_program_id FROM quest_prerequisite
                 WHERE organization_id = ?`, [orgId]);
            prerequisites = rows;
        } catch (e) { if (!isMissingSchema(e)) throw e; }

        res.json({ data: { categories, programs, prerequisites } });
    } catch (err) {
        console.error('Erreur structure quest :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/quest/categories — { kind, name, color?, icon? } */
const createQuestCategory = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const kind = String(req.body?.kind || '').toUpperCase();
        const name = String(req.body?.name || '').trim();
        if (!KINDS.includes(kind)) return res.status(422).json({ message: 'Axe inconnu (thème ou palier).' });
        if (!name) return res.status(422).json({ message: 'Intitulé requis.' });

        // Slug unique PAR AXE : « Expert » peut exister comme thème et comme palier.
        const base = toSlug(name) || 'categorie';
        let slug = base;
        try {
            for (let i = 2; i <= 50; i++) {
                const [[dup]] = await conn.query(
                    'SELECT 1 AS x FROM quest_category WHERE organization_id = ? AND kind = ? AND slug = ? LIMIT 1',
                    [orgId, kind, slug]);
                if (!dup) break;
                slug = `${base}-${i}`;
            }
            const [[mx]] = await conn.query(
                'SELECT COALESCE(MAX(sort_order), 0) AS n FROM quest_category WHERE organization_id = ? AND kind = ?',
                [orgId, kind]);
            const id = crypto.randomUUID();
            await conn.query(
                `INSERT INTO quest_category (id, organization_id, kind, name, slug, color, icon, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, orgId, kind, name.slice(0, 120), slug,
                 req.body?.color ? String(req.body.color).slice(0, 20) : null,
                 req.body?.icon ? String(req.body.icon).slice(0, 40) : null,
                 Number(mx.n) + 10]
            );
            await logAudit(req, 'CREATE', 'quest_category', id, { kind, name });
            res.status(201).json({ success: true, data: { id, kind, name, slug } });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
    } catch (err) {
        console.error('Erreur création catégorie quest :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/quest/categories/:id — { name?, color?, icon?, sort_order? } */
const updateQuestCategory = async (req, res) => {
    try {
        const conn = db.promise();
        const sets = [], vals = [];
        if (req.body?.name !== undefined) {
            const name = String(req.body.name).trim();
            if (!name) return res.status(422).json({ message: 'Intitulé requis.' });
            sets.push('name = ?'); vals.push(name.slice(0, 120));
        }
        for (const [f, len] of [['color', 20], ['icon', 40]]) {
            if (req.body?.[f] !== undefined) {
                sets.push(`${f} = ?`);
                vals.push(req.body[f] ? String(req.body[f]).slice(0, len) : null);
            }
        }
        if (req.body?.sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(Number(req.body.sort_order) || 0); }
        if (!sets.length) return res.json({ success: true });
        try {
            const [r] = await conn.query(
                `UPDATE quest_category SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`,
                [...vals, req.params.id, req.user.organization_id]);
            if (!r.affectedRows) return res.status(404).json({ message: 'Catégorie introuvable.' });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        await logAudit(req, 'UPDATE', 'quest_category', req.params.id, req.body);
        res.json({ success: true, message: 'Catégorie enregistrée.' });
    } catch (err) {
        console.error('Erreur maj catégorie quest :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/quest/categories/:id — supprime et DÉTACHE les formations concernées.
 * Le détachement est fait ici (pas par une clé étrangère ON DELETE SET NULL) : les colonnes
 * quest_theme_id / quest_tier_id sont volontairement sans contrainte, cf. migration 101.
 */
const deleteQuestCategory = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        try {
            const [[cat]] = await conn.query(
                'SELECT id, kind FROM quest_category WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
            if (!cat) return res.status(404).json({ message: 'Catégorie introuvable.' });
            const col = cat.kind === 'THEME' ? 'quest_theme_id' : 'quest_tier_id';
            await conn.query(
                `UPDATE training_program SET ${col} = NULL WHERE organization_id = ? AND ${col} = ?`,
                [orgId, req.params.id]).catch((e) => { if (!isMissingSchema(e)) throw e; });
            await conn.query('DELETE FROM quest_category WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        await logAudit(req, 'DELETE', 'quest_category', req.params.id, null);
        res.json({ success: true, message: 'Catégorie supprimée.' });
    } catch (err) {
        console.error('Erreur suppression catégorie quest :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/quest/programs/:id — rattache une formation à ses catégories.
 * Corps : { quest_theme_id?, quest_tier_id? } — `null` détache.
 */
const setProgramCategories = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const sets = [], vals = [];
        for (const [field, kind] of [['quest_theme_id', 'THEME'], ['quest_tier_id', 'TIER']]) {
            if (req.body?.[field] === undefined) continue;
            const v = req.body[field] || null;
            if (v) {
                // La catégorie doit exister, appartenir à l'organisme ET au bon axe : sans ce
                // contrôle on rangerait une formation sous un palier dans la case « thème ».
                const [[cat]] = await conn.query(
                    'SELECT id FROM quest_category WHERE id = ? AND organization_id = ? AND kind = ?',
                    [v, orgId, kind]).catch((e) => { if (isMissingSchema(e)) return [[null]]; throw e; });
                if (!cat) return res.status(422).json({ message: 'Catégorie inconnue pour cet axe.' });
            }
            sets.push(`${field} = ?`); vals.push(v);
        }
        if (!sets.length) return res.json({ success: true });
        try {
            const [r] = await conn.query(
                `UPDATE training_program SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`,
                [...vals, req.params.id, orgId]);
            if (!r.affectedRows) return res.status(404).json({ message: 'Formation introuvable.' });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        res.json({ success: true, message: 'Formation rangée.' });
    } catch (err) {
        console.error('Erreur rattachement formation quest :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/quest/prerequisites — { program_id, requires_program_id }.
 * Refuse tout lien qui BOUCLERAIT : A exige B qui exige A verrouille les deux formations
 * définitivement, et la boucle est invisible à l'écran (chaque lien paraît sensé isolément).
 */
const addQuestPrerequisite = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const programId = String(req.body?.program_id || '');
        const requiresId = String(req.body?.requires_program_id || '');
        if (!programId || !requiresId) return res.status(422).json({ message: 'Deux formations sont nécessaires.' });
        if (programId === requiresId) {
            return res.status(422).json({ message: 'Une formation ne peut pas être son propre prérequis.' });
        }
        // Les deux formations doivent être à nous (sinon on lierait la formation d'un autre
        // organisme, dont on ne connaît même pas le nom).
        const [owned] = await conn.query(
            'SELECT id FROM training_program WHERE organization_id = ? AND id IN (?, ?)', [orgId, programId, requiresId]);
        if (owned.length !== 2) return res.status(404).json({ message: 'Formation introuvable.' });

        const edges = await loadEdges(conn, orgId);
        if (wouldCycle(edges, programId, requiresId)) {
            return res.status(409).json({
                message: 'Impossible : ce prérequis créerait une boucle (les deux formations resteraient verrouillées).',
            });
        }
        const id = crypto.randomUUID();
        try {
            await conn.query(
                `INSERT INTO quest_prerequisite (id, organization_id, program_id, requires_program_id)
                 VALUES (?, ?, ?, ?)`,
                [id, orgId, programId, requiresId]);
        } catch (e) {
            if (e && e.code === 'ER_DUP_ENTRY') return res.json({ success: true }); // déjà posé
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        await logAudit(req, 'CREATE', 'quest_prerequisite', id, { programId, requiresId });
        res.status(201).json({ success: true, data: { id, program_id: programId, requires_program_id: requiresId } });
    } catch (err) {
        console.error('Erreur ajout prérequis :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/quest/prerequisites/:id */
const deleteQuestPrerequisite = async (req, res) => {
    try {
        const conn = db.promise();
        try {
            const [r] = await conn.query(
                'DELETE FROM quest_prerequisite WHERE id = ? AND organization_id = ?',
                [req.params.id, req.user.organization_id]);
            if (!r.affectedRows) return res.status(404).json({ message: 'Prérequis introuvable.' });
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: MIGRATION_HINT });
            throw e;
        }
        await logAudit(req, 'DELETE', 'quest_prerequisite', req.params.id, null);
        res.json({ success: true, message: 'Prérequis retiré.' });
    } catch (err) {
        console.error('Erreur suppression prérequis :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getQuestStructure, createQuestCategory, updateQuestCategory, deleteQuestCategory,
    setProgramCategories, addQuestPrerequisite, deleteQuestPrerequisite, loadEdges,
};
