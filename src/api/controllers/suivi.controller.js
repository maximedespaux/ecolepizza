const db = require('../config/database.js');
const { computeDocParcours, companyParcours } = require('../lib/parcours.js');
const { getEnabledFields, loadDossierFactsMap, loadConditionMap } = require('../lib/conditions.js');
const { loadEquivalences, equivalenceMap } = require('../lib/equivalence.js');
const { enrollmentSteps, formationSteps } = require('./formationProgram.controller.js');
const { logAudit } = require('../lib/audit.js');

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
            `SELECT e.id AS enrollment_id, e.learner_id, e.financing, e.crm_stage, e.session_id,
                    e.company_id AS enr_company_id,
                    l.first_name, l.last_name, l.opco,
                    /* L'entreprise d'un dossier est celle du DOSSIER, jamais celle de la fiche
                       personne. Un COALESCE vers l.company_id trainait ici : il ressuscitait
                       l'entreprise sur les inscriptions ou le stagiaire s'est engage seul,
                       parce que learner.company_id reste pose a vie des le premier
                       rattachement. Meme personne, deux dossiers, deux parcours possibles. */
                    e.company_id AS company_id, c.name AS company_name,
                    p.id AS program_id, p.code AS program_code, p.title AS program_title,
                    p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN learner l ON l.id = e.learner_id
             LEFT JOIN company c ON c.id = e.company_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.organization_id = ?`,
            [req.user.organization_id]
        );
        // Conditions + faits des dossiers chargés une seule fois pour toute la boucle.
        const condById = await loadConditionMap(conn, req.user.organization_id);
        const eqMap = equivalenceMap(await loadEquivalences(conn, req.user.organization_id));
        const fieldCatalog = await getEnabledFields(conn, req.user.organization_id, 'condition');
        const factsMap = await loadDossierFactsMap(
            conn, req.user.organization_id, enrollments.map((e) => e.enrollment_id), fieldCatalog);

        // Le parcours « à l'arrivée via une entreprise » vit dans lib/parcours.js, partagé
        // avec la fiche dossier et le tableau du Pipeline.
        const orgId = req.user.organization_id;
        // formationSteps par formation (toutes les étapes candidates), en cache.
        const allStepsCache = new Map(); // program_id -> allSteps
        async function allStepsFor(program) {
            if (allStepsCache.has(program.id)) return allStepsCache.get(program.id);
            const all = await formationSteps(conn, orgId, program);
            allStepsCache.set(program.id, all);
            return all;
        }

        const dossiers = [];
        for (const e of enrollments) {
            // Parcours = celui de la formation (Parcours documentaire), filtré aux
            // conditions du dossier, et progression réelle du stagiaire.
            let documents = [], score = 'ROUGE', signed = 0, toSign = 0, percent = 0, done = 0, total = 0;
            if (e.program_id) {
                const program = { id: e.program_id, code: e.program_code, days: e.program_days, hygiene: e.program_hygiene, rs_code: e.program_rs };
                const ctx = {
                    financing: e.financing, rsCode: e.program_rs, hygiene: !!e.program_hygiene,
                    jours: e.program_days || 1, agefice: (e.opco || '').toUpperCase() === 'AGEFICE',
                    ...(factsMap.get(e.enrollment_id) || {}),
                };
                let steps = await enrollmentSteps(conn, req.user.organization_id, program, ctx, condById, eqMap);
                const [docs] = await conn.query(
                    `SELECT gd.id, gd.type, gd.status, gd.template_slug, gd.quiz_id
                     FROM generated_document gd JOIN document_formation df ON df.document_id = gd.id
                     WHERE df.enrollment_id = ?
                     ORDER BY gd.created_at DESC`,
                    [e.enrollment_id]
                );
                // Dossier envoyé par une entreprise : même parcours que l'entreprise
                // (section company_steps, TOUTES les étapes) + statut des documents de
                // GROUPE rattaché.
                const ent = await companyParcours(conn, orgId,
                    { programId: program.id, companyId: e.enr_company_id, sessionId: e.session_id },
                    () => allStepsFor(program));
                if (ent.steps) steps = ent.steps;
                if (ent.docs.length) docs.push(...ent.docs);
                const parc = computeDocParcours({ steps, docs });
                total = parc.steps.length;
                done = parc.currentIndex;
                percent = parc.percent;
                // Format attendu par la feuille de route (Roadmap).
                documents = parc.steps.map((s, i) => ({
                    num: i + 1, type: s.key, label: s.label,
                    stagiaireSign: !!s.signable, quiz: !!s.quiz,
                    company_level: !!s.company_level,
                    status: s.docStatus || 'A_FAIRE',
                }));
                const signable = parc.steps.filter((s) => s.signable || s.quiz);
                toSign = signable.length;
                signed = signable.filter((s) => s.docStatus === 'SIGNE').length;
                const anyHandled = parc.steps.some((s) => ['GENERE', 'ENVOYE', 'CONSULTE', 'SIGNE'].includes(s.docStatus));
                score = total > 0 && done >= total ? 'VERT' : (done > 0 || anyHandled) ? 'ORANGE' : 'ROUGE';
            }

            dossiers.push({
                enrollment_id: e.enrollment_id,
                learner_id: e.learner_id,
                company_id: e.company_id || null,
                company_name: e.company_name || null,
                first_name: e.first_name,
                last_name: e.last_name,
                program_code: e.program_code,
                program_title: e.program_title,
                financing: e.financing,
                crm_stage: e.crm_stage,
                score,
                signed,
                to_sign: toSign,
                percent,
                done,
                total,
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
        // Documents générés par l'application (partagés / signés) — niveau STAGIAIRE.
        const [gen] = await conn.query(
            `SELECT gd.id AS doc_id, gd.title, gd.type, gd.status, gd.quiz_id, 'LEARNER' AS scope,
                    NULL AS company_id, NULL AS company_name,
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
        // Documents générés au niveau ENTREPRISE (un par groupe/session). learner_id NULL,
        // rangés par entreprise. Ignoré si la migration 077 (scope) n'est pas jouée.
        let comp = [];
        try {
            [comp] = await conn.query(
                `SELECT gd.id AS doc_id, gd.title, gd.type, gd.status, gd.quiz_id, 'COMPANY' AS scope,
                        gd.company_id, c.name AS company_name,
                        DATE_FORMAT(gd.sent_at,   '%Y-%m-%d %H:%i') AS sent_at,
                        DATE_FORMAT(gd.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                        s.year, s.week,
                        p.code AS program_code, p.title AS program_title,
                        NULL AS learner_id, '' AS first_name, c.name AS last_name, 'gen' AS source
                 FROM generated_document gd
                 JOIN company c ON c.id = gd.company_id
                 LEFT JOIN training_session s ON s.id = gd.session_id
                 LEFT JOIN training_program p ON p.id = s.program_id
                 WHERE gd.organization_id = ? AND gd.scope = 'COMPANY' AND gd.status IN (?)`,
                [req.user.organization_id, SHARED]
            );
        } catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; }
        // Documents archivés (PDF importés + feuilles d'émargement générées).
        // Pour l'émargement (ref « emarg:<enrollment>[:<slug>] »), on résout le vrai
        // stagiaire via le dossier, afin qu'il se range dans le MÊME dossier que ses
        // autres documents (regroupement par learner_id côté client) et non dans un
        // dossier « Nom Prénom » séparé.
        const [arch] = await conn.query(
            `SELECT ad.id AS doc_id, ad.title, 'PDF' AS type, ad.status, NULL AS quiz_id, 'LEARNER' AS scope,
                    NULL AS company_id, NULL AS company_name,
                    NULL AS sent_at, DATE_FORMAT(ad.created_at, '%Y-%m-%d %H:%i') AS signed_at,
                    ad.year, ad.week,
                    COALESCE(p.code, ad.formation_label) AS program_code,
                    COALESCE(p.title, ad.formation_label) AS program_title,
                    l.id AS learner_id,
                    COALESCE(l.first_name, '') AS first_name,
                    COALESCE(l.last_name, ad.learner_name) AS last_name,
                    'archive' AS source
             FROM archive_document ad
             LEFT JOIN enrollment e ON ad.ref LIKE 'emarg:%'
                  AND e.id = SUBSTRING_INDEX(SUBSTRING(ad.ref, 7), ':', 1)
             LEFT JOIN learner l ON l.id = e.learner_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE ad.organization_id = ?`,
            [req.user.organization_id]
        );
        res.json({ data: [...gen, ...comp, ...arch] });
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

/**
 * POST /api/suivi/archives/delete — suppression groupée (semaine / formation /
 * stagiaire / fichiers). Supprime en base les PDF importés (archive_document) et,
 * si demandé, les documents générés (generated_document). Toujours cloisonné à l'organisme.
 * Corps : { archive_ids: [...], document_ids: [...] }.
 */
const bulkDeleteArchive = async (req, res) => {
    const orgId = req.user.organization_id;
    const clean = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x) : []);
    const archiveIds = clean(req.body?.archive_ids);
    const documentIds = clean(req.body?.document_ids);
    if (!archiveIds.length && !documentIds.length) {
        return res.status(422).json({ error: 'Aucun document à supprimer.' });
    }
    try {
        const conn = db.promise();
        let deleted = 0;
        if (archiveIds.length) {
            const [r] = await conn.query('DELETE FROM archive_document WHERE organization_id = ? AND id IN (?)', [orgId, archiveIds]);
            deleted += r.affectedRows || 0;
        }
        if (documentIds.length) {
            const [r] = await conn.query('DELETE FROM generated_document WHERE organization_id = ? AND id IN (?)', [orgId, documentIds]);
            deleted += r.affectedRows || 0;
        }
        logAudit(req, 'archive.bulk_delete', 'Archive', null);
        res.json({ success: true, deleted });
    } catch (err) {
        console.error('Erreur suppression groupée archives :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   CE QUE LE COFFRE OCCUPE — et où, précisément.
   ═════════════════════════════════════════════════════════════════════════════════════════════

   MESURÉ AVANT D'ÊTRE ÉCRIT (1188 PDF, 681 Mo) : la masse n'est pas répartie, elle est
   CONCENTRÉE. 148 fichiers — 12 % — portent 378 Mo, soit 55 % du total ; les 1040 autres font
   291 Ko de moyenne, ce qui est normal pour un scan. Un écran qui trie par poids décroissant
   règle donc le problème en montrant trente lignes, là où compresser les 1188 rapporterait 9 %.

   POURQUOI 9 % SEULEMENT en compression sans perte : le contenu des PDF est déjà en Flate.
   Compresser du déjà-compressé ne rend rien — vérifié en gzipant quarante fichiers réels.
   L'anomalie est ailleurs : certains fichiers pèsent 2,2 à 4,0 OCTETS PAR PIXEL quand un JPEG
   en fait 0,13. Un bitmap RVB brut vaut exactement 3,0 : ces documents-là ne sont pas compressés
   du tout. C'est pour cela que la densité est affichée — c'est elle qui distingue un scan de
   300 DPI légitimement lourd d'un fichier qui gaspille dix fois sa place.

   UNE SEULE PASSE SUR LES BLOBS. `LENGTH()` et `MD5()` obligent InnoDB à lire chaque blob : sur
   681 Mo, c'est quelques secondes. On lit donc TOUT une fois et l'on calcule le reste en
   mémoire — total, tranches, plus lourds, doublons. Deux requêtes auraient coûté deux lectures.
   D'où aussi la route SÉPARÉE : la liste des archives, elle, reste instantanée.
*/
const TRANCHES = [
    { libelle: '> 8 Mo', min: 8 * 1024 * 1024 },
    { libelle: '3 à 8 Mo', min: 3 * 1024 * 1024 },
    { libelle: '1 à 3 Mo', min: 1024 * 1024 },
    { libelle: '< 1 Mo', min: 0 },
];

const getArchiveStockage = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT id, title, learner_name, year, week,
                    LENGTH(file) AS octets, MD5(file) AS empreinte
               FROM archive_document WHERE organization_id = ?`,
            [req.user.organization_id]);

        const total = rows.reduce((s, r) => s + Number(r.octets || 0), 0);

        const tranches = TRANCHES.map((t, i) => {
            const max = i === 0 ? Infinity : TRANCHES[i - 1].min;
            const dedans = rows.filter((r) => r.octets >= t.min && r.octets < max);
            return { libelle: t.libelle, n: dedans.length,
                octets: dedans.reduce((s, r) => s + Number(r.octets), 0) };
        });

        /* LES DOUBLONS SE DISENT AVEC LE NOM DE CEUX QUI LES DÉTIENNENT. Supprimer une copie,
           c'est retirer un document du dossier de quelqu'un : le même PDF classé sous sept
           stagiaires est peut-être une erreur de classement (le cas rencontré — l'évaluation
           d'une personne recopiée dans six autres dossiers), mais peut aussi être une pièce
           commune légitimement présente partout. L'écran ne peut pas trancher ; il montre qui
           détient quoi et laisse décider. */
        const par = new Map();
        for (const r of rows) {
            if (!r.empreinte) continue;
            const k = `${r.empreinte}:${r.octets}`;
            if (!par.has(k)) par.set(k, []);
            par.get(k).push(r);
        }
        const doublons = [...par.values()].filter((g) => g.length > 1)
            .map((g) => ({ octets: Number(g[0].octets), n: g.length,
                gaspille: Number(g[0].octets) * (g.length - 1),
                exemplaires: g.map(({ empreinte, ...x }) => x) }))
            .sort((a, b) => b.gaspille - a.gaspille);

        res.json({
            data: {
                total: { n: rows.length, octets: total },
                tranches,
                /* Soixante suffisent : au-delà, on est déjà sous la moyenne, et une liste plus
                   longue ferait croire qu'il reste du gras alors qu'il n'y en a plus. */
                lourds: [...rows].sort((a, b) => b.octets - a.octets).slice(0, 60)
                    .map(({ empreinte, ...x }) => ({ ...x, octets: Number(x.octets) })),
                doublons,
                gaspilleDoublons: doublons.reduce((s, d) => s + d.gaspille, 0),
            },
        });
    } catch (err) {
        console.error('Erreur analyse stockage archives :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSuivi, getArchive, importArchive, getArchiveFile, deleteArchive, bulkDeleteArchive,
    getArchiveStockage };
