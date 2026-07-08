const crypto = require('crypto');
const db = require('../config/database.js');
const { renderDocumentHTML } = require('../lib/render.js');
const { templateSlugFor, renderTemplate } = require('../lib/docxfill.js');
const { getTemplateContent } = require('./template.controller.js');
const { renderTemplateHtml } = require('../lib/htmlfill.js');
const { docxToPdf, htmlToPdf } = require('../lib/docxpdf.js');
const { logAudit } = require('../lib/audit.js');
const { notify } = require('./notification.controller.js');

const TYPE_LABELS = {
    DEVIS: 'Devis', CONTRAT: 'Contrat de formation', CONVENTION: 'Convention de formation',
    DROIT_IMAGE: "Droit à l'image", CONVOCATION: "Convocation à l'examen", INVITATION: 'Invitation',
    CERTIFICAT_REALISATION: 'Certificat de réalisation', PROGRAMME: 'Programme de formation',
    ATTESTATION_HYGIENE: 'Attestation Hygiène', FICHE_SEMAINE: "Fiche d'expression de besoin",
    TEST_POSITIONNEMENT: 'Test de positionnement', EMARGEMENT: "Feuille d'émargement",
    EVALUATION_MANAGEUR: 'Évaluation Manageur', EVALUATION_FINANCEUR: 'Évaluation Financeur',
    CGV: 'Conditions générales de vente',
};
const STAGIAIRE_SIGN_TYPES = ['DEVIS', 'CONTRAT', 'CONVENTION', 'DROIT_IMAGE'];

// Charge le contexte de fusion (organisme, stagiaire, entreprise, formations).
async function loadContext(conn, organizationId, learnerId, documentId) {
    const [[org]] = await conn.query('SELECT * FROM organization WHERE id = ?', [organizationId]);
    const [[learner]] = await conn.query('SELECT * FROM learner WHERE id = ?', [learnerId]);
    let company = null;
    const [formations] = await conn.query(
        `SELECT p.code, p.title, p.days, p.hours, p.price, p.hygiene, p.rs_code AS rs_code,
                p.audience, p.objectives, p.objective_general, p.duration_detail, p.program_detail,
                s.year, s.week,
                DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                e.financing, e.price AS enroll_price, e.acompte
         FROM document_formation df
         JOIN enrollment e ON e.id = df.enrollment_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         WHERE df.document_id = ?`,
        [documentId]
    );
    const isPro = formations.some((f) => f.financing === 'PROFESSIONNEL');
    if (isPro && learner && learner.company_id) {
        const [cRows] = await conn.query('SELECT * FROM company WHERE id = ?', [learner.company_id]);
        company = cRows[0] || null;
    }
    return { org: org || {}, learner: learner || {}, company, formations };
}

/**
 * GET /api/documents?learner_id=... — documents d'un stagiaire + ses formations
 * (pour le regroupement).
 */
