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

// ── Analyse du champ « Horaires » (texte libre) en plages par jour ────────────
// Ex. : « Jour 1 : 8h45 - 12h00 / 13h00 - 17h15 » ; une ligne sans « Jour N » sert
// de valeur par défaut pour les jours non précisés. Retourne { [jour]: {matin:[deb,fin], aprem:[deb,fin]} }.
const toMin = (tok) => { const m = String(tok).match(/(\d{1,2})\s*h\s*(\d{0,2})/i); return m ? parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0) : null; };
const fmtHM = (min) => { if (min == null) return ''; const h = Math.floor(min / 60), m = ((min % 60) + 60) % 60; return `${h}h${String(m).padStart(2, '0')}`; };
const fmtDur = (min) => (min == null || min <= 0) ? '' : fmtHM(min);
function parseDaySchedules(text, numDays) {
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let def = null; const byDay = {};
    for (const line of lines) {
        const times = (line.match(/\d{1,2}\s*h\s*\d{0,2}/gi) || []).map(toMin).filter((v) => v != null);
        if (times.length < 2) continue;
        const sched = { matin: [times[0], times[1]], aprem: times.length >= 4 ? [times[2], times[3]] : null };
        const rng = line.match(/jours?\s*(\d+)\s*(?:à|au|-|–|et|,)\s*(\d+)/i);
        const one = line.match(/jours?\s*(\d+)/i);
        let days = [];
        if (rng) { for (let d = +rng[1]; d <= +rng[2]; d++) days.push(d); }
        else if (one) { days.push(+one[1]); }
        if (days.length) { for (const d of days) byDay[d] = sched; }
        else if (!def) def = sched;
    }
    const out = {};
    for (let d = 1; d <= numDays; d++) out[d] = byDay[d] || def || null;
    return out;
}

// Configuration par défaut de la feuille d'émargement (mise en page actuelle).
// Toute clé absente reprend cette valeur -> compatible avec les organismes qui
// n'ont rien personnalisé.
const DEFAULT_EMARG_CONFIG = {
    orientation: 'landscape',        // 'landscape' | 'portrait'
    title: "Feuille d'émargement",
    accent: '#c0392b',
    show_logo: false,
    show_duration: true,
    show_horaires: true,
    show_lieu: true,
    header_note: '',
    slots: ['MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL'], // demi-journées affichées en colonnes
    show_formateurs: true,
    show_intervenants: true,
    show_hours: true,                // lignes récap : horaires (au-dessus stagiaire) + volume (au-dessus formateur)
    density: 'normal',               // 'compact' | 'normal' | 'large' (police)
    margin_mm: 10,                   // marge de page
    footer_left: '',                 // '' -> « Fait à {ville}, le {date} »
    footer_caption: "Signature et cachet de l'organisme de formation",
    show_stamp: true,
};

const DENSITY = {
    compact: { base: 8.5, name: 8.5, sub: 7.5, head: 8, row: 30 },
    normal: { base: 9, name: 9.5, sub: 8, head: 9, row: 38 },
    large: { base: 10.5, name: 11, sub: 9, head: 10, row: 46 },
};

// Fusionne une config (objet ou JSON string, éventuellement partielle) sur les
// valeurs par défaut, avec un minimum de coercition de types.
function mergeEmargConfig(raw) {
    let obj = raw;
    if (typeof raw === 'string') { try { obj = JSON.parse(raw); } catch { obj = null; } }
    if (!obj || typeof obj !== 'object') return { ...DEFAULT_EMARG_CONFIG, slots: [...DEFAULT_EMARG_CONFIG.slots] };
    const c = { ...DEFAULT_EMARG_CONFIG, ...obj };
    c.orientation = c.orientation === 'portrait' ? 'portrait' : 'landscape';
    c.title = String(c.title || DEFAULT_EMARG_CONFIG.title);
    c.accent = /^#[0-9a-fA-F]{6}$/.test(c.accent) ? c.accent : DEFAULT_EMARG_CONFIG.accent;
    c.header_note = String(c.header_note || '');
    c.density = ['compact', 'normal', 'large'].includes(c.density) ? c.density : 'normal';
    // slots : sous-ensemble ordonné valide ; défaut = tous si vide/invalide.
    const validSlots = Array.isArray(c.slots) ? SLOT_ORDER.filter((s) => c.slots.includes(s)) : [];
    c.slots = validSlots.length ? validSlots : [...DEFAULT_EMARG_CONFIG.slots];
    c.footer_left = String(c.footer_left || '');
    c.footer_caption = String(c.footer_caption == null ? DEFAULT_EMARG_CONFIG.footer_caption : c.footer_caption);
    delete c.sig_height; // option retirée : dimensionnement automatique
    const m = parseInt(c.margin_mm, 10);
    c.margin_mm = Number.isFinite(m) ? Math.min(25, Math.max(4, m)) : DEFAULT_EMARG_CONFIG.margin_mm;
    for (const k of ['show_logo', 'show_duration', 'show_horaires', 'show_lieu', 'show_formateurs', 'show_intervenants', 'show_hours', 'show_stamp']) c[k] = !!c[k];
    return c;
}

