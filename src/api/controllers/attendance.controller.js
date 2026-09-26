const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { regenEmargement, parseDaySchedules, demiJourneesDuJour, fenetreSignature, calendrierSession, horaireDuJour } = require('../lib/emargement.js');
const { encrypt } = require('../lib/crypto.js');
const { lienEmargement } = require('../lib/relancesEmargement.js');
const { estSignatureValide } = require('../lib/signatures.js');

const SLOTS = ['MATIN', 'APRES_MIDI'];
const hhmm = (min) => (min == null ? null : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);

// Jours ouvrés (lun-ven) entre deux dates ISO incluses.
function businessDays(startISO, endISO) {
    if (!startISO || !endISO) return [];
    const days = [];
    const [ys, ms, ds] = startISO.split('-').map(Number);
    const [ye, me, de] = endISO.split('-').map(Number);
    const cur = new Date(ys, ms - 1, ds);
    const end = new Date(ye, me - 1, de);
    let guard = 0;
    while (cur <= end && guard < 400) {
        const w = cur.getDay();
        if (w !== 0 && w !== 6) {
            days.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
        }
        cur.setDate(cur.getDate() + 1);
        guard += 1;
    }
    return days;
}

/**
 * GET /api/attendance/:sessionId — feuilles d'émargement + présences.
 */
