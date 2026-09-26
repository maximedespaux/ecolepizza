// Génère (et met à jour) la feuille d'émargement PDF d'un dossier stagiaire,
// avec les signatures du stagiaire et du formateur par demi-journée, et l'archive
// dans le coffre documentaire (archive_document, ref = 'emarg:<enrollment_id>').
const crypto = require('crypto');
const { htmlToPdf } = require('./docxpdf.js');
const { decrypt } = require('./crypto.js');
const { plageFr } = require('./plageHoraire.js');
const { aRanger, mesureDisponible } = require('./coffre.js'); // le coffre est chiffré au repos
const { FUSEAU, maintenantA } = require('./fuseau.js');
const { colonneOuNull } = require('./colonnes.js');

const SLOT = { MATIN: 'Matin', APRES_MIDI: 'Après-midi', EXAMEN: 'Examen', DISTANCIEL: 'Distanciel' };
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

/* ── Les demi-journées d'un jour, et la fenêtre où l'on peut les signer ─────────────────────────── */
const MIDI = 12 * 60;
/**
 * LES DEMI-JOURNÉES D'UN JOUR, rangées par l'HEURE DE DÉBUT de leurs plages :
 * { MATIN: [début, fin], APRES_MIDI: [début, fin] } en minutes, `null` sans horaires lisibles.
 *
 * `parseDaySchedules` rend la première plage d'une ligne en `matin` quoi qu'elle dise :
 * « 17h00 - 19h00 » — le cours d'hygiène du soir — s'imprimait sous « Matin », et l'alerte du
 * formateur partait pour une demi-journée qui n'existait pas. Une plage qui commence avant midi est
 * le matin, les autres l'après-midi ; deux plages du même côté de midi n'en font qu'une
 * (« 8h-10h / 10h30-12h »). La feuille imprimée, les relances, la fenêtre de signature et la
 * création des feuilles lisent TOUTES cette fonction : une seconde lecture ferait sonner l'alerte à
 * une heure où le stagiaire ne peut pas encore signer.
 */
function demiJourneesDuJour(horaire) {
    if (!horaire) return null;
    const out = {};
    for (const plage of [horaire.matin, horaire.aprem]) {
        if (!plage) continue;
        const slot = plage[0] < MIDI ? 'MATIN' : 'APRES_MIDI';
        out[slot] = out[slot] ? [Math.min(out[slot][0], plage[0]), Math.max(out[slot][1], plage[1])] : [plage[0], plage[1]];
    }
    return out;
}

/* Début d'une demi-journée quand la formation n'a pas d'horaires lisibles (minutes depuis 0h). */
const OUVERTURE_DEFAUT = { MATIN: 8 * 60 + 30, APRES_MIDI: 13 * 60 + 30 };

/** Minute où la demi-journée commence ce jour-là — `null` si elle n'a pas lieu. */
function ouverture(slot, horaire) {
    const d = demiJourneesDuJour(horaire);
    if (!d) return OUVERTURE_DEFAUT[slot] ?? null;
    return d[slot] ? d[slot][0] : null;
}

/** Les horaires du jour `date`. « Jour N » est le RANG de la date parmi les jours de la session qui
    ont une feuille — le calcul de la feuille imprimée comme des relances. */
function horaireDuJour(horaires, jours, date) {
    const i = jours.indexOf(date);
    return i < 0 ? null : parseDaySchedules(horaires, jours.length)[i + 1] || null;
}

/**
 * Le calendrier d'une session : les horaires de sa formation (colonne 056, lue si elle existe) et
 * ses jours qui ont une feuille — ce qu'il faut pour savoir quand une demi-journée s'ouvre.
 */
async function calendrierSession(conn, sessionId) {
    const h = await colonneOuNull(conn, 'training_program', 'horaires', 'p.');
    const [[p]] = await conn.query(
        `SELECT ${h} FROM training_session ts LEFT JOIN training_program p ON p.id = ts.program_id WHERE ts.id = ?`, [sessionId]);
    const [js] = await conn.query(
        `SELECT DISTINCT DATE_FORMAT(date, '%Y-%m-%d') AS date FROM attendance_sheet WHERE session_id = ? ORDER BY date`, [sessionId]);
    return { horaires: (p && p.horaires) || null, jours: js.map((x) => x.date) };
}