const listDocuments = async (req, res) => {
    const learnerId = req.query.learner_id;
    if (!learnerId) return res.status(422).json({ error: 'learner_id requis' });
    try {
        const conn = db.promise();
        const [documents] = await conn.query(
            `SELECT d.id, d.type, d.title, d.status,
                    DATE_FORMAT(d.sent_at, '%Y-%m-%d %H:%i') AS sent_at,
                    DATE_FORMAT(d.signed_at, '%Y-%m-%d %H:%i') AS signed_at, d.signer_name,
                    GROUP_CONCAT(p.code ORDER BY p.code SEPARATOR ', ') AS formations
             FROM generated_document d
             LEFT JOIN document_formation df ON df.document_id = d.id
             LEFT JOIN enrollment e ON e.id = df.enrollment_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE d.learner_id = ? AND d.organization_id = ?
             GROUP BY d.id
             ORDER BY d.created_at DESC`,
            [learnerId, req.user.organization_id]
        );
        const [enrollments] = await conn.query(
            `SELECT e.id, e.financing, p.code AS program_code, p.title AS program_title,
                    s.year, s.week,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.learner_id = ? AND e.organization_id = ?
             ORDER BY s.year, s.week, p.code`,
            [learnerId, req.user.organization_id]
        );
        res.json({ data: { documents, enrollments } });
    } catch (err) {
        console.error('Erreur liste documents :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/documents — prépare un document (statut A_FAIRE, non envoyé).
 * Corps : { learner_id, type, title?, enrollment_ids: [] }.
 */
const createDocument = async (req, res) => {
    const { learner_id, type, title, enrollment_ids, template_slug } = req.body;
    if (!learner_id || !type || !Array.isArray(enrollment_ids) || enrollment_ids.length === 0) {
        return res.status(422).json({ error: 'Stagiaire, type et au moins une formation requis.' });
    }
    try {
        const conn = db.promise();
        const documentId = crypto.randomUUID();
        await conn.query(
            `INSERT INTO generated_document (id, organization_id, learner_id, type, template_slug, title, status)
             VALUES (?, ?, ?, ?, ?, ?, 'A_FAIRE')`,
            [documentId, req.user.organization_id, learner_id, type, template_slug || null, title || TYPE_LABELS[type] || type]
        );
        for (const eid of enrollment_ids) {
            await conn.query(
                'INSERT INTO document_formation (document_id, enrollment_id) VALUES (?, ?)',
                [documentId, eid]
            );
        }
        res.status(201).json({ message: 'Document préparé', id: documentId });
    } catch (err) {
        console.error('Erreur création document :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/documents/:id — document + contenu HTML fusionné (aperçu).
 */
const getDocument = async (req, res) => {
    try {
        const conn = db.promise();
        const [rows] = await conn.query(
            'SELECT * FROM generated_document WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Document introuvable' });
        const doc = rows[0];

        // Anti-IDOR : un non-membre du personnel ne peut lire que ses propres documents.
        const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR'];
        if (!STAFF.includes(req.user.role)) {
            const [own] = await conn.query('SELECT id FROM learner WHERE id = ? AND user_id = ?', [doc.learner_id, req.user.id]);
            if (own.length === 0) return res.status(403).json({ message: 'Accès refusé' });
        }

        const ctx = await loadContext(conn, doc.organization_id, doc.learner_id, doc.id);
        const html = renderDocumentHTML(doc.type, ctx, doc.title);
        res.json({
            data: {
                id: doc.id, type: doc.type, title: doc.title, status: doc.status,
                sent_at: doc.sent_at, signed_at: doc.signed_at, signer_name: doc.signer_name,
                signature_data: doc.signature_data,
                signable: STAGIAIRE_SIGN_TYPES.includes(doc.type),
                html,
            },
        });
    } catch (err) {
        console.error('Erreur lecture document :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Charge le document + contexte + remplit le modèle Word. Renvoie { doc, out } ou
// une réponse d'erreur (retourne null si déjà répondu).
async function fillForRequest(req, res) {
    const conn = db.promise();
    const [rows] = await conn.query(
        'SELECT * FROM generated_document WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id]
    );
    if (rows.length === 0) { res.status(404).json({ message: 'Document introuvable' }); return null; }
    const doc = rows[0];

    const STAFF = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR'];
    if (!STAFF.includes(req.user.role)) {
        const [own] = await conn.query('SELECT id FROM learner WHERE id = ? AND user_id = ?', [doc.learner_id, req.user.id]);
        if (own.length === 0) { res.status(403).json({ message: 'Accès refusé' }); return null; }
    }

    const ctx = await loadContext(conn, doc.organization_id, doc.learner_id, doc.id);
    const f = (ctx.formations && ctx.formations[0]) || {};
    // Slug enregistré sur le document en priorité, sinon dérivé du type + contexte.
    const slug = doc.template_slug || templateSlugFor(doc.type, { financing: f.financing, rsCode: f.rs_code, hygiene: !!f.hygiene, jours: f.days });
    if (!slug) { res.status(404).json({ message: 'Aucun modèle pour ce type de document.' }); return null; }
    // Contenu propre à l'organisme s'il existe, sinon modèle par défaut fourni.
    const content = await getTemplateContent(doc.organization_id, slug);
    if (!content) { res.status(404).json({ message: 'Aucun modèle pour cette étape. Créez-le dans Modèles → Éditer.' }); return null; }

    const who = [ctx.learner?.first_name, ctx.learner?.last_name].filter(Boolean).join(' ').trim();
    const label = TYPE_LABELS[doc.type] || doc.type || 'document';
    const baseName = (who ? `${doc.title || label} - ${who}` : (doc.title || label)).replace(/[\\/:*?"<>|]/g, '');
    return { doc, ctx, slug, content, baseName };
}

/**
 * GET /api/documents/:id/docx — modèle Word rempli (uniquement pour les modèles .docx hérités).
 */
const downloadDocx = async (req, res) => {
    try {
        const r = await fillForRequest(req, res);
        if (!r) return;
        if (r.content.kind !== 'docx') {
            return res.status(400).json({ message: 'Ce modèle est géré dans l\'éditeur intégré : disponible en PDF.' });
        }
        const out = renderTemplate(r.content.buffer, r.ctx, r.slug);
        logAudit(req, 'document.docx', 'GeneratedDocument', r.doc.id);
        res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(out.filename)}"`);
        res.send(out.buffer);
    } catch (err) {
        console.error('Erreur génération .docx :', err);
        res.status(500).json({ error: 'Génération du document impossible' });
    }
};

/**
 * GET /api/documents/:id/pdf — document final NON MODIFIABLE (PDF) envoyé au client.
 * Rendu fidèle au modèle Word via LibreOffice. Servi « inline » (aperçu + téléchargement).
 */
const downloadPdf = async (req, res) => {
    try {
        const r = await fillForRequest(req, res);
        if (!r) return;
        let pdf;
        try {
            if (r.content.kind === 'builder') {
                const html = renderTemplateHtml(r.content.html, r.ctx, {
                    title: r.doc.title || r.baseName,
                    headerHtml: r.content.header, footerHtml: r.content.footer,
                });
                pdf = htmlToPdf(html);
            } else {
                const out = renderTemplate(r.content.buffer, r.ctx, r.slug);
                pdf = docxToPdf(out.buffer);
            }
        } catch (e) {
            if (e.code === 'NO_SOFFICE') {
                return res.status(501).json({ error: 'PDF indisponible', message: 'LibreOffice n\'est pas installé sur le serveur (nécessaire pour convertir en PDF).' });
            }
            throw e;
        }
        logAudit(req, 'document.pdf', 'GeneratedDocument', r.doc.id);
        const filename = r.baseName + '.pdf';
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
        res.send(pdf);
    } catch (err) {
        console.error('Erreur génération PDF :', err);
        res.status(500).json({ error: 'Génération du PDF impossible' });
    }
};

/**
 * POST /api/documents/:id/send — envoie le document au stagiaire (demande de signature).
 */
const sendDocument = (req, res) => {
    db.query(
        `UPDATE generated_document SET status = 'ENVOYE', sent_at = NOW()
         WHERE id = ? AND organization_id = ? AND status = 'A_FAIRE'`,
        [req.params.id, req.user.organization_id],
        (err, result) => {
            if (err) {
                console.error('Erreur envoi document :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (result.affectedRows === 0) {
                return res.status(400).json({ message: 'Document déjà envoyé ou introuvable.' });
            }
            logAudit(req, 'document.send', 'GeneratedDocument', req.params.id);
            res.status(200).json({ success: true, message: 'Document envoyé au stagiaire' });
        }
    );
};

/**
 * POST /api/documents/:id/sign — signature par le stagiaire (ou l'admin).
 * Corps : { signer_name, signature_data }.
 */
const signDocument = async (req, res) => {
    const { signer_name, signature_data } = req.body;
    if (!signer_name) return res.status(422).json({ error: 'Nom du signataire requis.' });
    try {
        const conn = db.promise();
        // Vérifie l'accès : même organisme, et si stagiaire, propriétaire du document.
        const [rows] = await conn.query(
            `SELECT d.id FROM generated_document d
             LEFT JOIN learner l ON l.id = d.learner_id
             WHERE d.id = ? AND d.organization_id = ?
               AND (l.user_id = ? OR ? IN ('SUPER_ADMIN','ADMIN_ORGANISME','SECRETARIAT'))`,
            [req.params.id, req.user.organization_id, req.user.id, req.user.role]
        );
        if (rows.length === 0) return res.status(403).json({ message: 'Document non autorisé.' });

        await conn.query(
            `UPDATE generated_document
             SET status = 'SIGNE', signed_at = NOW(), signer_name = ?, signature_data = ?
             WHERE id = ?`,
            [signer_name, signature_data || null, req.params.id]
        );
        logAudit(req, 'document.sign', 'GeneratedDocument', req.params.id);
        notify(req.user.organization_id, { type: 'SIGNATURE', title: 'Document signé', body: `Signé par ${signer_name}` });
        res.status(200).json({ success: true, message: 'Document signé' });
    } catch (err) {
        console.error('Erreur signature document :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/documents/:id
 */
const deleteDocument = (req, res) => {
    db.query(
        'DELETE FROM generated_document WHERE id = ? AND organization_id = ?',
        [req.params.id, req.user.organization_id],
        (err) => {
            if (err) {
                console.error('Erreur suppression document :', err);
                return res.status(400).json({ message: 'Erreur suppression' });
            }
            res.status(200).json({ success: true, message: 'Document supprimé' });
        }
    );
};

module.exports = { listDocuments, createDocument, getDocument, downloadDocx, downloadPdf, sendDocument, signDocument, deleteDocument };
