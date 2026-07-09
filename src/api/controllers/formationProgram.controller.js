const crypto = require('crypto');
const db = require('../config/database.js');
const { matchFormation, matchStep } = require('../lib/documents.js');
const { loadOrgSteps } = require('./template.controller.js');

/**
 * Étapes documentaires d'une formation : documents candidats (selon rs/hygiène/
 * jours) + surcharge program_step (inclusion/ordre). Renvoie la liste ordonnée
 * avec un drapeau `active`.
 */
async function formationSteps(conn, orgId, program) {
    const orgSteps = await loadOrgSteps(orgId);
    const candidates = orgSteps.filter((s) => s.active && matchFormation(s.applies_when, program));
    const [rows] = await conn.query(
        'SELECT slug, sort_order, active FROM program_step WHERE program_id = ?',
        [program.id]
    );
    const overlay = new Map(rows.map((r) => [r.slug, r]));

    // Étapes documentaires classiques.
    const docSteps = candidates.map((s) => {
        const o = overlay.get(s.slug);
        return {
            slug: s.slug, label: s.label, doc_type: s.doc_type, quiz_id: null, day: null,
            applies_when: s.applies_when || {},
            signable: !!s.signable, stagiaire_sign: !!s.stagiaire_sign,
            sort_order: o ? o.sort_order : s.sort_order,
            active: o ? !!o.active : true,
        };
    });

    // QCM rattachés à la formation, ajoutés comme étapes (slug « quiz:<id> »).
    const [quizzes] = await conn.query(
        'SELECT id, title, day FROM quiz WHERE organization_id = ? AND program_id = ? AND active = 1',
        [orgId, program.id]
    );
    const quizSteps = quizzes.map((q) => {
        const slug = `quiz:${q.id}`;
        const o = overlay.get(slug);
        // Ordre par défaut d'après le jour : négatif (avant) en tête, sinon intercalé (jour*10+5).
        const dflt = q.day != null ? Number(q.day) * 10 + 5 : 555;
        return {
            slug, label: q.title, doc_type: 'QCM', quiz_id: q.id, day: q.day,
            signable: true, stagiaire_sign: true,
            sort_order: o ? o.sort_order : dflt,
            active: o ? !!o.active : true,
        };
    });

    return [...docSteps, ...quizSteps].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Parcours documentaire d'un DOSSIER précis : parcours de la formation filtré par
 * les conditions du dossier (financement, AGEFICE…) pour ne garder que la bonne
 * variante (devis particulier/entreprise, attestation d'assiduité, etc.).
 * ctx = { financing, rsCode, hygiene, jours, agefice }.
 */
async function enrollmentSteps(conn, orgId, program, ctx) {
    const steps = await formationSteps(conn, orgId, program);
    return steps.filter((s) => s.active && (s.quiz_id || matchStep(s.applies_when, ctx)));
}

/**
 * GET /api/formations — catalogue des formations de l'organisme.
 */
const getPrograms = (req, res) => {
    db.query(
        `SELECT id, organization_id, code, level, color, title, days, hours, price, audience,
                objectives, objective_general, duration_detail, program_detail,
                rs_code, hygiene, active, sort_order, created_at
         FROM training_program
         WHERE organization_id = ?
         ORDER BY sort_order, code`,
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération formations :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.json({ data: results });
        }
    );
};

/**
 * GET /api/formations/:id
 */
const getProgram = (req, res) => {
    db.query(
        'SELECT * FROM training_program WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération formation :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (results.length === 0) {
                return res.status(404).json({ message: 'Formation introuvable' });
            }
            res.json({ data: results[0] });
        }
    );
};

/**
 * POST /api/formations
 */
const CREATE_FIELDS = [
    'code', 'title', 'level', 'color', 'days', 'hours', 'price', 'audience', 'objectives',
    'objective_general', 'duration_detail', 'program_detail', 'rs_code', 'hygiene', 'active',
];
const createProgram = (req, res) => {
    const b = req.body || {};
    if (!b.code || !b.title) {
        return res.status(422).json({ error: 'Code et intitulé requis' });
    }
    const cols = [];
    const vals = [];
    for (const f of CREATE_FIELDS) {
        if (b[f] === undefined) continue;
        let v = b[f];
        if (f === 'hygiene' || f === 'active') v = v ? 1 : 0;
        else if (v === '') v = null; // champ vidé -> NULL (colonnes nullables)
        cols.push(f);
        vals.push(v);
    }
    db.query(
        `INSERT INTO training_program (id, organization_id, ${cols.join(', ')})
         VALUES (UUID(), ?, ${cols.map(() => '?').join(', ')})`,
        [req.user.organization_id, ...vals],
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce code de formation est déjà utilisé.' });
                console.error('Erreur création formation :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            res.status(201).json({ message: 'Formation créée' });
        }
    );
};

/**
 * PATCH /api/formations/:id — modifier une formation (champs éditables).
 */