/**
 * LA FENÊTRE DE SIGNATURE DU STAGIAIRE — décidée par l'école le 2026-09-26 : une demi-journée se
 * signe PENDANT qu'elle a lieu, de son heure de début (les horaires de la formation ; 8h30 et 13h30
 * à défaut) jusqu'à minuit le même jour.
 *
 * CE QUI SE PASSAIT. Seules les dates FUTURES étaient refusées. Relevé sur les deux sessions du
 * 14/09 : les stagiaires signaient à leur arrivée, entre 8h35 et 9h57, le matin ET l'après-midi
 * du jour — sept après-midi signés avant d'avoir eu lieu —, et quinze signatures sur cinquante
 * portaient sur la veille. La feuille imprimée n'en disait rien : une signature par case, datée
 * nulle part. Une feuille d'émargement ne prouve la présence que si elle est signée pendant la
 * demi-journée ; c'est ce qu'un contrôle vérifie.
 *
 * UNE DEMI-JOURNÉE MANQUÉE ne se signe plus après coup par le stagiaire : l'école la RATTRAPE,
 * avec un motif imprimé sur la feuille (attendance.controller, `rattraperPresence`).
 *
 * → { etat: 'a_venir' | 'pas_encore' | 'ouverte' | 'close', ouvreA: minutes | null }
 */
function fenetreSignature({ date, slot, horaire = null, instant = new Date(), zone = FUSEAU }) {
    const { jour, minutes } = maintenantA(zone, instant);
    if (date > jour) return { etat: 'a_venir', ouvreA: null };
    if (date < jour) return { etat: 'close', ouvreA: null };
    const debut = ouverture(slot, horaire);
    /* Une demi-journée que les horaires ne connaissent pas (une feuille créée avant qu'ils ne
       décident des demi-journées, un examen) s'ouvre toute la journée : on ne bloque pas ce qu'on
       ne sait pas dater. */
    if (debut == null) return { etat: 'ouverte', ouvreA: null };
    return minutes < debut ? { etat: 'pas_encore', ouvreA: debut } : { etat: 'ouverte', ouvreA: debut };
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
    show_organization: false,        // ligne « organisme de formation » (signature de l'organisme dans la grille)
    show_hours: true,                // lignes récap : horaires (au-dessus stagiaire) + volume (au-dessus formateur)
    density: 'normal',               // 'compact' | 'normal' | 'large' (police)
    margin_mm: 10,                   // marge de page
    footer_left: '',                 // '' -> « Fait à {ville}, le {date} »
    footer_caption: "Signature et cachet de l'organisme de formation",
    show_stamp: true,
    // Colonnes personnalisées ajoutées par l'organisme : { label, text, side, width_mm }.
    // text = contenu fixe répété sur chaque ligne (vide = case à remplir). side = 'before'|'after' la grille.
    extra_columns: [],
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
    for (const k of ['show_logo', 'show_duration', 'show_horaires', 'show_lieu', 'show_formateurs', 'show_intervenants', 'show_organization', 'show_hours', 'show_stamp']) c[k] = !!c[k];
    // Colonnes personnalisées : jusqu'à 6, label/texte bornés, largeur optionnelle.
    c.extra_columns = Array.isArray(c.extra_columns) ? c.extra_columns.slice(0, 6).map((x) => ({
        label: String((x && x.label) || '').slice(0, 40),
        text: String((x && x.text) || '').slice(0, 80),
        side: x && x.side === 'after' ? 'after' : 'before',
        width_mm: Number.isFinite(parseInt(x && x.width_mm, 10)) ? Math.min(60, Math.max(12, parseInt(x.width_mm, 10))) : 24,
    })).filter((x) => x.label || x.text) : [];
    return c;
}

// 1 mm ≈ 3.7795 px (96 dpi) — pour les attributs width/height des images.
const MM = 3.7795;

/**
 * LES INTERVENANTS D'UNE SESSION, avec leurs demi-journées ET leurs heures (migration 181).
 *
 * UNE SEULE DÉFINITION POUR LES DEUX CHEMINS. La même requête vivait en double — la feuille
 * archivée et son aperçu —, et ajouter les heures à l'une seulement aurait donné un aperçu qui
 * ne ressemble pas au PDF : le défaut le plus coûteux de cet écran, puisqu'on ne le voit qu'une
 * fois le document signé.
 *
 * CASCADE SUR ER_BAD_FIELD_ERROR : sans la 181, on relit sans les heures et la feuille sort
 * exactement comme avant.
 */
async function chargerIntervenants(conn, sessionId) {
    const base = `SELECT si.user_id, si.specialty, u.first_name, u.last_name,
                         DATE_FORMAT(sis.date, '%Y-%m-%d') AS date, sis.slot`;
    const suite = ` FROM session_intervenant si
             JOIN session_intervenant_slot sis ON sis.session_intervenant_id = si.id
             LEFT JOIN user u ON u.id = si.user_id
             WHERE si.session_id = ?`;
    let lignes;
    try {
        [lignes] = await conn.query(`${base}, sis.heure_debut AS hd, sis.heure_fin AS hf${suite}`, [sessionId]);
    } catch (err) {
        if (err && err.code !== 'ER_BAD_FIELD_ERROR') throw err;
        [lignes] = await conn.query(base + suite, [sessionId]);
    }
    const parUtilisateur = {};
    for (const a of lignes) {
        const iv = parUtilisateur[a.user_id] || (parUtilisateur[a.user_id] = {
            user_id: a.user_id, name: `${a.last_name || ''} ${a.first_name || ''}`.trim(),
            specialty: a.specialty, assigned: new Set(), heures: {},
        });
        const cle = `${a.date}|${a.slot}`;
        iv.assigned.add(cle);
        const plage = plageFr(a.hd, a.hf);
        if (plage) iv.heures[cle] = plage;
    }
    return parUtilisateur;
}

