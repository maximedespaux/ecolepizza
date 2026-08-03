const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { CONTRAT_VALABLE } = require('../lib/contratPartenaire.js');
const consentements = require('../lib/consentements.js');
const { stepsToDocSet, stagiaireSignsDoc, companySignsDoc, matchStep, stepSigners } = require('../lib/documents.js');
const { loadOrgSteps } = require('./template.controller.js');
const { formationSteps } = require('./formationProgram.controller.js');
const { regenEmargement } = require('../lib/emargement.js');
const { resolveUnlocked, buildGraph } = require('../lib/questgraph.js');
const { cadresQuest, possedeCadreQuest, parseCadre: parseCadreQuest, PALIER_IDS, EXPLOIT_IDS } = require('../lib/cadresQuest.js');
const { encrypt } = require('../lib/crypto.js');
const { slotsForDay, isOpenAt, minPickupDate } = require('../lib/horaires.js');
const { notify } = require('./notification.controller.js');
const { prixStagiaire } = require('../lib/remise.js');

const todayISO = () => new Date().toISOString().slice(0, 10);

// Date (YYYY-MM-DD) du jour ouvré N à partir d'une date de début (offset = N-1).
function businessDayISO(startStr, offset) {
    if (!startStr) return null;
    const d = new Date(startStr);
    if (Number.isNaN(d.getTime())) return null;
    let added = 0;
    while (added < offset) {
        d.setDate(d.getDate() + 1);
        const wd = d.getDay();
        if (wd !== 0 && wd !== 6) added += 1;
    }
    return d.toISOString().slice(0, 10);
}

// Date où le QCM doit être rempli : day>=1 = jour ouvré du stage ;
// day<=0 = |day| jours calendaires avant le début (test de positionnement, etc.).
function quizDayDate(startStr, day) {
    if (!startStr || day == null || day === '') return null;
    const d = Number(day);
    if (!Number.isFinite(d)) return null;
    if (d < 0) {
        const dt = new Date(startStr);
        if (Number.isNaN(dt.getTime())) return null;
        dt.setDate(dt.getDate() + d);
        return dt.toISOString().slice(0, 10);
    }
    return businessDayISO(startStr, d <= 1 ? 0 : d - 1);
}

// Matérialise les QCM « auto » dont le jour de formation est arrivé (envoi paresseux).
async function releaseAutoQuizzes(conn, learner) {
    const [enr] = await conn.query(
        `SELECT e.id AS enrollment_id, s.program_id, DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date
         FROM enrollment e JOIN training_session s ON s.id = e.session_id
         WHERE e.learner_id = ? AND s.program_id IS NOT NULL`,
        [learner.id]
    );
    if (!enr.length) return;
    const progIds = [...new Set(enr.map((e) => e.program_id))];
    const [quizzes] = await conn.query(
        `SELECT id, program_id, day, title FROM quiz
         WHERE organization_id = ? AND active = 1 AND auto_send = 1 AND day IS NOT NULL AND program_id IN (?)`,
        [learner.organization_id, progIds]
    );
    const today = todayISO();
    for (const q of quizzes) {
        for (const e of enr) {
            if (e.program_id !== q.program_id) continue;
            const dayDate = quizDayDate(e.start_date, q.day);
            if (!dayDate || dayDate > today) continue; // pas encore le jour J
            const [[ex]] = await conn.query(
                `SELECT gd.id FROM generated_document gd JOIN document_formation df ON df.document_id = gd.id
                 WHERE gd.quiz_id = ? AND df.enrollment_id = ? LIMIT 1`,
                [q.id, e.enrollment_id]
            );
            if (ex) continue;
            const docId = crypto.randomUUID();
            await conn.query(
                `INSERT INTO generated_document (id, organization_id, learner_id, type, quiz_id, title, status, sent_at)
                 VALUES (?, ?, ?, 'QCM', ?, ?, 'ENVOYE', NOW())`,
                [docId, learner.organization_id, learner.id, q.id, q.title]
            );
            await conn.query('INSERT INTO document_formation (document_id, enrollment_id) VALUES (?, ?)', [docId, e.enrollment_id]);
        }
    }
}

// Retrouve le stagiaire (learner) lié au compte connecté.
/* Colonnes de `inventory_item` arrivées par la 125 : sondées avant usage, sinon la requête
 * échouerait et la commande deviendrait impossible pour une remise facultative. */

async function colLigneDemande(conn, colonne) { return colTable(conn, 'shop_request_line', colonne); }
async function colInventaire(conn, colonne) { return colTable(conn, 'inventory_item', colonne); }

async function colTable(conn, table, colonne) {
    try {
        const [r] = await conn.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
            [table, colonne]);
        return r.length > 0;
    } catch { return false; }
}

async function learnerForUser(conn, userId) {
    const [rows] = await conn.query('SELECT * FROM learner WHERE user_id = ? LIMIT 1', [userId]);
    return rows[0] || null;
}

// Complétude d'un dossier : dernier jour passé + documents à signer tous signés.
async function completionOf(conn, e, steps, agefice = false) {
    const [rows] = await conn.query(
        `SELECT gd.type, gd.status
         FROM generated_document gd
         JOIN document_formation df ON df.document_id = gd.id
         WHERE df.enrollment_id = ?`,
        [e.enrollment_id]
    );
    const statusByType = {};
    for (const r of rows) statusByType[r.type] = r.status;

    const required = stepsToDocSet(steps, {
        hygiene: !!e.program_hygiene, rsCode: e.program_rs,
        jours: e.program_days || 1, financing: e.financing, agefice,
    }).filter((d) => d.stagiaireSign);

    const signed = required.filter((d) => statusByType[d.type] === 'SIGNE').length;
    const total = required.length;
    const dayPassed = !!e.end_date && e.end_date <= todayISO();
    const complete = dayPassed && total > 0 && signed === total;
    return { complete, dayPassed, signed, total };
}

// Accès à l'émargement — VOLET ENTREPRISE (migration 100). Point de rupture placé dans la
// section « À l'arrivée via une entreprise » (training_program.company_steps, migration 092) :
// company_break_slug = slug de l'étape juste avant le point. Ne s'applique QU'AUX stagiaires
// inscrits via une entreprise. Comptent, parmi les étapes situées à/avant le point :
//   · documents de GROUPE (🏢) → leur UNIQUE signature collective (ORG + Entreprise) ;
//   · documents STAGIAIRE     → la signature du stagiaire sur son propre document.
// Les étapes sans signataire, les QCM et l'émargement lui-même sont ignorés.
// Aucun point / pas d'entreprise / migration absente → aucun blocage (fail-open).
async function companyEmargementGate(conn, e, orgId) {
    const none = { locked: false, need: 0, done: 0, break_label: null };
    if (!e.program_id || !e.enrollment_id) return none;

    // Entreprise + session DU DOSSIER, et de lui seul.
    //
    // Il y avait ici un COALESCE vers learner.company_id, au motif que « l'entreprise peut être
    // portée par le dossier ou la fiche ». C'était l'inverse du besoin : learner.company_id est
    // posé à vie au premier rattachement, si bien qu'une personne déjà venue par son employeur
    // et qui s'inscrit ensuite d'elle-même se voyait appliquer le volet entreprise sur ce
    // second dossier — donc bloquée derrière des documents que son employeur n'a aucune raison
    // de signer. Le rattachement d'un dossier, c'est enrollment.company_id.
    let companyId = null, sessionId = null;
    try {
        const [[r]] = await conn.query(
            `SELECT en.company_id AS cid, en.session_id AS sid
             FROM enrollment en
             WHERE en.id = ? AND en.organization_id = ?`,
            [e.enrollment_id, orgId]
        );
        if (r) { companyId = r.cid || null; sessionId = r.sid || null; }
    } catch { return none; }
    if (!companyId) return none; // arrivée « seul » → le volet entreprise ne s'applique pas

    // Sous-parcours entreprise + point de rupture de la formation.
    let list = [], breakSlug = null;
    try {
        const [[p]] = await conn.query(
            'SELECT company_steps AS cs, company_break_slug AS cbs FROM training_program WHERE id = ?', [e.program_id]);
        breakSlug = p && p.cbs ? p.cbs : null;
        let cs = p && p.cs;
        if (typeof cs === 'string') { try { cs = JSON.parse(cs); } catch { cs = []; } }
        list = Array.isArray(cs) ? cs : [];
    } catch { return none; } // colonnes absentes (migrations 092 / 100 non jouées)
    if (!breakSlug || !list.length) return none;
    const idx = list.indexOf(breakSlug);
    if (idx < 0) return none;

    // Étapes à/avant le point, résolues sur le parcours de l'organisme.
    const bySlug = new Map((await loadOrgSteps(orgId)).map((s) => [s.slug, s]));
    const break_label = (bySlug.get(breakSlug) || {}).label || null;
    const required = list.slice(0, idx + 1)
        .map((sl) => bySlug.get(sl))
        .filter((s) => s && s.active && s.doc_type !== 'QCM' && s.doc_type !== 'EMARGEMENT' && stepSigners(s).length > 0);
    if (!required.length) return { ...none, break_label };

    // Documents du DOSSIER (stagiaire).
    const ownBySlug = {}, ownByType = {};
    const [own] = await conn.query(
        `SELECT gd.type, gd.template_slug, gd.status FROM generated_document gd
         JOIN document_formation df ON df.document_id = gd.id WHERE df.enrollment_id = ?`,
        [e.enrollment_id]
    );
    for (const r of own) { if (r.template_slug) ownBySlug[r.template_slug] = r.status; ownByType[r.type] = r.status; }

    // Documents de GROUPE de l'entreprise (scope COMPANY), pour cette session si connue.
    const grpBySlug = {};
    try {
        // `session_id IS NULL` laissait passer les documents de groupe de N'IMPORTE QUELLE
        // session de cette entreprise : une convention signée pour la session de mars pouvait
        // débloquer celle de septembre. On ne l'accepte donc que faute de mieux, quand le
        // dossier lui-même n'a pas de session.
        const [grp] = await conn.query(
            `SELECT template_slug, status FROM generated_document
             WHERE organization_id = ? AND scope = 'COMPANY' AND company_id = ?
               AND (? IS NULL OR session_id = ?)`,
            [orgId, companyId, sessionId, sessionId]
        );
        // Un document de groupe non signé ne doit pas être écrasé par un homonyme signé.
        for (const r of grp) {
            if (!r.template_slug) continue;
            if (grpBySlug[r.template_slug] !== 'SIGNE') grpBySlug[r.template_slug] = r.status;
        }
    } catch { /* schéma documents entreprise absent → ces étapes resteront « à faire » */ }

    const isDone = (s) => (s.company_level
        ? grpBySlug[s.slug] === 'SIGNE'
        : (ownBySlug[s.slug] === 'SIGNE' || ownByType[s.doc_type] === 'SIGNE'));
    const done = required.filter(isDone).length;
    return { locked: done < required.length, need: required.length, done, break_label };
}

// Accès à l'émargement : point de rupture positionné ENTRE deux jalons du parcours DE LA
// FORMATION (training_program.emargement_break_slug = slug de l'étape juste avant le point).
// Le stagiaire doit avoir signé tous les documents qu'il doit signer situés à/avant ce point
// (par sort_order du parcours de la formation). Aucun point → aucun blocage.
// Renvoie { locked, need, done, break_label }.
async function dossierEmargementGate(conn, e, orgId, agefice = false) {
    if (!e.program_id) return { locked: false, need: 0, done: 0, break_label: null };
    let breakSlug = null;
    try {
        const [[p]] = await conn.query('SELECT emargement_break_slug AS bs FROM training_program WHERE id = ?', [e.program_id]);
        breakSlug = p && p.bs ? p.bs : null;
    } catch { breakSlug = null; } // colonne absente (migration 076 non jouée)
    if (!breakSlug) return { locked: false, need: 0, done: 0, break_label: null };

    const program = { id: e.program_id, code: e.program_code, days: e.program_days, hygiene: e.program_hygiene, rs_code: e.program_rs };
    const pSteps = await formationSteps(conn, orgId, program);
    const brk = pSteps.find((s) => s.slug === breakSlug);
    if (!brk) return { locked: false, need: 0, done: 0, break_label: null };
    const threshold = Number(brk.sort_order);

    const ctx = { hygiene: !!e.program_hygiene, rsCode: e.program_rs, jours: e.program_days || 1, financing: e.financing, agefice };
    const required = pSteps.filter((s) => s.active && s.stagiaire_sign
        && s.doc_type !== 'QCM' && s.doc_type !== 'EMARGEMENT'
        && matchStep(s.applies_when || {}, ctx)
        && Number(s.sort_order) <= threshold);
    const break_label = brk.label;
    if (!required.length) return { locked: false, need: 0, done: 0, break_label };

    const [rows] = await conn.query(
        `SELECT gd.type, gd.template_slug, gd.status FROM generated_document gd
         JOIN document_formation df ON df.document_id = gd.id WHERE df.enrollment_id = ?`,
        [e.enrollment_id]
    );
    const statusBySlug = {}, statusByType = {};
    for (const r of rows) { if (r.template_slug) statusBySlug[r.template_slug] = r.status; statusByType[r.type] = r.status; }
    const done = required.filter((s) => statusBySlug[s.slug] === 'SIGNE' || statusByType[s.doc_type] === 'SIGNE').length;
    return { locked: done < required.length, need: required.length, done, break_label };
}

