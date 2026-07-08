const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { regenEmargement } = require('../lib/emargement.js');

const SLOTS = ['MATIN', 'APRES_MIDI'];

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
        const [sheets] = await conn.query(
            `SELECT id, DATE_FORMAT(date, '%Y-%m-%d') AS date, slot,
                    trainer_name, (trainer_signature IS NOT NULL) AS trainer_signed,
                    DATE_FORMAT(trainer_signed_at, '%Y-%m-%d %H:%i') AS trainer_signed_at
             FROM attendance_sheet WHERE session_id = ? ORDER BY date, FIELD(slot,'MATIN','APRES_MIDI','EXAMEN','DISTANCIEL')`,
            [req.params.sessionId]
        );
        const [records] = await conn.query(
            `SELECT r.id, r.sheet_id, r.learner_id, r.present, r.signer_name,
                    (r.signature_data IS NOT NULL) AS has_signature,
                    DATE_FORMAT(r.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                    l.first_name, l.last_name
             FROM attendance_record r
             JOIN attendance_sheet s ON s.id = r.sheet_id
             LEFT JOIN learner l ON l.id = r.learner_id
             WHERE s.session_id = ?`,
            [req.params.sessionId]
        );
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
        res.json({ data: { sheets, records, trainers, trainerSigns } });
    } catch (err) {
        console.error('Erreur émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/attendance/:sessionId/generate — crée les feuilles (matin/après-midi
 * pour chaque jour ouvré) et une ligne de présence par stagiaire inscrit.
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

        const [learners] = await conn.query(
            'SELECT learner_id FROM enrollment WHERE session_id = ?',
            [req.params.sessionId]
        );

        for (const day of days) {
            for (const slot of SLOTS) {
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
        res.status(201).json({ message: 'Feuilles générées' });
    } catch (err) {
        console.error('Erreur génération émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PATCH /api/attendance/record/:id — marque une présence.
 */
const setPresence = (req, res) => {
    const present = req.body.present ? 1 : 0;
    db.query(
        `UPDATE attendance_record SET present = ?, signed_at = ${present ? 'NOW()' : 'NULL'} WHERE id = ?`,
        [present, req.params.id],
        (err) => {
            if (err) {
                console.error('Erreur présence :', err);
                return res.status(400).json({ message: 'Erreur mise à jour' });
            }
            res.status(200).json({ success: true });
        }
    );
};

/**
 * POST /api/attendance/sheet/:id/sign — le formateur signe la feuille (demi-journée).
 * Corps : { signature_data, signer_name? }.
 */
const signSheet = async (req, res) => {
    const { signature_data, signer_name } = req.body || {};
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
            [crypto.randomUUID(), req.params.id, req.user.id, name, signature_data || null]
        );
        logAudit(req, 'attendance.sign', 'AttendanceSheet', req.params.id);
        res.json({ success: true, message: 'Feuille signée.' });

        // Régénère les feuilles d'émargement archivées des stagiaires de la session (non bloquant).
        const [enr] = await conn.query('SELECT id FROM enrollment WHERE session_id = ?', [sheet.session_id]);
        for (const en of enr) regenEmargement(conn, req.user.organization_id, en.id).catch(() => {});
    } catch (err) {
        console.error('Erreur signature feuille :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getAttendance, generateSheets, setPresence, signSheet };
