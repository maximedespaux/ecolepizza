// Génère (et met à jour) la feuille d'émargement PDF d'un dossier stagiaire,
// avec les signatures du stagiaire et du formateur par demi-journée, et l'archive
// dans le coffre documentaire (archive_document, ref = 'emarg:<enrollment_id>').
const crypto = require('crypto');
const { htmlToPdf } = require('./docxpdf.js');

const SLOT = { MATIN: 'Matin', APRES_MIDI: 'Après-midi', EXAMEN: 'Examen', DISTANCIEL: 'Distanciel' };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sig = (d) => (d ? `<img src="${d}" style="height:38px;max-width:150px" />` : '—');

function renderEmargementHtml({ org, e, rows }) {
    const trainerCell = (list) => (list && list.length
        ? list.map((t) => `${sig(t.signature_data)}<div class="nm">${esc(t.signer_name || '')}</div>`).join('')
        : '—');
    const trs = rows.map((r) => `<tr>
        <td>${esc(r.date)}</td><td>${SLOT[r.slot] || esc(r.slot)}</td>
        <td>${sig(r.signature_data)}<div class="nm">${esc(r.signature_data ? (r.signer_name || '') : '')}</div></td>
        <td>${trainerCell(r.trainers)}</td>
    </tr>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><style>
        body{font-family:Arial,sans-serif;font-size:12px;color:#111}
        h1{font-size:16px;margin:0 0 2px}.sub{color:#555;margin:0 0 12px;font-size:11px;line-height:1.5}
        table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px;text-align:left;vertical-align:middle}
        th{background:#f3f3f3}.nm{font-size:9px;color:#666}td:nth-child(1),td:nth-child(2){white-space:nowrap}
    </style></head><body>
        <h1>Feuille d'émargement</h1>
        <p class="sub">${esc(org && org.legal_name || '')} — ${esc(e.program_title || '')} (${esc(e.program_code || '')})<br/>
        Semaine ${esc(e.week)} · ${esc(e.year)} · du ${esc(e.start_date)} au ${esc(e.end_date)}<br/>
        Stagiaire : <b>${esc(`${e.last_name || ''} ${e.first_name || ''}`.trim())}</b></p>
        <table><thead><tr><th>Date</th><th>Demi-journée</th><th>Signature stagiaire</th><th>Signature formateur</th></tr></thead>
        <tbody>${trs}</tbody></table>
    </body></html>`;
}

/**
 * (Re)génère la feuille d'émargement d'un dossier et l'archive. Non bloquant :
 * en cas d'échec (LibreOffice absent, etc.) on journalise et on n'écrit rien.
 * `conn` = db.promise().
 */
async function regenEmargement(conn, orgId, enrollmentId) {
    try {
        const [[e]] = await conn.query(
            `SELECT e.id, e.learner_id, e.session_id, l.first_name, l.last_name,
                    ts.year, ts.week,
                    DATE_FORMAT(ts.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(ts.end_date, '%Y-%m-%d') AS end_date,
                    p.code AS program_code, p.title AS program_title
             FROM enrollment e
             JOIN training_session ts ON ts.id = e.session_id
             LEFT JOIN training_program p ON p.id = ts.program_id
             LEFT JOIN learner l ON l.id = e.learner_id
             WHERE e.id = ? AND e.organization_id = ?`,
            [enrollmentId, orgId]
        );
        if (!e) return;
        const [[org]] = await conn.query('SELECT legal_name FROM organization WHERE id = ?', [orgId]);
        const [rows] = await conn.query(
            `SELECT s.id AS sheet_id, DATE_FORMAT(s.date, '%Y-%m-%d') AS date, s.slot,
                    ar.signer_name, ar.signature_data
             FROM attendance_sheet s
             LEFT JOIN attendance_record ar ON ar.sheet_id = s.id AND ar.learner_id = ?
             WHERE s.session_id = ?
             ORDER BY s.date, FIELD(s.slot, 'MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL')`,
            [e.learner_id, e.session_id]
        );
        if (!rows.length) return;
        // Signatures formateur par feuille (plusieurs formateurs possibles).
        const [tsigns] = await conn.query(
            `SELECT ats.sheet_id, ats.signer_name, ats.signature_data
             FROM attendance_trainer_sign ats JOIN attendance_sheet s ON s.id = ats.sheet_id
             WHERE s.session_id = ? AND ats.signature_data IS NOT NULL`,
            [e.session_id]
        );
        const bySheet = {};
        for (const t of tsigns) (bySheet[t.sheet_id] = bySheet[t.sheet_id] || []).push(t);
        for (const r of rows) r.trainers = bySheet[r.sheet_id] || [];

        let pdf;
        try { pdf = htmlToPdf(renderEmargementHtml({ org, e, rows })); }
        catch (err) { console.warn('Émargement PDF non généré :', err.code || err.message); return; }

        const learnerName = `${e.last_name || ''} ${e.first_name || ''}`.trim();
        const ref = `emarg:${enrollmentId}`;
        const title = `Feuille d'émargement — ${e.program_code || ''} SEM ${e.week || ''}`.trim();
        const allSigned = rows.every((r) => r.signature_data && r.trainers.length > 0);
        const status = allSigned ? 'SIGNE' : 'ARCHIVE';

        const [[ex]] = await conn.query('SELECT id FROM archive_document WHERE organization_id = ? AND ref = ?', [orgId, ref]);
        if (ex) {
            await conn.query(
                'UPDATE archive_document SET year=?, week=?, formation_label=?, learner_name=?, title=?, status=?, mime=?, file=? WHERE id=?',
                [e.year, e.week, e.program_code || null, learnerName, title.slice(0, 255), status, 'application/pdf', pdf, ex.id]
            );
        } else {
            await conn.query(
                `INSERT INTO archive_document (id, organization_id, ref, year, week, formation_label, learner_name, title, status, mime, file)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), orgId, ref, e.year, e.week, e.program_code || null, learnerName, title.slice(0, 255), status, 'application/pdf', pdf]
            );
        }
    } catch (err) {
        console.warn('regenEmargement :', err.message);
    }
}

module.exports = { regenEmargement };