/** Les intervenants en ligne de feuille : ils ne signent QUE les demi-journées qu'ils assurent. */
const lignesIntervenants = (parUtilisateur, ivSig) => Object.values(parUtilisateur).map((iv) => ({
    role: 'intervenant', name: iv.name, specialty: iv.specialty,
    sigOf: (k) => ivSig[`${iv.user_id}|${k}`] || null,
    appliesTo: (k) => iv.assigned.has(k),
    heuresDe: (k) => iv.heures[k] || '',
}));

/**
 * La feuille, en HTML pour LibreOffice. En plus des lignes et des participants :
 *   · `lieu` : le LIEU DE LA SESSION (training_location) — la feuille imprimait l'adresse de
 *     l'organisme, alors que chaque session a son lieu, celui que la convention et le contrat
 *     impriment ; à défaut, l'adresse de l'organisme ;
 *   · `entreprise` : l'employeur, pour un stagiaire arrivé par une entreprise (OPCO) ;
 *   · `dateFeuille` : la date du « Fait à …, le … » — la dernière signature portée sur la feuille.
 *     C'était la date du JOUR DU RENDU : une feuille régénérée en novembre se datait de novembre ;
 *   · `aujourdHui` : le jour de l'organisme — une case vide d'un jour CLOS s'imprime « Non signé »,
 *     elle ne reste plus une case blanche qu'on pourrait remplir après coup.
 */
