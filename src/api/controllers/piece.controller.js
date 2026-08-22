/**
 * PIÈCES JUSTIFICATIVES fournies par le stagiaire — référentiel, dépôts, vérification.
 *
 * Le sens INVERSE du reste de l'application : les seize types de documents vont de l'école vers
 * le stagiaire, celui-ci les reçoit et les signe. Ici c'est lui qui envoie — une copie de pièce
 * d'identité recto/verso, une attestation d'hébergement.
 *
 * Trois choses qu'un document généré n'a pas, et qui structurent ce fichier :
 *   · PLUSIEURS fichiers pour une même pièce (recto ET verso) ;
 *   · un ÉTAT, parce qu'un dépôt se vérifie — et un refus porte un MOTIF, sans quoi il faut
 *     téléphoner pour dire « c'est illisible » ;
 *   · un contrôle HUMAIN, donc la trace de qui a validé.
 *
 * ⚠️ CONSERVATION NON TRANCHÉE (RGPD). Une copie de carte d'identité est une donnée personnelle
 * sensible. La suppression est MANUELLE pour l'instant, faute de décision — cf. le bloc en tête
 * de CLAUDE.md, à reposer jusqu'à réponse. `piece_depot.purge_at` existe déjà, NULL partout :
 * le jour où la règle est arrêtée, il n'y a qu'une purge à écrire ici.
 *
 * Les fichiers vivent en BLOB, comme les photos de publication : rien sur disque, donc rien à
 * nettoyer, et la suppression suit la cascade (migration 127).
 */
const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');

// Migration 127 non jouée : on dégrade au lieu de renvoyer une 500 incompréhensible.
const noTable = (e) => e && (e.code === 'ER_NO_SUCH_TABLE' || e.code === 'ER_BAD_FIELD_ERROR');
const ABSENTE = { message: 'Migration 127 non jouée.' };

const STATUTS = ['ATTENDUE', 'DEPOSEE', 'VALIDEE', 'REFUSEE'];
/* Ce qu'on accepte. Les images passent par la réduction du navigateur ; un PDF arrive tel quel,
 * d'où un plafond plus large que pour une photo de publication — un scan de carte d'identité en
 * PDF pèse volontiers 1,5 Mo. Pas de type bureautique : une pièce justificative se lit, elle ne
 * s'édite pas, et accepter du .docx ouvrirait la porte aux macros. */
const MIMES = ['image/webp', 'image/jpeg', 'image/png', 'application/pdf'];
const MAX_OCTETS = 3 * 1024 * 1024;

/* ─────────────────────────── Référentiel : ce qu'on PEUT demander ─────────────────────────── */

