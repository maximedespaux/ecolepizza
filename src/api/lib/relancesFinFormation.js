/**
 * « FORMATION À VALIDER » — l'alerte qui manquait (demandée le 2026-09-23).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI SE PASSAIT. Un dossier pouvait être à 100 %, session terminée, et la formation rester
 * « non terminée » pendant des mois : la case est DÉCLARATIVE (`learner.completed_levels`), et
 * rien ne disait qu'elle attendait. La fiche le dit désormais (bandeau « Marquer comme
 * terminée »), mais encore faut-il OUVRIR la fiche — personne ne les ouvre une par une pour
 * vérifier. D'où cette alerte : elle va chercher le bureau, au lieu d'attendre qu'il passe.
 *
 * TROIS CONDITIONS, LES MÊMES QUE LE BANDEAU : session terminée, parcours complet, formation pas
 * encore marquée. Les recopier ailleurs les ferait diverger — c'est pourquoi le parcours est
 * calculé par `avancementDossiers`, le même calcul que le Suivi et la fiche.
 *
 * UNE FENÊTRE DE 45 JOURS, ET C'EST LE POINT DÉLICAT. Sans elle, le tout premier passage
 * alerterait sur DES ANNÉES de dossiers d'un coup — une cloche à cent lignes, que personne ne
 * lit et qui enterre le reste. On ne regarde donc que les sessions terminées récemment ; les
 * dossiers plus anciens se valident à la main, sur la fiche, où le bandeau reste affiché.
 *
 * UNE SEULE ALERTE PAR DOSSIER, par le même procédé que les relances d'émargement : on relit les
 * notifications déjà posées et on écarte celles qui portent le même titre et le même lien. Sans
 * cela, le passage en créerait une nouvelle à chaque tour, toutes les six heures.
 *
 * DANS L'APPLICATION SEULEMENT : l'alerte s'adresse à l'organisme (`userId` nul), donc `notify`
 * ne la double par aucun e-mail — c'est un geste de bureau, qui se fait dans l'application.
 */
const { FUSEAU } = require('./fuseau.js');
const { avancementDossiers } = require('./avancement.js');

/** Aujourd'hui dans le fuseau de l'organisme : le serveur, lui, tourne en UTC. */
function jourA(zone = FUSEAU, instant = new Date()) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(instant).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}`;
}

const FENETRE_JOURS = 45;
const TITRE = 'Formation à valider';
const decale = (jour, n) => {
    const [a, m, j] = jour.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
};

/** Le lien de la fiche, sur LE dossier concerné — pas le premier de la personne. */
const lienDossier = (learnerId, enrollmentId) => `/stagiaires/${learnerId}?dossier=${enrollmentId}`;

async function relancerFinFormation({ conn, notifier, instant = new Date(), zone = FUSEAU }) {
    const aujourdhui = jourA(zone, instant);
    const depuis = decale(aujourdhui, -FENETRE_JOURS);

    /* LE FILTRE SE FAIT EN BASE tant qu'il est sûr : session terminée dans la fenêtre, et
       formation pas déjà marquée. `FIND_IN_SET` lit la liste `completed_levels` telle qu'elle est
       stockée (des codes séparés par des virgules) — un `LIKE '%NIV1%'` attraperait « NIV1H ». */
    let dossiers;
    try {
        [dossiers] = await conn.query(
            `SELECT e.id AS enrollment_id, e.organization_id, e.learner_id, e.company_id AS enr_company_id,
                    s.id AS session_id, s.program_id, p.code AS program_code, p.title AS program_title,
                    DATE_FORMAT(s.end_date, '%Y-%m-%d') AS fin
               FROM enrollment e
               JOIN training_session s ON s.id = e.session_id
               JOIN training_program p ON p.id = s.program_id
               JOIN learner l ON l.id = e.learner_id
              WHERE s.end_date BETWEEN ? AND ?
                    AND p.code IS NOT NULL AND p.code <> ''
                    AND NOT FIND_IN_SET(p.code, COALESCE(REPLACE(l.completed_levels, ' ', ''), ''))
              ORDER BY s.end_date DESC`,
            [depuis, aujourdhui]);
    } catch (err) {
        /* Colonne ou table absente (base plus ancienne) : on ne relance rien, et on ne casse rien. */
        if (err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE')) return 0;
        throw err;
    }
    if (!dossiers.length) return 0;

    /* Une session terminée AUJOURD'HUI n'est pas encore à valider : le dernier jour se termine
       le soir, et les documents de clôture s'envoient souvent le lendemain. */
    const mursDossiers = dossiers.filter((d) => d.fin < aujourdhui);
    if (!mursDossiers.length) return 0;

    /* Le parcours, par organisme : `avancementDossiers` charge conditions et équivalences pour
       l'organisme qu'on lui passe — mélanger deux organismes lui ferait lire les mauvaises. */
    const parOrg = new Map();
    for (const d of mursDossiers) {
        if (!parOrg.has(d.organization_id)) parOrg.set(d.organization_id, []);
        parOrg.get(d.organization_id).push(d);
    }

    const dues = [];
    for (const [orgId, liste] of parOrg) {
        const avancement = await avancementDossiers(conn, orgId, liste);
        for (const d of liste) {
            const a = avancement.get(d.enrollment_id);
            /* `currentKey` nul ET cent pour cent : les deux disent la même chose, et c'est voulu —
               le bandeau de la fiche se fie au premier, la pastille du Suivi au second. Exiger
               les deux évite d'alerter sur un parcours vide (aucune étape : 100 % de rien). */
            if (!a || a.total === 0 || a.currentKey !== null || a.percent < 100) continue;
            dues.push(d);
        }
    }
    if (!dues.length) return 0;

    /* DÉJÀ ALERTÉ ? Même procédé que les relances d'émargement : on relit les notifications
       posées pour ces liens, et on écarte celles qui portent déjà ce titre. */
    const liens = [...new Set(dues.map((d) => lienDossier(d.learner_id, d.enrollment_id)))];
    const [existantes] = await conn.query(
        'SELECT link FROM notification WHERE title = ? AND link IN (?)', [TITRE, liens]);
    const deja = new Set(existantes.map((n) => n.link));

    let posees = 0;
    for (const d of dues) {
        const link = lienDossier(d.learner_id, d.enrollment_id);
        if (deja.has(link)) continue;
        deja.add(link);
        await notifier(d.organization_id, {
            type: 'INFO',
            title: TITRE,
            body: `${d.program_code} — parcours complet et session terminée le ${d.fin}. `
                + 'La formation peut être marquée comme terminée sur la fiche.',
            link,
            /* Pas d'e-mail : une notification d'organisme s'adresse à tout le monde, et `notify`
               ne double que les notifications nominatives. On le dit quand même, pour que la
               lecture du code n'oblige pas à aller vérifier dans `notify`. */
            email: false,
        });
        posees += 1;
    }
    return posees;
}

module.exports = { relancerFinFormation, jourA, FENETRE_JOURS, TITRE };