const updateProgram = (req, res) => {
    const ALLOWED = [
        'code', 'title', 'level', 'color', 'days', 'hours', 'price', 'audience', 'objectives',
        'objective_general', 'duration_detail', 'program_detail',
        'rs_code', 'hygiene', 'active', 'sort_order',
    ];
    const sets = [];
    const values = [];
    for (const f of ALLOWED) {
        if (req.body[f] === undefined) continue;
        let v = req.body[f];
        if (f === 'hygiene' || f === 'active') v = v ? 1 : 0;
        else if (f === 'code') {
            v = String(v).trim();
            if (!v) continue; // le code est obligatoire : on ignore une valeur vide
        } else if (v === '') v = null; // champ vidé -> NULL
        sets.push(`${f} = ?`);
        values.push(v);
    }
    if (sets.length === 0) {
        return res.status(400).json({ message: 'Aucun champ valide à mettre à jour' });
    }
    values.push(req.params.id, req.user.organization_id);
    db.query(
        `UPDATE training_program SET ${sets.join(', ')} WHERE id = ? AND organization_id = ?`,
        values,
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(409).json({ error: 'Ce code de formation est déjà utilisé.' });
                }
                console.error('Erreur mise à jour formation :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Formation introuvable' });
            }
            res.status(200).json({ success: true, message: 'Formation mise à jour' });
        }
    );
};

/**
 * DELETE /api/formations/:id — supprime une formation. Refuse si des sessions
 * l'utilisent (données planifiées) ; détache les QCM rattachés.
 */
const deleteProgram = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[prog]] = await conn.query(
            'SELECT id FROM training_program WHERE id = ? AND organization_id = ?', [req.params.id, orgId]
        );
        if (!prog) return res.status(404).json({ message: 'Formation introuvable' });

        const [[c]] = await conn.query(
            'SELECT COUNT(*) AS n FROM training_session WHERE program_id = ? AND organization_id = ?', [req.params.id, orgId]
        );
        if (c.n > 0) {
            return res.status(409).json({ error: `Impossible de supprimer : ${c.n} session(s) planifiée(s) utilisent cette formation. Supprimez-les d'abord.` });
        }
        // Détache les QCM et retire le parcours documentaire propre à la formation.
        await conn.query('UPDATE quiz SET program_id = NULL WHERE program_id = ? AND organization_id = ?', [req.params.id, orgId]).catch(() => {});
        await conn.query('DELETE FROM program_step WHERE program_id = ? AND organization_id = ?', [req.params.id, orgId]).catch(() => {});
        await conn.query('DELETE FROM training_program WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        res.json({ success: true, message: 'Formation supprimée.' });
    } catch (err) {
        console.error('Erreur suppression formation :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/formations/reorder — définit l'ordre d'affichage des formations.
 * Corps : { ids: [id ordonnés] }.
 */
const reorderPrograms = (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    if (!ids || !ids.length) return res.status(422).json({ error: 'Liste ordonnée requise.' });
    const conn = db.promise();
    (async () => {
        try {
            for (let i = 0; i < ids.length; i++) {
                await conn.query(
                    'UPDATE training_program SET sort_order = ? WHERE id = ? AND organization_id = ?',
                    [(i + 1) * 10, ids[i], req.user.organization_id]
                );
            }
            res.json({ success: true, message: 'Ordre enregistré.' });
        } catch (e) {
            console.error('Erreur réordonnancement formations :', e);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    })();
};

/** GET /api/formations/:id/steps — parcours documentaire de la formation. */
const getFormationSteps = async (req, res) => {
    try {
        const conn = db.promise();
        const [[program]] = await conn.query(
            'SELECT id, code, days, hygiene, rs_code FROM training_program WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (!program) return res.status(404).json({ message: 'Formation introuvable' });
        res.json({ data: await formationSteps(conn, req.user.organization_id, program) });
    } catch (err) {
        console.error('Erreur étapes formation :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/formations/:id/steps — enregistre le parcours (ordre + inclusion). */
const saveFormationSteps = async (req, res) => {
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : null;
    if (!steps) return res.status(422).json({ error: 'Liste des étapes requise.' });
    try {
        const conn = db.promise();
        const [[program]] = await conn.query(
            'SELECT id FROM training_program WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (!program) return res.status(404).json({ message: 'Formation introuvable' });
        await conn.query('DELETE FROM program_step WHERE program_id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        for (let i = 0; i < steps.length; i++) {
            const slug = String(steps[i].slug || '').trim().toLowerCase();
            if (!slug) continue;
            await conn.query(
                'INSERT INTO program_step (id, organization_id, program_id, slug, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)',
                [crypto.randomUUID(), req.user.organization_id, req.params.id, slug, (i + 1) * 10, steps[i].active ? 1 : 0]
            );
        }
        res.json({ success: true, message: 'Parcours enregistré.' });
    } catch (err) {
        console.error('Erreur enregistrement parcours :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getPrograms, getProgram, createProgram, updateProgram, reorderPrograms,
    getFormationSteps, saveFormationSteps, formationSteps, enrollmentSteps, deleteProgram,
};