/** GET /api/pieces — le référentiel de l'organisme. */
const listTypes = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT id, code, label, consigne, fichiers_attendus, active
               FROM piece_type WHERE organization_id = ? ORDER BY active DESC, label`,
            [req.user.organization_id]);
        res.json({ data: rows });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] }); // avant la 127 : référentiel vide
        console.error('Erreur référentiel pièces :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const champsType = (b) => ({
    code: String(b?.code || '').trim().toUpperCase().slice(0, 60),
    label: String(b?.label || '').trim().slice(0, 160),
    consigne: b?.consigne ? String(b.consigne).slice(0, 400) : null,
    /* PLAFOND, et non simple indication. Une pièce d'identité tient en UN fichier — on
       photographie souvent recto et verso sur la même image — alors qu'un justificatif peut en
       demander six. Sans plafond appliqué, le champ n'était qu'un texte : rien n'empêchait d'en
       envoyer quinze, et la vérification devenait un dépouillement. */
    fichiers_attendus: Math.min(12, Math.max(1, Number(b?.fichiers_attendus) || 1)),
    active: b?.active === false || b?.active === 0 ? 0 : 1,
});

/** POST /api/pieces — ajouter au référentiel. */
const createType = async (req, res) => {
    const f = champsType(req.body);
    if (!f.label) return res.status(422).json({ message: 'Libellé requis.' });
    // Le code sert de repère stable côté écran ; à défaut on le dérive du libellé.
    if (!f.code) f.code = f.label.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 60);
    try {
        const id = crypto.randomUUID();
        await db.promise().query(
            `INSERT INTO piece_type (id, organization_id, code, label, consigne, fichiers_attendus, active)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.organization_id, f.code, f.label, f.consigne, f.fichiers_attendus, f.active]);
        logAudit(req, 'piecetype.create', 'PieceType', id);
        res.status(201).json({ data: { id, ...f } });
    } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ce code existe déjà.' });
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur création pièce :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PATCH /api/pieces/:id */
const updateType = async (req, res) => {
    const f = champsType(req.body);
    if (!f.label) return res.status(422).json({ message: 'Libellé requis.' });
    try {
        const [r] = await db.promise().query(
            `UPDATE piece_type SET code = ?, label = ?, consigne = ?, fichiers_attendus = ?, active = ?
              WHERE id = ? AND organization_id = ?`,
            [f.code, f.label, f.consigne, f.fichiers_attendus, f.active, req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Pièce introuvable.' });
        logAudit(req, 'piecetype.update', 'PieceType', req.params.id);
        res.json({ success: true });
    } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ce code existe déjà.' });
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur modification pièce :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/pieces/:id — retirer du référentiel.
 *
 * REFUSÉ tant qu'un dossier en dépend : supprimer le type emporterait, par cascade, les dépôts
 * ET les fichiers de tous les stagiaires concernés — donc la preuve d'avoir vérifié leur
 * identité. On propose de le DÉSACTIVER : il disparaît des choix sans rien détruire.
 */
const deleteType = async (req, res) => {
    try {
        const conn = db.promise();
        const [[d]] = await conn.query(
            'SELECT COUNT(*) AS n FROM piece_depot WHERE piece_type_id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (d.n > 0) {
            return res.status(409).json({
                message: `${d.n} dossier${d.n > 1 ? 's' : ''} utilise${d.n > 1 ? 'nt' : ''} cette pièce. Désactivez-la plutôt : elle ne sera plus proposée, et les dépôts existants sont conservés.`,
            });
        }
        const [r] = await conn.query('DELETE FROM piece_type WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Pièce introuvable.' });
        logAudit(req, 'piecetype.delete', 'PieceType', req.params.id);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur suppression pièce :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ────────────────────────────── Dépôts : ce qu'un dossier doit ────────────────────────────── */

/**
 * Les pièces EXIGÉES par la formation d'un dossier, avec l'état de chacune.
 *
 * Sert les deux côtés — la fiche stagiaire côté école et l'espace du stagiaire — parce que
 * c'est la même question : que reste-t-il à fournir ? Deux calculs auraient divergé.
 */
async function piecesDuDossier(conn, orgId, enrollmentId) {
    const [rows] = await conn.query(
        `SELECT pt.id AS piece_type_id, pt.code, pt.label, pt.consigne, pt.fichiers_attendus,
                d.id AS depot_id, d.statut, d.motif_refus,
                DATE_FORMAT(d.depose_le, '%Y-%m-%d %H:%i') AS depose_le,
                DATE_FORMAT(d.verifie_le, '%Y-%m-%d %H:%i') AS verifie_le,
                COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''), u.email) AS verifie_par
           FROM enrollment e
           JOIN program_step ps ON ps.program_id = e.program_id AND ps.active = 1 AND ps.piece_id IS NOT NULL
           JOIN piece_type pt ON pt.id = ps.piece_id
           LEFT JOIN piece_depot d ON d.enrollment_id = e.id AND d.piece_type_id = pt.id
           LEFT JOIN user u ON u.id = d.verifie_par
          WHERE e.id = ? AND e.organization_id = ?
          ORDER BY ps.sort_order, pt.label`,
        [enrollmentId, orgId]);
    const ids = rows.map((r) => r.depot_id).filter(Boolean);
    let parDepot = {};
    if (ids.length) {
        // Les octets ne sortent JAMAIS de la liste : on n'envoie que de quoi afficher une
        // vignette et un lien. Une liste de dix dossiers ferait sinon transiter 30 Mo.
        const [fs] = await conn.query(
            'SELECT id, depot_id, nom, mime, taille, sort_order FROM piece_fichier WHERE depot_id IN (?) ORDER BY sort_order, created_at',
            [ids]);
        parDepot = fs.reduce((acc, f) => { (acc[f.depot_id] ||= []).push(f); return acc; }, {});
    }
    return rows.map((r) => ({ ...r, statut: r.statut || 'ATTENDUE', fichiers: parDepot[r.depot_id] || [] }));
}

/** GET /api/pieces/dossier/:enrollmentId — côté école. */
const listDossier = async (req, res) => {
    try {
        const conn = db.promise();
        /* #5 GARDE DE PROPRIÉTÉ — même règle que deposer/servirFichier/supprimerFichier : un stagiaire
           ne voit QUE son propre dossier. Sans elle, cette route (volontairement sans authorizeRoles,
           pour le dépôt par le stagiaire) laissait lire les MÉTADONNÉES d'un dossier tiers : libellés
           (« Carte d'identité »), statuts, motifs de refus, et NOMS de fichiers (souvent le nom de la
           personne) — donnée sensible RGPD. Les octets restaient protégés (servirFichier re-vérifie). */
        const e = await dossierDe(conn, req.params.enrollmentId, req.user.organization_id);
        if (!e) return res.status(404).json({ message: 'Dossier introuvable.' });
        const staff = req.user.role !== 'STAGIAIRE' && req.user.role !== 'INTERVENANT';
        if (e.user_id !== req.user.id && !staff) return res.status(403).json({ message: "Dossier d'un autre stagiaire." });
        res.json({ data: await piecesDuDossier(conn, req.user.organization_id, req.params.enrollmentId) });
    } catch (err) {
        if (noTable(err)) return res.json({ data: [] });
        console.error('Erreur pièces du dossier :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** Le dossier appartient-il au demandeur ? (stagiaire) — sinon il faut être du personnel. */
async function dossierDe(conn, enrollmentId, orgId) {
    const [[e]] = await conn.query(
        `SELECT e.id, e.organization_id, l.user_id
           FROM enrollment e JOIN learner l ON l.id = e.learner_id
          WHERE e.id = ? AND e.organization_id = ?`,
        [enrollmentId, orgId]);
    return e || null;
}

/**
 * POST /api/pieces/dossier/:enrollmentId/:pieceTypeId — déposer un fichier.
 *
 * LE STAGIAIRE OU L'ÉCOLE. Le stagiaire photographie sa carte depuis son téléphone, mais il
 * arrive aussi qu'il apporte une photocopie papier au secrétariat : refuser le dépôt côté école
 * obligerait à lui demander de le refaire chez lui, ce qu'aucun accueil ne fera.
 *
 * Un dépôt REPASSE en « déposée » à chaque ajout, même après un refus : c'est le geste qui
 * relance la vérification. Sans cela, un stagiaire corrigerait son verso illisible sans que
 * personne ne soit prévenu que la pièce est à revoir.
 */
const deposer = async (req, res) => {
    try {
        const f = req.file;
        if (!f || !f.buffer?.length) return res.status(422).json({ message: 'Fichier requis.' });
        if (f.buffer.length > MAX_OCTETS) {
            return res.status(413).json({ message: `Fichier trop lourd (${Math.round(MAX_OCTETS / 1024 / 1024)} Mo maximum).` });
        }
        if (!MIMES.includes(String(f.mimetype))) {
            return res.status(415).json({ message: 'Formats acceptés : photo (JPEG, PNG, WebP) ou PDF.' });
        }
        const conn = db.promise();
        const e = await dossierDe(conn, req.params.enrollmentId, req.user.organization_id);
        if (!e) return res.status(404).json({ message: 'Dossier introuvable.' });
        const staff = req.user.role !== 'STAGIAIRE' && req.user.role !== 'INTERVENANT';
        if (e.user_id !== req.user.id && !staff) return res.status(403).json({ message: 'Dossier d\'un autre stagiaire.' });

        // Le dépôt existe-t-il déjà ? `INSERT ... ON DUPLICATE KEY` sur (dossier, pièce).
        await conn.query(
            `INSERT INTO piece_depot (id, organization_id, enrollment_id, piece_type_id, statut, depose_le)
             VALUES (?, ?, ?, ?, 'DEPOSEE', NOW())
             ON DUPLICATE KEY UPDATE statut = 'DEPOSEE', depose_le = NOW(),
                                     motif_refus = NULL, verifie_par = NULL, verifie_le = NULL`,
            [crypto.randomUUID(), req.user.organization_id, req.params.enrollmentId, req.params.pieceTypeId]);
        const [[d]] = await conn.query(
            'SELECT id FROM piece_depot WHERE enrollment_id = ? AND piece_type_id = ?',
            [req.params.enrollmentId, req.params.pieceTypeId]);
        /* LE PLAFOND EST APPLIQUÉ ICI, pas seulement affiché. Le refus nomme le nombre attendu :
         * « 1 fichier au maximum » se comprend, « trop de fichiers » oblige à deviner. Il dit
         * aussi comment s'en sortir — retirer avant d'ajouter — parce que c'est le geste que
         * personne ne trouve seul. */
        const [[dejaN]] = await conn.query('SELECT COUNT(*) AS n FROM piece_fichier WHERE depot_id = ?', [d.id]);
        const [[pt]] = await conn.query('SELECT label, fichiers_attendus FROM piece_type WHERE id = ? AND organization_id = ?',
            [req.params.pieceTypeId, req.user.organization_id]);
        const max = Math.max(1, Number(pt?.fichiers_attendus) || 1);
        if (dejaN.n >= max) {
            return res.status(409).json({
                message: `« ${pt?.label || 'Cette pièce'} » accepte ${max} fichier${max > 1 ? 's' : ''} au maximum. `
                    + 'Retirez-en un avant d\'en ajouter un autre.',
            });
        }
        const [[n]] = await conn.query('SELECT COALESCE(MAX(sort_order), 0) AS m FROM piece_fichier WHERE depot_id = ?', [d.id]);
        await conn.query(
            'INSERT INTO piece_fichier (id, depot_id, sort_order, nom, mime, bytes, taille) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), d.id, n.m + 1, String(f.originalname || '').slice(0, 200) || null,
                f.mimetype, f.buffer, f.buffer.length]);
        logAudit(req, 'piece.depot', 'PieceDepot', d.id);
        res.status(201).json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur dépôt de pièce :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/pieces/fichier/:id — servir un fichier.
 *
 * `Content-Disposition: inline` avec un nom : une pièce se REGARDE avant de se valider, mais on
 * garde son nom si elle est téléchargée. Aucun cache : contrairement à une photo de publication,
 * une copie de carte d'identité ne doit pas traîner dans le cache du navigateur — c'est la seule
 * mesure de conservation qu'on puisse prendre tant que la règle d'effacement n'est pas tranchée.
 */
const servirFichier = async (req, res) => {
    try {
        const conn = db.promise();
        const [[f]] = await conn.query(
            `SELECT pf.mime, pf.bytes, pf.nom, d.organization_id, l.user_id
               FROM piece_fichier pf
               JOIN piece_depot d ON d.id = pf.depot_id
               JOIN enrollment e ON e.id = d.enrollment_id
               JOIN learner l ON l.id = e.learner_id
              WHERE pf.id = ?`,
            [req.params.id]);
        if (!f || f.organization_id !== req.user.organization_id) return res.status(404).end();
        const staff = req.user.role !== 'STAGIAIRE' && req.user.role !== 'INTERVENANT';
        if (f.user_id !== req.user.id && !staff) return res.status(403).end();
        res.set('Content-Type', f.mime);
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(f.nom || 'piece')}"`);
        res.set('Cache-Control', 'no-store, private');
        res.send(f.bytes);
    } catch (err) {
        if (noTable(err)) return res.status(404).end();
        console.error('Erreur lecture pièce :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * DELETE /api/pieces/fichier/:id — retirer un fichier.
 *
 * C'EST AUSSI LA PURGE MANUELLE, seule mesure de conservation disponible tant que la règle
 * RGPD n'est pas tranchée (cf. l'en-tête). Le stagiaire peut retirer ce qu'il a envoyé tant que
 * ce n'est pas validé — après, la pièce fait foi et lui seul ne décide plus ; le personnel, lui,
 * peut retirer à tout moment, précisément pour pouvoir effacer une copie devenue inutile.
 */
const supprimerFichier = async (req, res) => {
    try {
        const conn = db.promise();
        const [[f]] = await conn.query(
            `SELECT pf.depot_id, d.organization_id, d.statut, l.user_id
               FROM piece_fichier pf
               JOIN piece_depot d ON d.id = pf.depot_id
               JOIN enrollment e ON e.id = d.enrollment_id
               JOIN learner l ON l.id = e.learner_id
              WHERE pf.id = ?`,
            [req.params.id]);
        if (!f || f.organization_id !== req.user.organization_id) return res.status(404).json({ message: 'Fichier introuvable.' });
        const staff = req.user.role !== 'STAGIAIRE' && req.user.role !== 'INTERVENANT';
        if (!staff) {
            if (f.user_id !== req.user.id) return res.status(403).json({ message: 'Pièce d\'un autre stagiaire.' });
            if (f.statut === 'VALIDEE') return res.status(409).json({ message: 'Pièce déjà validée : demandez à l\'école de la retirer.' });
        }
        await conn.query('DELETE FROM piece_fichier WHERE id = ?', [req.params.id]);
        // Plus aucun fichier : le dépôt redevient « attendue », sinon il resterait « déposée »
        // en promettant une pièce qui n'existe plus.
        const [[n]] = await conn.query('SELECT COUNT(*) AS n FROM piece_fichier WHERE depot_id = ?', [f.depot_id]);
        if (!n.n) {
            await conn.query(
                `UPDATE piece_depot SET statut = 'ATTENDUE', depose_le = NULL, motif_refus = NULL,
                                        verifie_par = NULL, verifie_le = NULL WHERE id = ?`, [f.depot_id]);
        }
        logAudit(req, 'piece.fichier_supprime', 'PieceDepot', f.depot_id);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur suppression fichier :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/pieces/depot/:id — valider ou refuser. Personnel uniquement.
 *
 * UN REFUS SANS MOTIF EST INUTILISABLE : le stagiaire ne saurait pas quoi refaire, et rappellerait
 * l'école pour le demander. Le motif est donc exigé — c'est le seul champ obligatoire de tout ce
 * fichier.
 *
 * Un refus GARDE les fichiers : il faut pouvoir regarder ce qui a été envoyé pour comprendre
 * « verso illisible ».
 */
const verifier = async (req, res) => {
    const statut = String(req.body?.statut || '').toUpperCase();
    if (!['VALIDEE', 'REFUSEE'].includes(statut)) return res.status(422).json({ message: 'Statut attendu : VALIDEE ou REFUSEE.' });
    const motif = String(req.body?.motif_refus || '').trim().slice(0, 400);
    if (statut === 'REFUSEE' && !motif) {
        return res.status(422).json({ message: 'Indiquez ce qui ne va pas : sans motif, le stagiaire ne sait pas quoi refaire.' });
    }
    try {
        const [r] = await db.promise().query(
            `UPDATE piece_depot SET statut = ?, motif_refus = ?, verifie_par = ?, verifie_le = NOW()
              WHERE id = ? AND organization_id = ?`,
            [statut, statut === 'REFUSEE' ? motif : null, req.user.id, req.params.id, req.user.organization_id]);
        if (!r.affectedRows) return res.status(404).json({ message: 'Dépôt introuvable.' });
        logAudit(req, statut === 'VALIDEE' ? 'piece.validee' : 'piece.refusee', 'PieceDepot', req.params.id);
        res.json({ success: true });
    } catch (err) {
        if (noTable(err)) return res.status(503).json(ABSENTE);
        console.error('Erreur vérification pièce :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listTypes, createType, updateType, deleteType, listDossier, piecesDuDossier,
    deposer, servirFichier, supprimerFichier, verifier,
    STATUTS, MIMES, MAX_OCTETS, noTable, ABSENTE };
