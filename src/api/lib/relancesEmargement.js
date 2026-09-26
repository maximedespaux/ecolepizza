/**
 * RELANCES D'ÉMARGEMENT — « Émargement à signer », LE JOUR MÊME, à chaque demi-journée.
 *
 * CE QUI SE PASSAIT. L'alerte partait au moment où l'on AJOUTAIT un formateur à une session
 * (`setSessionTrainers`), quelle que soit la date de la session. Relevé en production le
 * 2026-09-17 : une alerte « signez votre feuille » créée ce jour-là pour NIV2 S43 (octobre), une
 * autre deux jours plus tôt pour RS7404 S45 (novembre) — et RIEN le matin ni l'après-midi du
 * 17/09, alors que deux sessions S38 tournaient et que les feuilles de l'après-midi attendaient
 * la signature du formateur. L'alerte arrivait quand il n'y avait rien à signer, et manquait
 * quand il y avait tout à signer. L'école : « ce matin j'aurais dû avoir une alerte, et cet
 * après-midi aussi ».
 *
 * CE QUI SE PASSE. Le serveur passe toutes les cinq minutes (server.js). Pour chaque feuille du
 * JOUR (matin, après-midi) dont la demi-journée a COMMENCÉ, chaque formateur affecté qui ne l'a
 * pas encore signée reçoit une alerte — une seule par formateur et par feuille, et elle se
 * marque lue d'elle-même quand il signe (attendance.controller).
 *
 * L'HEURE DE DÉBUT vient des « Horaires » de la formation, lus par le MÊME analyseur que la
 * feuille imprimée (`parseDaySchedules`) : « Jour 1 : 8h45 - 12h00 / 13h00 - 17h15 » fait partir
 * l'alerte du matin à 8h45 le premier jour. Un jour sans après-midi dans les horaires n'a pas
 * d'alerte d'après-midi. Sans horaires lisibles, on part de 8h30 et 13h30.
 *
 * DANS L'APPLICATION SEULEMENT, sans le double par e-mail que `notify` ajoute d'ordinaire :
 * deux sessions en parallèle, c'est quatre alertes par jour et par formateur — quatre e-mails
 * quotidiens pour un geste qui se fait dans l'application, sur place.
 */
const { FUSEAU, maintenantA } = require('./fuseau.js');
/* L'OUVERTURE d'une demi-journée vit avec la feuille (lib/emargement.js) : la même règle fait
   partir cette alerte, ouvre la signature du stagiaire et range les plages de la feuille imprimée
   (« 17h00 - 19h00 » est un après-midi). Deux lectures feraient sonner l'alerte à une heure où le
   stagiaire ne peut pas encore signer. */
const { parseDaySchedules, ouverture, OUVERTURE_DEFAUT } = require('./emargement.js');
const { colonneOuNull } = require('./colonnes.js');

const DEMI_JOURNEE = { MATIN: 'Matin', APRES_MIDI: 'Après-midi' };

/**
 * Le lien de l'alerte : la session, et la feuille visée (l'écran s'y place et la surligne).
 * Il sert aussi de CLÉ — une alerte par formateur et par feuille, jamais deux, quel que soit le
 * nombre de passages ou de redémarrages du serveur.
 */
const lienEmargement = (sessionId, sheetId) => `/sessions/${sessionId}?emargement=${sheetId}`;

/** « Matin du jeudi 17/09 · RS7404 S38 » — la date découpée dans la chaîne, jamais relue en UTC. */
function libelleDemiJournee(slot, jour, programme, semaine) {
    const [a, m, j] = jour.split('-');
    const nomJour = new Date(Date.UTC(+a, +m - 1, +j, 12)).toLocaleDateString('fr-FR', { weekday: 'long', timeZone: 'UTC' });
    const session = [programme, semaine ? `S${semaine}` : null].filter(Boolean).join(' ');
    return `${DEMI_JOURNEE[slot]} du ${nomJour} ${j}/${m}${session ? ` · ${session}` : ''}`;
}

/**
 * Crée les alertes dues à cet instant. Rejouable sans limite : ce qui a déjà été signalé ne
 * l'est pas deux fois. Renvoie le nombre d'alertes créées.
 *
 * `notifier` et `publier` sont INJECTÉS (server.js y passe `notify` et `publish`) : c'est ce qui
 * laisse les tests rejouer une journée entière sans base ni réseau. Ils ne portent pas les noms
 * des fonctions partagées pour que le garde-fou « appelée sans être importée »
 * (imports-manquants.test.js) continue de voir juste ici.
 */
