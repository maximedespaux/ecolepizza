const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { encrypt, decrypt } = require('../lib/crypto.js');

const SLOTS = ['MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL'];
const SLOT_LABEL = { MATIN: 'Matin', APRES_MIDI: 'Après-midi', EXAMEN: 'Examen', DISTANCIEL: 'Distanciel' };

// Vérifie que la session appartient à l'organisme du jeton.
async function ownSession(conn, orgId, sessionId) {
    const [[s]] = await conn.query('SELECT id FROM training_session WHERE id = ? AND organization_id = ?', [sessionId, orgId]);
    return !!s;
}

/**
 * GET /api/sessions/:id/intervenants — intervenants affectés (+ demi-journées) et
 * vivier des comptes INTERVENANT de l'organisme.
 */
const listSessionIntervenants = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        if (!await ownSession(conn, orgId, req.params.id)) return res.status(404).json({ message: 'Session introuvable' });

        const [assigned] = await conn.query(
            `SELECT si.id, si.user_id, si.specialty, u.first_name, u.last_name, u.email
             FROM session_intervenant si JOIN user u ON u.id = si.user_id
             WHERE si.session_id = ? AND si.organization_id = ?
             ORDER BY u.last_name, u.first_name`,
            [req.params.id, orgId]
        );
        if (assigned.length) {
            const ids = assigned.map((a) => a.id);
            const [slots] = await conn.query(
                `SELECT session_intervenant_id AS si, DATE_FORMAT(date, '%Y-%m-%d') AS date, slot
                 FROM session_intervenant_slot WHERE session_intervenant_id IN (?)`,
                [ids]
            );
            const by = {};
            for (const s of slots) (by[s.si] = by[s.si] || []).push({ date: s.date, slot: s.slot });
            for (const a of assigned) a.slots = by[a.id] || [];
        }

        // Vivier : comptes INTERVENANT actifs non déjà affectés à CETTE session.
        const [roster] = await conn.query(
            `SELECT id, first_name, last_name, email FROM user
             WHERE organization_id = ? AND role = 'INTERVENANT' AND active = 1
               AND id NOT IN (SELECT user_id FROM session_intervenant WHERE session_id = ?)
             ORDER BY last_name, first_name`,
            [orgId, req.params.id]
        );
        res.json({ data: { assigned, roster } });
    } catch (err) {
        console.error('Erreur liste intervenants session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/sessions/:id/intervenants — affecte un intervenant. Corps : { user_id, specialty }. */
const addSessionIntervenant = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        if (!await ownSession(conn, orgId, req.params.id)) return res.status(404).json({ message: 'Session introuvable' });
        const { user_id, specialty } = req.body || {};
        // Le compte doit être un INTERVENANT de l'organisme.
        const [[u]] = await conn.query(
            "SELECT id FROM user WHERE id = ? AND organization_id = ? AND role = 'INTERVENANT'", [user_id, orgId]);
        if (!u) return res.status(422).json({ error: 'Compte intervenant invalide.' });
        const id = crypto.randomUUID();
        try {
            await conn.query(
                'INSERT INTO session_intervenant (id, organization_id, session_id, user_id, specialty) VALUES (?, ?, ?, ?, ?)',
                [id, orgId, req.params.id, user_id, specialty ? String(specialty).slice(0, 160) : null]);
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Cet intervenant est déjà affecté à la session.' });
            throw e;
        }
        logAudit(req, 'session.intervenant.add', 'TrainingSession', req.params.id);
        res.status(201).json({ data: { id } });
    } catch (err) {
        console.error('Erreur ajout intervenant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/sessions/:id/intervenants/:siId/slots — remplace les demi-journées. Corps : { slots:[{date,slot}] }. */
const setIntervenantSlots = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[si]] = await conn.query(
            'SELECT id FROM session_intervenant WHERE id = ? AND session_id = ? AND organization_id = ?',
            [req.params.siId, req.params.id, orgId]);
        if (!si) return res.status(404).json({ message: 'Affectation introuvable' });

        const list = Array.isArray(req.body?.slots) ? req.body.slots : [];
        await conn.query('DELETE FROM session_intervenant_slot WHERE session_intervenant_id = ?', [si.id]);
        for (const s of list) {
            const date = String(s.date || '').slice(0, 10);
            const slot = String(s.slot || '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !SLOTS.includes(slot)) continue;
            await conn.query(
                'INSERT IGNORE INTO session_intervenant_slot (id, session_intervenant_id, date, slot) VALUES (?, ?, ?, ?)',
                [crypto.randomUUID(), si.id, date, slot]);
        }
        logAudit(req, 'session.intervenant.slots', 'TrainingSession', req.params.id);
        res.json({ success: true, message: 'Demi-journées enregistrées.' });
    } catch (err) {
        console.error('Erreur demi-journées intervenant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/sessions/:id/intervenants/:siId — retire l'intervenant de la session. */
const removeSessionIntervenant = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [result] = await conn.query(
            'DELETE FROM session_intervenant WHERE id = ? AND session_id = ? AND organization_id = ?',
            [req.params.siId, req.params.id, orgId]);
        if (!result.affectedRows) return res.status(404).json({ message: 'Affectation introuvable' });
        logAudit(req, 'session.intervenant.remove', 'TrainingSession', req.params.id);
        res.json({ success: true, message: 'Intervenant retiré.' });
    } catch (err) {
        console.error('Erreur retrait intervenant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// ---------------------------------------------------------------------------
// Espace intervenant (rôle INTERVENANT) : ses demi-journées à signer.
// ---------------------------------------------------------------------------

/** GET /api/intervenant/emargement — sessions et demi-journées assignées à l'intervenant connecté. */
const getMyIntervenantSheets = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [assigns] = await conn.query(
            `SELECT si.id AS si_id, si.session_id, si.specialty,
                    ts.year, ts.week, p.code AS program_code, p.title AS program_title,
                    DATE_FORMAT(ts.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(ts.end_date, '%Y-%m-%d') AS end_date
             FROM session_intervenant si
             JOIN training_session ts ON ts.id = si.session_id
             LEFT JOIN training_program p ON p.id = ts.program_id
             WHERE si.user_id = ? AND si.organization_id = ?
             ORDER BY ts.start_date DESC`,
            [req.user.id, orgId]
        );
        if (!assigns.length) return res.json({ data: [] });

        const siIds = assigns.map((a) => a.si_id);
        const sessionIds = [...new Set(assigns.map((a) => a.session_id))];
        const [slots] = await conn.query(
            `SELECT session_intervenant_id AS si, DATE_FORMAT(date, '%Y-%m-%d') AS date, slot
             FROM session_intervenant_slot WHERE session_intervenant_id IN (?)`,
            [siIds]
        );
        // Feuilles existantes + signatures de CET intervenant.
        const [sheets] = await conn.query(
            `SELECT id, session_id, DATE_FORMAT(date, '%Y-%m-%d') AS date, slot FROM attendance_sheet WHERE session_id IN (?)`,
            [sessionIds]
        );
        const [signs] = await conn.query(
            `SELECT ats.sheet_id FROM attendance_trainer_sign ats JOIN attendance_sheet s ON s.id = ats.sheet_id
             WHERE s.session_id IN (?) AND ats.user_id = ? AND ats.signature_data IS NOT NULL`,
            [sessionIds, req.user.id]
        );
        const sheetKey = (sid, d, sl) => `${sid}|${d}|${sl}`;
        const sheetByKey = {};
        for (const s of sheets) sheetByKey[sheetKey(s.session_id, s.date, s.slot)] = s.id;
        const signedSheets = new Set(signs.map((s) => s.sheet_id));
        const slotsBySi = {};
        for (const s of slots) (slotsBySi[s.si] = slotsBySi[s.si] || []).push(s);

        const data = assigns.map((a) => ({
            session_id: a.session_id, specialty: a.specialty || null,
            program_code: a.program_code, program_title: a.program_title,
            year: a.year, week: a.week, start_date: a.start_date, end_date: a.end_date,
            slots: (slotsBySi[a.si_id] || [])
                .sort((x, y) => x.date.localeCompare(y.date) || SLOTS.indexOf(x.slot) - SLOTS.indexOf(y.slot))
                .map((s) => {
                    const sheetId = sheetByKey[sheetKey(a.session_id, s.date, s.slot)];
                    return { date: s.date, slot: s.slot, slot_label: SLOT_LABEL[s.slot] || s.slot,
                        signed: !!(sheetId && signedSheets.has(sheetId)) };
                }),
        }));
        res.json({ data });
    } catch (err) {
        console.error('Erreur espace intervenant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/intervenant/me — profil (dont signature enregistrée). */
const getMyIntervenantProfile = async (req, res) => {
    try {
        let signature = null;
        try {
            const [[u]] = await db.promise().query('SELECT signature_image FROM user WHERE id = ?', [req.user.id]);
            signature = decrypt(u && u.signature_image) || null;
        } catch (e) { if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e; } // migration 051 non jouée
        res.json({ data: { signature } });
    } catch (err) {
        console.error('Erreur profil intervenant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/intervenant/signature — enregistre la signature réutilisable. Corps : { signature_data }. */
const setMyIntervenantSignature = async (req, res) => {
    try {
        const data = req.body && req.body.signature_data;
        if (data && !/^data:image\//.test(data)) return res.status(422).json({ message: 'Image de signature invalide.' });
        await db.promise().query('UPDATE user SET signature_image = ? WHERE id = ?', [encrypt(data || null), req.user.id]);
        res.json({ success: true, message: 'Signature enregistrée.' });
    } catch (err) {
        console.error('Erreur enregistrement signature intervenant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/intervenant/emargement/sign — signe UNE demi-journée. Corps : { session_id, date, slot, signature_data | use_saved, signer_name? }. */
const signMyIntervenantSheet = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const { session_id, date, slot, signer_name } = req.body || {};
        let signature_data = req.body && req.body.signature_data;
        // Signature enregistrée (cachet société) : on la réutilise si demandé.
        if (req.body && req.body.use_saved) {
            const [[u]] = await conn.query('SELECT signature_image FROM user WHERE id = ?', [req.user.id]);
            signature_data = decrypt(u && u.signature_image);
            if (!signature_data) return res.status(422).json({ message: 'Aucune signature enregistrée.' });
        }
        if (!signature_data) return res.status(422).json({ message: 'Signature requise.' });
        if (!SLOTS.includes(slot)) return res.status(422).json({ message: 'Demi-journée invalide.' });

        // L'intervenant doit être assigné à CETTE demi-journée.
        const [[ok]] = await conn.query(
            `SELECT sis.id FROM session_intervenant si
             JOIN session_intervenant_slot sis ON sis.session_intervenant_id = si.id
             WHERE si.user_id = ? AND si.organization_id = ? AND si.session_id = ? AND sis.date = ? AND sis.slot = ? LIMIT 1`,
            [req.user.id, orgId, session_id, date, slot]
        );
        if (!ok) return res.status(403).json({ message: 'Demi-journée non assignée.' });

        // Feuille d'émargement de la demi-journée (créée si absente).
        let [[sheet]] = await conn.query(
            'SELECT id FROM attendance_sheet WHERE session_id = ? AND date = ? AND slot = ? LIMIT 1', [session_id, date, slot]);
        if (!sheet) {
            const sheetId = crypto.randomUUID();
            await conn.query('INSERT INTO attendance_sheet (id, session_id, date, slot) VALUES (?, ?, ?, ?)', [sheetId, session_id, date, slot]);
            sheet = { id: sheetId };
        }
        const name = (signer_name && signer_name.trim())
            || `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'Intervenant';
        await conn.query(
            `INSERT INTO attendance_trainer_sign (id, sheet_id, user_id, signer_name, signature_data, signed_at)
             VALUES (?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE signer_name = VALUES(signer_name), signature_data = VALUES(signature_data), signed_at = NOW()`,
            [crypto.randomUUID(), sheet.id, req.user.id, name, encrypt(signature_data)]
        );
        logAudit(req, 'intervenant.emargement.sign', 'AttendanceSheet', sheet.id);
        res.json({ success: true, message: 'Émargement signé.' });
    } catch (err) {
        console.error('Erreur signature intervenant :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    listSessionIntervenants, addSessionIntervenant, setIntervenantSlots, removeSessionIntervenant,
    getMyIntervenantSheets, signMyIntervenantSheet, getMyIntervenantProfile, setMyIntervenantSignature,
};