/**
 * Accès à l'émargement, TOUS VOLETS CONFONDUS. Les DEUX points de rupture doivent être
 * franchis : celui du « Parcours du dossier » et — pour un stagiaire arrivé via une
 * entreprise — celui de la section « À l'arrivée via une entreprise ».
 * Les compteurs sont cumulés ; `break_label` est celui du volet encore bloquant.
 */
async function emargementGate(conn, e, orgId, agefice = false) {
    const [dossier, company] = await Promise.all([
        dossierEmargementGate(conn, e, orgId, agefice),
        companyEmargementGate(conn, e, orgId),
    ]);
    const locked = dossier.locked || company.locked;
    // Libellé affiché : le volet qui bloque encore (dossier prioritaire), sinon le dernier point posé.
    const break_label = (dossier.locked ? dossier.break_label : null)
        || (company.locked ? company.break_label : null)
        || dossier.break_label || company.break_label || null;
    return {
        locked,
        need: dossier.need + company.need,
        done: dossier.done + company.done,
        break_label,
        dossier, company, // détail par volet (diagnostic / affichage fin)
    };
}

/**
 * GET /api/mon-espace — documents ENVOYÉS au stagiaire (à consulter / signer).
 */
const getMonEspace = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: "Aucune fiche stagiaire liée à ce compte." });

        await releaseAutoQuizzes(conn, learner); // matérialise les QCM du jour (auto)

        const [documents] = await conn.query(
            `SELECT d.id, d.type, d.template_slug, d.title, d.status, d.quiz_id,
                    DATE_FORMAT(d.sent_at, '%Y-%m-%d %H:%i') AS sent_at,
                    DATE_FORMAT(d.signed_at, '%Y-%m-%d %H:%i') AS signed_at, d.signer_name,
                    GROUP_CONCAT(p.code ORDER BY p.code SEPARATOR ', ') AS formations,
                    /* Le rattachement entreprise est une propriété DU DOSSIER de ce document,
                       pas du stagiaire : un même stagiaire peut avoir un dossier porté par son
                       employeur et un autre qu'il porte seul. MAX() parce que le GROUP BY
                       agrège les dossiers d'un document multi-formations. */
                    MAX(e.company_id) AS doc_company_id
             FROM generated_document d
             LEFT JOIN document_formation df ON df.document_id = d.id
             LEFT JOIN enrollment e ON e.id = df.enrollment_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE d.learner_id = ? AND d.status IN ('ENVOYE','CONSULTE','SIGNE')
             GROUP BY d.id
             ORDER BY d.sent_at DESC`,
            [learner.id]
        );

        // Le stagiaire doit-il signer chaque document ? Piloté par le modèle (Modeles).
        // Exception : les documents « signés par l'entreprise » quand LE DOSSIER de ce document
        // est rattaché à une entreprise → c'est le représentant qui signe.
        //
        // Cette exception se décidait auparavant une fois pour toutes, à partir de
        // learner.company_id. Ce champ étant posé à vie au premier rattachement, un stagiaire
        // déjà venu par son employeur ne pouvait plus jamais signer un document, même sur une
        // inscription qu'il portait seul.
        const orgSteps = await loadOrgSteps(req.user.organization_id);
        for (const d of documents) {
            const byCompany = !!d.doc_company_id && companySignsDoc(orgSteps, d);
            d.company_sign = byCompany;
            d.signable = d.quiz_id ? false : (!byCompany && (d.type === 'EMARGEMENT' || stagiaireSignsDoc(orgSteps, d)));
            delete d.doc_company_id; // donnée de calcul, pas d'affichage
        }

        res.json({
            data: {
                learner: {
                    id: learner.id, civility: learner.civility,
                    first_name: learner.first_name, last_name: learner.last_name, email: learner.email,
                },
                documents,
            },
        });
    } catch (err) {
        console.error('Erreur mon-espace :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/formations — une carte PAR formation du catalogue.
 * Toutes les cartes sont visibles ; une carte se déverrouille si le stagiaire a
 * suivi cette formation et qu'elle est complète (dernier jour passé + signée).
 */
/**
 * GET /api/mon-espace/access — le stagiaire a-t-il franchi le POINT D'ACCÈS (breakpoint
 * émargement) d'au moins une de ses formations ? Sert à débloquer Pizza Quest + Outils &
 * Communauté. Aucune formation avec point d'accès → débloqué (rien à bloquer). En erreur
 * on débloque (fail-open : on ne bloque jamais par bug).
 */
/**
 * Nombre de documents EN ATTENTE D'UNE ACTION du stagiaire — la pastille du menu.
 *
 * Comptent : les QCM non répondus, et les documents non signés que le stagiaire doit signer
 * lui-même. Ne comptent PAS les documents seulement « à consulter » : rien ne trace leur
 * lecture, la pastille resterait donc allumée à vie et on cesserait de la voir.
 * Ni ceux signés par l'entreprise quand le stagiaire y est rattaché — ce n'est pas lui
 * qui signe.
 *
 * Ne matérialise pas les QCM automatiques (releaseAutoQuizzes) : ce serait une écriture à
 * chaque navigation. Un QCM du jour apparaît donc dans la pastille dès la page ouverte.
 */
/**
 * Ce qui m'attend dans la Communauté — la pastille du menu.
 *
 * DEUX SIGNAUX, DEUX EXIGENCES. Ils ne s'éteignent pas au même moment, et c'est toute la
 * raison pour laquelle ils sont comptés séparément :
 *
 *   · COMMENTAIRES — ils appellent une réponse, donc ils restent comptés tant que la fiche
 *     n'a pas été OUVERTE (recipe_read, migration 107). Traverser la Communauté sans entrer
 *     dans la fiche ne les éteint pas : on ne les a pas lus.
 *     Deux cas seulement : un commentaire sur une fiche QUE J'AI PARTAGÉE, ou sur une fiche
 *     OÙ J'AI DÉJÀ COMMENTÉ — j'y ai pris part, la suite me regarde.
 *
 *   · J'AIME — ils n'appellent rien. Les VOIR suffit, donc ils s'éteignent à la visite
 *     (community_seen_at, migration 106). Uniquement sur MES fiches : être informé qu'on a
 *     aimé la fiche d'un autre n'a pas de sens.
 *
 * LE REPLI DE `read_at` MÉRITE UN MOT. Un commentaire est neuf s'il est postérieur à :
 *   1. la lecture de SA fiche, si elle a eu lieu ;
 *   2. sinon, la dernière visite de la Communauté — ce qui évite qu'à la mise en service de
 *      la 107, où recipe_read est vide, chacun se réveille avec des mois d'historique dans
 *      sa pastille. Ce que l'on avait déjà balayé du regard reste considéré comme vu ;
 *   3. sinon (jamais venu), tout est neuf : c'est le bon accueil pour une première visite.
 *
 * Mes propres commentaires et mes propres j'aime ne comptent pas : s'auto-notifier n'a
 * aucun intérêt.
 *
 * Le périmètre reste les fiches ENCORE partagées dans MON organisme : la pastille ne doit
 * annoncer que ce sur quoi on peut réellement cliquer. Une fiche repassée en privé en sort.
 */
async function communityNewsCount(conn, userId, orgId) {
    try {
        const [[row]] = await conn.query(
            `SELECT
               (SELECT COUNT(*)
                  FROM recipe_comment c
                  JOIN recipe r ON r.id = c.recipe_id
                  LEFT JOIN recipe_read rr ON rr.recipe_id = c.recipe_id AND rr.user_id = u.id
                 WHERE c.user_id <> u.id
                   AND r.organization_id = ?
                   AND r.visibility = 'SHARED'
                   AND c.created_at > COALESCE(rr.read_at, u.community_seen_at, '1970-01-01')
                   AND (r.author_user_id = u.id
                        OR EXISTS (SELECT 1 FROM recipe_comment m
                                    WHERE m.recipe_id = c.recipe_id AND m.user_id = u.id))
               ) AS comments,
               (SELECT COUNT(*)
                  FROM recipe_like lk
                  JOIN recipe r2 ON r2.id = lk.recipe_id
                 WHERE lk.user_id <> u.id
                   AND r2.author_user_id = u.id
                   AND r2.organization_id = ?
                   AND r2.visibility = 'SHARED'
                   AND lk.created_at > COALESCE(u.community_seen_at, '1970-01-01')
               ) AS likes
             FROM user u WHERE u.id = ?`,
            [orgId, orgId, userId]
        );
        return (Number(row?.comments) || 0) + (Number(row?.likes) || 0);
    } catch (e) {
        if (isMissingSchema(e)) return 0; // migration 106 non jouée
        console.error('Erreur comptage nouveautés Communauté :', e);
        return 0; // une pastille absente vaut mieux qu'un menu en erreur
    }
}

async function pendingDocsCount(conn, learner, orgId) {
    try {
        // company_id remonte PAR DOCUMENT, via le dossier auquel il appartient : c'est le
        // dossier qui dit si l'entreprise signe, jamais la fiche du stagiaire. Sinon la
        // pastille cessait de compter les documents d'une inscription portée seul, dès lors
        // que la personne était déjà passée une fois par un employeur.
        const [rows] = await conn.query(
            `SELECT d.id, d.type, d.template_slug, d.quiz_id, MAX(e.company_id) AS doc_company_id
             FROM generated_document d
             LEFT JOIN document_formation df ON df.document_id = d.id
             LEFT JOIN enrollment e ON e.id = df.enrollment_id
             WHERE d.learner_id = ? AND d.status IN ('ENVOYE','CONSULTE')
             GROUP BY d.id`,
            [learner.id]
        );
        if (!rows.length) return 0;
        const orgSteps = await loadOrgSteps(orgId);
        return rows.filter((d) => {
            if (d.quiz_id) return true;                                          // QCM à faire
            if (d.doc_company_id && companySignsDoc(orgSteps, d)) return false;  // signé par l'entreprise
            return d.type === 'EMARGEMENT' || stagiaireSignsDoc(orgSteps, d);
        }).length;
    } catch (e) {
        if (isMissingSchema(e)) return 0;
        console.error('Erreur comptage documents en attente :', e);
        return 0; // une pastille absente vaut mieux qu'un menu en erreur
    }
}

const getMyAccess = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        // Pas de fiche stagiaire (intervenant, staff…) : on ne bloque pas.
        if (!learner) return res.json({ data: { quest_unlocked: true, pending_docs: 0, community_news: await communityNewsCount(conn, req.user.id, req.user.organization_id) } });
        // Pastille du menu : calculée pour TOUTES les sorties ci-dessous, sans quoi elle
        // disparaîtrait dès qu'une formation est terminée ou qu'aucune n'est suivie.
        const pending_docs = await pendingDocsCount(conn, learner, learner.organization_id);
        const community_news = await communityNewsCount(conn, req.user.id, learner.organization_id);
        const [enrollments] = await conn.query(
            `SELECT e.id AS enrollment_id, e.financing, s.program_id,
                    DATE_FORMAT(s.end_date, '%Y-%m-%d') AS end_date,
                    p.code AS program_code, p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.learner_id = ?`,
            [learner.id]
        );
        const agefice = (learner.opco || '').toUpperCase() === 'AGEFICE';
        // Au moins une formation TERMINÉE (marquée manuellement OU complétée auto) → débloqué,
        // même sans point d'accès franchi (cas des personnes déjà venues / déjà formées).
        const doneSet = new Set(String(learner.completed_levels || '').split(',').map((s) => s.trim()).filter(Boolean));
        // Nombre de formations terminées → CADRE porté par l'avatar de l'en-tête. Il est
        // renvoyé ici plutôt que par un appel dédié : la barre appelle déjà cette route à
        // chaque page, et le compte est déjà calculé juste au-dessus.
        const formations_done = doneSet.size;
        // Les cadres exclusifs accordés (migration 113) : l'en-tête en a besoin pour savoir si
        // le cadre choisi est réellement possédé. `?? ''` et non `||` — une colonne absente
        // (migration non jouée) donne `undefined`, qui doit donner une liste vide sans lever.
        const cadres_exclusifs = String(learner.cadres_exclusifs ?? '').split(',').map((x) => x.trim()).filter(Boolean);
        let finished = doneSet.size > 0;
        if (!finished && enrollments.length) {
            const steps = await loadOrgSteps(learner.organization_id);
            for (const e of enrollments) {
                const c = await completionOf(conn, e, steps, agefice);
                if (c.complete) { finished = true; break; }
            }
        }
        if (finished) return res.json({ data: { quest_unlocked: true, pending_docs, community_news, formations_done, cadres_exclusifs } });

        // AUCUNE formation → verrouillé (rien à débloquer tant qu'il n'est pas inscrit).
        if (!enrollments.length) return res.json({ data: { quest_unlocked: false, pending_docs, community_news, formations_done, cadres_exclusifs } });
        const gating = [];
        for (const e of enrollments) {
            const g = await emargementGate(conn, e, learner.organization_id, agefice);
            if (g.need > 0) gating.push(g);
        }
        // Inscrit : débloqué si aucune formation n'a de point d'accès, ou si au moins un est franchi.
        const quest_unlocked = gating.length === 0 || gating.some((g) => !g.locked);
        res.json({ data: { quest_unlocked, pending_docs, community_news, formations_done, cadres_exclusifs } });
    } catch (err) {
        console.error('Erreur accès stagiaire :', err);
        res.json({ data: { quest_unlocked: true, pending_docs: 0, community_news: 0 } });
    }
};

