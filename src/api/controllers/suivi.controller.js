const db = require('../config/database.js');
const { stepsToDocSet } = require('../lib/documents.js');
const { loadOrgSteps } = require('./template.controller.js');

const SCORE_ORDER = { ROUGE: 0, ORANGE: 1, VERT: 2 };
// Statuts « partagé avec le stagiaire » (envoyé / consulté / signé).
const SHARED = ['ENVOYE', 'CONSULTE', 'SIGNE'];

/**
 * GET /api/suivi — suivi Qualiopi par dossier (inscription) : jeu de documents
 * requis + statut réel, conformité calculée, dossiers incomplets en premier.
 */
const getSuivi = async (req, res) => {
    try {
        const conn = db.promise();
        const [enrollments] = await conn.query(
            `SELECT e.id AS enrollment_id, e.learner_id, e.financing, e.crm_stage,
                    l.first_name, l.last_name, l.opco,
                    p.code AS program_code, p.title AS program_title,
                    p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN learner l ON l.id = e.learner_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.organization_id = ?`,
            [req.user.organization_id]
        );

        const steps = await loadOrgSteps(req.user.organization_id);
        const dossiers = [];
        for (const e of enrollments) {
            // Statuts réels des documents rattachés à ce dossier.
            const [rows] = await conn.query(
                `SELECT gd.type, gd.status
                 FROM generated_document gd
                 JOIN document_formation df ON df.document_id = gd.id
                 WHERE df.enrollment_id = ?`,
                [e.enrollment_id]
            );
            const statusByType = {};
            for (const r of rows) statusByType[r.type] = r.status; // dernier gagne

            const required = stepsToDocSet(steps, {
                hygiene: !!e.program_hygiene,
                rsCode: e.program_rs,
                jours: e.program_days || 1,
                financing: e.financing,
                agefice: (e.opco || '').toUpperCase() === 'AGEFICE',
            });
            const documents = required.map((d) => ({ ...d, status: statusByType[d.type] || 'A_FAIRE' }));

            // Conformité : VERT si tous les documents à signer sont signés,
            // ORANGE si des documents sont en cours, ROUGE si rien n'est engagé.
            const signable = documents.filter((d) => d.stagiaireSign);
            const signed = signable.filter((d) => d.status === 'SIGNE').length;
            const anyHandled = documents.some((d) => ['GENERE', 'ENVOYE', 'CONSULTE', 'SIGNE'].includes(d.status));
            const score = signable.length > 0 && signed === signable.length
                ? 'VERT'
                : anyHandled ? 'ORANGE' : 'ROUGE';

            dossiers.push({
                enrollment_id: e.enrollment_id,
                learner_id: e.learner_id,
                first_name: e.first_name,
                last_name: e.last_name,
                program_code: e.program_code,
                program_title: e.program_title,
                financing: e.financing,
                crm_stage: e.crm_stage,
                score,
                signed,
                to_sign: signable.length,
                documents,
            });
        }

        // Incomplets en premier (ROUGE, ORANGE puis VERT), puis par nom.
        dossiers.sort((a, b) =>
            (SCORE_ORDER[a.score] - SCORE_ORDER[b.score]) ||
            (a.last_name || '').localeCompare(b.last_name || ''));

        res.json({ data: dossiers });
    } catch (err) {
        console.error('Erreur suivi :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/suivi/archives — coffre documentaire : tous les documents partagés/
 * signés avec les stagiaires, à plat, avec session (année/semaine), formation et
 * stagiaire. Le regroupement (année → semaine → formation → stagiaire) est fait
 * côté client. Un document couvrant plusieurs formations apparaît sous chacune.
 */
const getArchive = async (req, res) => {
    try {
        const conn = db.promise();
        // Documents générés par l'application (partagés / signés).
        const [gen] = await conn.query(
            `SELECT gd.id AS doc_id, gd.title, gd.type, gd.status, gd.quiz_id,
                    DATE_FORMAT(gd.sent_at,   '%Y-%m-%d %H:%i') AS sent_at,
                    DATE_FORMAT(gd.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                    s.year, s.week,
                    p.code AS program_code, p.title AS program_title,
                    l.id AS learner_id, l.first_name, l.last_name, 'gen' AS source
             FROM generated_document gd
             JOIN learner l ON l.id = gd.learner_id
             LEFT JOIN document_formation df ON df.document_id = gd.id
             LEFT JOIN enrollment e ON e.id = df.enrollment_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE gd.organization_id = ? AND gd.status IN (?)`,
            [req.user.organization_id, SHARED]
        );
        // Documents historiques importés (PDF).
        const [arch] = await conn.query(
            `SELECT id AS doc_id, title, 'PDF' AS type, status, NULL AS quiz_id,
                    NULL AS sent_at, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS signed_at,
                    year, week,
                    formation_label AS program_code, formation_label AS program_title,
                    NULL AS learner_id, learner_name AS last_name, '' AS first_name, 'archive' AS source
             FROM archive_document WHERE organization_id = ?`,
            [req.user.organization_id]
        );
        res.json({ data: [...gen, ...arch] });
    } catch (err) {
        console.error('Erreur archives documents :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Extrait année / semaine / formation / stagiaire depuis un chemin de dossier
// (webkitRelativePath) : « …/2024/S12/[Formation]/Dupont Jean/devis.pdf ».
function parsePath(rel) {
    const parts = String(rel || '').split('/').filter(Boolean);
    const file = parts.pop() || 'document.pdf';
    const title = file.replace(/\.[^.]+$/, '');
    let year = null, week = null, formation = null, learner = null;
    const yi = parts.findIndex((p) => /^\d{4}$/.test(p));
    if (yi >= 0) {
        year = parseInt(parts[yi], 10);
        const after = parts.slice(yi + 1);
        if (after[0] != null) { const w = String(after[0]).match(/\d+/); week = w ? parseInt(w[0], 10) : null; }
        const rest = after.slice(1); // entre la semaine et le fichier
        if (rest.length >= 2) { formation = rest[rest.length - 2]; learner = rest[rest.length - 1]; }
        else if (rest.length === 1) { learner = rest[0]; }
    } else if (parts.length) {
        learner = parts[parts.length - 1];
    }
    return { year, week, formation, learner, title };
}

/**
 * POST /api/suivi/archives/import — importe des PDF historiques.
 * Multipart : `files` (PDF) + `paths` (JSON des chemins relatifs, même ordre).
 */
const importArchive = async (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.status(422).json({ error: 'Aucun fichier reçu.' });
    let paths = [];
    try { paths = JSON.parse(req.body.paths || '[]'); } catch { paths = []; }
    try {
        const conn = db.promise();
        let imported = 0, skipped = 0;
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const isPdf = /pdf$/i.test(f.mimetype || '') || /\.pdf$/i.test(f.originalname || '');
            if (!isPdf) { skipped++; continue; }
            const meta = parsePath(paths[i] || f.originalname);
            await conn.query(
                `INSERT INTO archive_document
                    (id, organization_id, year, week, formation_label, learner_name, title, status, mime, file)
                 VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'ARCHIVE', ?, ?)`,
                [req.user.organization_id, meta.year, meta.week, meta.formation || null,
                 meta.learner || null, meta.title.slice(0, 255), f.mimetype || 'application/pdf', f.buffer]
            );
            imported++;
        }
        res.status(201).json({ data: { imported, skipped } });
    } catch (err) {
        console.error('Erreur import archives :', err);
        if (err && /max_allowed_packet|packet/i.test(err.message || '')) {
            return res.status(413).json({ error: 'Fichier trop volumineux pour la base. Augmentez max_allowed_packet ou importez par lots plus petits.' });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/suivi/archives/:id/file — sert le PDF importé (aperçu / téléchargement). */
const getArchiveFile = async (req, res) => {
    try {
        const [[row]] = await db.promise().query(
            'SELECT title, mime, file FROM archive_document WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (!row || !row.file) return res.status(404).json({ message: 'Document introuvable.' });
        const name = (row.title || 'document').replace(/[\\/:*?"<>|]/g, '') + '.pdf';
        // Les archives sont des PDF : on force le type (ne jamais renvoyer un mime
        // fourni par le client, qui pourrait provoquer un rendu HTML/JS = XSS).
        res.set('Content-Type', 'application/pdf');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
        res.send(row.file);
    } catch (err) {
        console.error('Erreur lecture archive :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/suivi/archives/:id — supprime un document importé. */
const deleteArchive = async (req, res) => {
    try {
        await db.promise().query('DELETE FROM archive_document WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        res.json({ success: true, message: 'Document supprimé.' });
    } catch (err) {
        console.error('Erreur suppression archive :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSuivi, getArchive, importArchive, getArchiveFile, deleteArchive };
