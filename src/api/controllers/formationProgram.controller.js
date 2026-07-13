const crypto = require('crypto');
const db = require('../config/database.js');
const { matchFormation, matchStep } = require('../lib/documents.js');
const { matchCustom, loadConditionMap } = require('../lib/conditions.js');
const { loadEquivalences, equivalenceMap } = require('../lib/equivalence.js');
const { loadOrgSteps } = require('./template.controller.js');

/**
 * Étapes documentaires d'une formation : documents candidats (selon rs/hygiène/
 * jours) + surcharge program_step (inclusion/ordre). Renvoie la liste ordonnée
 * avec un drapeau `active`.
 */
async function formationSteps(conn, orgId, program) {
    const orgSteps = await loadOrgSteps(orgId);
    const candidates = orgSteps.filter((s) => s.active && matchFormation(s.applies_when, program));
    let rows = [];
    try {
        [rows] = await conn.query('SELECT slug, sort_order, active, or_group FROM program_step WHERE program_id = ?', [program.id]);
    } catch (e) {
        // Colonne or_group absente (migration 052 non jouée) : on lit sans.
        if (e && e.code === 'ER_BAD_FIELD_ERROR') {
            [rows] = await conn.query('SELECT slug, sort_order, active FROM program_step WHERE program_id = ?', [program.id]);
        } else { throw e; }
    }
    const overlay = new Map(rows.map((r) => [r.slug, r]));

    // Étapes documentaires classiques. or_group : surcharge program_step sinon défaut.
    const docSteps = candidates.map((s) => {
        const o = overlay.get(s.slug);
        return {
            slug: s.slug, label: s.label, doc_type: s.doc_type, quiz_id: null, day: null,
            applies_when: s.applies_when || {},
            signable: !!s.signable, stagiaire_sign: !!s.stagiaire_sign,
            company_level: !!s.company_level,
            or_group: o ? (o.or_group || null) : (s.or_group || null),
            sort_order: o ? o.sort_order : s.sort_order,
            active: o ? !!o.active : true,
        };
    });

    // QCM ajoutables comme étapes (slug « quiz:<id> ») : ceux rattachés à cette
    // formation, ET ceux non rattachés (program_id NULL) — pour qu'un QCM nouvellement
    // créé soit proposé dans le parcours de n'importe quelle formation.
    const [quizzes] = await conn.query(
        'SELECT id, title, day FROM quiz WHERE organization_id = ? AND (program_id = ? OR program_id IS NULL) AND active = 1 ORDER BY (program_id IS NULL), title',
        [orgId, program.id]
    );
    const quizSteps = quizzes.map((q) => {
        const slug = `quiz:${q.id}`;
        const o = overlay.get(slug);
        // Ordre par défaut d'après le jour : négatif (avant) en tête, sinon intercalé (jour*10+5).
        const dflt = q.day != null ? Number(q.day) * 10 + 5 : 555;
        return {
            slug, label: q.title, doc_type: 'QCM', quiz_id: q.id, day: q.day,
            signable: true, stagiaire_sign: true, company_level: false,
            sort_order: o ? o.sort_order : dflt,
            active: o ? !!o.active : true,
        };
    });

    // Modèles de feuille d'émargement, ajoutés comme étapes attribuables (opt-in).
    // Contrairement aux documents classiques, ils sont INACTIFS par défaut : on ne
    // les génère que si on les ajoute explicitement au parcours de la formation.
    let emargSteps = [];
    try {
        let tpls;
        try {
            [tpls] = await conn.query(
                'SELECT slug, name, sort_order, applies_when, config FROM emargement_template WHERE organization_id = ? AND active = 1 ORDER BY sort_order, name',
                [orgId]
            );
        } catch (e2) {
            if (e2 && e2.code === 'ER_BAD_FIELD_ERROR') {
                [tpls] = await conn.query('SELECT slug, name, sort_order, config FROM emargement_template WHERE organization_id = ? AND active = 1 ORDER BY sort_order, name', [orgId]);
            } else { throw e2; }
        }
        const parseJSON = (v) => { if (!v) return {}; try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return {}; } };
        emargSteps = (tpls || []).map((t) => {
            const aw = parseJSON(t.applies_when);
            const cfg = parseJSON(t.config);
            return { slug: t.slug, name: t.name, sort_order: t.sort_order, applies_when: aw, config: cfg };
        }).filter((t) => matchFormation(t.applies_when, program)).map((t) => {
            const o = overlay.get(t.slug);
            return {
                slug: t.slug, label: t.name, doc_type: 'EMARGEMENT', quiz_id: null, day: null,
                applies_when: t.applies_when || {}, signable: true, stagiaire_sign: true, company_level: false,
                or_group: o ? (o.or_group || null) : null, emargement: true,
                sort_order: o ? o.sort_order : (t.sort_order || 75),
                active: o ? !!o.active : false,
            };
        });
    } catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; }

    return [...docSteps, ...quizSteps, ...emargSteps].sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Parcours documentaire d'un DOSSIER précis : parcours de la formation filtré par
 * les conditions du dossier (financement, AGEFICE…) pour ne garder que la bonne
 * variante (devis particulier/entreprise, attestation d'assiduité, etc.).
 * ctx = { financing, rsCode, hygiene, jours, agefice }.
 */
async function enrollmentSteps(conn, orgId, program, ctx, condById, eqMap) {
    const steps = await formationSteps(conn, orgId, program);
    // Conditions personnalisées (Modeles → Conditions) évaluées en plus des intégrées.
    const conds = condById || await loadConditionMap(conn, orgId);
    // Carte des équivalences « OU » (slug -> groupe) pour collapser les variantes.
    const eq = eqMap || equivalenceMap(await loadEquivalences(conn, orgId));

    const active = steps.filter((s) => s.active);
    // Une étape « passe » si c'est un QCM ou si ses conditions correspondent au dossier.
    const passes = (s) => s.quiz_id || (matchStep(s.applies_when, ctx) && matchCustom(s.applies_when, ctx, conds));
    const groupOf = (s) => (eq && eq.get(s.slug) ? eq.get(s.slug).group : null);

    // Pour un groupe « OU » : on garde UNE seule variante — celle qui s'applique au
    // dossier, sinon la première (défaut) pour ne JAMAIS faire disparaître le jalon.
    // Pour une étape isolée : filtrée par ses propres conditions.
    const out = [];
    const seen = new Set();
    for (const s of active) {
        const g = groupOf(s);
        if (!g) { if (passes(s)) out.push(s); continue; }
        if (seen.has(g)) continue;
        seen.add(g);
        const members = active.filter((m) => groupOf(m) === g);
        out.push(members.find(passes) || members[0]);
    }
    return out;
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
    'objective_general', 'duration_detail', 'program_detail', 'rs_code', 'hygiene', 'needs_emargement', 'horaires', 'active',
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
        if (f === 'hygiene' || f === 'active' || f === 'needs_emargement') v = v ? 1 : 0;
        else if (v === '') v = null; // champ vidé -> NULL (colonnes nullables)
        cols.push(f);
        vals.push(v);
    }
    const runInsert = (colList, valList, allowRetry) => {
        db.query(
            `INSERT INTO training_program (id, organization_id, ${colList.join(', ')})
             VALUES (UUID(), ?, ${colList.map(() => '?').join(', ')})`,
            [req.user.organization_id, ...valList],
            (err) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce code de formation est déjà utilisé.' });
                    if (err.code === 'ER_BAD_FIELD_ERROR' && allowRetry) {
                        const drop = new Set(['horaires']);
                        const fCols = [], fVals = [];
                        colList.forEach((c, i) => { if (!drop.has(c)) { fCols.push(c); fVals.push(valList[i]); } });
                        return runInsert(fCols, fVals, false);
                    }
                    console.error('Erreur création formation :', err);
                    return res.status(500).json({ error: 'Internal Server Error' });
                }
                res.status(201).json({ message: 'Formation créée' });
            }
        );
    };
    runInsert(cols, vals, true);
};

