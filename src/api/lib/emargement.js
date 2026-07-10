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

function renderEmargementHtml({ org, e, rows, participants = [] }) {
    // Colonnes = jours (dates) × demi-journées présentes ce jour-là (grille paysage).
    const dates = [...new Set(rows.map((r) => r.date))].sort();
    const daySlots = {}; // date -> [slots présents]
    for (const d of dates) daySlots[d] = SLOT_ORDER.filter((sl) => rows.some((r) => r.date === d && r.slot === sl));
    const cols = []; // colonnes ordonnées { date, slot }
    for (const d of dates) for (const sl of daySlots[d]) cols.push({ date: d, slot: sl });

    // Cellule signature : image, ou case vide (à signer), ou grisée (pas concerné).
    const cell = (dataUrl, applies) => {
        if (!applies) return '<td class="off"></td>';
        const v = decrypt(dataUrl);
        return v ? `<td><span class="sg"><img src="${v}" /></span></td>` : '<td><span class="ln"></span></td>';
    };
    const rowFor = (p) => `<tr>
        <td class="nm">${esc(p.name || '')}${p.specialty ? `<div class="sub">${esc(p.specialty)}</div>` : ''}${p.role === 'stagiaire' ? '<div class="sub">Stagiaire</div>' : p.role === 'intervenant' ? '<div class="sub">Intervenant</div>' : ''}</td>
        ${cols.map((c) => { const k = `${c.date}|${c.slot}`; return cell(p.sigOf(k), p.appliesTo(k)); }).join('')}
    </tr>`;

    const today = frDate(new Date().toISOString().slice(0, 10));
    const orgAddr = [org && org.address, [org && org.zip_code, org && org.town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const orgSig = decrypt(org && org.signature_image);
    const durText = [e.program_days ? `${e.program_days} jour${e.program_days > 1 ? 's' : ''}` : '', e.program_hours ? `${e.program_hours} h` : ''].filter(Boolean).join(' · ');

    return `<!doctype html><html><head><meta charset="utf-8"><style>
        @page{size:297mm 210mm;margin:10mm}
        *{box-sizing:border-box}
        body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#1e2140;margin:0}
        h1{font-size:16px;margin:0 0 4px;color:#c0392b;letter-spacing:.03em;text-transform:uppercase}
        .head{border-bottom:2px solid #c0392b;padding-bottom:8px;margin-bottom:10px}
        .org{font-weight:700;font-size:11px}
        .meta{color:#444;font-size:10px;line-height:1.55;margin-top:3px}
        .meta b{color:#1e2140}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        th,td{border:1px solid #cfd2d8;padding:3px 4px;text-align:center;vertical-align:middle;font-size:9px}
        thead th{background:#f5f3f0;text-transform:uppercase;letter-spacing:.03em;color:#555}
        .who{width:150px;text-align:left}
        td.nm{text-align:left;font-weight:600;font-size:9.5px}
        td.nm .sub{font-weight:400;font-size:8px;color:#8a8f99}
        tbody td{height:38px}
        td.off{background:#f4f4f6}
        .sg img{max-height:30px;max-width:100%;object-fit:contain}
        .ln{display:block;border-bottom:1px dotted #b9bcc4;width:70%;margin:14px auto 0}
        .foot{margin-top:14px;display:flex;justify-content:space-between;align-items:flex-end;font-size:10px}
        .stamp{text-align:center}
        .stamp img{max-height:60px;max-width:200px;object-fit:contain;display:block;margin:0 auto 2px}
        .stamp .cap{font-size:9px;color:#555}
    </style></head><body>
        <div class="head">
            <h1>Feuille d'émargement</h1>
            <div class="org">${esc(org && org.legal_name || '')}</div>
            <div class="meta">
                Intitulé de l'action de formation : <b>${esc(e.program_title || '')}</b> (${esc(e.program_code || '')})<br/>
                Date(s) : <b>du ${esc(frDate(e.start_date))} au ${esc(frDate(e.end_date))}</b> — Semaine ${esc(e.week)}/${esc(e.year)}${durText ? ` · Durée : ${esc(durText)}` : ''}<br/>
                ${e.program_horaires ? `Horaires : ${esc(e.program_horaires).replace(/\r?\n/g, '<br/>')}<br/>` : ''}${orgAddr ? `Lieu : ${esc(orgAddr)}` : ''}
            </div>
        </div>

        <table>
            <thead>
                <tr><th class="who" rowspan="2">Nom et prénom</th>${dates.map((d) => `<th colspan="${daySlots[d].length}">${esc(frDay(d))}</th>`).join('')}</tr>
                <tr>${cols.map((c) => `<th>${SLOT[c.slot] || esc(c.slot)}</th>`).join('')}</tr>
            </thead>
            <tbody>${participants.map(rowFor).join('')}</tbody>
        </table>

        <div class="foot">
            <div>Fait à ${esc(org && org.town || '')}, le ${esc(today)}</div>
            <div class="stamp">
                ${orgSig ? `<img src="${orgSig}" />` : ''}
                <div class="cap">Signature et cachet de l'organisme de formation</div>
            </div>
        </div>
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
                    p.code AS program_code, p.title AS program_title, p.days AS program_days, p.hours AS program_hours, p.id AS program_id
             FROM enrollment e
             JOIN training_session ts ON ts.id = e.session_id
             LEFT JOIN training_program p ON p.id = ts.program_id
             LEFT JOIN learner l ON l.id = e.learner_id
             WHERE e.id = ? AND e.organization_id = ?`,
            [enrollmentId, orgId]
        );
        if (!e) return;
        // Horaires détaillés (colonne ajoutée par 056) — lecture tolérante à l'absence.
        try {
            const [[h]] = await conn.query('SELECT horaires FROM training_program WHERE id = ?', [e.program_id]);
            e.program_horaires = h ? h.horaires : null;
        } catch (err) { if (!(err && err.code === 'ER_BAD_FIELD_ERROR')) throw err; }
        const [[org]] = await conn.query('SELECT legal_name, address, zip_code, town, signature_image FROM organization WHERE id = ?', [orgId]);
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
        const sheetInfo = {};
        for (const r of rows) sheetInfo[r.sheet_id] = { date: r.date, slot: r.slot };
        // Signatures (chiffrées) indexées par personne + demi-journée (date|slot).
        const learnerSig = {};
        for (const r of rows) if (r.signature_data) learnerSig[`${r.date}|${r.slot}`] = r.signature_data;
        const trSig = {}; const ivSig = {};
        for (const t of tsigns) {
            const info = sheetInfo[t.sheet_id];
            if (!info) continue;
            const target = t.user_role === 'INTERVENANT' ? ivSig : trSig;
            target[`${t.user_id}|${info.date}|${info.slot}`] = t.signature_data;
        }

        // Formateurs affectés à la session (une ligne chacun, même sans signature).
        const [formateurs] = await conn.query(
            `SELECT u.id, u.first_name, u.last_name FROM session_trainer st JOIN user u ON u.id = st.user_id
             WHERE st.session_id = ? ORDER BY u.last_name, u.first_name`,
            [e.session_id]
        );
        // Intervenants affectés (avec leurs demi-journées).
        const [ivAssign] = await conn.query(
            `SELECT si.user_id, si.specialty, u.first_name, u.last_name,
                    DATE_FORMAT(sis.date, '%Y-%m-%d') AS date, sis.slot
             FROM session_intervenant si
             JOIN session_intervenant_slot sis ON sis.session_intervenant_id = si.id
             LEFT JOIN user u ON u.id = si.user_id
             WHERE si.session_id = ?`,
            [e.session_id]
        );
        const ivByUser = {};
        for (const a of ivAssign) {
            const iv = ivByUser[a.user_id] || (ivByUser[a.user_id] = {
                user_id: a.user_id, name: `${a.last_name || ''} ${a.first_name || ''}`.trim(),
                specialty: a.specialty, assigned: new Set(),
            });
            iv.assigned.add(`${a.date}|${a.slot}`);
        }

        // Colonnes de la grille : demi-journées existantes (date|slot).
        const sheetKeys = new Set(rows.map((r) => `${r.date}|${r.slot}`));
        const learnerName = `${e.last_name || ''} ${e.first_name || ''}`.trim();
        // Participants (lignes) : stagiaire, formateurs, intervenants. sigOf(key) -> data|null ;
        // appliesTo(key) -> présent cette demi-journée ?
        const participants = [
            { role: 'stagiaire', name: learnerName, sigOf: (k) => learnerSig[k] || null, appliesTo: (k) => sheetKeys.has(k) },
            ...formateurs.map((f) => ({
                role: 'formateur', name: `${f.last_name || ''} ${f.first_name || ''}`.trim(),
                sigOf: (k) => trSig[`${f.id}|${k}`] || null, appliesTo: (k) => sheetKeys.has(k),
            })),
            ...Object.values(ivByUser).map((iv) => ({
                role: 'intervenant', name: iv.name, specialty: iv.specialty,
                sigOf: (k) => ivSig[`${iv.user_id}|${k}`] || null, appliesTo: (k) => iv.assigned.has(k),
            })),
        ];
        const allSignedFlag = rows.every((r) => r.signature_data);

        let pdf;
        try { pdf = htmlToPdf(renderEmargementHtml({ org, e, rows, participants })); }
        catch (err) { console.warn('Émargement PDF non généré :', err.code || err.message); return; }

        const ref = `emarg:${enrollmentId}`;
        const title = `Feuille d'émargement — ${e.program_code || ''} SEM ${e.week || ''}`.trim();
        const status = allSignedFlag ? 'SIGNE' : 'ARCHIVE';

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