function renderEmargementHtml({ org, e, rows, participants = [], config, lieu = null, entreprise = null, dateFeuille = null, aujourdHui = null }) {
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

    /* Horaires détaillés par jour (récap), extraits du champ « Horaires » de la formation. « Jour N »
       est le rang de la date parmi TOUS les jours qui ont une feuille — la règle des relances et de
       la fenêtre de signature —, et la plage se range par son heure de début (demiJourneesDuJour) :
       « 17h00 - 19h00 » s'imprime sous « Après-midi ». */
    const joursFeuille = [...new Set(rows.map((r) => r.date))].sort();
    const horairesJours = parseDaySchedules(e.program_horaires, joursFeuille.length);
    const plageDe = (c) => { const d = demiJourneesDuJour(horairesJours[joursFeuille.indexOf(c.date) + 1]); return d ? d[c.slot] || null : null; };
    const rangeFor = (c) => (cfg.show_hours ? plageDe(c) : null);
    const hasSched = cfg.show_hours && cols.some((c) => rangeFor(c));

    /* LE TOTAL : les heures émargées par le stagiaire — le chiffre que demandent le certificat de
       réalisation et le financeur. En heures quand chaque demi-journée a sa plage ; sinon en
       demi-journées (« 9/10 »). Une présence RATTRAPÉE par l'école compte : elle est attestée. */
    const durees = cols.map((c) => { const r = plageDe(c); return r ? r[1] - r[0] : null; });
    const dureesConnues = cols.length > 0 && durees.every((x) => x != null);
    const totalPrevu = dureesConnues ? durees.reduce((a, b) => a + b, 0) : null;
    const totalDe = (p) => {
        if (p.role !== 'stagiaire' || !p.presentDe) return '';
        const presents = cols.map((c, i) => (p.presentDe(`${c.date}|${c.slot}`) ? i : -1)).filter((i) => i >= 0);
        return dureesConnues ? (fmtDur(presents.reduce((t, i) => t + durees[i], 0)) || '0h00') : `${presents.length}/${cols.length}`;
    };
    const close = (c) => !!aujourdHui && c.date < aujourdHui;

    const orgAddr = [org && org.address, [org && org.zip_code, org && org.town].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const lieuTexte = lieu || orgAddr;
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
    const totalW = 16;                                          // colonne « Total »
    const nCols = cols.length || 1;
    // Colonnes personnalisées (avant / après la grille) : on réserve leur largeur.
    const extraCols = cfg.extra_columns || [];
    const beforeEx = extraCols.filter((x) => x.side === 'before');
    const afterEx = extraCols.filter((x) => x.side === 'after');
    const extraW = extraCols.reduce((s, x) => s + (x.width_mm || 24), 0);
    // Largeur d'une colonne de signature = (largeur utile - nom - colonnes perso) / nb demi-journées.
    const colW = Math.max(7, (contentW - nameW - extraW - totalW) / nCols);
    const tableW = nameW + extraW + colW * nCols + totalW;

    // Participants affichés (le stagiaire est toujours là).
    const shown = participants.filter((p) => p.role === 'stagiaire'
        || (p.role === 'formateur' && cfg.show_formateurs)
        || (p.role === 'intervenant' && cfg.show_intervenants));
    // Ligne « organisme de formation » : signature de l'organisme (image enregistrée) sur chaque demi-journée.
    if (cfg.show_organization) {
        shown.push({ role: 'organisme', name: (org && org.legal_name) || 'Organisme de formation', sigOf: () => (org && org.signature_image) || null, appliesTo: () => true });
    }

    // Hauteur de ligne : on répartit la place verticale restante entre les lignes.
    /* LES HORAIRES EN TOUTES LETTRES NE S'IMPRIMENT QUE SI LA GRILLE NE LES MONTRE PAS : le texte
       libre de la formation (« Jour 1 : 8h45 - 12h00 / … », puis « 8h00 - 12h00 / 13h00 - 16h30 »
       sans dire pour quels jours) répétait, moins lisiblement, la ligne « Horaires » du tableau. */
    const horairesTexte = cfg.show_horaires && e.program_horaires && !hasSched;
    const horairesLines = horairesTexte ? String(e.program_horaires).split(/\r?\n/).length : 0;
    const noteLines = cfg.header_note ? String(cfg.header_note).split(/\r?\n/).length : 0;
    const lieuLines = (cfg.show_lieu && lieuTexte) ? 1 : 0;
    const entrepriseLines = entreprise ? 1 : 0;
    const metaLines = 2 + horairesLines + noteLines + lieuLines + entrepriseLines; // intitulé + dates + …
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
    /* LES HEURES AU-DESSUS DE LA SIGNATURE (migration 181). Un intervenant externe ne suit pas
       les horaires des stagiaires — l'expert hygiène passe de 10 h à 12 h 30 —, si bien que la
       ligne « Horaires » du haut ne parle pas de lui. Sa case portait donc une signature muette :
       on savait QU'il était là, jamais QUAND. La plage se glisse au-dessus de l'image, et non
       à côté : la colonne fait 12 à 20 mm, deux informations côte à côte n'y tiendraient pas.
       Sans heures (cas de toutes les demi-journées d'avant la 181), rien ne s'ajoute. */
    /* LE MOTIF D'UN RATTRAPAGE sous la signature (ou seul, quand l'école atteste la présence sans
       signature) : une demi-journée enregistrée après coup le DIT sur la feuille — c'est la
       condition que l'école a posée en fermant la signature tardive au stagiaire.
       « NON SIGNÉ » dans une case vide d'un jour clos : blanche, elle se remplissait au stylo. */
    const cell = (dataUrl, applies, heures, etat = {}) => {
        if (!applies) return `<td width="${colWpx}" height="${rowHpx}" bgcolor="#f4f4f6"></td>`;
        const h = heures ? `<div class="hr">${esc(heures)}</div>` : '';
        const note = etat.note ? `<div class="nt">${esc(etat.note)}</div>` : '';
        const v = decrypt(dataUrl);
        /* L'IMAGE PERD LA HAUTEUR DE LA LIGNE D'HEURES, sinon la case grandit et la feuille ne
           tient plus sur une page — LibreOffice n'honore aucune hauteur de tableau (CLAUDE.md § 3),
           c'est le CONTENU qui la fait. */
        const imgH = heures ? Math.max(4, sigH - dens.sub * 0.4) : sigH;
        const imgHNote = etat.note ? Math.max(4, imgH - dens.sub * 0.8) : imgH; // …et celle du motif
        if (v) return `<td width="${colWpx}" height="${rowHpx}">${h}<img src="${v}" width="${px(sigW)}" height="${px(imgHNote)}" style="object-fit:contain"/>${note}</td>`;
        if (note) return `<td width="${colWpx}" height="${rowHpx}">${h}${note}</td>`;
        if (etat.close) return `<td width="${colWpx}" height="${rowHpx}">${h}<div class="ns">Non signé</div></td>`;
        return `<td width="${colWpx}" height="${rowHpx}">${h}</td>`;
    };
    // Cellules des colonnes personnalisées : texte fixe répété, ou case vide à remplir.
    const exFilled = (arr) => arr.map((x) => `<td width="${px(x.width_mm)}" height="${rowHpx}">${esc(x.text || '')}</td>`).join('');
    const exEmpty = (arr) => arr.map((x) => `<td width="${px(x.width_mm)}"></td>`).join('');
    /* `align="left"` ET NON le CSS : LibreOffice ignore `text-align` sur une cellule (CLAUDE.md § 3,
       même famille que `width` et `valign`) — les noms sortaient centrés sous « Nom et prénom »,
       aligné à gauche. Le formateur porte désormais son rôle, comme les autres lignes. */
    const roleSub = (r) => r === 'stagiaire' ? 'Stagiaire' : r === 'formateur' ? 'Formateur' : r === 'intervenant' ? 'Intervenant' : r === 'organisme' ? 'Organisme de formation' : '';
    const totWpx = px(totalW);
    const rowFor = (p) => `<tr>
        <td class="nm" align="left" width="${nameWpx}" height="${rowHpx}">${esc(p.name || '')}${p.specialty ? `<div class="sub">${esc(p.specialty)}</div>` : ''}${roleSub(p.role) ? `<div class="sub">${roleSub(p.role)}</div>` : ''}</td>
        ${exFilled(beforeEx)}${cols.map((c) => { const k = `${c.date}|${c.slot}`; return cell(p.sigOf(k), p.appliesTo(k), p.heuresDe ? p.heuresDe(k) : '', { note: p.noteDe ? p.noteDe(k) : '', close: close(c) }); }).join('')}${exFilled(afterEx)}
        <td class="tot" width="${totWpx}">${esc(totalDe(p))}</td>
    </tr>`;

    // Lignes récap (horaires / volume) : plage horaire et durée par demi-journée.
    const infoRow = (label, fn, total = '') => `<tr class="info">
        <td class="nm ilabel" align="left" width="${nameWpx}">${esc(label)}</td>
        ${exEmpty(beforeEx)}${cols.map((c) => `<td width="${colWpx}">${esc(fn(c))}</td>`).join('')}${exEmpty(afterEx)}
        <td width="${totWpx}">${esc(total)}</td>
    </tr>`;
    const timeCell = (c) => { const r = rangeFor(c); return r ? `${fmtHM(r[0])} - ${fmtHM(r[1])}` : ''; };
    const volCell = (c) => { const r = rangeFor(c); return r ? fmtDur(r[1] - r[0]) : ''; };

    // Assemblage : ligne « Horaires » au-dessus du stagiaire, ligne « Volume horaire » au-dessus du 1er formateur.
    const bodyParts = [];
    if (hasSched) bodyParts.push(infoRow('Horaires', timeCell));
    let volDone = false;
    for (const p of shown) {
        if (hasSched && !volDone && p.role === 'formateur') { bodyParts.push(infoRow('Volume horaire', volCell, totalPrevu != null ? fmtDur(totalPrevu) : '')); volDone = true; }
        bodyParts.push(rowFor(p));
    }
    const tbodyHtml = bodyParts.join('');

    const today = frDate(new Date().toISOString().slice(0, 10));
    const pageSize = cfg.orientation === 'portrait' ? '210mm 297mm' : '297mm 210mm';
    const durText = [e.program_days ? `${e.program_days} jour${e.program_days > 1 ? 's' : ''}` : '', e.program_hours ? `${e.program_hours} h` : ''].filter(Boolean).join(' · ');
    const dureeFrag = (cfg.show_duration && durText) ? ` · Durée : ${esc(durText)}` : '';
    const horairesFrag = horairesTexte
        ? `Horaires : ${esc(e.program_horaires).replace(/\r?\n/g, '<br/>')}<br/>` : '';
    const lieuFrag = (cfg.show_lieu && lieuTexte) ? `Lieu : ${esc(lieuTexte)}` : '';
    const entrepriseFrag = entreprise ? `${lieuFrag ? '<br/>' : ''}Entreprise : <b>${esc(entreprise)}</b>` : '';
    const noteFrag = cfg.header_note ? `${esc(cfg.header_note).replace(/\r?\n/g, '<br/>')}<br/>` : '';
    const footLeft = cfg.footer_left
        ? esc(cfg.footer_left).replace(/\r?\n/g, '<br/>')
        : `Fait à ${esc(org && org.town || '')}, le ${esc(dateFeuille ? frDate(dateFeuille) : today)}`;

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
        td .hr{font-size:${dens.sub}px;color:#555;line-height:1.1;white-space:nowrap}
        td .nt{font-size:${Math.max(6.5, dens.sub - 1.5)}px;color:#555;line-height:1.05}
        td .ns{font-size:${dens.sub}px;color:#8a8f99;font-style:italic}
        td.tot{font-weight:600}
        .nda{font-weight:400;color:#555}
        .foot{margin-top:10px;font-size:10px}
        .foot td{vertical-align:bottom}
        .stamp{text-align:center}
        .stamp img{max-height:56px;max-width:190px;display:block;margin:0 auto 2px}
        .stamp .cap{font-size:9px;color:#555}
    </style></head><body>
        <div class="head">
            ${orgLogo ? `<img class="logo" src="${orgLogo}" width="${px(40)}" height="${px(14)}" style="object-fit:contain" />` : ''}
            <h1>${esc(cfg.title)}</h1>
            <div class="org">${esc(org && org.legal_name || '')}${org && org.nda ? ` <span class="nda">· Déclaration d'activité n° ${esc(org.nda)}</span>` : ''}</div>
            <div class="meta">
                Intitulé de l'action de formation : <b>${esc(e.program_title || '')}</b> (${esc(e.program_code || '')})<br/>
                Date(s) : <b>du ${esc(frDate(e.start_date))} au ${esc(frDate(e.end_date))}</b> — Semaine ${esc(e.week)}/${esc(e.year)}${dureeFrag}<br/>
                ${horairesFrag}${noteFrag}${lieuFrag}${entrepriseFrag}
            </div>
        </div>
        <hr class="rule" />

        <table border="1" bordercolor="#c9ccd3" cellspacing="0" cellpadding="2" width="${px(tableW)}">
            <thead>
                <tr><th class="nm" rowspan="2" width="${nameWpx}" bgcolor="#f5f3f0" style="text-align:left">Nom et prénom</th>${beforeEx.map((x) => `<th rowspan="2" width="${px(x.width_mm)}" bgcolor="#f5f3f0">${esc(x.label)}</th>`).join('')}${dates.map((d) => `<th colspan="${daySlots[d].length}" bgcolor="#f5f3f0">${esc(frDay(d))}</th>`).join('')}${afterEx.map((x) => `<th rowspan="2" width="${px(x.width_mm)}" bgcolor="#f5f3f0">${esc(x.label)}</th>`).join('')}<th rowspan="2" width="${totWpx}" bgcolor="#f5f3f0">Total</th></tr>
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
 * TOUT CE QU'IMPRIME LA FEUILLE D'UN DOSSIER, lu en un seul endroit.
 *
 * La feuille archivée (`regenEmargement`) et le document signé électroniquement
 * (`buildEmargementDocHtml`) relisaient chacun, en double, le dossier, l'organisme, les
 * demi-journées et les signatures : ajouter une information à l'une seulement aurait donné un
 * document signé qui ne ressemble pas à la feuille du coffre — le défaut le plus coûteux ici,
 * puisqu'il ne se voit qu'une fois la signature posée. Même raison que `chargerIntervenants`.
 *
 * Chaque colonne récente est lue en CASCADE (`ER_BAD_FIELD_ERROR` / `ER_NO_SUCH_TABLE` → on relit
 * sans) : horaires (056), logo (058), lieu de la session (067), rattrapage (184).
 * Rend `null` sans dossier ou sans demi-journée.
 */
async function chargerFeuille(conn, orgId, enrollmentId, { instant = new Date(), zone = FUSEAU } = {}) {
    const absente = (err) => err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE');
    const [[e]] = await conn.query(
        `SELECT e.id, e.learner_id, e.session_id, e.company_id, l.first_name, l.last_name,
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
    if (!e) return null;
    // Horaires détaillés (colonne ajoutée par 056) — lecture tolérante à l'absence.
    try {
        const [[h]] = await conn.query('SELECT horaires FROM training_program WHERE id = ?', [e.program_id]);
        e.program_horaires = h ? h.horaires : null;
    } catch (err) { if (!(err && err.code === 'ER_BAD_FIELD_ERROR')) throw err; }
    const [[org]] = await conn.query('SELECT legal_name, nda, address, zip_code, town, signature_image FROM organization WHERE id = ?', [orgId]);
    // Logo d'organisme (colonne 058) — tolérante à l'absence.
    try {
        const [[lg]] = await conn.query('SELECT logo_image FROM organization WHERE id = ?', [orgId]);
        org.logo_image = lg ? lg.logo_image : null;
    } catch (err) { if (!(err && err.code === 'ER_BAD_FIELD_ERROR')) throw err; }
    /* LE LIEU DE LA SESSION (067), celui qu'impriment la convention et le contrat. Sans lieu posé,
       la feuille garde l'adresse de l'organisme. */
    let lieu = null;
    try {
        const [[tl]] = await conn.query(
            `SELECT tl.name, tl.address, tl.zip_code, tl.town FROM training_session s
             JOIN training_location tl ON tl.id = s.location_id WHERE s.id = ?`, [e.session_id]);
        if (tl) lieu = [tl.name, tl.address, [tl.zip_code, tl.town].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;
    } catch (err) { if (!absente(err)) throw err; }
    /* L'EMPLOYEUR d'un stagiaire arrivé par une entreprise : un financeur (OPCO) rapproche la
       feuille de SON salarié. */
    let entreprise = null;
    if (e.company_id) {
        const [[co]] = await conn.query('SELECT name FROM company WHERE id = ? AND organization_id = ?', [e.company_id, orgId]);
        entreprise = co ? co.name : null;
    }
    /* Les demi-journées ET ce que le stagiaire y a fait. Le rattrapage (184) : motif et auteur,
       imprimés dans la case. */
    const lignes = `SELECT s.id AS sheet_id, DATE_FORMAT(s.date, '%Y-%m-%d') AS date, s.slot,
                    ar.signer_name, ar.signature_data, DATE_FORMAT(ar.signed_at, '%Y-%m-%d') AS signed_on`;
    const suite = ` FROM attendance_sheet s
             LEFT JOIN attendance_record ar ON ar.sheet_id = s.id AND ar.learner_id = ?
             WHERE s.session_id = ?
             ORDER BY s.date, FIELD(s.slot, 'MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL')`;
    let rows;
    try {
        [rows] = await conn.query(`${lignes}, ar.rattrapage_motif, ar.rattrapage_par${suite}`, [e.learner_id, e.session_id]);
    } catch (err) {
        if (!absente(err)) throw err;
        [rows] = await conn.query(lignes + suite, [e.learner_id, e.session_id]);
    }
    if (!rows.length) return null;
    // Signatures formateur par feuille (plusieurs formateurs possibles).
    // Formateurs ET intervenants signent via attendance_trainer_sign : on les
    // sépare selon le rôle du compte, et on récupère la spécialité de l'intervenant.
    const [tsigns] = await conn.query(
        `SELECT ats.sheet_id, ats.user_id, ats.signer_name, ats.signature_data, u.role AS user_role, si.specialty,
                DATE_FORMAT(ats.signed_at, '%Y-%m-%d') AS signed_on
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
    const rattrapage = {};
    for (const r of rows) {
        const k = `${r.date}|${r.slot}`;
        if (r.signature_data) learnerSig[k] = r.signature_data;
        if (r.rattrapage_motif) rattrapage[k] = `Rattrapage : ${r.rattrapage_motif}${r.rattrapage_par ? ` (${r.rattrapage_par})` : ''}`;
    }
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
    // Intervenants affectés (avec leurs demi-journées et leurs heures).
    const ivByUser = await chargerIntervenants(conn, e.session_id);

    // Colonnes de la grille : demi-journées existantes (date|slot).
    const sheetKeys = new Set(rows.map((r) => `${r.date}|${r.slot}`));
    const learnerName = `${e.last_name || ''} ${e.first_name || ''}`.trim();
    // Participants (lignes) : stagiaire, formateurs, intervenants. sigOf(key) -> data|null ;
    // appliesTo(key) -> présent cette demi-journée ?
    const participants = [
        {
            role: 'stagiaire', name: learnerName, sigOf: (k) => learnerSig[k] || null, appliesTo: (k) => sheetKeys.has(k),
            noteDe: (k) => rattrapage[k] || '', presentDe: (k) => !!(learnerSig[k] || rattrapage[k]),
        },
        ...formateurs.map((f) => ({
            role: 'formateur', name: `${f.last_name || ''} ${f.first_name || ''}`.trim(),
            sigOf: (k) => trSig[`${f.id}|${k}`] || null, appliesTo: (k) => sheetKeys.has(k),
        })),
        ...lignesIntervenants(ivByUser, ivSig),
    ];
    /* La date du « Fait à …, le … » : la dernière signature portée sur la feuille, à défaut la fin
       de la session. */
    const signeLe = [...rows.map((r) => (r.signature_data || r.rattrapage_motif ? r.signed_on : null)), ...tsigns.map((t) => t.signed_on)].filter(Boolean).sort();
    const dateFeuille = signeLe.length ? signeLe[signeLe.length - 1] : e.end_date || null;
    const { jour: aujourdHui } = maintenantA(zone, instant);
    return { e, org, rows, participants, learnerName, lieu, entreprise, dateFeuille, aujourdHui };
}

/**
 * (Re)génère la feuille d'émargement d'un dossier et l'archive. Non bloquant :
 * en cas d'échec (LibreOffice absent, etc.) on journalise et on n'écrit rien.
 * `conn` = db.promise().
 */
async function regenEmargement(conn, orgId, enrollmentId) {
    try {
        const f = await chargerFeuille(conn, orgId, enrollmentId);
        if (!f) return;
        const { e, rows, learnerName } = f;
        // Config de mise en page par défaut (colonne 057) — tolérante à l'absence.
        let emargConfig = null;
        try {
            const [[cf]] = await conn.query('SELECT emargement_config FROM organization WHERE id = ?', [orgId]);
            emargConfig = cf ? cf.emargement_config : null;
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
        /* SIGNÉE quand chaque demi-journée porte la présence du stagiaire : sa signature, ou le
           rattrapage que l'école a enregistré. */
        const allSignedFlag = rows.every((r) => r.signature_data || r.rattrapage_motif);
        const status = allSignedFlag ? 'SIGNE' : 'ARCHIVE';

        /* Sondé UNE fois : `colonneExiste` n'a volontairement aucun cache (cf. lib/colonnes.js),
           et un dossier peut produire une feuille par modèle d'émargement. */
        const mesure = await mesureDisponible(conn);
        // Upsert d'une feuille dans le coffre documentaire (clé = ref). Renvoie true si écrite.
        const upsert = async (ref, title, config) => {
            let pdf;
            try { pdf = htmlToPdf(renderEmargementHtml({ ...f, config })); }
            catch (err) { console.warn('Émargement PDF non généré :', err.code || err.message); return false; }
            /* LA FEUILLE D'ÉMARGEMENT PART CHIFFRÉE, comme tout ce qui entre au coffre. Elle
               porte les signatures manuscrites de la promotion entière : c'est la pièce la plus
               nominative que l'application produise d'elle-même, et la seule qui s'y range sans
               que personne ne l'ait demandé. Les colonnes de mesure datent de la 153 — avant,
               on écrit sans, et le chiffrement, lui, s'applique quand même. */
            const range = aRanger(pdf);
            const [[ex]] = await conn.query('SELECT id FROM archive_document WHERE organization_id = ? AND ref = ?', [orgId, ref]);
            if (ex) {
                await conn.query(
                    `UPDATE archive_document SET year=?, week=?, formation_label=?, learner_name=?, title=?, status=?, mime=?, file=?${mesure ? ', empreinte=?, octets=?' : ''} WHERE id=?`,
                    [e.year, e.week, e.program_code || null, learnerName, title.slice(0, 255), status, 'application/pdf', range.file,
                        ...(mesure ? [range.empreinte, range.octets] : []), ex.id]
                );
            } else {
                await conn.query(
                    `INSERT INTO archive_document (id, organization_id, ref, year, week, formation_label, learner_name, title, status, mime, file${mesure ? ', empreinte, octets' : ''})
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${mesure ? ', ?, ?' : ''})`,
                    [crypto.randomUUID(), orgId, ref, e.year, e.week, e.program_code || null, learnerName, title.slice(0, 255), status, 'application/pdf', range.file,
                        ...(mesure ? [range.empreinte, range.octets] : [])]
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

/**
 * Construit le HTML de la feuille d'émargement d'un dossier POUR LE FLUX DOCUMENT
 * (préparer/envoyer/signer électroniquement). = grille visuelle habituelle + un bloc
 * de signatures ÉLECTRONIQUES (stagiaire + organisme) ajouté en pied.
 * Renvoie le HTML, ou null si aucune feuille d'assiduité n'existe encore.
 * opts = { config }.
 */
async function buildEmargementDocHtml(conn, orgId, enrollmentId, opts = {}) {
    const f = await chargerFeuille(conn, orgId, enrollmentId);
    if (!f) return null;
    // La feuille = la grille (signatures visuelles par demi-journée). La signature
    // électronique du stagiaire est portée par l'empreinte + le scellement PAdès du
    // PDF (pas de bloc de signature redondant en pied).
    return renderEmargementHtml({ ...f, config: opts.config });
}

/**
 * LA VEILLE SE CLÔT APRÈS MINUIT. Une case vide ne s'imprime « Non signé » qu'une fois son jour
 * clos, et la feuille archivée ne se refait qu'à chaque signature : la dernière de la veille
 * tombait AVANT minuit, et le coffre gardait des cases blanches jusqu'à la signature suivante —
 * pour le dernier jour d'une session, jusqu'à jamais. Chaque dossier qui avait une demi-journée
 * la veille est donc régénéré une fois, au premier passage de la journée (server.js).
 * Une fois par veille et par processus : un redémarrage refait au plus ces quelques feuilles.
 */
const veillesCloses = new Set();
async function cloreLaVeille({ conn, instant = new Date(), zone = FUSEAU, regenerer = regenEmargement } = {}) {
    const { jour } = maintenantA(zone, instant);
    const d = new Date(`${jour}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const veille = d.toISOString().slice(0, 10);
    if (veillesCloses.has(veille)) return 0;
    const [dossiers] = await conn.query(
        `SELECT DISTINCT e.id, e.organization_id FROM attendance_sheet s
           JOIN enrollment e ON e.session_id = s.session_id
          WHERE s.date = ?`, [veille]);
    for (const x of dossiers) await regenerer(conn, x.organization_id, x.id);
    veillesCloses.add(veille);
    return dossiers.length;
}

module.exports = {
    regenEmargement, buildEmargementDocHtml, DEFAULT_EMARG_CONFIG, mergeEmargConfig,
    chargerFeuille, renderEmargementHtml, cloreLaVeille,
    // Les demi-journées et la fenêtre de signature : UNE règle pour la feuille, les relances,
    // la signature du stagiaire et la création des feuilles.
    demiJourneesDuJour, ouverture, OUVERTURE_DEFAUT, horaireDuJour, fenetreSignature, calendrierSession,
    /* `parseDaySchedules` et `fmtHM` sortent d'ici pour le jeton {HorairesJours} (lib/tokens.js).
       Ils NE SONT PAS recopiés là-bas : ce parseur connaît les formes réelles écrites par
       l'organisme — « Jour 5 : 9h-12h », « Jours 1 à 4 », une ligne unique valant pour tous —
       et une seconde lecture finirait par diverger de la feuille d'émargement. Le document et
       la feuille doivent annoncer les MÊMES horaires, sinon lequel croire ? */
    parseDaySchedules, fmtHM,
};