/**
 * PATCH /api/formations/:id — modifier une formation (champs éditables).
 */
const updateProgram = (req, res) => {
    const ALLOWED = [
        'code', 'title', 'level', 'color', 'days', 'hours', 'price', 'audience', 'objectives',
        'objective_general', 'duration_detail', 'program_detail',
        'rs_code', 'hygiene', 'needs_emargement', 'horaires', 'active', 'sort_order',
    ];
    const sets = [];
    const values = [];
    for (const f of ALLOWED) {
        if (req.body[f] === undefined) continue;
        let v = req.body[f];
        if (f === 'hygiene' || f === 'active' || f === 'needs_emargement') v = v ? 1 : 0;
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

    // Exécution avec repli : si une colonne récente (ex. horaires) n'existe pas
    // encore (migration non passée), on rejoue la requête sans ce champ pour ne
    // pas bloquer l'enregistrement du reste.
    const runUpdate = (setList, valList, allowRetry) => {
        db.query(
            `UPDATE training_program SET ${setList.join(', ')} WHERE id = ? AND organization_id = ?`,
            valList,
            (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') {
                        return res.status(409).json({ error: 'Ce code de formation est déjà utilisé.' });
                    }
                    if (err.code === 'ER_BAD_FIELD_ERROR' && allowRetry) {
                        // Retire les colonnes récentes potentiellement absentes puis réessaie.
                        const drop = new Set(['horaires']);
                        const fSets = [], fVals = [];
                        setList.forEach((s, i) => {
                            const col = s.split(' = ')[0];
                            if (drop.has(col)) return;
                            fSets.push(s); fVals.push(valList[i]);
                        });
                        fVals.push(valList[valList.length - 2], valList[valList.length - 1]);
                        if (fSets.length === 0) return res.status(200).json({ success: true, message: 'Formation mise à jour' });
                        return runUpdate(fSets, fVals, false);
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
    runUpdate(sets, values, true);
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

/** PUT /api/formations/:id/archive-tree — enregistre l'arborescence d'archivage. Corps : { tree }. */
const saveArchiveTree = async (req, res) => {
    try {
        const conn = db.promise();
        const [[program]] = await conn.query(
            'SELECT id FROM training_program WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!program) return res.status(404).json({ message: 'Formation introuvable' });
        const b = req.body || {};
        if (Object.prototype.hasOwnProperty.call(b, 'tree')) {
            const json = b.tree == null ? null : JSON.stringify(b.tree);
            try {
                await conn.query('UPDATE training_program SET archive_tree = ? WHERE id = ? AND organization_id = ?',
                    [json, req.params.id, req.user.organization_id]);
            } catch (e) {
                if (e && e.code === 'ER_BAD_FIELD_ERROR') {
                    return res.status(422).json({ error: "Migration requise (archive_tree) : appliquez 053_program_archive_tree.sql." });
                }
                throw e;
            }
        }
        // Arborescence ENTREPRISE (migration 083) — tolère l'absence de colonne.
        if (Object.prototype.hasOwnProperty.call(b, 'company_tree')) {
            const cjson = b.company_tree == null ? null : JSON.stringify(b.company_tree);
            try {
                await conn.query('UPDATE training_program SET company_archive_tree = ? WHERE id = ? AND organization_id = ?',
                    [cjson, req.params.id, req.user.organization_id]);
            } catch (e) { if (!e || e.code !== 'ER_BAD_FIELD_ERROR') throw e; }
        }
        res.json({ success: true, message: 'Arborescence enregistrée.' });
    } catch (err) {
        console.error('Erreur enregistrement arborescence :', err);
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
        // Colonne or_group disponible ? (migration 052)
        let hasOrGroup = true;
        try { await conn.query('SELECT or_group FROM program_step LIMIT 1'); }
        catch (e) { if (e && e.code === 'ER_BAD_FIELD_ERROR') hasOrGroup = false; else throw e; }
        for (let i = 0; i < steps.length; i++) {
            const slug = String(steps[i].slug || '').trim().toLowerCase();
            if (!slug) continue;
            const og = steps[i].or_group ? String(steps[i].or_group).slice(0, 60) : null;
            if (hasOrGroup) {
                await conn.query(
                    'INSERT INTO program_step (id, organization_id, program_id, slug, sort_order, active, or_group) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [crypto.randomUUID(), req.user.organization_id, req.params.id, slug, (i + 1) * 10, steps[i].active ? 1 : 0, og]
                );
            } else {
                await conn.query(
                    'INSERT INTO program_step (id, organization_id, program_id, slug, sort_order, active) VALUES (?, ?, ?, ?, ?, ?)',
                    [crypto.randomUUID(), req.user.organization_id, req.params.id, slug, (i + 1) * 10, steps[i].active ? 1 : 0]
                );
            }
            // QCM ajouté au parcours et non encore rattaché : on le lie à cette formation.
            if (steps[i].active && slug.startsWith('quiz:')) {
                const quizId = slug.slice(5);
                await conn.query('UPDATE quiz SET program_id = ? WHERE id = ? AND organization_id = ? AND program_id IS NULL',
                    [req.params.id, quizId, req.user.organization_id]).catch(() => {});
            }
        }
        // Point d'accès à l'émargement : slug de l'étape juste avant le point de rupture (ou null).
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'break_slug')) {
            const bs = req.body.break_slug ? String(req.body.break_slug).trim().toLowerCase().slice(0, 191) : null;
            try {
                await conn.query('UPDATE training_program SET emargement_break_slug = ? WHERE id = ? AND organization_id = ?',
                    [bs, req.params.id, req.user.organization_id]);
            } catch (e) { if (!e || e.code !== 'ER_BAD_FIELD_ERROR') throw e; } // migration 076 non jouée
        }
        // Point de rupture du PARCOURS ENTREPRISE (migration 082).
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'company_break_slug')) {
            const cbs = req.body.company_break_slug ? String(req.body.company_break_slug).trim().toLowerCase().slice(0, 191) : null;
            try {
                await conn.query('UPDATE training_program SET company_break_slug = ? WHERE id = ? AND organization_id = ?',
                    [cbs, req.params.id, req.user.organization_id]);
            } catch (e) { if (!e || e.code !== 'ER_BAD_FIELD_ERROR') throw e; } // migration 082 non jouée
        }
        res.json({ success: true, message: 'Parcours enregistré.' });
    } catch (err) {
        console.error('Erreur enregistrement parcours :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    getPrograms, getProgram, createProgram, updateProgram, reorderPrograms,
    getFormationSteps, saveFormationSteps, saveArchiveTree, formationSteps, enrollmentSteps, deleteProgram,
};