async function relancerEmargements({ conn, notifier, publier = null, instant = new Date(), zone = FUSEAU }) {
    const { jour, minutes } = maintenantA(zone, instant);
    const horaires = await colonneOuNull(conn, 'training_program', 'horaires', 'p.'); // migration 056
    const [feuilles] = await conn.query(
        `SELECT sh.id, sh.session_id, sh.slot, ts.organization_id, ts.week,
                p.code AS program_code, ${horaires}
           FROM attendance_sheet sh
           JOIN training_session ts ON ts.id = sh.session_id
           LEFT JOIN training_program p ON p.id = ts.program_id
          WHERE sh.date = ? AND sh.slot IN ('MATIN', 'APRES_MIDI')`,
        [jour]);
    if (!feuilles.length) return 0;

    const sessions = [...new Set(feuilles.map((f) => f.session_id))];
    /* Le RANG du jour dans la session — « Jour 4 » des horaires. Même calcul que la feuille
       imprimée (renderEmargementHtml) : la position de la date parmi les jours qui ont une
       feuille. Deux lectures différentes feraient partir l'alerte à une autre heure que celle
       que la feuille annonce. */
    const [dates] = await conn.query(
        `SELECT DISTINCT session_id, DATE_FORMAT(date, '%Y-%m-%d') AS date
           FROM attendance_sheet WHERE session_id IN (?) ORDER BY date`,
        [sessions]);
    const joursDe = new Map();
    for (const d of dates) {
        if (!joursDe.has(d.session_id)) joursDe.set(d.session_id, []);
        joursDe.get(d.session_id).push(d.date);
    }
    const [formateurs] = await conn.query(
        `SELECT st.session_id, st.user_id
           FROM session_trainer st JOIN user u ON u.id = st.user_id
          WHERE st.session_id IN (?) AND u.active = 1`,
        [sessions]);
    const [signatures] = await conn.query(
        `SELECT sheet_id, user_id FROM attendance_trainer_sign
          WHERE sheet_id IN (?) AND signature_data IS NOT NULL`,
        [feuilles.map((f) => f.id)]);
    const signe = new Set(signatures.map((s) => `${s.sheet_id}|${s.user_id}`));

    const dues = [];
    for (const f of feuilles) {
        const jours = joursDe.get(f.session_id) || [];
        const horaire = parseDaySchedules(f.horaires, jours.length)[jours.indexOf(jour) + 1] || null;
        const debut = ouverture(f.slot, horaire);
        if (debut == null || minutes < debut) continue; // pas encore commencée, ou pas de cours
        for (const t of formateurs) {
            if (t.session_id !== f.session_id || signe.has(`${f.id}|${t.user_id}`)) continue;
            dues.push({ f, userId: t.user_id, link: lienEmargement(f.session_id, f.id) });
        }
    }
    if (!dues.length) return 0;

    const [existantes] = await conn.query(
        'SELECT user_id, link FROM notification WHERE organization_id IN (?) AND user_id IN (?) AND link IN (?)',
        [[...new Set(dues.map((d) => d.f.organization_id))], [...new Set(dues.map((d) => d.userId))],
            [...new Set(dues.map((d) => d.link))]]);
    const deja = new Set(existantes.map((n) => `${n.user_id}|${n.link}`));

    let crees = 0;
    const organismes = new Set();
    for (const d of dues) {
        if (deja.has(`${d.userId}|${d.link}`)) continue;
        await notifier(d.f.organization_id, {
            userId: d.userId, type: 'INFO', title: 'Émargement à signer',
            body: `${libelleDemiJournee(d.f.slot, jour, d.f.program_code, d.f.week)}. Signez votre ligne de formateur.`,
            link: d.link, email: false,
        });
        crees++;
        organismes.add(d.f.organization_id);
    }
    /* Le signal temps réel, comme après toute écriture faite par une requête : sans lui, un onglet
       resté en arrière-plan ne sonnerait qu'au retour de la personne (cf. Topbar). */
    if (publier) for (const o of organismes) publier(o, 'refresh', {});
    return crees;
}

module.exports = { relancerEmargements, maintenantA, ouverture, lienEmargement, libelleDemiJournee, OUVERTURE_DEFAUT };