// 1 mm ≈ 3.7795 px (96 dpi) — pour les attributs width/height des images.
const MM = 3.7795;

function renderEmargementHtml({ org, e, rows, participants = [], config }) {
    const cfg = mergeEmargConfig(config);
    const dens = DENSITY[cfg.density] || DENSITY.normal;
    const slotSet = new Set(cfg.slots);
    // Colonnes = jours (dates) × demi-journées présentes ce jour-là ET activées en config.
    const daySlots = {}; // date -> [slots présents]
    for (const d of [...new Set(rows.map((r) => r.date))].sort()) {
        const sl = SLOT_ORDER.filter((s) => slotSet.has(s) && rows.some((r) => r.date === d && r.slot === s));
        if (sl.length) daySlots[d] = sl;
    }
    const dates = Object.keys(daySlots).sort(); // jours ayant au moins une colonne
    const cols = []; // colonnes ordonnées { date, slot }
    for (const d of dates) for (const sl of daySlots[d]) cols.push({ date: d, slot: sl });

    // Horaires détaillés par jour (récap), extraits du champ « Horaires » de la formation.
    const schedules = cfg.show_hours ? parseDaySchedules(e.program_horaires, dates.length) : {};
    const rangeFor = (c) => { const s = schedules[dates.indexOf(c.date) + 1]; if (!s) return null; return c.slot === 'MATIN' ? s.matin : c.slot === 'APRES_MIDI' ? s.aprem : null; };
    const hasSched = cfg.show_hours && cols.some((c) => rangeFor(c));

    const orgAddr = [org && org.address, [org && org.zip_code, org && org.town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const orgSig = cfg.show_stamp ? decrypt(org && org.signature_image) : null;
    const orgLogo = cfg.show_logo ? (org && org.logo_image) || null : null;

    // ── Dimensionnement automatique (en mm) pour tenir sur UNE page ────────────
    // LibreOffice ignore table-layout:fixed / max-width : on fixe donc des largeurs
    // et hauteurs explicites (colgroup + width/height sur les images).
    const pageW = cfg.orientation === 'portrait' ? 210 : 297;
    const pageH = cfg.orientation === 'portrait' ? 297 : 210;
    const margin = cfg.margin_mm;
    const contentW = pageW - 2 * margin;
    const contentH = pageH - 2 * margin;
    const nameW = Math.min(45, Math.max(28, contentW * 0.16)); // colonne « Nom et prénom »
    const nCols = cols.length || 1;
    // Largeur d'une colonne = (largeur utile - colonne nom) / nombre de demi-journées.
    const colW = Math.max(7, (contentW - nameW) / nCols);
    const tableW = nameW + colW * nCols;

    // Participants affichés (le stagiaire est toujours là).
    const shown = participants.filter((p) => p.role === 'stagiaire'
        || (p.role === 'formateur' && cfg.show_formateurs)
        || (p.role === 'intervenant' && cfg.show_intervenants));

    // Hauteur de ligne : on répartit la place verticale restante entre les lignes.
    const horairesLines = (cfg.show_horaires && e.program_horaires) ? String(e.program_horaires).split(/\r?\n/).length : 0;
    const noteLines = cfg.header_note ? String(cfg.header_note).split(/\r?\n/).length : 0;
    const lieuLines = (cfg.show_lieu && orgAddr) ? 1 : 0;
    const metaLines = 2 + horairesLines + noteLines + lieuLines; // intitulé + dates + …
    const headerH = 16 + metaLines * 4.7;                 // en-tête (titre, organisme, méta)
    const footerH = (orgSig ? 24 : 12) + 6;               // pied (mention + cachet)
    const theadH = 16;                                    // 2 lignes d'en-tête de tableau
    const infoRowsH = hasSched ? 15 : 0;                  // 2 lignes récap (horaires + volume)
    const availBody = Math.max(18, contentH - headerH - footerH - theadH - infoRowsH - 14); // marge de sécurité anti-débordement
    const nRows = Math.max(1, shown.length);
    const rowH = Math.max(9, Math.min(26, availBody / nRows)); // borne haute/basse raisonnable
    const sigW = Math.max(6, colW - 3);
    const sigH = Math.max(6, rowH - 3);
    const px = (mm) => Math.round(mm * MM);

    const colWpx = px(colW), nameWpx = px(nameW), rowHpx = px(rowH);
    // Cellule signature : image dimensionnée à la case, case vide, ou grisée (non concerné).
    // LibreOffice respecte mieux les attributs HTML (width/height/bgcolor) que le CSS.
    const cell = (dataUrl, applies) => {
        if (!applies) return `<td width="${colWpx}" height="${rowHpx}" bgcolor="#f4f4f6"></td>`;
        const v = decrypt(dataUrl);
        if (v) return `<td width="${colWpx}" height="${rowHpx}"><img src="${v}" width="${px(sigW)}" height="${px(sigH)}" style="object-fit:contain"/></td>`;
        return `<td width="${colWpx}" height="${rowHpx}"></td>`;
    };
    const rowFor = (p) => `<tr>
        <td class="nm" width="${nameWpx}" height="${rowHpx}">${esc(p.name || '')}${p.specialty ? `<div class="sub">${esc(p.specialty)}</div>` : ''}${p.role === 'stagiaire' ? '<div class="sub">Stagiaire</div>' : p.role === 'intervenant' ? '<div class="sub">Intervenant</div>' : ''}</td>
        ${cols.map((c) => { const k = `${c.date}|${c.slot}`; return cell(p.sigOf(k), p.appliesTo(k)); }).join('')}
    </tr>`;

    // Lignes récap (horaires / volume) : plage horaire et durée par demi-journée.
    const infoRow = (label, fn) => `<tr class="info">
        <td class="nm ilabel" width="${nameWpx}">${esc(label)}</td>
        ${cols.map((c) => `<td width="${colWpx}">${esc(fn(c))}</td>`).join('')}
    </tr>`;
    const timeCell = (c) => { const r = rangeFor(c); return r ? `${fmtHM(r[0])} – ${fmtHM(r[1])}` : ''; };
    const volCell = (c) => { const r = rangeFor(c); return r ? fmtDur(r[1] - r[0]) : ''; };

    // Assemblage : ligne « Horaires » au-dessus du stagiaire, ligne « Volume horaire » au-dessus du 1er formateur.
    const bodyParts = [];
    if (hasSched) bodyParts.push(infoRow('Horaires', timeCell));
    let volDone = false;
    for (const p of shown) {
        if (hasSched && !volDone && p.role === 'formateur') { bodyParts.push(infoRow('Volume horaire', volCell)); volDone = true; }
        bodyParts.push(rowFor(p));
    }
    const tbodyHtml = bodyParts.join('');

    const today = frDate(new Date().toISOString().slice(0, 10));
    const pageSize = cfg.orientation === 'portrait' ? '210mm 297mm' : '297mm 210mm';
    const durText = [e.program_days ? `${e.program_days} jour${e.program_days > 1 ? 's' : ''}` : '', e.program_hours ? `${e.program_hours} h` : ''].filter(Boolean).join(' · ');
    const dureeFrag = (cfg.show_duration && durText) ? ` · Durée : ${esc(durText)}` : '';
    const horairesFrag = (cfg.show_horaires && e.program_horaires)
        ? `Horaires : ${esc(e.program_horaires).replace(/\r?\n/g, '<br/>')}<br/>` : '';
    const lieuFrag = (cfg.show_lieu && orgAddr) ? `Lieu : ${esc(orgAddr)}` : '';
    const noteFrag = cfg.header_note ? `${esc(cfg.header_note).replace(/\r?\n/g, '<br/>')}<br/>` : '';
    const footLeft = cfg.footer_left
        ? esc(cfg.footer_left).replace(/\r?\n/g, '<br/>')
        : `Fait à ${esc(org && org.town || '')}, le ${esc(today)}`;

    return `<!doctype html><html><head><meta charset="utf-8"><style>
        @page{size:${pageSize};margin:${margin}mm}
        *{box-sizing:border-box}
        body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:${dens.base}px;color:#1e2140;margin:0}
        h1{font-size:15px;margin:0 0 3px;color:${cfg.accent};letter-spacing:.03em;text-transform:uppercase}
        .head{position:relative;margin-bottom:2px}
        .rule{border:none;border-top:2px solid ${cfg.accent};height:0;margin:5px 0 8px}
        .logo{position:absolute;top:0;right:0;max-height:52px;max-width:180px}
        .org{font-weight:700;font-size:11px}
        .meta{color:#444;font-size:9.5px;line-height:1.5;margin-top:2px}
        .meta b{color:#1e2140}
        table{border-collapse:collapse}
        th,td{text-align:center;vertical-align:middle;font-size:${dens.base}px}
        thead th{background:#f5f3f0;text-transform:uppercase;color:#555;font-size:${dens.head}px}
        td.nm{text-align:left;font-weight:600;font-size:${dens.name}px}
        td.nm .sub{font-weight:400;font-size:${dens.sub}px;color:#8a8f99}
        tr.info td{background:#faf7f2;font-size:${dens.sub}px;color:#555;padding:1px 3px}
        tr.info td.ilabel{font-weight:600;color:#333;text-align:left}
        .foot{margin-top:10px;font-size:10px}
        .foot td{vertical-align:bottom}
        .stamp{text-align:center}
        .stamp img{max-height:56px;max-width:190px;display:block;margin:0 auto 2px}
        .stamp .cap{font-size:9px;color:#555}
    </style></head><body>
        <div class="head">
            ${orgLogo ? `<img class="logo" src="${orgLogo}" width="${px(40)}" height="${px(14)}" style="object-fit:contain" />` : ''}
            <h1>${esc(cfg.title)}</h1>
            <div class="org">${esc(org && org.legal_name || '')}</div>
            <div class="meta">
                Intitulé de l'action de formation : <b>${esc(e.program_title || '')}</b> (${esc(e.program_code || '')})<br/>
                Date(s) : <b>du ${esc(frDate(e.start_date))} au ${esc(frDate(e.end_date))}</b> — Semaine ${esc(e.week)}/${esc(e.year)}${dureeFrag}<br/>
                ${horairesFrag}${noteFrag}${lieuFrag}
            </div>
        </div>
        <hr class="rule" />

        <table border="1" bordercolor="#c9ccd3" cellspacing="0" cellpadding="2" width="${px(tableW)}">
            <thead>
                <tr><th class="nm" rowspan="2" width="${nameWpx}" bgcolor="#f5f3f0" style="text-align:left">Nom et prénom</th>${dates.map((d) => `<th colspan="${daySlots[d].length}" bgcolor="#f5f3f0">${esc(frDay(d))}</th>`).join('')}</tr>
                <tr>${cols.map((c) => `<th width="${colWpx}" bgcolor="#f5f3f0">${SLOT[c.slot] || esc(c.slot)}</th>`).join('')}</tr>
            </thead>
            <tbody>${tbodyHtml}</tbody>
        </table>

        <table cellspacing="0" cellpadding="0" width="${px(tableW)}" class="foot"><tr>
            <td style="text-align:left">${footLeft}</td>
            <td class="stamp" width="${px(Math.min(70, tableW * 0.35))}">
                ${orgSig ? `<img src="${orgSig}" width="${px(44)}" height="${px(16)}" style="object-fit:contain" />` : ''}
                ${cfg.footer_caption ? `<div class="cap">${esc(cfg.footer_caption)}</div>` : ''}
            </td>
        </tr></table>
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
        // Config de mise en page par défaut (colonne 057) — tolérante à l'absence.
        let emargConfig = null;
        try {
            const [[cf]] = await conn.query('SELECT emargement_config FROM organization WHERE id = ?', [orgId]);
            emargConfig = cf ? cf.emargement_config : null;
        } catch (err) { if (!(err && err.code === 'ER_BAD_FIELD_ERROR')) throw err; }
        const [[org]] = await conn.query('SELECT legal_name, address, zip_code, town, signature_image FROM organization WHERE id = ?', [orgId]);
        // Logo d'organisme (colonne 058) — tolérante à l'absence.
        try {
            const [[lg]] = await conn.query('SELECT logo_image FROM organization WHERE id = ?', [orgId]);
            org.logo_image = lg ? lg.logo_image : null;
        } catch (err) { if (!(err && err.code === 'ER_BAD_FIELD_ERROR')) throw err; }
        // Modèles d'émargement rattachés au parcours de cette formation (table 058).
        // Opt-in : seuls les slugs marqués actifs dans program_step comptent.
        let emargTemplates = [];
        try {
            const [tpls] = await conn.query(
                `SELECT et.slug, et.name, et.config
                 FROM emargement_template et
                 JOIN program_step ps ON ps.slug = et.slug AND ps.organization_id = et.organization_id
                 WHERE et.organization_id = ? AND et.active = 1 AND ps.active = 1 AND ps.program_id = ?
                 ORDER BY et.sort_order, et.name`,
                [orgId, e.program_id]
            );
            emargTemplates = tpls || [];
        } catch (err) { if (!(err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE'))) throw err; }
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
        const status = allSignedFlag ? 'SIGNE' : 'ARCHIVE';

        // Upsert d'une feuille dans le coffre documentaire (clé = ref). Renvoie true si écrite.
        const upsert = async (ref, title, config) => {
            let pdf;
            try { pdf = htmlToPdf(renderEmargementHtml({ org, e, rows, participants, config })); }
            catch (err) { console.warn('Émargement PDF non généré :', err.code || err.message); return false; }
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
            return true;
        };

        const sem = `SEM ${e.week || ''}`.trim();
        if (emargTemplates.length) {
            // Une feuille par modèle rattaché au parcours (ref = emarg:<dossier>:<slug>).
            const keep = [];
            for (const t of emargTemplates) {
                const ref = `emarg:${enrollmentId}:${t.slug}`;
                const title = `${t.name || "Feuille d'émargement"} — ${e.program_code || ''} ${sem}`.trim();
                if (await upsert(ref, title, t.config)) keep.push(ref);
            }
            // Nettoyage : retire l'ancienne feuille unique + les modèles retirés (jamais si aucune écriture).
            if (keep.length) {
                await conn.query(
                    `DELETE FROM archive_document WHERE organization_id = ?
                     AND (ref = ? OR ref LIKE ?) AND ref NOT IN (${keep.map(() => '?').join(',')})`,
                    [orgId, `emarg:${enrollmentId}`, `emarg:${enrollmentId}:%`, ...keep]
                );
            }
        } else {
            // Aucun modèle rattaché explicitement au parcours : feuille unique. On applique
            // tout de même la mise en page du 1er modèle actif de l'organisme s'il en existe
            // un (pour que le format défini dans Modèles s'applique sans rattachement), sinon
            // la config par défaut de l'organisme.
            let layout = emargConfig;
            try {
                const [[ft]] = await conn.query(
                    'SELECT config FROM emargement_template WHERE organization_id = ? AND active = 1 ORDER BY sort_order, name LIMIT 1',
                    [orgId]
                );
                if (ft && ft.config) layout = ft.config;
            } catch (err) { if (!(err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE'))) throw err; }
            const title = `Feuille d'émargement — ${e.program_code || ''} ${sem}`.trim();
            const ok = await upsert(`emarg:${enrollmentId}`, title, layout);
            // Retire d'éventuelles feuilles par-modèle devenues obsolètes.
            if (ok) await conn.query('DELETE FROM archive_document WHERE organization_id = ? AND ref LIKE ?', [orgId, `emarg:${enrollmentId}:%`]);
        }
    } catch (err) {
        console.warn('regenEmargement :', err.message);
    }
}

module.exports = { regenEmargement, DEFAULT_EMARG_CONFIG, mergeEmargConfig };