const getAttendance = async (req, res) => {
    try {
        const conn = db.promise();
        // Cloisonnement multi-tenant : la session doit appartenir à l'organisme.
        const [[sess]] = await conn.query(
            'SELECT id FROM training_session WHERE id = ? AND organization_id = ?',
            [req.params.sessionId, req.user.organization_id]
        );
        if (!sess) return res.status(404).json({ message: 'Session introuvable.' });
        const [sheets] = await conn.query(
            `SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, slot,
                    trainer_name, (trainer_signature IS NOT NULL) AS trainer_signed,
                    DATE_FORMAT(trainer_signed_at, '%Y-%m-%d %H:%i') AS trainer_signed_at
             FROM attendance_sheet WHERE session_id = ? ORDER BY date, FIELD(slot,'MATIN','APRES_MIDI','EXAMEN','DISTANCIEL')`,
            [req.params.sessionId]
        );
        /* L'ÉTAT DE CHAQUE DEMI-JOURNÉE à cet instant (à venir, pas encore ouverte, ouverte, close) :
           l'écran n'offre « Rattraper » que sur une demi-journée commencée, comme le serveur. */
        const { horaires, jours } = await calendrierSession(conn, req.params.sessionId);
        for (const sh of sheets) {
            const f = fenetreSignature({ date: sh.date, slot: sh.slot, horaire: horaireDuJour(horaires, jours, sh.date) });
            sh.etat = f.etat;
            sh.ouvre_a = hhmm(f.ouvreA);
        }
        const recs = `SELECT r.id, r.sheet_id, r.learner_id, r.present, r.signer_name,
                    (r.signature_data IS NOT NULL) AS has_signature,
                    DATE_FORMAT(r.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                    l.first_name, l.last_name`;
        const recsSuite = ` FROM attendance_record r
             JOIN attendance_sheet s ON s.id = r.sheet_id
             LEFT JOIN learner l ON l.id = r.learner_id
             WHERE s.session_id = ?`;
        let records;
        try {
            [records] = await conn.query(`${recs}, r.rattrapage_motif, r.rattrapage_par${recsSuite}`, [req.params.sessionId]);
        } catch (e) {
            if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e; // migration 184 non jouée
            [records] = await conn.query(recs + recsSuite, [req.params.sessionId]);
        }
        // Formateurs affectés à la session (une ligne d'émargement chacun).
        const [trainers] = await conn.query(
            `SELECT u.id, u.first_name, u.last_name
             FROM session_trainer st JOIN user u ON u.id = st.user_id
             WHERE st.session_id = ? ORDER BY u.last_name, u.first_name`,
            [req.params.sessionId]
        );
        // Signatures formateur par (feuille, formateur).
        const [trainerSigns] = await conn.query(
            `SELECT ats.sheet_id, ats.user_id, ats.signer_name,
                    (ats.signature_data IS NOT NULL) AS signed,
                    DATE_FORMAT(ats.signed_at, '%Y-%m-%d %H:%i') AS signed_at
             FROM attendance_trainer_sign ats
             JOIN attendance_sheet s ON s.id = ats.sheet_id
             WHERE s.session_id = ?`,
            [req.params.sessionId]
        );
        // Intervenants externes affectés (avec leurs demi-journées) : une ligne chacun.
        // Signatures récupérées via trainerSigns (même table attendance_trainer_sign).
        let intervenants = [];
        try {
            const [ivRows] = await conn.query(
                `SELECT si.user_id AS id, u.first_name, u.last_name, si.specialty,
                        DATE_FORMAT(sis.date, '%Y-%m-%d') AS date, sis.slot
                 FROM session_intervenant si
                 JOIN user u ON u.id = si.user_id
                 LEFT JOIN session_intervenant_slot sis ON sis.session_intervenant_id = si.id
                 WHERE si.session_id = ?
                 ORDER BY u.last_name, u.first_name`,
                [req.params.sessionId]
            );
            const ivMap = {};
            for (const r of ivRows) {
                const iv = ivMap[r.id] || (ivMap[r.id] = { id: r.id, first_name: r.first_name, last_name: r.last_name, specialty: r.specialty, slots: [] });
                if (r.date) iv.slots.push({ date: r.date, slot: r.slot });
            }
            intervenants = Object.values(ivMap);
        } catch (e) {
            if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; // migration 050 non jouée
        }
        res.json({ data: { sheets, records, trainers, trainerSigns, intervenants } });
    } catch (err) {
        console.error('Erreur émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Les demi-journées d'une session, jour ouvré par jour ouvré : celles que les HORAIRES de la
 * formation définissent (« Jour 5 : 8h00 - 12h00 » n'a pas d'après-midi ; « 17h00 - 19h00 » est un
 * après-midi) — le matin et l'après-midi quand les horaires de ce jour sont illisibles.
 * Décidé par l'école le 2026-09-26 : une colonne à signer pour une demi-journée sans cours ne se
 * signait jamais, et la feuille ne passait jamais « signée ». → Set de « date|slot ».
 */
function demiJourneesVoulues(days, horaires) {
    const parJour = parseDaySchedules(horaires, days.length);
    const voulues = new Set();
    days.forEach((day, i) => {
        const d = demiJourneesDuJour(parJour[i + 1]);
        for (const slot of d ? SLOTS.filter((sl) => d[sl]) : SLOTS) voulues.add(`${day}|${slot}`);
    });
    return voulues;
}

/**
 * POST /api/attendance/:sessionId/generate — crée les feuilles des demi-journées de la session
 * (cf. `demiJourneesVoulues`) et une ligne de présence par stagiaire inscrit. Une demi-journée qui
 * n'en fait plus partie (horaires ou dates changés) est RETIRÉE — jamais si elle porte une
 * signature, une présence enregistrée ou l'affectation d'un intervenant.
 */
const generateSheets = async (req, res) => {
    try {
        const conn = db.promise();
        const [sess] = await conn.query(
            `SELECT DATE_FORMAT(start_date,'%Y-%m-%d') AS start_date,
                    DATE_FORMAT(end_date,'%Y-%m-%d') AS end_date
             FROM training_session WHERE id = ? AND organization_id = ?`,
            [req.params.sessionId, req.user.organization_id]
        );
        if (sess.length === 0) return res.status(404).json({ message: 'Session introuvable' });

        const days = businessDays(sess[0].start_date, sess[0].end_date);
        if (days.length === 0) return res.status(422).json({ error: 'Dates de session manquantes' });
        const { horaires } = await calendrierSession(conn, req.params.sessionId);
        const voulues = demiJourneesVoulues(days, horaires);

        const [learners] = await conn.query(
            'SELECT learner_id FROM enrollment WHERE session_id = ?',
            [req.params.sessionId]
        );

        // Purge les présences des stagiaires qui ne sont plus inscrits à la session.
        const enrolledIds = learners.map((l) => l.learner_id).filter(Boolean);
        if (enrolledIds.length) {
            await conn.query(
                `DELETE ar FROM attendance_record ar JOIN attendance_sheet s ON s.id = ar.sheet_id
                 WHERE s.session_id = ? AND (ar.learner_id IS NULL OR ar.learner_id NOT IN (?))`,
                [req.params.sessionId, enrolledIds]
            );
        } else {
            await conn.query(
                `DELETE ar FROM attendance_record ar JOIN attendance_sheet s ON s.id = ar.sheet_id
                 WHERE s.session_id = ?`,
                [req.params.sessionId]
            );
        }

        /* LES DEMI-JOURNÉES EN TROP : hors des horaires ou des dates de la session. Retirées si elles
           ne portent RIEN — ni signature (stagiaire, formateur, intervenant), ni présence
           enregistrée, ni intervenant affecté ; gardées et comptées sinon. Seuls le matin et
           l'après-midi se retirent : un examen ou un distanciel ne sont pas créés ici. */
        const [existantes] = await conn.query(
            `SELECT s.id, DATE_FORMAT(s.date, '%Y-%m-%d') AS date, s.slot,
                    EXISTS(SELECT 1 FROM attendance_record r WHERE r.sheet_id = s.id AND (r.signature_data IS NOT NULL OR r.present = 1)) AS stagiaire,
                    EXISTS(SELECT 1 FROM attendance_trainer_sign t WHERE t.sheet_id = s.id AND t.signature_data IS NOT NULL) AS formateur
             FROM attendance_sheet s WHERE s.session_id = ? AND s.slot IN ('MATIN', 'APRES_MIDI')`,
            [req.params.sessionId]
        );
        let affectees = new Set();
        try {
            const [aff] = await conn.query(
                `SELECT DISTINCT DATE_FORMAT(sis.date, '%Y-%m-%d') AS date, sis.slot FROM session_intervenant si
                 JOIN session_intervenant_slot sis ON sis.session_intervenant_id = si.id WHERE si.session_id = ?`,
                [req.params.sessionId]);
            affectees = new Set(aff.map((a) => `${a.date}|${a.slot}`));
        } catch (e) { if (!(e && e.code === 'ER_NO_SUCH_TABLE')) throw e; } // migration 050 non jouée
        let retirees = 0;
        let gardees = 0;
        for (const x of existantes) {
            const cle = `${x.date}|${x.slot}`;
            if (voulues.has(cle)) continue;
            if (x.stagiaire || x.formateur || affectees.has(cle)) { gardees++; continue; }
            await conn.query('DELETE FROM attendance_sheet WHERE id = ? AND session_id = ?', [x.id, req.params.sessionId]);
            retirees++;
        }

        let creees = 0;
        for (const day of days) {
            for (const slot of SLOTS) {
                if (!voulues.has(`${day}|${slot}`)) continue;
                // Feuille (unique par session+date+slot).
                let [ex] = await conn.query(
                    'SELECT id FROM attendance_sheet WHERE session_id = ? AND date = ? AND slot = ?',
                    [req.params.sessionId, day, slot]
                );
                let sheetId;
                if (ex.length) {
                    sheetId = ex[0].id;
                } else {
                    sheetId = crypto.randomUUID();
                    await conn.query(
                        'INSERT INTO attendance_sheet (id, session_id, date, slot) VALUES (?, ?, ?, ?)',
                        [sheetId, req.params.sessionId, day, slot]
                    );
                    creees++;
                }
                // Une ligne de présence par stagiaire (si absente).
                for (const l of learners) {
                    const [rec] = await conn.query(
                        'SELECT id FROM attendance_record WHERE sheet_id = ? AND learner_id = ?',
                        [sheetId, l.learner_id]
                    );
                    if (rec.length === 0) {
                        await conn.query(
                            'INSERT INTO attendance_record (id, sheet_id, learner_id, present) VALUES (?, ?, ?, 0)',
                            [crypto.randomUUID(), sheetId, l.learner_id]
                        );
                    }
                }
            }
        }
        logAudit(req, 'attendance.generate', 'AttendanceSheet', req.params.sessionId);
        const details = [
            creees ? `${creees} demi-journée(s) ajoutée(s)` : null,
            retirees ? `${retirees} retirée(s) (hors des horaires de la formation)` : null,
            gardees ? `${gardees} hors horaires gardée(s) : elle(s) porte(nt) déjà une signature ou un intervenant` : null,
        ].filter(Boolean);
        res.status(201).json({ message: `Feuilles générées${details.length ? ` — ${details.join(', ')}` : ''}.`, creees, retirees, gardees });
    } catch (err) {
        console.error('Erreur génération émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/attendance/record/:id/rattrapage — L'ÉCOLE enregistre la présence d'un stagiaire sur une
 * demi-journée qu'il n'a pas signée. Corps : { motif, signature_data? }.
 *
 * DÉCIDÉ PAR L'ÉCOLE LE 2026-09-26 : le stagiaire ne signe plus que PENDANT la demi-journée
 * (lib/emargement.js, `fenetreSignature`). Une demi-journée manquée ne se rattrape plus de son
 * côté ; elle se rattrape ici, par le personnel, avec un MOTIF — imprimé dans la case de la
 * feuille, avec le nom de qui l'a enregistrée. Si le stagiaire est là, il signe sur le poste de
 * l'école (`signature_data`) ; sinon la présence est attestée sans signature.
 *
 * Ceci remplace `PATCH /attendance/record/:id`, que rien n'appelait plus : il marquait « présent »
 * et datait la signature SANS signature ni motif — exactement le contournement que la fenêtre
 * ferme.
 *
 * Refusé sur une demi-journée pas encore commencée (le stagiaire peut encore signer lui-même),
 * déjà signée, ou déjà rattrapée. Sans la migration 184 (le motif n'a pas de colonne), 503.
 */
const MOTIF_MAX = 120;
const rattraperPresence = async (req, res) => {
    const motif = String((req.body && req.body.motif) || '').trim().replace(/\s+/g, ' ');
    const signature = (req.body && req.body.signature_data) || null;
    if (!motif) return res.status(422).json({ message: 'Le motif est obligatoire : il s\'imprime sur la feuille d\'émargement.' });
    if (motif.length > MOTIF_MAX) return res.status(422).json({ message: `Motif trop long (${MOTIF_MAX} caractères au plus) : il doit tenir dans la case.` });
    /* Le motif ANCRÉ de lib/signatures.js, pas un simple préfixe : `data:image/png;base64,AA"…`
       passait le préfixe, et la suite s'écrivait dans la feuille d'émargement. */
    if (signature && !estSignatureValide(signature)) return res.status(422).json({ message: 'Signature invalide (image attendue).' });
    try {
        const conn = db.promise();
        const [[r]] = await conn.query(
            `SELECT r.id, r.learner_id, (r.signature_data IS NOT NULL) AS signee, s.session_id,
                    DATE_FORMAT(s.date, '%Y-%m-%d') AS date, s.slot, l.first_name, l.last_name
             FROM attendance_record r
             JOIN attendance_sheet s ON s.id = r.sheet_id
             JOIN training_session ts ON ts.id = s.session_id
             LEFT JOIN learner l ON l.id = r.learner_id
             WHERE r.id = ? AND ts.organization_id = ?`,
            [req.params.id, req.user.organization_id]
        );
        if (!r) return res.status(404).json({ message: 'Présence introuvable.' });
        if (r.signee) return res.status(409).json({ message: 'Cette demi-journée est déjà signée.' });
        const { horaires, jours } = await calendrierSession(conn, r.session_id);
        const { etat } = fenetreSignature({ date: r.date, slot: r.slot, horaire: horaireDuJour(horaires, jours, r.date) });
        if (etat === 'a_venir' || etat === 'pas_encore') {
            return res.status(409).json({ message: 'Cette demi-journée n\'a pas encore commencé : le stagiaire la signera lui-même.' });
        }
        const par = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.email || 'l\'école';
        const nomStagiaire = `${r.last_name || ''} ${r.first_name || ''}`.trim();
        let resultat;
        try {
            [resultat] = await conn.query(
                `UPDATE attendance_record SET present = 1, signed_at = NOW(), signer_name = ?, signature_data = ?,
                        rattrapage_motif = ?, rattrapage_par = ?, rattrapage_le = NOW()
                  WHERE id = ? AND signature_data IS NULL AND rattrapage_motif IS NULL`,
                [signature ? nomStagiaire : null, encrypt(signature), motif, par, req.params.id]
            );
        } catch (err) {
            if (err && err.code === 'ER_BAD_FIELD_ERROR') {
                return res.status(503).json({ message: 'Migration 184 non jouée : le rattrapage ne peut pas encore enregistrer son motif.' });
            }
            throw err;
        }
        if (!resultat || !resultat.affectedRows) return res.status(409).json({ message: 'Cette présence a été enregistrée entre-temps.' });
        logAudit(req, 'attendance.rattrapage', 'AttendanceRecord', req.params.id);
        res.json({ success: true, message: 'Présence enregistrée : le motif figure sur la feuille.' });

        // Met à jour la feuille d'émargement archivée du dossier (non bloquant).
        const [[en]] = await conn.query('SELECT id FROM enrollment WHERE session_id = ? AND learner_id = ? LIMIT 1', [r.session_id, r.learner_id]);
        if (en) regenEmargement(conn, req.user.organization_id, en.id).catch(() => {});
    } catch (err) {
        console.error('Erreur rattrapage émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/attendance/sheet/:id/sign — le formateur signe la feuille (demi-journée).
 * Corps : { signature_data, signer_name? }.
 */
const signSheet = async (req, res) => {
    const { signature_data, signer_name } = req.body || {};
    // Une image, et rien d'autre : elle s'imprime dans la feuille d'émargement (cf. lib/signatures.js).
    if (signature_data && !estSignatureValide(signature_data)) return res.status(422).json({ message: 'Signature invalide (image attendue).' });
    try {
        const conn = db.promise();
        const [[sheet]] = await conn.query(
            `SELECT s.id, s.session_id FROM attendance_sheet s
             JOIN training_session ts ON ts.id = s.session_id
             WHERE s.id = ? AND ts.organization_id = ?`,
            [req.params.id, req.user.organization_id]
        );
        if (!sheet) return res.status(404).json({ message: 'Feuille introuvable.' });
        // Le signataire doit être un formateur affecté à la session (il signe sa propre ligne).
        const [[assigned]] = await conn.query(
            'SELECT 1 AS ok FROM session_trainer WHERE session_id = ? AND user_id = ?',
            [sheet.session_id, req.user.id]
        );
        if (!assigned) return res.status(403).json({ message: "Vous n'êtes pas formateur affecté à cette session." });

        const name = (signer_name && signer_name.trim()) || req.user.email;
        await conn.query(
            `INSERT INTO attendance_trainer_sign (id, sheet_id, user_id, signer_name, signature_data, signed_at)
             VALUES (?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE signer_name = VALUES(signer_name), signature_data = VALUES(signature_data), signed_at = NOW()`,
            [crypto.randomUUID(), req.params.id, req.user.id, name, encrypt(signature_data || null)]
        );
        logAudit(req, 'attendance.sign', 'AttendanceSheet', req.params.id);
        /* L'ALERTE « Émargement à signer » de cette demi-journée s'éteint d'elle-même : elle
           demandait ce geste, il est fait. Retrouvée par son lien, qui est aussi sa clé
           (lib/relancesEmargement.js). AVANT la réponse — celle-ci déclenche le rechargement des
           postes, qui doivent déjà la lire comme lue. Un échec ici n'annule pas la signature. */
        await conn.query('UPDATE notification SET is_read = 1 WHERE organization_id = ? AND user_id = ? AND link = ?',
            [req.user.organization_id, req.user.id, lienEmargement(sheet.session_id, req.params.id)]).catch(() => {});
        res.json({ success: true, message: 'Feuille signée.' });

        // Régénère les feuilles d'émargement archivées des stagiaires de la session (non bloquant).
        const [enr] = await conn.query('SELECT id FROM enrollment WHERE session_id = ?', [sheet.session_id]);
        for (const en of enr) regenEmargement(conn, req.user.organization_id, en.id).catch(() => {});
    } catch (err) {
        console.error('Erreur signature feuille :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/attendance/:sessionId/regenerate — régénère les feuilles d'émargement
 * de tous les dossiers de la session (met à jour la mise en page / les infos).
 */
const regenerateEmargement = async (req, res) => {
    try {
        const conn = db.promise();
        const [[s]] = await conn.query('SELECT id FROM training_session WHERE id = ? AND organization_id = ?',
            [req.params.sessionId, req.user.organization_id]);
        if (!s) return res.status(404).json({ message: 'Session introuvable.' });
        const [enr] = await conn.query('SELECT id FROM enrollment WHERE session_id = ? AND organization_id = ?',
            [req.params.sessionId, req.user.organization_id]);
        let n = 0;
        for (const en of enr) { await regenEmargement(conn, req.user.organization_id, en.id); n++; }
        logAudit(req, 'emargement.regenerate', 'TrainingSession', req.params.sessionId);
        res.json({ success: true, message: `${n} feuille(s) d'émargement régénérée(s).` });
    } catch (err) {
        console.error('Erreur régénération émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getAttendance, generateSheets, rattraperPresence, signSheet, regenerateEmargement, demiJourneesVoulues };