/**
 * POST /api/mon-espace/communaute/vue — « j'ai vu la Communauté ».
 *
 * Appelé par le front UNE FOIS la galerie affichée, pas à l'entrée dans la page : le repérage
 * des cartes concernées est calculé côté serveur à partir de cette même date. Marquer trop tôt
 * les effacerait avant qu'on ait pu les voir.
 *
 * Idempotent, et sans effet de bord visible : reposer la date ne fait que remettre le
 * compteur à zéro. En échec on répond quand même 200 — rater ce marquage laisse une pastille
 * de trop, ce qui ne justifie pas d'afficher une erreur au stagiaire.
 */
const markCommunitySeen = async (req, res) => {
    try {
        await db.promise().query('UPDATE user SET community_seen_at = NOW() WHERE id = ?', [req.user.id]);
        res.json({ data: { ok: true } });
    } catch (err) {
        if (!isMissingSchema(err)) console.error('Erreur marquage Communauté vue :', err);
        res.json({ data: { ok: false } }); // migration 106 non jouée, ou écriture refusée
    }
};

const getMyFormations = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: "Aucune fiche stagiaire liée à ce compte." });

        // Catalogue complet des formations de l'organisme (avec le descriptif,
        // pour l'aperçu en lecture seule des formations non suivies).
        // ORDER BY sort_order, code — et non « code » seul : l'ordre du catalogue est celui
        // que l'organisme a choisi en réordonnant ses formations, et c'est lui qui doit se
        // retrouver sur la carte Pizza Quest comme dans « Mes formations ». Trié
        // alphabétiquement, RS7404 passait derrière les NIV1* pour la seule raison que R
        // suit N — un ordre que personne n'avait décidé.
        //
        // Les colonnes quest_* (migration 101) peuvent ne pas exister : on retente sans elles
        // plutôt que de casser la page « Mes formations » pour un paramétrage optionnel.
        const PROG_COLS = `id, code, title, level, color, days, hours, price, hygiene, rs_code,
                    audience, objectives, objective_general, duration_detail, program_detail`;
        let programs;
        try {
            [programs] = await conn.query(
                `SELECT ${PROG_COLS}, quest_theme_id, quest_tier_id
                 FROM training_program WHERE organization_id = ? AND active = 1 ORDER BY sort_order, code`,
                [learner.organization_id]
            );
        } catch (e) {
            if (!isMissingSchema(e)) throw e;
            [programs] = await conn.query(
                `SELECT ${PROG_COLS} FROM training_program WHERE organization_id = ? AND active = 1 ORDER BY sort_order, code`,
                [learner.organization_id]
            );
            programs = programs.map((p) => ({ ...p, quest_theme_id: null, quest_tier_id: null }));
        }
        // Thèmes / paliers (Pizza Quest) — facultatifs : sans eux la carte reste plate.
        const questCats = new Map();
        try {
            const [cats] = await conn.query(
                'SELECT id, kind, name, color, icon, sort_order FROM quest_category WHERE organization_id = ?',
                [learner.organization_id]);
            for (const c of cats) questCats.set(c.id, c);
        } catch (e) { if (!isMissingSchema(e)) throw e; }

        // Inscriptions du stagiaire (pour déverrouiller les cartes concernées).
        const [enrollments] = await conn.query(
            `SELECT e.id AS enrollment_id, e.financing, s.program_id, s.year, s.week,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                    p.code AS program_code, p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.learner_id = ?`,
            [learner.id]
        );

        // Une carte par formation ; on ouvre par défaut la session la plus RÉCENTE.
        // On compte aussi le nombre de sessions suivies (onglets dans le détail).
        const agefice = (learner.opco || "").toUpperCase() === "AGEFICE";
        const steps = await loadOrgSteps(learner.organization_id);
        const byProgram = {};
        for (const e of enrollments) {
            const c = await completionOf(conn, e, steps, agefice);
            const g = await emargementGate(conn, e, learner.organization_id, agefice); // point d'accès (breakpoint)
            const info = {
                enrollment_id: e.enrollment_id, complete: c.complete, dayPassed: c.dayPassed,
                signed: c.signed, total: c.total, start_date: e.start_date, end_date: e.end_date,
                year: e.year, week: e.week, gate_need: g.need, gate_locked: g.locked,
            };
            const cur = byProgram[e.program_id];
            if (!cur) byProgram[e.program_id] = { ...info, session_count: 1 };
            else {
                cur.session_count += 1;
                if ((e.start_date || '') > (cur.start_date || '')) byProgram[e.program_id] = { ...info, session_count: cur.session_count };
            }
        }

        // Badges du stagiaire (codes/niveaux de formation attachés à sa fiche) :
        // ils débloquent le niveau correspondant dans Pizza Quest.
        const badgeSet = new Set(String(learner.levels || '').split(',').map((s) => s.trim()).filter(Boolean));
        // Formations marquées TERMINÉES manuellement (migration 094, colonne optionnelle).
        const doneSet = new Set(String(learner.completed_levels || '').split(',').map((s) => s.trim()).filter(Boolean));

        // PRÉREQUIS (migration 101) : « pour attaquer B, il faut avoir terminé A ». On résout
        // en deux temps car « terminée » se calcule par formation (badge manuel OU complétion
        // documentaire), donc il faut d'abord établir la liste des formations terminées.
        const estTerminee = (p) => {
            const e = byProgram[p.id] || null;
            const badge = (p.level && String(p.level).trim()) || p.code;
            return doneSet.has(badge) || doneSet.has(p.code) || !!(e && e.complete);
        };
        const doneIds = programs.filter(estTerminee).map((p) => p.id);
        let prereqEdges = [];
        try {
            const [rows] = await conn.query(
                'SELECT program_id, requires_program_id FROM quest_prerequisite WHERE organization_id = ?',
                [learner.organization_id]);
            prereqEdges = rows;
        } catch (e) { if (!isMissingSchema(e)) throw e; }
        const unlockMap = resolveUnlocked(programs.map((p) => p.id), prereqEdges, doneIds);
        const titreDe = new Map(programs.map((p) => [p.id, { code: p.code, title: p.title }]));
        // Prérequis DIRECTS de chaque formation, avec leur état. On renvoie la liste complète
        // et pas seulement ce qui manque : le stagiaire doit pouvoir lire « pour l'Expert, il
        // faut le Niveau II » même une fois le Niveau II acquis — c'est le plan de parcours,
        // pas une alerte. Les manquants restent distingués par `done`.
        const prereqGraph = buildGraph(prereqEdges);
        const finiSet = new Set(doneIds);
        const prereqsDe = (id) => [...(prereqGraph.get(id) || [])].map((rid) => ({
            ...(titreDe.get(rid) || { code: '?', title: 'formation supprimée' }),
            done: finiSet.has(rid),
        }));

        const formations = programs.map((p) => {
            const e = byProgram[p.id] || null;
            const badge = (p.level && String(p.level).trim()) || p.code;
            const hasBadge = badgeSet.has(badge) || badgeSet.has(p.code);
            // Terminée = marquée manuellement OU complétion auto des documents.
            const finished = doneSet.has(badge) || doneSet.has(p.code) || !!(e && e.complete);
            // RÉVOQUÉE : session commencée + point d'accès (breakpoint) NON franchi + non terminée.
            // → retire le badge (niveau) et l'accès à la formation dans « Mes documents ».
            const sessionStarted = !!(e && e.start_date && e.start_date <= todayISO());
            const revoked = !!e && sessionStarted && (e.gate_need || 0) > 0 && !!e.gate_locked && !finished;
            return {
                program_id: p.id, program_code: p.code, program_title: p.title,
                // Descriptif (aperçu lecture seule).
                level: p.level, color: p.color, days: p.days, hours: p.hours, price: p.price,
                hygiene: p.hygiene, rs_code: p.rs_code,
                audience: p.audience, objectives: p.objectives, objective_general: p.objective_general,
                duration_detail: p.duration_detail, program_detail: p.program_detail,
                enrolled: !!e, has_badge: hasBadge, finished, revoked,
                // Rangement Pizza Quest (facultatif).
                quest_theme: questCats.get(p.quest_theme_id) || null,
                quest_tier: questCats.get(p.quest_tier_id) || null,
                // Prérequis : `prereq_locked` = il reste des formations à terminer avant.
                // `prereq_missing` les nomme, pour l'afficher plutôt qu'un cadenas muet.
                prereq_locked: !(unlockMap.get(p.id) || { unlocked: true }).unlocked,
                prereq_missing: ((unlockMap.get(p.id) || {}).missing || [])
                    .map((id) => titreDe.get(id) || { code: '?', title: 'formation supprimée' }),
                // Tous les prérequis directs, acquis compris (chacun avec son `done`).
                prereq_all: prereqsDe(p.id),
                enrollment_id: e ? e.enrollment_id : null,
                complete: e ? e.complete : false,
                dayPassed: e ? e.dayPassed : false,
                signed: e ? e.signed : 0,
                total: e ? e.total : 0,
                start_date: e ? e.start_date : null,
                end_date: e ? e.end_date : null,
                year: e ? e.year : null,
                week: e ? e.week : null,
                session_count: e ? e.session_count : 0,
            };
        });

        res.json({ data: formations });
    } catch (err) {
        console.error('Erreur formations stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/formations/:id — documents d'une formation terminée
 * (accessible uniquement si la formation est complète).
 */
const getMyFormation = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Fiche stagiaire introuvable.' });

        const [rows] = await conn.query(
            `SELECT e.id AS enrollment_id, e.financing, e.session_id, s.program_id,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s.end_date,   '%Y-%m-%d') AS end_date,
                    s.year, s.week,
                    p.code AS program_code, p.title AS program_title, p.hours AS program_hours,
                    p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.id = ? AND e.learner_id = ?`,
            [req.params.id, learner.id]
        );
        if (rows.length === 0) return res.status(404).json({ message: 'Formation introuvable.' });
        const e = rows[0];

        // Accès dès l'inscription à une session (plus besoin que la formation soit terminée).
        const steps = await loadOrgSteps(learner.organization_id);
        const agefice = (learner.opco || "").toUpperCase() === "AGEFICE";
        const c = await completionOf(conn, e, steps, agefice);
        const gate = await emargementGate(conn, e, learner.organization_id, agefice);

        // Sessions du MÊME programme suivies par ce stagiaire (onglets W23 / W25…).
        const [sessions] = e.session_id ? await conn.query(
            `SELECT e2.id AS enrollment_id, s2.year, s2.week,
                    DATE_FORMAT(s2.start_date, '%Y-%m-%d') AS start_date,
                    DATE_FORMAT(s2.end_date,   '%Y-%m-%d') AS end_date
             FROM enrollment e2
             JOIN training_session s2 ON s2.id = e2.session_id
             WHERE e2.learner_id = ? AND s2.program_id = (SELECT program_id FROM training_session WHERE id = ?)
             ORDER BY s2.start_date DESC, s2.year DESC, s2.week DESC`,
            [learner.id, e.session_id]
        ) : [[]];

        // Tous les documents partagés du dossier (envoyés / consultés / signés).
        const [documents] = await conn.query(
            `SELECT gd.id, gd.type, gd.title, gd.status, gd.quiz_id,
                    DATE_FORMAT(gd.signed_at, '%Y-%m-%d %H:%i') AS signed_at
             FROM generated_document gd
             JOIN document_formation df ON df.document_id = gd.id
             WHERE df.enrollment_id = ? AND gd.status IN ('ENVOYE','CONSULTE','SIGNE')
             ORDER BY gd.created_at`,
            [e.enrollment_id]
        );

        // Émargement de la session (demi-journées à signer par le stagiaire).
        const [emargement] = e.session_id ? await conn.query(
            `SELECT ar.id AS record_id, (ar.signature_data IS NOT NULL) AS signed,
                    DATE_FORMAT(ar.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                    DATE_FORMAT(sh.date, '%Y-%m-%d') AS date, sh.slot
             FROM attendance_record ar
             JOIN attendance_sheet sh ON sh.id = ar.sheet_id
             WHERE ar.learner_id = ? AND sh.session_id = ?
             ORDER BY sh.date, FIELD(sh.slot, 'MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL')`,
            [learner.id, e.session_id]
        ) : [[]];

        res.json({
            data: {
                program_code: e.program_code, program_title: e.program_title,
                start_date: e.start_date, end_date: e.end_date, year: e.year, week: e.week,
                program_hours: e.program_hours,
                complete: c.complete, signed: c.signed, total: c.total,
                today: todayISO(),
                enrollment_id: e.enrollment_id,
                sessions,
                emargement_gate: gate, // { locked, need, done, break_label }
                documents, emargement,
            },
        });
    } catch (err) {
        console.error('Erreur formation stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/emargement — demi-journées d'émargement du stagiaire
 * (ses sessions), avec l'état de sa signature.
 */
const getMyEmargement = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: "Aucune fiche stagiaire liée à ce compte." });
        const [rows] = await conn.query(
            `SELECT ar.id AS record_id, ar.present,
                    (ar.signature_data IS NOT NULL) AS signed, ar.signer_name,
                    DATE_FORMAT(ar.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                    DATE_FORMAT(s.date, '%Y-%m-%d') AS date, s.slot, s.session_id,
                    p.code AS program_code, p.title AS program_title
             FROM attendance_record ar
             JOIN attendance_sheet s ON s.id = ar.sheet_id
             JOIN training_session ts ON ts.id = s.session_id
             LEFT JOIN training_program p ON p.id = ts.program_id
             WHERE ar.learner_id = ?
             ORDER BY s.date, FIELD(s.slot, 'MATIN', 'APRES_MIDI', 'EXAMEN', 'DISTANCIEL')`,
            [learner.id]
        );
        res.json({ data: { today: todayISO(), records: rows } });
    } catch (err) {
        console.error('Erreur émargement stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/mon-espace/emargement/:recordId/sign — le stagiaire signe sa présence
 * pour une demi-journée. Corps : { signature_data, signer_name? }.
 */
const signMyEmargement = async (req, res) => {
    const { signature_data, signer_name } = req.body || {};
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Fiche stagiaire introuvable.' });
        const [[rec]] = await conn.query(
            `SELECT ar.id, s.session_id, DATE_FORMAT(s.date, '%Y-%m-%d') AS date
             FROM attendance_record ar JOIN attendance_sheet s ON s.id = ar.sheet_id
             WHERE ar.id = ? AND ar.learner_id = ?`,
            [req.params.recordId, learner.id]
        );
        if (!rec) return res.status(404).json({ message: 'Émargement introuvable.' });
        if (rec.date > todayISO()) return res.status(400).json({ message: 'Impossible de signer une demi-journée à venir.' });
        const name = (signer_name && signer_name.trim()) || `${learner.first_name || ''} ${learner.last_name || ''}`.trim();
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || req.socket?.remoteAddress || null;
        const ua = (req.headers['user-agent'] || '').slice(0, 400);
        await conn.query(
            'UPDATE attendance_record SET present = 1, signed_at = NOW(), signer_name = ?, signature_data = ?, signer_ip = ?, signer_user_agent = ? WHERE id = ?',
            [name, encrypt(signature_data || null), encrypt(ip), encrypt(ua), req.params.recordId]
        );
        res.json({ success: true, message: 'Émargement signé.' });

        // Met à jour la feuille d'émargement archivée du dossier (non bloquant).
        const [[enr]] = await conn.query('SELECT id FROM enrollment WHERE session_id = ? AND learner_id = ? LIMIT 1', [rec.session_id, learner.id]);
        if (enr) regenEmargement(conn, learner.organization_id, enr.id).catch(() => {});
    } catch (err) {
        console.error('Erreur signature émargement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// --- Profil ludique du stagiaire (avatar + progression Pizza Quest) ---
// Persistance en base de ce qui vivait en localStorage. Tolérant à l'absence de la
// migration 070 (renvoie un profil vide / no-op au lieu d'échouer).

const isMissingSchema = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE');
// Avatars illustrés proposés aujourd'hui (cf. front AvatarArt.jsx) + « img » = le stagiaire
// utilise sa PHOTO (l'image vit dans learner_avatar, migration 094).
const AVATAR_IDS = new Set(['pizza','paton','oven','pelle','petrin','chef','flame','wheat','farine',
    'tomato','cheese','basil','olive','chili','mushroom','huile','img']);
// Anciens ids (jeu d'emoji générique : burger, sushi, café…), retirés du sélecteur mais
// TOUJOURS ACCEPTÉS : des stagiaires les ont en base. Les refuser ferait échouer leur
// prochaine sauvegarde de profil pour un choix qu'ils n'ont plus les moyens de corriger.
// Le front les remappe à l'affichage (LEGACY_AVATAR dans gamification.js).
const LEGACY_AVATAR_IDS = new Set(['bread','chef2','chef3','burger','fries','pasta','salad','egg','bacon',
    'shrimp','sushi','taco','hotdog','sandwich','croissant','pretzel','avocado','pepper','corn','grapes','lemon','icecream','coffee']);
const isKnownAvatar = (id) => AVATAR_IDS.has(id) || LEGACY_AVATAR_IDS.has(id);

/**
 * Les cadres de Pizza Quest possédés par un stagiaire.
 *
 * DÉRIVÉ, jamais stocké : la règle (moitié / bouclé / sans faute) porte sur le NOMBRE DE
 * CHAPITRES ACTIFS, qui bouge dès que l'école enrichit sa banque. Cf. lib/cadresQuest.js.
 *
 * `world` dans `learner_quest_progress` est le CODE de la formation (c'est ce que le jeu
 * enregistre) : c'est donc sur le code qu'on rapproche les deux, pas sur l'id.
 *
 * Dégradation silencieuse : ni `quest_chapter` (migration 102) ni la progression (070) ne sont
 * garanties. Sans elles la liste est vide — le stagiaire ne voit pas ces cadres, et rien d'autre
 * ne casse. Une exception ici ferait tomber tout le profil, avatar compris.
 */
async function cadresQuestDuStagiaire(conn, learner, progress) {
    if (!progress || !Object.keys(progress).length) return [];
    try {
        const [rows] = await conn.query(
            `SELECT p.code, p.title, p.color, COUNT(c.id) AS chapitres
               FROM training_program p
               LEFT JOIN quest_chapter c ON c.program_id = p.id AND c.active = 1
              WHERE p.organization_id = ? AND p.active = 1
              GROUP BY p.id, p.code, p.title, p.color`,
            [learner.organization_id]
        );
        return cadresQuest(progress, rows.map((r) => ({
            code: r.code, title: r.title, color: r.color, chapitres: Number(r.chapitres) || 0,
        })));
    } catch (e) {
        if (isMissingSchema(e)) return [];
        throw e;
    }
}

/** GET /api/mon-espace/profile — avatar + progression { world: { step: stars } } + XP. */
const getMyProfile = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: "Aucune fiche stagiaire liée à ce compte." });
        let avatar = null, cadre = null, cadres_exclusifs = [], progress = {}, xp = 0, stars = 0;
        try {
            const [[l]] = await conn.query('SELECT avatar FROM learner WHERE id = ?', [learner.id]);
            avatar = (l && l.avatar) || null;
            // Cadres : requête SÉPARÉE. Ces colonnes arrivent avec la migration 113 ; dans le
            // même SELECT que l'avatar, une base où 113 n'est pas jouée aurait fait échouer la
            // requête entière et emporté l'avatar avec les cadres.
            try {
                const [[lc]] = await conn.query('SELECT cadre, cadres_exclusifs FROM learner WHERE id = ?', [learner.id]);
                cadre = (lc && lc.cadre) || null;
                cadres_exclusifs = listeCadres(lc && lc.cadres_exclusifs);
            } catch (e) { if (!isMissingSchema(e)) throw e; }
            const [rows] = await conn.query('SELECT world, step, stars FROM learner_quest_progress WHERE learner_id = ?', [learner.id]);
            for (const r of rows) {
                (progress[r.world] ||= {})[r.step] = r.stars;
                stars += r.stars; xp += r.stars * 10;
            }
        } catch (e) { if (!isMissingSchema(e)) throw e; } // migration 070 non jouée : profil vide
        /* Cadres de PIZZA QUEST, dérivés et jamais stockés (cf. lib/cadresQuest.js). Les
           recalculer à chaque lecture coûte deux requêtes et garantit qu'ils suivent la banque de
           questions : un chapitre ajouté par l'école DÉFAIT un « Monde bouclé », et c'est
           volontaire — le cadre dit « j'ai tout fait », il doit redevenir faux quand ce n'est plus
           vrai. Une liste figée en base aurait menti dès le premier chapitre ajouté. */
        const quest_cadres = await cadresQuestDuStagiaire(conn, learner, progress);
        res.json({ data: { avatar, cadre, cadres_exclusifs, progress, xp, stars, quest_cadres } });
    } catch (err) {
        console.error('Erreur profil stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/mon-espace/avatar — { avatar }. */
const saveMyAvatar = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        // Le personnel n'a pas de fiche stagiaire — en creer une pour lui polluerait les
        // effectifs, Qualiopi et les listes de session. Son avatar vit sur `user` (migration 126).
        if (!learner && !estPersonnel(req.user)) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        const avatar = req.body && req.body.avatar;
        if (avatar != null && avatar !== '') {
            const [id, color] = String(avatar).split('|'); // "id" ou "id|#rrggbb"
            if (!isKnownAvatar(id)) return res.status(422).json({ message: 'Avatar inconnu.' });
            if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(422).json({ message: 'Couleur invalide.' });
        }
        const [table, cible] = learner ? ['learner', learner.id] : ['user', req.user.id];
        try { await conn.query(`UPDATE ${table} SET avatar = ? WHERE id = ?`, [avatar || null, cible]); }
        catch (e) { if (!isMissingSchema(e)) throw e; } // migration 126 non jouee (personnel)
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur avatar stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/mon-espace/cadre — { cadre }.
 *
 * Le cadre PORTÉ, pour que les autres stagiaires le voient : jusqu'ici le choix vivait en
 * localStorage, donc la Communauté affichait à tous le cadre de parcours et jamais le choix.
 *
 * On ne vérifie PAS ici que le stagiaire possède ce cadre. C'est volontaire : la possession se
 * déduit de `completed_levels` et de `cadres_exclusifs`, deux valeurs qui bougent dans le temps
 * (une formation validée après coup, un cadre exclusif accordé puis corrigé). La règle est donc
 * appliquée À LA LECTURE, là où l'on connaît l'état du moment — un cadre choisi puis perdu
 * cesse simplement d'être affiché, sans qu'il faille repasser sur la base. Un cadre est de
 * toute façon purement décoratif : il n'ouvre aucun droit.
 *
 * On valide en revanche la FORME, sans quoi la colonne accepterait n'importe quelle chaîne.
 */
const CADRES_CONNUS = ['aucun', 'bronze', 'argent', 'or', 'braise', 'maestro',
    // Résultats de concours, du plus haut au plus spécifique. « Champion » les couvrait tous,
    // ce qui donnait le même cadre au vainqueur et au troisième.
    'champion', 'categorie', 'podium', 'prix', 'jury', 'fondateur', 'ecole'];
/* Le cadre « ecole » est le SEUL que le personnel porte, et le seul qu'un stagiaire ne peut
 * pas porter. Les cadres de parcours annoncent un nombre de formations terminees : un
 * secretariat en « Maestro » se lirait comme un stagiaire chevronne, et l'inverse — un
 * stagiaire en « ecole » — le ferait passer pour le bureau dans la Communaute. */
const CADRE_PERSONNEL = 'ecole';
const ROLES_PERSONNEL = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR'];
const estPersonnel = (u) => ROLES_PERSONNEL.includes(u?.role);
const listeCadres = (v) => String(v || '').split(',').map((x) => x.trim()).filter(Boolean);

const saveMyCadre = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner && !estPersonnel(req.user)) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        const cadre = req.body && req.body.cadre;
        // Le controle vaut DANS LES DEUX SENS : le front propose la bonne liste, mais la route
        // est ouverte a tout compte authentifie — une requete a la main contournerait l'ecran.
        if (cadre && cadre !== 'aucun') {
            const perso = String(cadre) === CADRE_PERSONNEL;
            if (perso && !estPersonnel(req.user)) {
                return res.status(403).json({ message: 'Le cadre « École » est réservé au personnel de l\'organisme.' });
            }
            if (!perso && estPersonnel(req.user)) {
                return res.status(403).json({ message: 'Les cadres de parcours récompensent des formations terminées.' });
            }
        }
        /* CADRE DE QUÊTE : « palier|#rrggbb ». Celui-là se vérifie VRAIMENT, contrairement aux
           autres — et la raison tient à la couleur. Un palier sans couleur ne dit rien de faux ;
           un « Sans faute » teinté d'une formation qu'on n'a jamais ouverte, si. La possession se
           calcule ici, à l'écriture, parce qu'elle dépend de la banque de questions du moment. */
        const q = parseCadreQuest(cadre);
        if (q.id && (PALIER_IDS.includes(q.id) || EXPLOIT_IDS.includes(q.id))) {
            if (!learner) return res.status(403).json({ message: 'Les cadres de Pizza Quest récompensent la progression d\'un stagiaire.' });
            const progress = {};
            try {
                const [rows] = await conn.query('SELECT world, step, stars FROM learner_quest_progress WHERE learner_id = ?', [learner.id]);
                for (const r of rows) (progress[r.world] ||= {})[r.step] = r.stars;
            } catch (e) { if (!isMissingSchema(e)) throw e; }
            const possedes = await cadresQuestDuStagiaire(conn, learner, progress);
            if (!possedeCadreQuest(cadre, possedes)) {
                return res.status(403).json({ message: 'Ce cadre de Pizza Quest n\'est pas encore débloqué.' });
            }
        } else if (cadre != null && cadre !== '' && !CADRES_CONNUS.includes(String(cadre))) {
            // NULL et « aucun » ne disent pas la même chose : NULL = aucun choix exprimé (on
            // retombe sur le palier), « aucun » = le choix de ne rien porter.
            return res.status(422).json({ message: 'Cadre inconnu.' });
        }
        const [tbl, ref] = learner ? ['learner', learner.id] : ['user', req.user.id];
        try { await conn.query(`UPDATE ${tbl} SET cadre = ? WHERE id = ?`, [cadre || null, ref]); }
        catch (e) { if (!isMissingSchema(e)) throw e; } // migration 113 (stagiaire) / 126 (personnel) non jouée
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur cadre stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Le catalogue admin porte des mentions de gestion entre parenthèses — « Veste brodée Molinel
 * (uniquement pour nos stagiaires) ». Utile au secrétariat, absurde côté stagiaire : ici, tout
 * le monde EST stagiaire. On les retire à l'affichage plutôt que de renommer l'article, parce
 * que la mention garde tout son sens dans l'inventaire admin.
 */
const RESERVE_RE = /\s*\((?:uniquement\s+)?(?:pour|r[ée]serv[ée]e?\s+(?:aux|à))\s+(?:nos\s+)?stagiaires?\)\s*$/i;
const cleanName = (n) => String(n || '').replace(RESERVE_RE, '').trim();

/* Articles à personnaliser : la veste Molinel est BRODÉE — sans le nom, la commande est
   inexploitable. Le déclencheur est la CATÉGORIE, pas le libellé : le jour où il y aura un
   tablier ou une casquette, ils demanderont le nom sans qu'on retouche le code. */
const PERSONALIZABLE_CATEGORIES = new Set(['Textile']);
const isPersonalizable = (cat) => PERSONALIZABLE_CATEGORIES.has(String(cat || ''));

/* Délai de fabrication du textile : la veste part chez le brodeur, elle n'est pas en rayon.
   En JOURS OUVRÉS (cf. minPickupDate) et pas calendaires — le brodeur ne travaille pas le
   week-end, donc y compter deux jours promettrait une veste qui n'existe pas.

   Ce 3 n'est pas un arrondi : il vient de la règle de l'école, « commandée avant le mardi
   soir, la veste est là pour la fin du stage ». Mardi + 3 ouvrés = vendredi ✓ ; mercredi + 3
   = le lundi suivant, le stagiaire est reparti — d'où la limite du mardi soir. Le changer,
   c'est déplacer cette limite : à 5, plus AUCUN stagiaire ne repart avec sa veste (toutes les
   formations sauf TMP durent 5 jours ou moins) et tout bascule en expédition. */
const TEXTILE_DELAI_OUVRES = 3;

/* Déclinaisons du textile. L'inventaire ne tient qu'UNE ligne « Veste brodée Molinel » — pas
   un article par taille — donc la taille se choisit à la demande. Servi au front par l'API :
   une liste recopiée dans le front finirait par diverger de ce que le serveur accepte. */
const TAILLES = ['S', 'M', 'L', 'XL'];
const COUPES = ['Femme', 'Homme'];
const variantOptions = (cat) => (isPersonalizable(cat) ? { tailles: TAILLES, coupes: COUPES } : null);
/* Une déclinaison valide, telle qu'elle sera stockée : « L · Femme ». */
const parseVariant = (v) => {
    const [t, c] = String(v || '').split('·').map((x) => x.trim());
    return TAILLES.includes(t) && COUPES.includes(c) ? `${t} · ${c}` : null;
};

/**
 * GET /api/mon-espace/boutique — le matériel que l'ÉCOLE vend (onglet prioritaire).
 * Source : `inventory_item`, le stock réel. L'école est le marchand : elle achète chez
 * gi.metal à son tarif, marge, facture et remet en main propre le dernier jour. Aucun tiers.
 * On n'expose PAS `threshold` (seuil de réappro) : c'est une info de gestion interne.
 * `quantity` sert seulement à dire « en stock » ou « sur commande » — on ne montre pas le
 * nombre, sinon un stagiaire qui voit « 2 restants » se croit chez un marchand pressé.
 */
/**
 * Quantités déjà RÉSERVÉES par les demandes en cours -> Map inventory_item_id => qty.
 *
 * Statuts retenus : tout sauf REMISE (l'article est parti, sa sortie de stock est passée en
 * caisse) et ANNULEE (la demande n'existe plus). `excludeRequestId` sert à recalculer sans
 * compter une demande précise — utile si un jour on autorise sa modification.
 * Table absente (migration 096 non jouée) → aucune réservation, on ne bloque personne.
 */
async function reservedByPendingRequests(conn, orgId, excludeRequestId = null) {
    const map = new Map();
    try {
        const [rows] = await conn.query(
            `SELECT li.inventory_item_id AS id, SUM(li.qty) AS n
             FROM shop_request_line li
             JOIN shop_request r ON r.id = li.request_id
             WHERE r.organization_id = ? AND li.source = 'ECOLE' AND li.inventory_item_id IS NOT NULL
               AND r.status NOT IN ('REMISE', 'ANNULEE')
               ${excludeRequestId ? 'AND r.id <> ?' : ''}
             GROUP BY li.inventory_item_id`,
            excludeRequestId ? [orgId, excludeRequestId] : [orgId]
        );
        for (const r of rows) map.set(r.id, Number(r.n) || 0);
    } catch (e) { if (!isMissingSchema(e)) throw e; }
    return map;
}

const getBoutique = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        // `learner_discount_pct` arrive par la 125 : sans elle, la cascade retombe sur la
        // requête d'avant et la boutique affiche le prix catalogue, comme aujourd'hui.
        let rows;
        for (const remise of ['learner_discount_pct, learner_discount_eur',
                              'NULL AS learner_discount_pct, NULL AS learner_discount_eur']) {
          try {
            [rows] = await conn.query(
              `SELECT id, name, category, unit_price, tax_rate, quantity, ${remise}
             FROM inventory_item WHERE organization_id = ? AND unit_price IS NOT NULL
             ORDER BY category, name`,
              [learner.organization_id]
            );
            break;
          } catch (e) { if (!isMissingSchema(e)) throw e; }
        }
        // Stock DISPONIBLE = stock physique − ce qui est déjà réservé par des demandes en
        // cours. Une demande ne décrémente pas l'inventaire (seule la caisse le fait, à la
        // vente) : sans cette déduction, trois stagiaires peuvent commander le même dernier
        // article et l'école se retrouve à en promettre trois. On s'arrête à REMISE :
        // l'article est alors physiquement parti et sa sortie de stock est passée en caisse
        // — le compter encore reviendrait à le déduire deux fois.
        const reserved = await reservedByPendingRequests(conn, learner.organization_id);
        const data = rows.map((r) => {
            const dispo = Math.max(0, Number(r.quantity) - (reserved.get(r.id) || 0));
            /* REMISE STAGIAIRE (migration 125). Le prix montré ici est le prix REMISÉ : c'est
             * celui que le stagiaire paiera, donc celui qui doit s'afficher. On renvoie aussi le
             * prix barré et le taux, pour que la boutique puisse montrer l'économie — une remise
             * qu'on ne voit pas ne fait plaisir à personne.
             * Arrondi au centime AVANT multiplication, comme partout ailleurs (cf. sale.controller). */
            const { brut: brutHt, net: netHt, taux, libelle } = prixStagiaire(r);
            return {
                id: r.id, name: cleanName(r.name), category: r.category,
                price_ht: netHt, tax_rate: Number(r.tax_rate),
                price_ttc: +(netHt * (1 + Number(r.tax_rate) / 100)).toFixed(2),
                // Prix catalogue + taux : présents SEULEMENT s'il y a une remise, pour que le
                // front n'ait pas à comparer deux nombres pour savoir s'il doit barrer un prix.
                ...(taux > 0 ? {
                    // `remise_label` porte la forme SAISIE (« −5,00 € » ou « −10 % »), pas le
                    // taux effectif : annoncer « −12,53 % » là où l'école a promis 5 € serait
                    // exact et incompréhensible.
                    remise_label: libelle,
                    remise_pct: taux,
                    price_ttc_avant: +(brutHt * (1 + Number(r.tax_rate) / 100)).toFixed(2),
                } : {}),
                stock: dispo,            // ce qu'il reste réellement à prendre
                in_stock: dispo > 0,
                personalizable: isPersonalizable(r.category),
                variants: variantOptions(r.category),
            };
        });
        res.json({ data });
    } catch (err) {
        console.error('Erreur boutique :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/boutique/partenaires — les offres de nos partenaires, par partenaire.
 * Ici l'école NE VEND PAS : elle présente et met en relation. D'où `price_school` à côté de
 * `price_public` — l'écart est ce qui donne au stagiaire une raison de passer par nous.
 * Un partenaire sans produit actif n'est pas renvoyé : une vitrine vide ne rend service à
 * personne, et ferait croire à un partenariat qui n'existe pas encore.
 */
const getBoutiquePartenaires = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        let rows = [];
        /* AVEC OU SANS LA CLAUSE DE CONTRAT (migration 131). Le repli d'origine renvoyait une
           VITRINE VIDE dès qu'une colonne manquait — pensé pour l'absence de `partner_product`
           (migration 095), où c'est le bon comportement. Mais appliqué à `p.contrat`, il aurait
           vidé toute la boutique partenaires tant que la 131 n'est pas jouée : une régression
           silencieuse, sur un écran que personne ne relit après une migration.
           On distingue donc les deux : sans la colonne de contrat on refait la requête SANS le
           filtre (comportement d'avant, aucun partenaire n'a d'échéance à respecter) ; sans la
           table des produits, la vitrine est bien vide. */
        const requete = (avecContrat) =>
                `SELECT pp.id, pp.name, pp.category, pp.reference, pp.price_public, pp.price_school,
                        pp.url, pp.image_url, pp.note, pp.specs,
                        p.id AS partner_id, p.name AS partner_name, p.category AS partner_category,
                        p.discount_pct, p.website
                 FROM partner_product pp
                 JOIN partner p ON p.id = pp.partner_id
                 WHERE pp.organization_id = ? AND pp.active = 1
                   /* UN CONTRAT ÉCHU RETIRE LA VITRINE (migration 131). Sans cette clause, une
                      convention arrivée à terme ne se manifeste par RIEN : ni erreur, ni alerte.
                      L'école continue de présenter les offres d'une entreprise avec qui elle n'a
                      plus d'accord, et le stagiaire se réclame d'un partenariat qui n'existe plus.
                      Le partenaire n'est pas supprimé pour autant — sa fiche, ses commissions et
                      son historique restent : c'est un retrait, pas un effacement. */
                   ${avecContrat ? `AND ${CONTRAT_VALABLE('p')}` : ''}
                 -- PAS « ORDER BY p.category » : c'est un ENUM, et MySQL trie les ENUM par ordre
                 -- de DÉCLARATION, pas alphabétiquement. Or 'MATERIEL' y est déclaré avant 'FOUR'
                 -- — le stagiaire tombait donc sur une trancheuse à jambon avant les fours. Cet
                 -- ordre-là est celui de l'annuaire des fournisseurs ; ici on équipe une pizzeria,
                 -- et le four est la décision la plus lourde. On impose donc l'ordre de la vitrine.
                 ORDER BY CASE p.category WHEN 'FOUR' THEN 1 WHEN 'MATERIEL' THEN 2 ELSE 3 END,
                          p.name, pp.sort_order, pp.name`;
        try {
            [rows] = await conn.query(requete(true), [learner.organization_id]);
        } catch (e) {
            if (!isMissingSchema(e)) throw e;
            try {
                [rows] = await conn.query(requete(false), [learner.organization_id]);
            } catch (e2) {
                if (isMissingSchema(e2)) return res.json({ data: [] }); // migration 095 non jouée
                throw e2;
            }
        }
        // Regroupé PAR PARTENAIRE : c'est l'entrée demandée côté stagiaire (« chez qui ? »),
        // pas par catégorie — un four et une pelle ne se comparent pas.
        const byPartner = new Map();
        for (const r of rows) {
            if (!byPartner.has(r.partner_id)) {
                byPartner.set(r.partner_id, {
                    partner_id: r.partner_id, partner_name: r.partner_name,
                    partner_category: r.partner_category, discount_pct: r.discount_pct,
                    website: r.website, products: [],
                });
            }
            byPartner.get(r.partner_id).products.push({
                id: r.id, name: r.name, category: r.category, reference: r.reference,
                price_public: r.price_public == null ? null : Number(r.price_public),
                price_school: r.price_school == null ? null : Number(r.price_school),
                url: r.url, image_url: r.image_url, note: r.note,
                // specs est une colonne JSON : selon le driver elle arrive déjà en objet, ou en
                // chaîne à parser. On tolère les deux plutôt que de supposer.
                specs: r.specs == null ? null : (typeof r.specs === 'string' ? JSON.parse(r.specs) : r.specs),
                prix: [], // rempli juste après par les relevés revendeurs
            });
        }

        // Les prix constatés chez les revendeurs (comparateur). Table séparée, une requête à
        // part : un four a plusieurs prix, un bac n'en a aucun. On les attache aux produits par
        // id. `min`/`max` sont l'argument du comparateur — l'écart entre revendeurs.
        const ids = rows.map((r) => r.id);
        if (ids.length) {
            let prixRows = [];
            try {
                [prixRows] = await conn.query(
                    `SELECT partner_product_id, reseller, url, price_ht, includes_install, seen_at
                     FROM partner_product_price WHERE partner_product_id IN (?)
                     ORDER BY price_ht`, [ids]);
            } catch (e) {
                if (!isMissingSchema(e)) throw e; // migration 097 non jouée : on sert sans prix
            }
            const parProduit = new Map();
            for (const pr of prixRows) {
                if (!parProduit.has(pr.partner_product_id)) parProduit.set(pr.partner_product_id, []);
                parProduit.get(pr.partner_product_id).push({
                    reseller: pr.reseller, url: pr.url, price_ht: Number(pr.price_ht),
                    includes_install: !!pr.includes_install,
                    seen_at: pr.seen_at instanceof Date ? pr.seen_at.toISOString().slice(0, 10) : String(pr.seen_at).slice(0, 10),
                });
            }
            for (const g of byPartner.values()) {
                for (const prod of g.products) {
                    const l = parProduit.get(prod.id) || [];
                    prod.prix = l;
                    prod.prix_min = l.length ? l[0].price_ht : null;         // trié par price_ht
                    prod.prix_max = l.length ? l[l.length - 1].price_ht : null;
                }
            }
        }
        res.json({ data: [...byPartner.values()] });
    } catch (err) {
        console.error('Erreur offres partenaires :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * Référence lisible d'une demande : EPJJD-2026-0042.
 * Lisible et DICTABLE : le stagiaire la donne au téléphone, l'école la retrouve. Un uuid ne
 * se dicte pas. Le compteur repart à 1 chaque année, par organisation.
 */
async function nextShopRef(conn, orgId) {
    const year = new Date().getFullYear();
    const [[org]] = await conn.query('SELECT code FROM organization WHERE id = ? LIMIT 1', [orgId]);
    const code = String((org && org.code) || 'EP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'EP';
    const prefix = `${code}-${year}-`;
    const [[last]] = await conn.query(
        'SELECT ref FROM shop_request WHERE organization_id = ? AND ref LIKE ? ORDER BY ref DESC LIMIT 1',
        [orgId, `${prefix}%`]
    );
    const n = last ? Number(String(last.ref).slice(prefix.length)) + 1 : 1;
    return prefix + String(n).padStart(4, '0');
}

/**
 * GET /api/mon-espace/boutique/creneaux?textile=1 — les créneaux de retrait des 10 prochaines
 * semaines. 10 et pas 4 : le calendrier laisse naviguer sur deux mois, il lui faut de quoi les
 * remplir. C'est l'API qui les calcule, PAS le front : une table d'horaires recopiée des deux
 * côtés finit par diverger, et le stagiaire se voit refuser un créneau qu'on venait de lui
 * proposer.
 *
 * `textile=1` = le panier contient un article brodé → on n'ouvre qu'à partir du délai de
 * fabrication. Le front grise ainsi les jours trop proches AU LIEU de laisser choisir puis
 * refuser à l'envoi.
 */
const getPickupSlots = async (req, res) => {
    try {
        const textile = req.query.textile === '1';
        const minDate = textile ? minPickupDate(TEXTILE_DELAI_OUVRES) : null;
        const days = [];
        const d = new Date(); d.setHours(12, 0, 0, 0); // midi : à l'abri des bascules d'heure d'été
        for (let i = 0; i < 70; i++) {
            d.setDate(d.getDate() + 1); // à partir de demain : préparer une commande prend un jour
            const slots = slotsForDay(d.getDay());
            if (!slots.length) continue; // fermé : on ne renvoie pas le jour du tout
            // Date LOCALE assemblée à la main — toISOString() repasserait en UTC et
            // décalerait le jour (cf. lib/horaires.js).
            const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            if (minDate && date < minDate) continue; // trop tôt pour une broderie
            days.push({ date, dow: d.getDay(), slots });
        }
        res.json({ data: days, min_date: minDate, delai_ouvres: textile ? TEXTILE_DELAI_OUVRES : 0 });
    } catch (err) {
        console.error('Erreur créneaux :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/mon-espace/boutique/demande — le panier validé devient une demande.
 * Body : { lines: [{ source, id, qty }], note }
 * Pas de paiement : le stagiaire retire à l'école et paie sur place (cf. `invoice`).
 * Les libellés et prix sont RELUS EN BASE puis figés dans la demande — jamais pris du client :
 * sinon n'importe qui poste un prix de 1 € et l'école facture ce qu'on lui a dicté.
 */
const createShopRequest = async (req, res) => {
    const conn = db.promise();
    try {
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        const lines = Array.isArray(req.body && req.body.lines) ? req.body.lines : [];
        if (!lines.length) return res.status(422).json({ message: 'Demande vide.' });
        if (lines.length > 50) return res.status(422).json({ message: 'Trop d’articles (50 maximum).' });

        const resolved = [];
        for (const l of lines) {
            const qty = Math.max(1, Math.min(99, Number(l.qty) || 1));
            if (l.source === 'PARTENAIRE') {
                const [[p]] = await conn.query(
                    'SELECT id, name, price_school, price_public FROM partner_product WHERE id = ? AND organization_id = ? AND active = 1',
                    [l.id, learner.organization_id]
                );
                if (!p) continue; // article retiré entre-temps : on l'ignore plutôt que de tout refuser
                const price = p.price_school != null ? p.price_school : p.price_public;
                resolved.push({ source: 'PARTENAIRE', pprod: p.id, item: null, label: p.name, qty,
                    price: price == null ? null : Number(price), tax: 20, perso: null, variant: null, brodable: false });
            } else {
                const [[it]] = await conn.query(
                    `SELECT id, name, category, unit_price, tax_rate, ${await colInventaire(conn, 'learner_discount_eur') ? 'learner_discount_pct, learner_discount_eur' : 'NULL AS learner_discount_pct, NULL AS learner_discount_eur'} FROM inventory_item WHERE id = ? AND organization_id = ?`,
                    [l.id, learner.organization_id]
                );
                if (!it || it.unit_price == null) continue;
                // Broderie et taille n'existent que pour le textile. On les IGNORE ailleurs au
                // lieu de recopier ce que le client envoie : sinon une pelle postée avec un
                // `personalization` afficherait un ordre de broderie sur un manche de louche —
                // et lui collerait les 5 jours ouvrés de délai, pour rien.
                const brodable = isPersonalizable(it.category);
                const perso = brodable ? String(l.personalization || '').trim().slice(0, 120) : '';
                const variant = brodable ? parseVariant(l.variant) : null;
                if (brodable) {
                    // Un article brodé sans nom est inexploitable : on refuse plutôt que de créer
                    // une demande que l'école devra courir après par téléphone. Sans le nom, la
                    // veste part chez le brodeur sans savoir quoi broder ; sans la taille,
                    // l'école ne sait pas laquelle sortir du carton.
                    if (!perso) return res.status(422).json({ message: `« ${cleanName(it.name)} » est brodé : indique le nom et le prénom.` });
                    if (!variant) return res.status(422).json({ message: `« ${cleanName(it.name)} » : choisis la taille et la coupe.` });
                }
                /* REMISE STAGIAIRE (125), APPLIQUÉE ICI ET PAS SEULEMENT À L'AFFICHAGE. Le prix
                 * retenu vient de la base, jamais du panier — un panier trafiqué ne peut donc pas
                 * imposer son prix. On fige aussi le taux et le prix catalogue sur la ligne : le
                 * stagiaire a vu un prix, c'est celui-là qui l'engage même si l'école change sa
                 * remise le lendemain. Le brut sert ensuite à la colonne « Remise » de la facture. */
                const { brut, net, taux: tauxStag } = prixStagiaire(it);
                resolved.push({ source: 'ECOLE', pprod: null, item: it.id, label: cleanName(it.name), qty,
                    price: net, brut, remise: tauxStag, tax: Number(it.tax_rate), perso: perso || null, variant, brodable });
            }
        }
        if (!resolved.length) return res.status(422).json({ message: 'Aucun article valide dans la demande.' });

        // STOCK — contrôle qui fait autorité. Le panier plafonne déjà les quantités à l'écran,
        // mais c'est du confort : rien n'empêche de poster la requête à la main. On revalide
        // donc ici, sur le stock DISPONIBLE (physique − déjà réservé par les demandes en cours).
        //
        // On additionne PAR ARTICLE et pas par ligne : une veste en M et la même en L font deux
        // lignes (la déclinaison les sépare) mais puisent dans le même article d'inventaire.
        // Vérifier ligne par ligne laisserait passer 2 vestes quand il n'en reste qu'une.
        {
            const reserved = await reservedByPendingRequests(conn, learner.organization_id);
            const wanted = new Map();
            for (const r of resolved) {
                if (r.source !== 'ECOLE' || !r.item) continue; // le partenaire vend son propre stock
                wanted.set(r.item, (wanted.get(r.item) || 0) + r.qty);
            }
            if (wanted.size) {
                const [stocks] = await conn.query(
                    'SELECT id, name, quantity FROM inventory_item WHERE organization_id = ? AND id IN (?)',
                    [learner.organization_id, [...wanted.keys()]]
                );
                for (const it of stocks) {
                    const dispo = Math.max(0, Number(it.quantity) - (reserved.get(it.id) || 0));
                    const veut = wanted.get(it.id) || 0;
                    if (veut > dispo) {
                        const nom = cleanName(it.name);
                        return res.status(409).json({
                            message: dispo === 0
                                ? `« ${nom} » vient de partir : il n'y en a plus de disponible. Retire-le de ton panier.`
                                : `« ${nom} » : il n'en reste que ${dispo}. Ajuste la quantité (tu en demandes ${veut}).`,
                        });
                    }
                }
            }
        }

        // Créneau de retrait : facultatif, mais s'il est là il doit tomber pendant les
        // heures d'ouverture. On revalide côté serveur — le front peut avoir une vieille
        // version en cache, ou quelqu'un poster directement.
        const pickup = (req.body && req.body.pickup_at) || null;
        const chk = isOpenAt(pickup);
        if (!chk.ok) return res.status(422).json({ message: chk.reason });
        // Délai de broderie : revalidé ici, le front peut être en cache ou contourné.
        if (pickup && resolved.some((r) => r.brodable)) {
            const min = minPickupDate(TEXTILE_DELAI_OUVRES);
            if (String(pickup).slice(0, 10) < min) {
                return res.status(422).json({ message: `Le textile est brodé sur commande : compte ${TEXTILE_DELAI_OUVRES} jours ouvrés. Le retrait n’est possible qu’à partir du ${min.split('-').reverse().join('/')}.` });
            }
        }

        /* PAS DE CHOIX DE DESTINATAIRE ICI. Le stagiaire commande, il ne décide pas qui sera
         * facturé : c'est l'école qui sait si l'employeur prend en charge, et elle le tranche à
         * l'émission (cf. shopRequest.controller, modale de facturation). Lui poser la question
         * au panier l'obligerait à connaître un accord commercial qui ne le regarde pas, et
         * l'école devrait de toute façon revérifier derrière. */
        const ref = await nextShopRef(conn, learner.organization_id);
        await conn.query(
            'INSERT INTO shop_request (id, organization_id, learner_id, ref, note, pickup_at) VALUES (uuid(), ?, ?, ?, ?, ?)',
            [learner.organization_id, learner.id, ref, String((req.body && req.body.note) || '').slice(0, 500) || null,
             pickup ? String(pickup).slice(0, 16).replace('T', ' ') + ':00' : null]
        );
        const [[created]] = await conn.query('SELECT id FROM shop_request WHERE ref = ? LIMIT 1', [ref]);
        for (let i = 0; i < resolved.length; i++) {
            const r = resolved[i];
            // Taux et prix catalogue figés SUR LA LIGNE quand la 125 est jouée : c'est ce qui
            // permettra à la facture d'afficher la remise consentie plutôt qu'un prix nu.
            const lc = ['id', 'request_id', 'source', 'inventory_item_id', 'partner_product_id', 'label',
                'qty', 'unit_price_ht', 'tax_rate', 'personalization', 'variant', 'sort_order'];
            const lv = [created.id, r.source, r.item, r.pprod, r.label, r.qty, r.price, r.tax, r.perso, r.variant, i];
            if (r.remise > 0 && await colLigneDemande(conn, 'discount_pct')) {
                lc.push('discount_pct', 'unit_price_gross_ht');
                lv.push(r.remise, r.brut);
            }
            await conn.query(
                `INSERT INTO shop_request_line (${lc.join(', ')}) VALUES (uuid(), ${lc.slice(1).map(() => '?').join(', ')})`,
                lv
            );
        }
        // Prévient le secrétariat : sans cela, une commande n'existait QUE dans l'écran
        // « Demandes boutique », qu'il fallait penser à ouvrir. La pastille du menu comptait
        // bien les demandes en cours, mais rien ne signalait l'arrivée d'une nouvelle — un
        // stagiaire pouvait commander le vendredi soir et attendre le mardi qu'on la remarque.
        // `user_id` nul : visible par tout l'organisme, comme les autres notifications de suivi.
        const nomStagiaire = [learner.first_name, learner.last_name].filter(Boolean).join(' ').trim();
        const nbArticles = resolved.reduce((s, r) => s + (Number(r.qty) || 0), 0);
        const totalTTC = resolved.reduce(
            (s, r) => s + (Number(r.price) || 0) * (Number(r.qty) || 0) * (1 + (Number(r.tax) || 0) / 100), 0);
        const quand = pickup
            ? ` · retrait le ${String(pickup).slice(0, 10).split('-').reverse().join('/')}`
            : '';
        // ATTENDUE avant de répondre : la réponse déclenche la diffusion SSE, et les postes
        // rechargent aussitôt. Sans cette attente, la notification peut n'être pas encore
        // enregistrée à ce moment — le son et la cloche arriveraient au sondage suivant.
        await notify(learner.organization_id, {
            type: 'BOUTIQUE',
            title: 'Nouvelle commande boutique',
            body: `${nomStagiaire || 'Un stagiaire'} · ${nbArticles} article${nbArticles > 1 ? 's' : ''}`
                + ` · ${totalTTC.toFixed(2).replace('.', ',')} € TTC · réf ${ref}${quand}`,
            link: '/demandes-boutique',
        });

        res.status(201).json({ success: true, ref, id: created.id });
    } catch (err) {
        if (isMissingSchema(err)) return res.status(503).json({ message: 'Migration 096 non jouée : boutique indisponible.' });
        console.error('Erreur demande boutique :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/mon-espace/boutique/mes-demandes — le suivi côté stagiaire. */
const getMyShopRequests = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        let rows = [];
        try {
            [rows] = await conn.query(
                // DATE_FORMAT et pas `r.pickup_at` brut : le driver rendrait un objet Date, que
                // res.json() sérialise en UTC (« …T10:00:00.000Z » pour un rendez-vous de 12h00).
                // Le front y découpe l'heure telle quelle et affichait 10:00 — deux heures avant
                // l'heure réelle, sur un rendez-vous physique. On renvoie donc la MÊME forme que
                // celle qu'on accepte à l'écriture : heure locale, sans Z (cf. lib/horaires.js).
                `SELECT r.id, r.ref, r.status, r.note,
                        DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i') AS created_at,
                        DATE_FORMAT(r.pickup_at, '%Y-%m-%dT%H:%i') AS pickup_at,
                        l.source, l.label, l.qty, l.unit_price_ht, l.tax_rate, l.personalization, l.variant
                 FROM shop_request r LEFT JOIN shop_request_line l ON l.request_id = r.id
                 WHERE r.learner_id = ? ORDER BY r.created_at DESC, l.sort_order`,
                [learner.id]
            );
        } catch (e) { if (isMissingSchema(e)) return res.json({ data: [] }); throw e; }
        const byId = new Map();
        for (const r of rows) {
            if (!byId.has(r.id)) byId.set(r.id, { id: r.id, ref: r.ref, status: r.status, note: r.note, pickup_at: r.pickup_at, created_at: r.created_at, lines: [] });
            if (r.label) byId.get(r.id).lines.push({ source: r.source, label: r.label, qty: r.qty,
                unit_price_ht: r.unit_price_ht == null ? null : Number(r.unit_price_ht), tax_rate: Number(r.tax_rate),
                personalization: r.personalization, variant: r.variant });
        }
        res.json({ data: [...byId.values()] });
    } catch (err) {
        console.error('Erreur mes demandes :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* Les CŒURS de Pizza Quest ont été supprimés (2026-07-28). Ils bloquaient la révision après
   un échec — punir quelqu'un qui veut réviser est absurde dans une école. Sont partis avec :
   `lib/questlives.js`, les routes /quest/vies, l'écran d'administration, les colonnes
   `organization.quest_max_hearts` / `quest_regen_minutes` et la table `learner_quest_life`
   (migration 115). La progression se lit désormais aux CADRES, gagnés sur les formations
   terminées. */


/**
 * PUT /api/mon-espace/boutique/demande/:id/annuler — le stagiaire annule SA demande.
 *
 * Autorisé uniquement tant que l'école n'a rien engagé, c'est-à-dire au statut NOUVELLE
 * (« Reçue ») : dès la préparation, du textile a pu partir à la broderie et l'annulation
 * se règle de vive voix, pas d'un clic.
 *
 * Le garde-fou vit dans le WHERE, pas dans un `if` précédé d'un SELECT : deux onglets
 * ouverts (ou l'école passant la demande en préparation au même instant) suffiraient
 * sinon à annuler une demande déjà engagée. Ici, l'UPDATE ne touche la ligne que si elle
 * appartient TOUJOURS à ce stagiaire ET qu'elle est TOUJOURS en NOUVELLE.
 */
const cancelMyShopRequest = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        let r;
        try {
            [r] = await conn.query(
                `UPDATE shop_request SET status = 'ANNULEE'
                 WHERE id = ? AND learner_id = ? AND organization_id = ?
                   AND status = 'NOUVELLE' AND invoice_id IS NULL`,
                [req.params.id, learner.id, learner.organization_id]
            );
        } catch (e) {
            if (isMissingSchema(e)) return res.status(503).json({ message: 'Boutique indisponible.' });
            throw e;
        }
        if (!r.affectedRows) {
            // Demande inexistante, appartenant à quelqu'un d'autre, ou déjà avancée : même
            // réponse dans les trois cas — on ne renseigne pas sur l'existence d'une demande.
            return res.status(409).json({ message: "Cette demande ne peut plus être annulée. Contacte l'école si besoin." });
        }
        res.json({ success: true, message: 'Demande annulée.' });
    } catch (err) {
        console.error('Erreur annulation demande :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/mon-espace/avatar-image — photo de profil (visage, logo…).
 * Le NAVIGATEUR a déjà recadré en carré 500x500 et compressé : on ne fait que valider et
 * stocker. Aucun traitement d'image côté serveur (pas de sharp à installer).
 * Pose learner.avatar = « img » pour que le profil bascule sur la photo.
 */
const saveMyAvatarImage = async (req, res) => {
    try {
        const f = req.file;
        if (!f || !f.buffer || !f.buffer.length) return res.status(422).json({ message: 'Image requise.' });
        // Le carré 500x500 compressé tient très largement sous 300 Ko ; au-delà, c'est que
        // l'image n'est pas passée par le recadrage du navigateur.
        if (f.buffer.length > 300 * 1024) return res.status(413).json({ message: 'Image trop lourde (300 Ko maximum).' });
        const mime = String(f.mimetype || '');
        if (!['image/webp', 'image/jpeg', 'image/png'].includes(mime)) {
            return res.status(415).json({ message: 'Format accepté : WebP, JPEG ou PNG.' });
        }
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });

        await conn.query(
            `INSERT INTO learner_avatar (learner_id, organization_id, mime, bytes) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE mime = VALUES(mime), bytes = VALUES(bytes)`,
            [learner.id, learner.organization_id, mime, f.buffer]
        );
        // On garde la couleur de fond déjà choisie, s'il y en a une.
        const color = String(req.body && req.body.color ? req.body.color : '');
        const value = /^#[0-9a-fA-F]{6}$/.test(color) ? `img|${color}` : 'img';
        await conn.query('UPDATE learner SET avatar = ? WHERE id = ?', [value, learner.id]);
        res.json({ success: true, avatar: value });
    } catch (err) {
        if (isMissingSchema(err)) return res.status(503).json({ message: 'Migration 094 non jouée : photo de profil indisponible.' });
        console.error('Erreur photo de profil :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/avatar-image/:learnerId — sert la photo.
 * Ouvert à tout compte authentifié de l'ORGANISATION : les avatars s'affichent dans la
 * communauté, donc chacun voit ceux des autres — mais pas ceux d'un autre organisme.
 */
const getAvatarImage = async (req, res) => {
    try {
        const conn = db.promise();
        const me = await learnerForUser(conn, req.user.id);
        const orgId = (me && me.organization_id) || (req.user && req.user.organization_id);
        if (!orgId) return res.status(404).end();
        const [[row]] = await conn.query(
            'SELECT mime, bytes, updated_at FROM learner_avatar WHERE learner_id = ? AND organization_id = ? LIMIT 1',
            [req.params.learnerId, orgId]
        );
        if (!row) return res.status(404).end();
        // ETag sur la date de mise à jour : l'image ne bouge qu'au changement de photo, et
        // la communauté en affiche beaucoup — sans ça, on la retélécharge à chaque écran.
        const etag = `W/"${new Date(row.updated_at).getTime()}"`;
        if (req.headers['if-none-match'] === etag) return res.status(304).end();
        res.set('Content-Type', row.mime);
        res.set('Cache-Control', 'private, max-age=0, must-revalidate');
        res.set('ETag', etag);
        res.send(row.bytes);
    } catch (err) {
        if (isMissingSchema(err)) return res.status(404).end();
        console.error('Erreur lecture photo de profil :', err);
        res.status(500).end();
    }
};

/** DELETE /api/mon-espace/avatar-image — retire la photo, retour aux avatars illustrés. */
const deleteMyAvatarImage = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        await conn.query('DELETE FROM learner_avatar WHERE learner_id = ?', [learner.id]);
        await conn.query("UPDATE learner SET avatar = NULL WHERE id = ? AND avatar LIKE 'img%'", [learner.id]);
        res.json({ success: true });
    } catch (err) {
        if (isMissingSchema(err)) return res.json({ success: true }); // rien à supprimer
        console.error('Erreur suppression photo de profil :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/mon-espace/quest — { progress: { world: { step: stars } } } (upsert, meilleur score). */
/**
 * DELETE /api/mon-espace/quest — efface TOUTE la progression Pizza Quest du stagiaire.
 *
 * POURQUOI CETTE ROUTE EXISTE. `saveMyQuest` écrit avec `GREATEST(stars, VALUES(stars))` : une
 * étoile ne redescend jamais, c'est voulu — on ne perd pas un acquis en rejouant moins bien. Il
 * n'y avait donc AUCUN moyen de remettre à zéro, ni pour tester, ni pour un stagiaire qui veut
 * reprendre son entraînement à blanc.
 *
 * ELLE N'EFFACE QUE SES PROPRES LIGNES : `learner_id` vient du compte connecté, jamais du corps
 * de la requête. Personne ne peut remettre à zéro quelqu'un d'autre, même en forgeant l'appel.
 *
 * LE CADRE PORTÉ TOMBE AVEC. Les cadres de quête se déduisent de la progression : sans elle ils
 * ne sont plus possédés, et le serveur refuserait de les réenregistrer. Le laisser en base
 * afficherait un « Sans faute » que plus rien ne justifie — la possession n'étant revérifiée
 * qu'à l'écriture, il resterait visible dans la Communauté.
 */
const resetMyQuest = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        try {
            await conn.query('DELETE FROM learner_quest_progress WHERE learner_id = ?', [learner.id]);
        } catch (e) { if (!isMissingSchema(e)) throw e; } // migration 070 non jouée : rien à effacer
        // Le cadre n'est remis à zéro QUE s'il venait de la quête : un Bronze ou un Fondateur ne
        // doit rien à Pizza Quest, et les effacer serait un dégât collatéral.
        try {
            const [[l]] = await conn.query('SELECT cadre FROM learner WHERE id = ?', [learner.id]);
            const { id } = parseCadreQuest(l && l.cadre);
            if (PALIER_IDS.includes(id) || EXPLOIT_IDS.includes(id)) {
                await conn.query('UPDATE learner SET cadre = NULL WHERE id = ?', [learner.id]);
            }
        } catch (e) { if (!isMissingSchema(e)) throw e; }
        logAudit(req, 'quest.reset', 'Learner', learner.id);
        res.json({ success: true, message: 'Progression Pizza Quest effacée.' });
    } catch (err) {
        console.error('Erreur remise à zéro Pizza Quest :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const saveMyQuest = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire.' });
        const progress = (req.body && req.body.progress) || {};
        try {
            for (const [world, steps] of Object.entries(progress)) {
                if (!steps || typeof steps !== 'object') continue;
                for (const [step, starsRaw] of Object.entries(steps)) {
                    const stars = Math.max(0, Math.min(3, parseInt(starsRaw, 10) || 0));
                    await conn.query(
                        `INSERT INTO learner_quest_progress (id, organization_id, learner_id, world, step, stars)
                         VALUES (?, ?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE stars = GREATEST(stars, VALUES(stars))`,
                        [crypto.randomUUID(), learner.organization_id, learner.id, String(world).slice(0, 60), String(step).slice(0, 60), stars]
                    );
                }
            }
        } catch (e) { if (!isMissingSchema(e)) throw e; } // migration 070 non jouée : no-op
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur progression Pizza Quest :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// --- Infos personnelles du stagiaire (modifiables par lui, visibles de l'organisme) ---
// Champs que le stagiaire peut mettre à jour lui-même (l'e-mail et le mot de passe passent par /auth).
const INFO_FIELDS = ['civility', 'first_name', 'last_name', 'phone', 'birth_place'];
const clean = (v) => (v == null ? null : String(v).trim().slice(0, 255) || null);

// Visibilité du profil communauté : ce que les autres stagiaires peuvent voir.
// Par défaut : entreprise visible, téléphone et e-mail masqués.
const parseVisibility = (raw) => {
    let v = raw; if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
    v = v || {};
    return { company: v.company !== false, phone: v.phone === true, email: v.email === true };
};

/** GET /api/mon-espace/infos — infos personnelles + entreprise + réglages de visibilité. */
const getMyInfos = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        const [[u]] = await conn.query('SELECT email FROM user WHERE id = ?', [req.user.id]);
        const base = { email: (u && u.email) || '' };
        INFO_FIELDS.forEach((f) => { base[f] = (learner && learner[f]) || ''; });
        base.birthday = learner && learner.birthday ? new Date(learner.birthday).toISOString().slice(0, 10) : '';
        // Entreprise (modifiable par le stagiaire) + visibilité.
        base.company = ''; base.company_address = ''; base.company_zip = ''; base.company_town = '';
        base.visibility = parseVisibility(null);
        if (learner && learner.company_id) {
            try {
                const [[c]] = await conn.query('SELECT name, address, zip_code, town FROM company WHERE id = ?', [learner.company_id]);
                if (c) { base.company = c.name || ''; base.company_address = c.address || ''; base.company_zip = c.zip_code || ''; base.company_town = c.town || ''; }
            } catch { /* ignore */ }
        }
        try { const [[lv]] = await conn.query('SELECT profile_visibility FROM learner WHERE id = ?', [learner ? learner.id : null]); if (lv) base.visibility = parseVisibility(lv.profile_visibility); } catch { /* migration 075 non jouée */ }
        res.json({ data: base });
    } catch (err) {
        console.error('Erreur lecture infos stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/mon-espace/consentements — l'état courant, finalité par finalité.
 *
 * `accorde: null` veut dire JAMAIS DEMANDÉ, et c'est la seule chose qui déclenche la fenêtre côté
 * écran. Un refus rend `false` : il est mémorisé, et on ne redemande pas. Redemander à chaque
 * connexion après un refus rendrait le consentement non « libre » — les gens finissent par
 * accepter pour avoir la paix, et un consentement arraché ne couvre rien.
 */
const getMyConsents = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        // Pas de fiche stagiaire (personnel de l'organisme) : rien à demander.
        if (!learner) return res.json({ data: null });
        const etat = await consentements.etatCourant(conn, learner.organization_id, learner.id);
        res.json({ data: etat });   // `null` si la migration 130 n'est pas jouée
    } catch (err) {
        console.error('Erreur consentements :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * PUT /api/mon-espace/consentements/:finalite — enregistre une réponse.
 *
 * AJOUTE UNE LIGNE, ne modifie jamais la précédente : il faut pouvoir démontrer l'état au moment
 * de chaque transmission passée. Accepter puis retirer son accord ne doit pas rendre indéfendable
 * un envoi qui était licite le jour où il a été fait.
 */
const setMyConsent = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.status(404).json({ message: 'Aucune fiche stagiaire liée à ce compte.' });
        if (typeof req.body?.accorde !== 'boolean') {
            // On EXIGE un booléen : « ni oui ni non » ne doit pas pouvoir s'enregistrer comme un
            // refus par défaut. Fermer la fenêtre sans répondre n'appelle aucune écriture.
            return res.status(422).json({ message: 'Réponse attendue : accepté ou refusé.' });
        }
        const r = await consentements.enregistrer(conn, {
            orgId: learner.organization_id, learnerId: learner.id,
            finalite: req.params.finalite, accorde: req.body.accorde, source: 'espace_stagiaire',
        });
        if (!r.ok) return res.status(409).json({ message: r.message });
        /* `logAudit(req, action, entity, entityId)` — QUATRE ARGUMENTS À PLAT, pas un objet. Une
           première version passait ici `{ action, entity, after }` : la colonne `action` recevait
           « [object Object] » et l'entité restait vide, si bien que la trace d'audit d'une décision
           de consentement ne désignait plus personne. La réponse elle-même est dans le registre ;
           l'audit dit seulement QUI a écrit QUOI, et QUAND — c'est ce qu'on relit quand un
           stagiaire conteste avoir répondu. D'où le sens de la décision dans le nom de l'action. */
        logAudit(req, `consent.${req.body.accorde ? 'accorde' : 'refuse'}.${req.params.finalite}`,
            'Learner', learner.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur enregistrement consentement :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/mon-espace/visibility — enregistre ce que les autres stagiaires voient. */
const updateMyVisibility = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        if (!learner) return res.json({ success: true });
        const vis = parseVisibility(req.body && req.body.visibility);
        try {
            await conn.query('UPDATE learner SET profile_visibility = ? WHERE id = ?', [JSON.stringify(vis), learner.id]);
        } catch (e) { return res.status(422).json({ message: 'Réglage de visibilité non initialisé (migration 075).' }); }
        res.json({ success: true, visibility: vis });
    } catch (err) {
        console.error('Erreur visibilité profil :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/mon-espace/infos — met à jour les infos perso (learner + user, donc visibles de l'organisme). */
const updateMyInfos = async (req, res) => {
    try {
        const conn = db.promise();
        const learner = await learnerForUser(conn, req.user.id);
        const b = req.body || {};
        const vals = {};
        INFO_FIELDS.forEach((f) => { if (b[f] !== undefined) vals[f] = clean(b[f]); });
        const birthday = b.birthday !== undefined ? (b.birthday ? String(b.birthday).slice(0, 10) : null) : undefined;
        if (learner) {
            const sets = Object.keys(vals).map((f) => `${f} = ?`);
            const params = Object.values(vals);
            if (birthday !== undefined) { sets.push('birthday = ?'); params.push(birthday); }
            if (sets.length) await conn.query(`UPDATE learner SET ${sets.join(', ')} WHERE id = ?`, [...params, learner.id]);
        }
        // Miroir sur le compte utilisateur (certaines vues organisme s'appuient dessus).
        const uSets = []; const uParams = [];
        if (vals.first_name !== undefined) { uSets.push('first_name = ?'); uParams.push(vals.first_name); }
        if (vals.last_name !== undefined) { uSets.push('last_name = ?'); uParams.push(vals.last_name); }
        if (vals.phone !== undefined) { uSets.push('phone = ?'); uParams.push(vals.phone); }
        if (uSets.length) await conn.query(`UPDATE user SET ${uSets.join(', ')} WHERE id = ?`, [...uParams, req.user.id]);
        // Entreprise du stagiaire : mise à jour, ou création si aucune n'est encore liée.
        if (learner) {
            const cvals = {};
            if (b.company_name !== undefined) cvals.name = clean(b.company_name);
            if (b.company_address !== undefined) cvals.address = clean(b.company_address);
            if (b.company_zip !== undefined) cvals.zip_code = clean(b.company_zip);
            if (b.company_town !== undefined) cvals.town = clean(b.company_town);
            if (Object.keys(cvals).length) {
                if (learner.company_id) {
                    const cs = Object.keys(cvals).map((k) => `${k} = ?`);
                    await conn.query(`UPDATE company SET ${cs.join(', ')} WHERE id = ?`, [...Object.values(cvals), learner.company_id]);
                } else if (cvals.name) {
                    const cid = crypto.randomUUID();
                    const cols = Object.keys(cvals);
                    await conn.query(
                        `INSERT INTO company (id, organization_id, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
                        [cid, learner.organization_id, ...Object.values(cvals)]);
                    await conn.query('UPDATE learner SET company_id = ? WHERE id = ?', [cid, learner.id]);
                }
            }
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur mise à jour infos stagiaire :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Union des deux branches : getMyAccess (branche « Mes accès ») + tout le bloc boutique/avatar.
module.exports = {
    getMyConsents, setMyConsent,
    saveMyCadre, getMonEspace, getMyAccess, markCommunitySeen, getMyFormations, getMyFormation, getMyEmargement, signMyEmargement, getMyProfile, saveMyAvatar, saveMyAvatarImage, getAvatarImage, deleteMyAvatarImage, saveMyQuest, resetMyQuest, getMyInfos, updateMyInfos, updateMyVisibility, getBoutique, getBoutiquePartenaires, createShopRequest, getMyShopRequests, cancelMyShopRequest, getPickupSlots,
};
