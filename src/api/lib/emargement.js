// Génère (et met à jour) la feuille d'émargement PDF d'un dossier stagiaire,
// avec les signatures du stagiaire et du formateur par demi-journée, et l'archive
// dans le coffre documentaire (archive_document, ref = 'emarg:<enrollment_id>').
const crypto = require('crypto');
const { htmlToPdf } = require('./docxpdf.js');
const { decrypt } = require('./crypto.js');

const SLOT = { MATIN: 'Matin', APRES_MIDI: 'Après-midi', EXAMEN: 'Examen', DISTANCIEL: 'Distanciel' };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Les signatures sont chiffrées au repos : on déchiffre avant de les afficher.
const sig = (d) => { const v = decrypt(d); return v ? `<img src="${v}" style="height:38px;max-width:150px" />` : '—'; };

// Date FR courte : « Lun. 06/07 ». Date FR longue : « 06/07/2026 ».
const DOW = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
function frDay(iso) {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return `${DOW[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function frDate(iso) {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso || '';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
const SLOT_ORDER = ['MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL'];

function renderEmargementHtml({ org, e, rows, intervenants = [] }) {
    const learnerName = `${e.last_name || ''} ${e.first_name || ''}`.trim();
    // Grille : lignes = jours, colonnes = créneaux réellement présents.
    const slots = SLOT_ORDER.filter((sl) => rows.some((r) => r.slot === sl));
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    const byKey = {};
    for (const r of rows) byKey[`${r.date}|${r.slot}`] = r;

    // Cellule de signature : image + nom (ou case vide à signer).
    const sigCell = (dataUrl, name, absent) => {
        const v = decrypt(dataUrl);
        if (v) return `<div class="sg"><img src="${v}" /></div>${name ? `<div class="nm">${esc(name)}</div>` : ''}`;
        return absent ? '<span class="na">—</span>' : '<div class="sg empty"></div>';
    };
    const headRow = `<tr><th class="d">Jour</th>${slots.map((sl) => `<th>${SLOT[sl] || esc(sl)}</th>`).join('')}</tr>`;
    const gridBody = (cellFor) => dates.map((d) => `<tr>
        <td class="d">${esc(frDay(d))}</td>
        ${slots.map((sl) => `<td>${cellFor(byKey[`${d}|${sl}`])}</td>`).join('')}
    </tr>`).join('');

    const learnerBody = gridBody((r) => (r ? sigCell(r.signature_data, r.signer_name || learnerName, false) : '<span class="na">—</span>'));
    const trainerBody = gridBody((r) => (r && r.trainers && r.trainers.length
        ? r.trainers.map((t) => sigCell(t.signature_data, t.signer_name, false)).join('')
        : (r ? sigCell(null, '', false) : '<span class="na">—</span>')));

    // Un bloc par intervenant externe (uniquement ses demi-journées).
    const intervSections = intervenants.map((iv) => {
        const k = {};
        for (const s of (iv.slots || [])) k[`${s.date}|${s.slot}`] = s;
        const body = dates.map((d) => `<tr><td class="d">${esc(frDay(d))}</td>${slots.map((sl) => {
            const s = k[`${d}|${sl}`];
            return `<td>${s ? sigCell(s.signature_data, iv.name, false) : ''}</td>`;
        }).join('')}</tr>`).join('');
        return `<div class="blk"><h2>Intervenant — ${esc(iv.name || '')}${iv.specialty ? ` · ${esc(iv.specialty)}` : ''}</h2>
            <table><thead>${headRow}</thead><tbody>${body}</tbody></table></div>`;
    }).join('');

    return `<!doctype html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box}
        body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#1e2140;margin:0;padding:22px}
        .head{border-bottom:2px solid #c0392b;padding-bottom:10px;margin-bottom:14px}
        h1{font-size:18px;margin:0 0 6px;color:#c0392b;letter-spacing:.02em}
        .org{font-weight:700;font-size:12px}
        .meta{color:#555;font-size:10.5px;line-height:1.6;margin-top:4px}
        .meta b{color:#1e2140}
        .blk{margin-top:16px;page-break-inside:avoid}
        h2{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8a8f99;margin:0 0 6px}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        th,td{border:1px solid #d9dbe0;padding:5px 6px;text-align:center;vertical-align:middle}
        th{background:#f5f3f0;font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#555}
        td.d,th.d{width:110px;text-align:left;white-space:nowrap;font-weight:600}
        td{height:44px}
        .sg{height:34px;display:flex;align-items:center;justify-content:center}
        .sg img{max-height:34px;max-width:100%;object-fit:contain}
        .sg.empty{border-bottom:1px dotted #c9ccd2;height:20px;margin:6px 8px 0}
        .nm{font-size:8px;color:#8a8f99;margin-top:1px}
        .na{color:#c9ccd2}
        .foot{margin-top:18px;font-size:9px;color:#8a8f99;border-top:1px solid #e6e6ea;padding-top:8px}
    </style></head><body>
        <div class="head">
            <h1>Feuille d'émargement</h1>
            <div class="org">${esc(org && org.legal_name || '')}</div>
            <div class="meta">
                Formation : <b>${esc(e.program_title || '')}</b> (${esc(e.program_code || '')}) — Semaine ${esc(e.week)}/${esc(e.year)}<br/>
                Période : du <b>${esc(frDate(e.start_date))}</b> au <b>${esc(frDate(e.end_date))}</b><br/>
                Stagiaire : <b>${esc(learnerName)}</b>
            </div>
        </div>

        <div class="blk"><h2>Signature du stagiaire</h2>
            <table><thead>${headRow}</thead><tbody>${learnerBody}</tbody></table></div>

        <div class="blk"><h2>Signature du/des formateur(s)</h2>
            <table><thead>${headRow}</thead><tbody>${trainerBody}</tbody></table></div>

        ${intervSections}

        <p class="foot">Document généré électroniquement — les signatures sont recueillies par voie électronique au fil de la formation.</p>
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
        // Formateurs ET intervenants signent via attendance_trainer_sign : on les
        // sépare selon le rôle du compte, et on récupère la spécialité de l'intervenant.
        const [tsigns] = await conn.query(
            `SELECT ats.sheet_id, ats.user_id, ats.signer_name, ats.signature_data, u.role AS user_role, si.specialty
             FROM attendance_trainer_sign ats
             JOIN attendance_sheet s ON s.id = ats.sheet_id
             LEFT JOIN user u ON u.id = ats.user_id
             LEFT JOIN session_intervenant si ON si.user_id = ats.user_id AND si.session_id = s.session_id
             WHERE s.session_id = ? AND ats.signature_data IS NOT NULL`,
            [e.session_id]
        );
        const trBySheet = {};
        const sheetInfo = {};
        for (const r of rows) sheetInfo[r.sheet_id] = { date: r.date, slot: r.slot };
        // Colonne formateur + index des signatures d'intervenant (par personne/demi-journée).
        const ivSig = {};
        for (const t of tsigns) {
            if (t.user_role === 'INTERVENANT') {
                const info = sheetInfo[t.sheet_id];
                if (info) ivSig[`${t.user_id}|${info.date}|${info.slot}`] = t.signature_data;
            } else {
                (trBySheet[t.sheet_id] = trBySheet[t.sheet_id] || []).push(t);
            }
        }
        for (const r of rows) r.trainers = trBySheet[r.sheet_id] || [];

        // Intervenants AFFECTÉS à la session (avec leurs demi-journées) — affichés même
        // s'ils n'ont pas encore signé ; la signature est remplie là où elle existe.
        const [ivAssign] = await conn.query(
            `SELECT si.user_id, si.specialty, u.first_name, u.last_name,
                    DATE_FORMAT(sis.date, '%Y-%m-%d') AS date, sis.slot
             FROM session_intervenant si
             JOIN session_intervenant_slot sis ON sis.session_intervenant_id = si.id
             LEFT JOIN user u ON u.id = si.user_id
             WHERE si.session_id = ?
             ORDER BY u.last_name, u.first_name, sis.date, FIELD(sis.slot, 'MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL')`,
            [e.session_id]
        );
        const ivByUser = {};
        for (const a of ivAssign) {
            const iv = ivByUser[a.user_id] || (ivByUser[a.user_id] = {
                name: `${a.last_name || ''} ${a.first_name || ''}`.trim(), specialty: a.specialty, slots: [],
            });
            iv.slots.push({ date: a.date, slot: a.slot, signature_data: ivSig[`${a.user_id}|${a.date}|${a.slot}`] || null });
        }
        const intervenants = Object.values(ivByUser);

        let pdf;
        try { pdf = htmlToPdf(renderEmargementHtml({ org, e, rows, intervenants })); }
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
