const db = require('../config/database.js');
const { computeDocParcours, companyParcours } = require('../lib/parcours.js');
const { avancementDossiers } = require('../lib/avancement.js');
const { getEnabledFields, loadDossierFactsMap, loadConditionMap } = require('../lib/conditions.js');
const { loadEquivalences, equivalenceMap } = require('../lib/equivalence.js');
const { enrollmentSteps, formationSteps } = require('./formationProgram.controller.js');
const { logAudit } = require('../lib/audit.js');
const { aRanger, aServir, mesureDisponible } = require('../lib/coffre.js'); // coffre chiffré AU REPOS
const { colonneExiste } = require('../lib/colonnes.js');
const { decryptBytes } = require('../lib/crypto.js');
const { ecrivainZip } = require('../lib/zip.js');
const { placesDansLArchive, offertsDesFormations, lireArbre, normaliserTitre } = require('../lib/arborescenceArchive.js');

const SCORE_ORDER = { ROUGE: 0, ORANGE: 1, VERT: 2 };
// Statuts « partagé avec le stagiaire » (envoyé / consulté / signé).
const SHARED = ['ENVOYE', 'CONSULTE', 'SIGNE'];

/**
 * GET /api/suivi — suivi Qualiopi par dossier (inscription) : jeu de documents
 * requis + statut réel, conformité calculée, dossiers incomplets en premier.
 */
const getSuivi = async (req, res) => {
    try {
        const conn = db.promise();
        const [enrollments] = await conn.query(
            `SELECT e.id AS enrollment_id, e.learner_id, e.financing, e.crm_stage, e.session_id,
                    e.company_id AS enr_company_id,
                    l.first_name, l.last_name, l.opco,
                    /* L'entreprise d'un dossier est celle du DOSSIER, jamais celle de la fiche
                       personne. Un COALESCE vers l.company_id trainait ici : il ressuscitait
                       l'entreprise sur les inscriptions ou le stagiaire s'est engage seul,
                       parce que learner.company_id reste pose a vie des le premier
                       rattachement. Meme personne, deux dossiers, deux parcours possibles. */
                    e.company_id AS company_id, c.name AS company_name,
                    p.id AS program_id, p.code AS program_code, p.title AS program_title,
                    p.days AS program_days, p.hygiene AS program_hygiene, p.rs_code AS program_rs
             FROM enrollment e
             LEFT JOIN learner l ON l.id = e.learner_id
             LEFT JOIN company c ON c.id = e.company_id
             LEFT JOIN training_session s ON s.id = e.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE e.organization_id = ?`,
            [req.user.organization_id]
        );
        /* LE CALCUL D'AVANCEMENT VIT DANS `lib/avancement.js` : le tableau de bord et la page
           session en ont besoin aussi, et ils n'ont pas les mêmes droits que cet écran —
           `/api/suivi` est réservé aux rôles d'audit, un formateur peut ouvrir une session.
           Une seule implémentation, trois appelants. */
        const avancement = await avancementDossiers(conn, req.user.organization_id, enrollments, { avecDocuments: true });

        const dossiers = [];
        for (const e of enrollments) {
            const a = avancement.get(e.enrollment_id)
                || { percent: 0, done: 0, total: 0, score: 'ROUGE', signed: 0, toSign: 0, documents: [] };
            const { documents, score, signed, toSign, percent, done, total } = a;

            dossiers.push({
                enrollment_id: e.enrollment_id,
                learner_id: e.learner_id,
                company_id: e.company_id || null,
                company_name: e.company_name || null,
                first_name: e.first_name,
                last_name: e.last_name,
                program_code: e.program_code,
                program_title: e.program_title,
                financing: e.financing,
                crm_stage: e.crm_stage,
                score,
                signed,
                to_sign: toSign,
                percent,
                done,
                total,
                documents,
            });
        }

        // Incomplets en premier (ROUGE, ORANGE puis VERT), puis par nom.
        dossiers.sort((a, b) =>
            (SCORE_ORDER[a.score] - SCORE_ORDER[b.score]) ||
            (a.last_name || '').localeCompare(b.last_name || ''));

        res.json({ data: dossiers });
    } catch (err) {
        console.error('Erreur suivi :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * CE QUE CONTIENT LE COFFRE — une seule définition, pour deux lecteurs : la liste de l'écran
 * (GET /archives) et l'archive ZIP (GET /archives/zip). Deux jeux de requêtes écrits côte à côte
 * auraient fini par ne plus compter les mêmes documents, et l'archive remise à un contrôle aurait
 * oublié ce que l'écran montrait.
 *
 * Chaque ligne porte aussi ce qu'il faut pour la RANGER (2026-09-24) : le modèle (`slug`), le type
 * de pièce, le dossier et son entreprise, la session et ses dates. L'écran les ignore ; l'archive
 * s'en sert pour suivre l'arborescence (lib/arborescenceArchive.js).
 *
 * LES ÉVALUATIONS (QCM) N'Y SONT PLUS — décidé par l'école le 2026-09-25. Un QCM n'est pas un
 * document : aucun modèle, aucun PDF. Ici, il s'ouvrait sur « Aucun modèle », son téléchargement
 * échouait, et l'archive ZIP rangeait les 31 réponses de production en « NON inclus » — les dossiers
 * « Évaluations » des arborescences restaient vides. Ses réponses, figées au moment de l'envoi, vivent
 * dans Résultats QCM (ouvert aux auditeurs, export CSV). La ligne du document, elle, reste en base :
 * c'est elle qui fait avancer le parcours du dossier (lib/avancement.js), et rien ne l'efface.
 */
async function lignesDuCoffre(conn, orgId) {
    // Documents générés par l'application (partagés / signés) — niveau STAGIAIRE.
    const [gen] = await conn.query(
        `SELECT gd.id AS doc_id, gd.title, gd.type, gd.status, gd.quiz_id, 'LEARNER' AS scope,
                NULL AS company_id, NULL AS company_name,
                DATE_FORMAT(gd.sent_at,   '%Y-%m-%d %H:%i') AS sent_at,
                DATE_FORMAT(gd.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                s.year, s.week,
                p.code AS program_code, p.title AS program_title,
                l.id AS learner_id, l.first_name, l.last_name, 'gen' AS source,
                NULL AS dossier,
                gd.template_slug AS slug, NULL AS quiz_title, e.id AS enrollment_id,
                e.company_id AS enr_company_id, dc.name AS enr_company_name, s.id AS session_id,
                DATE_FORMAT(s.start_date, '%Y-%m-%d') AS debut, DATE_FORMAT(s.end_date, '%Y-%m-%d') AS fin
         FROM generated_document gd
         JOIN learner l ON l.id = gd.learner_id
         LEFT JOIN document_formation df ON df.document_id = gd.id
         LEFT JOIN enrollment e ON e.id = df.enrollment_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         LEFT JOIN company dc ON dc.id = e.company_id
         WHERE gd.organization_id = ? AND gd.status IN (?) AND gd.quiz_id IS NULL`,
        [orgId, SHARED]
    );
    // Documents générés au niveau ENTREPRISE (un par groupe/session). learner_id NULL,
    // rangés par entreprise. Ignoré si la migration 077 (scope) n'est pas jouée.
    let comp = [];
    try {
        [comp] = await conn.query(
            `SELECT gd.id AS doc_id, gd.title, gd.type, gd.status, gd.quiz_id, 'COMPANY' AS scope,
                    gd.company_id, c.name AS company_name,
                    DATE_FORMAT(gd.sent_at,   '%Y-%m-%d %H:%i') AS sent_at,
                    DATE_FORMAT(gd.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                    s.year, s.week,
                    p.code AS program_code, p.title AS program_title,
                    NULL AS learner_id, '' AS first_name, c.name AS last_name, 'gen' AS source,
                    NULL AS dossier,
                    gd.template_slug AS slug, NULL AS quiz_title, NULL AS enrollment_id,
                    gd.company_id AS enr_company_id, c.name AS enr_company_name, s.id AS session_id,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS debut, DATE_FORMAT(s.end_date, '%Y-%m-%d') AS fin
             FROM generated_document gd
             JOIN company c ON c.id = gd.company_id
             LEFT JOIN training_session s ON s.id = gd.session_id
             LEFT JOIN training_program p ON p.id = s.program_id
             WHERE gd.organization_id = ? AND gd.scope = 'COMPANY' AND gd.status IN (?)`,
            [orgId, SHARED]
        );
    } catch (e) { if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e; }
    /* DOCUMENTS DE LA SESSION (migration 157) — contrat d'hygiène signé par un intervenant
       externe, et ce qui suivra. Ils n'appartiennent NI à un stagiaire NI à une entreprise :
       c'est le troisième cas, et sans cette requête ils n'existaient nulle part dans le
       coffre. Un document qu'on ne retrouve pas six mois plus tard ne sert à rien le jour
       d'un contrôle — c'est même toute la raison d'être de cet écran.

       JOINTURE INTERNE SUR LA SESSION, et c'est voulu : un document de session sans session
       n'a ni année, ni semaine, ni formation. Il n'aurait aucune branche où se poser, et
       remonterait dans un « - / Sans session » que personne n'irait ouvrir. */
    let sess = [];
    try {
        [sess] = await conn.query(
            `SELECT gd.id AS doc_id, gd.title, gd.type, gd.status, gd.quiz_id, 'SESSION' AS scope,
                    NULL AS company_id, NULL AS company_name,
                    DATE_FORMAT(gd.sent_at,   '%Y-%m-%d %H:%i') AS sent_at,
                    DATE_FORMAT(gd.signed_at, '%Y-%m-%d %H:%i') AS signed_at,
                    s.year, s.week,
                    p.code AS program_code, p.title AS program_title,
                    NULL AS learner_id, '' AS first_name, '' AS last_name, 'gen' AS source,
                    NULL AS dossier,
                    gd.template_slug AS slug, NULL AS quiz_title, NULL AS enrollment_id,
                    NULL AS enr_company_id, NULL AS enr_company_name, s.id AS session_id,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS debut, DATE_FORMAT(s.end_date, '%Y-%m-%d') AS fin
               FROM generated_document gd
               JOIN training_session s ON s.id = gd.session_id
               LEFT JOIN training_program p ON p.id = s.program_id
              WHERE gd.organization_id = ? AND gd.scope = 'SESSION' AND gd.status IN (?)`,
            [orgId, SHARED]);
    } catch (e) {
        /* La 157 n'est pas jouée : l'énumération ignore 'SESSION'. Le coffre doit rester
           lisible — il l'était avant cette fonctionnalité, il le reste sans elle. */
        if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'
            || e.code === 'WARN_DATA_TRUNCATED' || e.code === 'ER_DATA_TRUNCATED'))) throw e;
    }

    // Documents archivés (PDF importés + feuilles d'émargement générées).
    // Pour l'émargement (ref « emarg:<enrollment>[:<slug>] »), on résout le vrai
    // stagiaire via le dossier, afin qu'il se range dans le MÊME dossier que ses
    // autres documents (regroupement par learner_id côté client) et non dans un
    // dossier « Nom Prénom » séparé.
    /* Sondée AVANT la requête : la 154 peut ne pas être jouée, et l'écran doit alors
       fonctionner exactement comme avant — sans classeur, pas avec une erreur SQL. */
    const colDossier = await colonneExiste(conn, 'archive_document', 'dossier');
    const [arch] = await conn.query(
        `SELECT ad.id AS doc_id, ad.title, 'PDF' AS type, ad.status, NULL AS quiz_id, 'LEARNER' AS scope,
                NULL AS company_id, NULL AS company_name,
                NULL AS sent_at, DATE_FORMAT(ad.created_at, '%Y-%m-%d %H:%i') AS signed_at,
                ad.year, ad.week,
                COALESCE(p.code, ad.formation_label) AS program_code,
                COALESCE(p.title, ad.formation_label) AS program_title,
                l.id AS learner_id,
                COALESCE(l.first_name, '') AS first_name,
                COALESCE(l.last_name, ad.learner_name) AS last_name,
                'archive' AS source,
                ${colDossier ? 'ad.dossier' : 'NULL AS dossier'},
                ad.ref, e.id AS enrollment_id,
                e.company_id AS enr_company_id, dc.name AS enr_company_name, s.id AS session_id,
                DATE_FORMAT(s.start_date, '%Y-%m-%d') AS debut, DATE_FORMAT(s.end_date, '%Y-%m-%d') AS fin
         FROM archive_document ad
         LEFT JOIN enrollment e ON ad.ref LIKE 'emarg:%'
              AND e.id = SUBSTRING_INDEX(SUBSTRING(ad.ref, 7), ':', 1)
         LEFT JOIN learner l ON l.id = e.learner_id
         LEFT JOIN training_session s ON s.id = e.session_id
         LEFT JOIN training_program p ON p.id = s.program_id
         LEFT JOIN company dc ON dc.id = e.company_id
         WHERE ad.organization_id = ?`,
        [orgId]
    );
    /* UNE FEUILLE D'ÉMARGEMENT ARCHIVÉE porte son modèle dans sa référence
       (« emarg:<dossier>:<modèle> ») : c'est lui qui la range, comme le modèle d'un document. */
    for (const a of arch) {
        const m = /^emarg:[^:]+:(.+)$/.exec(a.ref || '');
        a.slug = m ? m[1] : null;
        delete a.ref;
    }
    /* PIÈCES JUSTIFICATIVES — la quatrième source, qui manquait. Le coffre réunissait les
       documents que l'école PRODUIT et les PDF importés à la main ; les pièces déposées par
       le stagiaire (identité, justificatif de domicile) n'y figuraient nulle part. Elles
       font pourtant partie du dossier au même titre, et c'est dans ce coffre qu'on va les
       chercher un an plus tard.

       UNE LIGNE PAR FICHIER, pas par dépôt : un justificatif peut en compter six, et n'en
       montrer qu'un rendrait les autres introuvables — le défaut qu'on vient de corriger
       dans la fiche du dossier.

       Les octets ne sortent pas d'ici : la liste ne porte que de quoi nommer et ouvrir. */
    let pieces = [];
    try {
        const [pf] = await conn.query(
            `SELECT pf.id AS doc_id, pf.nom AS fichier_nom, pf.sort_order,
                    pt.label AS piece_label, d.id AS depot_id, d.statut,
                    DATE_FORMAT(d.depose_le, '%Y-%m-%d %H:%i') AS depose_le,
                    s.year, s.week,
                    p.code AS program_code, p.title AS program_title,
                    l.id AS learner_id, l.first_name, l.last_name,
                    d.piece_type_id, e.id AS enrollment_id,
                    e.company_id AS enr_company_id, dc.name AS enr_company_name, s.id AS session_id,
                    DATE_FORMAT(s.start_date, '%Y-%m-%d') AS debut, DATE_FORMAT(s.end_date, '%Y-%m-%d') AS fin
               FROM piece_fichier pf
               JOIN piece_depot d ON d.id = pf.depot_id
               JOIN piece_type pt ON pt.id = d.piece_type_id
               JOIN enrollment e ON e.id = d.enrollment_id
               JOIN learner l ON l.id = e.learner_id
               LEFT JOIN training_session s ON s.id = e.session_id
               LEFT JOIN training_program p ON p.id = s.program_id
               LEFT JOIN company dc ON dc.id = e.company_id
              WHERE d.organization_id = ?
              ORDER BY pf.depot_id, pf.sort_order, pf.created_at`,
            [orgId]);
        /* Le rang « 2/6 » se calcule ICI plutôt qu'en SQL : une fonction de fenêtrage
           obligerait à une version minimale de MariaDB pour un simple numéro d'ordre, et
           la liste est déjà triée par dépôt. Un dépôt d'un seul fichier ne porte AUCUN
           rang — « (1/1) » n'apprend rien et alourdit chaque ligne. */
        const parDepot = new Map();
        for (const f of pf) parDepot.set(f.depot_id, (parDepot.get(f.depot_id) || 0) + 1);
        const vus = new Map();
        pieces = pf.map((f) => {
            const total = parDepot.get(f.depot_id);
            const rang = (vus.get(f.depot_id) || 0) + 1;
            vus.set(f.depot_id, rang);
            return {
                doc_id: f.doc_id,
                title: total > 1 ? `${f.piece_label} (${rang}/${total})` : f.piece_label,
                type: 'PIECE', status: f.statut, quiz_id: null, scope: 'LEARNER',
                company_id: null, company_name: null,
                sent_at: f.depose_le, signed_at: null,
                year: f.year, week: f.week,
                program_code: f.program_code, program_title: f.program_title,
                learner_id: f.learner_id, first_name: f.first_name, last_name: f.last_name,
                dossier: null,
                source: 'piece',
                fichier_nom: f.fichier_nom, piece_type_id: f.piece_type_id, enrollment_id: f.enrollment_id,
                enr_company_id: f.enr_company_id, enr_company_name: f.enr_company_name,
                session_id: f.session_id, debut: f.debut, fin: f.fin,
            };
        });
    } catch (e) {
        // Migration 127 non jouée : le coffre reste lisible sans les pièces.
        if (!(e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'))) throw e;
    }

    return { gen, comp, sess, arch, pieces };
}

/**
 * GET /api/suivi/archives — coffre documentaire : tous les documents partagés/
 * signés avec les stagiaires, à plat, avec session (année/semaine), formation et
 * stagiaire. Le regroupement (année → semaine → formation → stagiaire) est fait
 * côté client. Un document couvrant plusieurs formations apparaît sous chacune.
 */
const getArchive = async (req, res) => {
    try {
        const conn = db.promise();
        const { gen, comp, sess, arch, pieces } = await lignesDuCoffre(conn, req.user.organization_id);
        res.json({ data: [...gen, ...comp, ...sess, ...arch, ...pieces] });
    } catch (err) {
        console.error('Erreur archives documents :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Extrait année / semaine / formation / stagiaire depuis un chemin de dossier
// (webkitRelativePath) : « …/2024/S12/[Formation]/Dupont Jean/devis.pdf ».
/* Le titre d'un document déposé dans un CLASSEUR : son nom de fichier, sans le chemin ni
   l'extension. `parsePath` ne convient pas — elle lit le chemin pour en tirer une année et une
   semaine, ce qui n'a aucun sens ici : un classeur est justement ce qui ne se range pas ainsi. */
function nomSeul(rel) {
    const file = String(rel || '').split('/').filter(Boolean).pop() || 'document.pdf';
    return file.replace(/\.[^.]+$/, '');
}

function parsePath(rel) {
    const parts = String(rel || '').split('/').filter(Boolean);
    const file = parts.pop() || 'document.pdf';
    const title = file.replace(/\.[^.]+$/, '');
    let year = null, week = null, formation = null, learner = null;
    const yi = parts.findIndex((p) => /^\d{4}$/.test(p));
    if (yi >= 0) {
        year = parseInt(parts[yi], 10);
        const after = parts.slice(yi + 1);
        if (after[0] != null) { const w = String(after[0]).match(/\d+/); week = w ? parseInt(w[0], 10) : null; }
        const rest = after.slice(1); // entre la semaine et le fichier
        if (rest.length >= 2) { formation = rest[rest.length - 2]; learner = rest[rest.length - 1]; }
        else if (rest.length === 1) { learner = rest[0]; }
    } else if (parts.length) {
        learner = parts[parts.length - 1];
    }
    return { year, week, formation, learner, title };
}

/**
 * POST /api/suivi/archives/import — importe des PDF historiques.
 * Multipart : `files` (PDF) + `paths` (JSON des chemins relatifs, même ordre).
 */
const importArchive = async (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.status(422).json({ error: 'Aucun fichier reçu.' });
    let paths = [];
    try { paths = JSON.parse(req.body.paths || '[]'); } catch { paths = []; }
    /* UN CLASSEUR NOMMÉ met en sommeil TOUT le classement par session : ni année, ni semaine,
       ni formation, ni stagiaire. Un document d'assurance n'appartient à aucune promotion, et
       lui inventer une semaine le rendrait introuvable là où on ira le chercher. */
    const dossier = String(req.body.dossier || '').trim().slice(0, 160) || null;
    try {
        const conn = db.promise();
        let imported = 0, skipped = 0, doublons = 0;
        const nomsDoublons = [];
        /* MÊME NOM, MÊME PLACE : c'est déjà là. Un import se relance facilement — on reprend un
           dossier « pour être sûr », on redépose un lot déjà traité — et rien n'empêchait le
           coffre de garder deux fois le même document.

           POURQUOI PAS « NOM + POIDS », LA RÈGLE QUI PARAÎT ÉVIDENTE. Parce qu'elle ne marche
           pas. Mesuré sur les doublons réellement présents : « Droit image GERVAIS Raphaelle »
           pèse 817 196 octets d'un côté, 731 771 de l'autre ; « Invitation LAMBERT Sylvain »,
           300 290 contre 298 524. Ce sont des RÉ-EXPORTS du même document — le même Google Doc
           réimprimé en PDF donne des octets différents (horodatage interne, compression). Sur
           quatre paires examinées, trois avaient des tailles distinctes : la règle « nom +
           poids » en aurait laissé passer trois sur quatre, et l'empreinte du contenu, quatre
           sur quatre. C'est d'ailleurs pourquoi l'écran de stockage, qui regroupe par empreinte,
           n'en signalait AUCUN.

           LA PLACE COMPTE AUTANT QUE LE NOM. Le même document classé sous deux stagiaires n'est
           pas un doublon : c'est la même pièce rangée à deux endroits, et les deux ont lieu
           d'être. On compare donc l'année, la semaine, la formation et le stagiaire.

           CE QUE CETTE RÈGLE REFUSE AUSSI : une version CORRIGÉE déposée sous le même nom, au
           même endroit. C'est assumé — dans un coffre, un nom à un endroit désigne un document
           et un seul. Pour remplacer, on supprime puis on réimporte ; et l'import NOMME ce
           qu'il a écarté, pour qu'on s'en aperçoive au lieu de croire que tout est passé. */
        const colDossier = await colonneExiste(conn, 'archive_document', 'dossier');
        if (dossier && !colDossier) return res.status(422).json({ error: 'Classeurs indisponibles : migration 154 non jouée.' });
        const dejaLa = async (meta) => {
            /* DANS UN CLASSEUR, LA PLACE C'EST LE CLASSEUR. La règle générale compare aussi
               l'année, la semaine, la formation et le stagiaire — tous NULL ici, si bien que
               deux fichiers du même nom rangés dans DEUX classeurs différents se seraient pris
               pour des doublons, et le second aurait été écarté en silence. */
            const [[r]] = await conn.query(
                `SELECT 1 AS oui FROM archive_document
                  WHERE organization_id = ?
                    AND title = ?
                    AND COALESCE(year, -1) = COALESCE(?, -1)
                    AND COALESCE(week, -1) = COALESCE(?, -1)
                    AND COALESCE(formation_label, '') = COALESCE(?, '')
                    AND COALESCE(learner_name, '') = COALESCE(?, '')
                    ${colDossier ? "AND COALESCE(dossier, '') = COALESCE(?, '')" : ''}
                  LIMIT 1`,
                [req.user.organization_id, meta.title.slice(0, 255), meta.year, meta.week,
                    meta.formation || null, meta.learner || null,
                    ...(colDossier ? [dossier] : [])]);
            return !!r;
        };

        let vides = 0; const nomsVides = [];
        const mesure = await mesureDisponible(conn); // une seule fois : l'import peut porter 3000 fichiers
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const isPdf = /pdf$/i.test(f.mimetype || '') || /\.pdf$/i.test(f.originalname || '');
            if (!isPdf) { skipped++; continue; }
            const meta = dossier
                ? { year: null, week: null, formation: null, learner: null, title: nomSeul(paths[i] || f.originalname) }
                : parsePath(paths[i] || f.originalname);
            /* UN FICHIER VIDE N'ENTRE PAS AU COFFRE. Trouvé en production le 2026-09-15 : une
               ligne d'archive à ZÉRO octet, importée le 8 juillet, qui rend un PDF que rien
               n'ouvre. Un import de dossier peut porter 3000 fichiers ; il suffit qu'un seul
               soit vide — une copie interrompue, un fichier de synchronisation — pour qu'il
               s'installe dans le coffre avec un titre crédible. Il y passerait inaperçu
               jusqu'au jour où quelqu'un essaie de l'ouvrir, et ce jour-là, c'est un contrôle
               Qualiopi. On le REFUSE, et on le NOMME : un compte ne dit pas lequel reprendre. */
            if (!f.buffer || !f.buffer.length) { vides++; nomsVides.push(meta.title); continue; }
            if (await dejaLa(meta)) { doublons++; nomsDoublons.push(meta.title); continue; }
            /* LE PDF PART CHIFFRÉ — il ne repassera jamais en clair en base. `aRanger` rend du
               même coup l'empreinte et la taille du CLAIR : sans elles, l'écran de stockage
               compterait des octets de chiffré et ne verrait plus aucun doublon (IV aléatoire).
               Les deux colonnes datent de la 153 : tant qu'elle n'est pas jouée, on écrit sans,
               et l'écran retombe sur la mesure faite en base. */
            const range = aRanger(f.buffer);
            await conn.query(
                `INSERT INTO archive_document
                    (id, organization_id, year, week, formation_label, learner_name, title, status, mime, file${mesure ? ', empreinte, octets' : ''}${colDossier ? ', dossier' : ''})
                 VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'ARCHIVE', ?, ?${mesure ? ', ?, ?' : ''}${colDossier ? ', ?' : ''})`,
                [req.user.organization_id, meta.year, meta.week, meta.formation || null,
                 meta.learner || null, meta.title.slice(0, 255), f.mimetype || 'application/pdf', range.file,
                 ...(mesure ? [range.empreinte, range.octets] : []),
                 ...(colDossier ? [dossier] : [])]
            );
            imported++;
        }
        /* `doublons` À PART DE `skipped` : un fichier écarté parce qu'il n'est pas un PDF et un
           fichier écarté parce qu'il est déjà là ne demandent pas le même geste. Les confondre
           ferait croire à un import raté là où il n'y avait rien à faire. */
        /* `doublons` À PART DE `skipped` : un fichier écarté parce qu'il n'est pas un PDF et un
           fichier écarté parce qu'il est déjà là ne demandent pas le même geste. Les confondre
           ferait croire à un import raté là où il n'y avait rien à faire.
           Les NOMS partent aussi : un compte ne dit pas lequel, et c'est lequel qui compte
           quand on voulait justement remplacer une version par sa correction. */
        res.status(201).json({ data: { imported, skipped, doublons, noms_doublons: nomsDoublons.slice(0, 20),
            vides, noms_vides: nomsVides.slice(0, 20) } });
    } catch (err) {
        console.error('Erreur import archives :', err);
        if (err && /max_allowed_packet|packet/i.test(err.message || '')) {
            return res.status(413).json({ error: 'Fichier trop volumineux pour la base. Augmentez max_allowed_packet ou importez par lots plus petits.' });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** GET /api/suivi/archives/:id/file — sert le PDF importé (aperçu / téléchargement). */
const getArchiveFile = async (req, res) => {
    try {
        const [[row]] = await db.promise().query(
            'SELECT title, mime, file FROM archive_document WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]
        );
        if (!row || !row.file) return res.status(404).json({ message: 'Document introuvable.' });
        /* ZÉRO OCTET : un Buffer vide est « vrai » en JavaScript, donc le test ci-dessus le
           laisse passer — et l'écran recevait un PDF de zéro octet, que le navigateur ouvre sur
           une page blanche ou une erreur illisible. Mieux vaut le DIRE : le document existe
           dans le coffre, son contenu non. */
        if (!row.file.length) return res.status(422).json({ message: 'Ce document est vide (0 octet) : son contenu n\'a jamais été enregistré. Réimportez-le, ou supprimez la ligne.' });
        /* DÉCHIFFRÉ À LA VOLÉE, comme les pièces justificatives : le clair n'existe que dans
           cette réponse. `null` = illisible (clé changée, contenu altéré — le tag GCM le
           détecte) ; on le DIT au lieu de servir un PDF vide qui ferait croire à un document
           corrompu à l'import. */
        const clair = aServir(row.file);
        if (clair === null) return res.status(500).json({ message: 'Archive illisible (déchiffrement — clé ?).' });
        const name = (row.title || 'document').replace(/[\\/:*?"<>|]/g, '') + '.pdf';
        // Les archives sont des PDF : on force le type (ne jamais renvoyer un mime
        // fourni par le client, qui pourrait provoquer un rendu HTML/JS = XSS).
        res.set('Content-Type', 'application/pdf');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(name)}"`);
        /* AUCUN CACHE — même raison que pour une pièce d'identité : un contrat signé, une
           feuille d'émargement nominative n'ont pas à rester sur le disque du navigateur après
           la déconnexion, surtout sur un poste partagé. Chiffrer en base et laisser une copie
           en clair dans le cache du poste, c'est fermer une porte et en ouvrir une autre. */
        res.set('Cache-Control', 'no-store, private');
        res.send(clair);
    } catch (err) {
        console.error('Erreur lecture archive :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** DELETE /api/suivi/archives/:id — supprime un document importé. */
const deleteArchive = async (req, res) => {
    try {
        await db.promise().query('DELETE FROM archive_document WHERE id = ? AND organization_id = ?',
            [req.params.id, req.user.organization_id]);
        res.json({ success: true, message: 'Document supprimé.' });
    } catch (err) {
        console.error('Erreur suppression archive :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/suivi/archives/delete — suppression groupée (semaine / formation /
 * stagiaire / fichiers). Supprime en base les PDF importés (archive_document) et,
 * si demandé, les documents générés (generated_document). Toujours cloisonné à l'organisme.
 * Corps : { archive_ids: [...], document_ids: [...] }.
 */
const bulkDeleteArchive = async (req, res) => {
    const orgId = req.user.organization_id;
    const clean = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x) : []);
    const archiveIds = clean(req.body?.archive_ids);
    const documentIds = clean(req.body?.document_ids);
    if (!archiveIds.length && !documentIds.length) {
        return res.status(422).json({ error: 'Aucun document à supprimer.' });
    }
    try {
        const conn = db.promise();
        let deleted = 0;
        if (archiveIds.length) {
            const [r] = await conn.query('DELETE FROM archive_document WHERE organization_id = ? AND id IN (?)', [orgId, archiveIds]);
            deleted += r.affectedRows || 0;
        }
        if (documentIds.length) {
            /* JAMAIS UNE ÉVALUATION : supprimée d'ici, elle laissait sa réponse dans Résultats QCM
               (`quiz_response` ne tient pas au document), et l'espace du stagiaire la renvoyait,
               comme jamais faite. Le coffre ne les liste plus ; cette route les refuse aussi. */
            const [r] = await conn.query('DELETE FROM generated_document WHERE organization_id = ? AND id IN (?) AND quiz_id IS NULL',
                [orgId, documentIds]);
            deleted += r.affectedRows || 0;
        }
        logAudit(req, 'archive.bulk_delete', 'Archive', null);
        res.json({ success: true, deleted });
    } catch (err) {
        console.error('Erreur suppression groupée archives :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   CE QUE LE COFFRE OCCUPE — et où, précisément.
   ═════════════════════════════════════════════════════════════════════════════════════════════

   MESURÉ AVANT D'ÊTRE ÉCRIT (1188 PDF, 681 Mo) : la masse n'est pas répartie, elle est
   CONCENTRÉE. 148 fichiers — 12 % — portent 378 Mo, soit 55 % du total ; les 1040 autres font
   291 Ko de moyenne, ce qui est normal pour un scan. Un écran qui trie par poids décroissant
   règle donc le problème en montrant trente lignes, là où compresser les 1188 rapporterait 9 %.

   POURQUOI 9 % SEULEMENT en compression sans perte : le contenu des PDF est déjà en Flate.
   Compresser du déjà-compressé ne rend rien — vérifié en gzipant quarante fichiers réels.
   L'anomalie est ailleurs : certains fichiers pèsent 2,2 à 4,0 OCTETS PAR PIXEL quand un JPEG
   en fait 0,13. Un bitmap RVB brut vaut exactement 3,0 : ces documents-là ne sont pas compressés
   du tout. C'est pour cela que la densité est affichée — c'est elle qui distingue un scan de
   300 DPI légitimement lourd d'un fichier qui gaspille dix fois sa place.

   UNE SEULE PASSE SUR LES BLOBS. `LENGTH()` et `MD5()` obligent InnoDB à lire chaque blob : sur
   681 Mo, c'est quelques secondes. On lit donc TOUT une fois et l'on calcule le reste en
   mémoire — total, tranches, plus lourds, doublons. Deux requêtes auraient coûté deux lectures.
   D'où aussi la route SÉPARÉE : la liste des archives, elle, reste instantanée.
*/
const TRANCHES = [
    { libelle: '> 8 Mo', min: 8 * 1024 * 1024 },
    { libelle: '3 à 8 Mo', min: 3 * 1024 * 1024 },
    { libelle: '1 à 3 Mo', min: 1024 * 1024 },
    { libelle: '< 1 Mo', min: 0 },
];

const getArchiveStockage = async (req, res) => {
    try {
        /* DEUX REQUÊTES, ET C'EST UN GAIN. Les mesures sont désormais MÉMORISÉES à l'écriture
           (migration 153) : la première requête ne lit aucun blob, donc l'écran devient
           instantané là où il lisait 681 Mo. La seconde ne ramasse que les lignes pas encore
           reprises et les mesure en base, comme avant — elle ne rend rien une fois la reprise
           faite. Un `COALESCE(octets, LENGTH(file))` aurait été plus court d'une ligne, mais
           aurait forcé la lecture de TOUS les blobs pour une colonne déjà connue.

           SHA2 ET NON PLUS MD5 : c'est la même fonction que celle utilisée pour l'empreinte
           mémorisée, si bien qu'une ligne en clair et la même ligne une fois chiffrée rendent
           la MÊME valeur. Sans cela, pendant la reprise, un doublon dont un exemplaire serait
           déjà chiffré passerait inaperçu. */
        const conn = db.promise();
        const mesure = await mesureDisponible(conn);
        /* Le détenteur d'un document de classeur n'est pas un stagiaire, c'est le CLASSEUR :
           sans lui, les plus gros fichiers s'afficheraient sans rien pour les situer. */
        const colDossier = await colonneExiste(conn, 'archive_document', 'dossier');
        const quiDetient = colDossier ? 'COALESCE(learner_name, dossier)' : 'learner_name';
        const [rows] = mesure
            ? await conn.query(
                `SELECT id, title, ${quiDetient} AS learner_name, year, week, octets, empreinte
                   FROM archive_document WHERE organization_id = ? AND octets IS NOT NULL`,
                [req.user.organization_id])
            : [[]];
        const [aMesurer] = await conn.query(
            `SELECT id, title, ${quiDetient} AS learner_name, year, week,
                    LENGTH(file) AS octets, SHA2(file, 256) AS empreinte
               FROM archive_document
              WHERE organization_id = ?${mesure ? ' AND octets IS NULL' : ''}`,
            [req.user.organization_id]);
        rows.push(...aMesurer);

        const total = rows.reduce((s, r) => s + Number(r.octets || 0), 0);

        const tranches = TRANCHES.map((t, i) => {
            const max = i === 0 ? Infinity : TRANCHES[i - 1].min;
            const dedans = rows.filter((r) => r.octets >= t.min && r.octets < max);
            /* `min` PART AVEC LA TRANCHE : après une suppression, l'écran retire le fichier de
               sa tranche sans relire la base — encore faut-il qu'il sache où il tombait. Sans
               cette borne, le client recopierait les seuils, et les deux jeux divergeraient au
               premier changement. */
            return { libelle: t.libelle, min: t.min, n: dedans.length,
                octets: dedans.reduce((s, r) => s + Number(r.octets), 0) };
        });

        /* LES DOUBLONS SE DISENT AVEC LE NOM DE CEUX QUI LES DÉTIENNENT. Supprimer une copie,
           c'est retirer un document du dossier de quelqu'un : le même PDF classé sous sept
           stagiaires est peut-être une erreur de classement (le cas rencontré — l'évaluation
           d'une personne recopiée dans six autres dossiers), mais peut aussi être une pièce
           commune légitimement présente partout. L'écran ne peut pas trancher ; il montre qui
           détient quoi et laisse décider. */
        const par = new Map();
        for (const r of rows) {
            if (!r.empreinte) continue;
            const k = `${r.empreinte}:${r.octets}`;
            if (!par.has(k)) par.set(k, []);
            par.get(k).push(r);
        }
        const doublons = [...par.values()].filter((g) => g.length > 1)
            .map((g) => ({ octets: Number(g[0].octets), n: g.length,
                gaspille: Number(g[0].octets) * (g.length - 1),
                /* `octets` EN NOMBRE, explicitement : `LENGTH()` peut revenir en chaîne selon
                   le pilote, et l'écran s'en sert pour retrancher d'un total après suppression.
                   Une addition sur des chaînes concatène au lieu d'ajouter. */
                exemplaires: g.map(({ empreinte, ...x }) => ({ ...x, octets: Number(x.octets) })) }))
            .sort((a, b) => b.gaspille - a.gaspille);

        res.json({
            data: {
                total: { n: rows.length, octets: total },
                tranches,
                /* Soixante suffisent : au-delà, on est déjà sous la moyenne, et une liste plus
                   longue ferait croire qu'il reste du gras alors qu'il n'y en a plus. */
                lourds: [...rows].sort((a, b) => b.octets - a.octets).slice(0, 60)
                    .map(({ empreinte, ...x }) => ({ ...x, octets: Number(x.octets) })),
                doublons,
                gaspilleDoublons: doublons.reduce((s, d) => s + d.gaspille, 0),
            },
        });
    } catch (err) {
        console.error('Erreur analyse stockage archives :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   L'ARCHIVE ZIP DU COFFRE (2026-09-24) — rangée selon l'arborescence d'archivage.

   L'arborescence existait depuis juillet (« étape 1 ») sans que rien ne la lise : l'export qu'elle
   devait ranger n'avait jamais été écrit. Le voici, derrière UNE route et une seule règle d'accès —
   celle du coffre (AUDIT_ROLES). La page session, la fiche du stagiaire et le coffre l'appellent
   tous trois : un formateur qui ne peut pas ouvrir le coffre ne reçoit pas davantage une archive
   qui contient les pièces d'identité.

   TROIS PORTÉES, une seule liste : `lignesDuCoffre`, celle de l'écran. L'archive ne contient donc
   jamais ni plus ni moins que ce que le coffre montre pour la même sélection.
   ═══════════════════════════════════════════════════════════════════════════════════════════ */

const cleCoffre = (v) => (v == null ? '-' : String(v));
const deux = (n) => String(n == null ? '' : n).padStart(2, '0');
const motsDuNom = (s) => normaliserTitre(s).split(' ').filter(Boolean).sort().join(' ');

/**
 * Ce qu'une demande d'archive couvre. Les clés du coffre (année, semaine, formation) sont CELLES DE
 * L'ÉCRAN — « - » pour une valeur absente, comme ses nœuds —, pour qu'une ligne du coffre et son
 * archive désignent exactement les mêmes documents.
 * @returns {Promise<null | { garde: (ligne) => boolean, nom: string, libelle: string }>}
 */
async function porteeDeLArchive(conn, orgId, q) {
    if (q.session) {
        const [[s]] = await conn.query(
            `SELECT s.id, s.year, s.week, p.code FROM training_session s
               LEFT JOIN training_program p ON p.id = s.program_id
              WHERE s.id = ? AND s.organization_id = ?`, [String(q.session), orgId]);
        if (!s) return null;
        return {
            /* Les documents rattachés à la session par leur dossier ; les PDF importés, qui n'ont
               pas de dossier, par la semaine et la formation — comme le coffre les range. */
            garde: (l) => (l.session_id ? l.session_id === s.id
                : l.source === 'archive' && cleCoffre(l.year) === cleCoffre(s.year) && cleCoffre(l.week) === cleCoffre(s.week)
                    && (l.program_code || '-') === (s.code || '-')),
            nom: `archive ${s.code || 'formation'} ${s.year} S${deux(s.week)}`,
            libelle: `Session ${s.code || ''} — semaine ${s.week} de ${s.year}`,
        };
    }
    if (q.dossier) {
        const [[e]] = await conn.query(
            `SELECT e.id, e.company_id, e.session_id, l.first_name, l.last_name, s.year, s.week, p.code
               FROM enrollment e
               JOIN learner l ON l.id = e.learner_id
               LEFT JOIN training_session s ON s.id = e.session_id
               LEFT JOIN training_program p ON p.id = s.program_id
              WHERE e.id = ? AND e.organization_id = ?`, [String(q.dossier), orgId]);
        if (!e) return null;
        const personne = motsDuNom(`${e.last_name} ${e.first_name}`);
        return {
            garde: (l) => {
                if (l.enrollment_id) return l.enrollment_id === e.id;
                // Les documents de SON entreprise pour SA session (convention, accord de prise en charge).
                if (l.scope === 'COMPANY') return !!e.company_id && l.company_id === e.company_id && !!l.session_id && l.session_id === e.session_id;
                /* Un PDF importé n'a que le nom lu dans son chemin : on le reconnaît à ce nom, dans la
                   même semaine et la même formation. */
                if (l.source === 'archive' && !l.learner_id) {
                    return cleCoffre(l.year) === cleCoffre(e.year) && cleCoffre(l.week) === cleCoffre(e.week)
                        && (l.program_code || '-') === (e.code || '-') && motsDuNom(`${l.last_name || ''} ${l.first_name || ''}`) === personne;
                }
                return false;
            },
            nom: `archive ${e.last_name || ''} ${e.first_name || ''} ${e.code || ''}`.replace(/\s+/g, ' ').trim(),
            libelle: `Dossier de ${e.last_name || ''} ${e.first_name || ''}${e.code ? ` — ${e.code}` : ''}`.trim(),
        };
    }
    if (q.annee == null || q.annee === '') return null;
    const annee = String(q.annee);
    const semaine = q.semaine == null || q.semaine === '' ? null : String(q.semaine);
    const formation = q.formation == null || q.formation === '' ? null : String(q.formation);
    return {
        garde: (l) => cleCoffre(l.year) === annee && (semaine == null || cleCoffre(l.week) === semaine)
            && (formation == null || (l.program_code || '-') === formation),
        nom: `archive ${annee}${semaine ? ` S${deux(semaine)}` : ''}${formation ? ` ${formation}` : ''}`,
        libelle: `${annee === '-' ? 'Sans année' : annee}${semaine ? ` — semaine ${semaine}` : ''}${formation ? ` — ${formation}` : ''}`,
    };
}

/**
 * Les arborescences qui rangent l'archive : la COMMUNE (migration 182) dès que l'école l'a
 * enregistrée ; sinon celle de chaque formation (053, 083), telle qu'elle est ; sinon la structure
 * standard (lib/arborescenceArchive.js). Sans la 182, l'export marche donc déjà.
 * @returns {Promise<{ source: string, pour: (code) => ({ stagiaire, entreprise }) }>}
 */
async function arborescencesDeLArchive(conn, orgId) {
    try {
        const [[o]] = await conn.query('SELECT archive_tree, company_archive_tree FROM organization WHERE id = ?', [orgId]);
        if (o && (o.archive_tree != null || o.company_archive_tree != null)) {
            const commune = { stagiaire: lireArbre(o.archive_tree), entreprise: lireArbre(o.company_archive_tree) };
            return { source: "l'arborescence commune (Formations → Arborescence d'archivage)", pour: () => commune };
        }
    } catch (e) { if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e; }
    let rows = [];
    try {
        [rows] = await conn.query('SELECT code, archive_tree, company_archive_tree FROM training_program WHERE organization_id = ?', [orgId]);
    } catch (e) {
        if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e;
        try { [rows] = await conn.query('SELECT code, archive_tree FROM training_program WHERE organization_id = ?', [orgId]); }
        catch (e2) { if (!(e2 && e2.code === 'ER_BAD_FIELD_ERROR')) throw e2; }
    }
    const parCode = new Map(rows.map((r) => [r.code, { stagiaire: lireArbre(r.archive_tree), entreprise: lireArbre(r.company_archive_tree) }]));
    return { source: "l'arborescence de chaque formation (l'arborescence commune n'est pas encore enregistrée)", pour: (code) => parCode.get(code) || {} };
}

const EXTENSIONS = {
    'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/heic': '.heic',
    'image/webp': '.webp', 'image/gif': '.gif', 'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};
function extensionDe(f) {
    const m = /\.([A-Za-z0-9]{1,6})$/.exec((f && f.nom) || '');
    if (m) return `.${m[1].toLowerCase()}`;
    return EXTENSIONS[String((f && f.mime) || '').toLowerCase()] || '.pdf';
}

/** Le fichier d'une ligne du coffre, déchiffré — ou une erreur `NON_RENDU` qui dit pourquoi il manque. */
async function fichierDuCoffre(conn, user, l) {
    if (l.source === 'archive') {
        const [[a]] = await conn.query('SELECT mime, file FROM archive_document WHERE id = ? AND organization_id = ?',
            [l.doc_id, user.organization_id]);
        const clair = a && a.file ? aServir(a.file) : null;
        return clair ? { buffer: clair, mime: a.mime || 'application/pdf' } : null;
    }
    if (l.source === 'piece') {
        const [[p]] = await conn.query(
            `SELECT pf.mime, pf.bytes, pf.nom FROM piece_fichier pf JOIN piece_depot d ON d.id = pf.depot_id
              WHERE pf.id = ? AND d.organization_id = ?`, [l.doc_id, user.organization_id]);
        const clair = p && p.bytes ? decryptBytes(p.bytes) : null;
        return clair ? { buffer: clair, mime: p.mime || 'application/octet-stream', nom: p.nom } : null;
    }
    const { fichierPourArchive } = require('./document.controller.js');
    return fichierPourArchive(conn, user, l.doc_id);
}

const STATUT_LU = { SIGNE: 'signé', ENVOYE: 'envoyé', CONSULTE: 'consulté', GENERE: 'généré', ARCHIVE: 'importé',
    VALIDEE: 'pièce validée', DEPOSEE: 'pièce à vérifier', REFUSEE: 'pièce refusée' };
const dateFr = (d) => d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' });

/**
 * Le sommaire de l'archive : ce qu'elle contient, ce qu'elle range par défaut, ce qu'elle laisse dehors
 * PAR CHOIX (l'arborescence ne le range pas), et ce qui manque malgré elle.
 * @param nonRanges les documents que l'arborescence ne range pas : { titre } — comptés par intitulé
 */
function sommaireDeLArchive(portee, source, inclus, absents, quand, nonRanges = []) {
    const copies = inclus.filter((d) => d.copie).length;
    const lignes = [
        `Archive Impastio — ${portee.libelle}`,
        `Exportée le ${dateFr(quand)}. Rangée selon ${source}.`,
        '',
        `${inclus.length} document(s) inclus${copies ? `, dont ${copies} copie(s) pour les entreprises` : ''} :`,
        ...[...inclus].sort((a, b) => a.chemin.localeCompare(b.chemin, 'fr'))
            .map((d) => `  ${d.chemin}  [${STATUT_LU[d.statut] || String(d.statut || '').toLowerCase() || '—'}]`),
    ];
    const horsArbre = inclus.filter((d) => d.place === 'defaut');
    if (horsArbre.length) {
        lignes.push('', `${horsArbre.length} document(s) rangés par défaut dans le dossier du stagiaire, de l'entreprise ou de la formation — l'arborescence ne peut pas les nommer (PDF importé, document hors parcours) ou n'est pas réglée :`,
            ...horsArbre.map((d) => `  ${d.chemin}`));
    }
    /* CE QUI EST LAISSÉ DEHORS PAR CHOIX est nommé, par intitulé : celui qui lira l'archive doit
       savoir qu'un document manque parce qu'on l'a voulu, et où ce choix se change. */
    if (nonRanges.length) {
        const parTitre = new Map();
        for (const d of nonRanges) parTitre.set(d.titre || 'Document', (parTitre.get(d.titre || 'Document') || 0) + 1);
        lignes.push('', `${nonRanges.length} document(s) du coffre laissés hors de l'archive : l'arborescence d'archivage ne les range pas (Formations → Arborescence d'archivage) :`,
            ...[...parTitre].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([t, n]) => `  ${t}${n > 1 ? ` (${n})` : ''}`));
    }
    if (absents.length) {
        lignes.push('', `${absents.length} document(s) du coffre NON inclus :`,
            ...absents.map((d) => `  ${d.titre}${d.qui ? ` — ${d.qui}` : ''} : ${d.raison}`));
    }
    return `${lignes.join('\r\n')}\r\n`;
}

/**
 * GET /api/suivi/archives/zip — ?session=<id> | ?dossier=<inscription> | ?annee=&semaine=&formation=
 *
 * DEUX TEMPS. Tout ce qui peut échouer proprement échoue AVANT le premier octet : la portée, la
 * liste, la place de chaque document (calculée sans rien lire) — on peut encore répondre une erreur
 * lisible. Ensuite l'archive part au fil de l'eau (lib/zip.js), triée dossier par dossier. Un
 * document qui ne se rend pas n'interrompt rien : il est NOMMÉ dans `_sommaire.txt`, avec la raison.
 * Une panne en cours de route, elle, COUPE la connexion : un ZIP tronqué ne doit pas passer pour
 * complet auprès de celui qui le remettra à un contrôleur.
 */
const exporterArchive = async (req, res) => {
    const conn = db.promise();
    const orgId = req.user.organization_id;
    let portee; let arbres; let aEcrire; let nonRanges;
    try {
        portee = await porteeDeLArchive(conn, orgId, req.query || {});
        if (!portee) return res.status(404).json({ message: 'Sélection introuvable : rien à archiver.' });
        const c = await lignesDuCoffre(conn, orgId);
        /* Les CLASSEURS (assurance, agrément) n'appartiennent à aucune session : l'écran les tient à
           part de l'arbre des sessions, l'archive aussi. */
        const lignes = [...c.gen, ...c.comp, ...c.sess, ...c.arch, ...c.pieces].filter((l) => !l.dossier && portee.garde(l));
        if (!lignes.length) return res.status(404).json({ message: 'Aucun document dans le coffre pour cette sélection.' });
        arbres = await arborescencesDeLArchive(conn, orgId);
        const groupes = new Map((await loadEquivalences(conn, orgId)).map((e) => [e.key, { members: e.members, label: e.label }]));
        /* CE QUE CHAQUE FORMATION PROPOSE DE RANGER — la liste même que l'aperçu de l'arborescence dit
           « non rangée » : ce qui y figure sans être rangé reste HORS de l'archive, c'est le choix de
           l'école (2026-09-25). Un document d'une formation inconnue n'a pas de liste : rien n'en est exclu. */
        const { paletteDeLOrganisme } = require('./formationProgram.controller.js');
        const offerts = offertsDesFormations(await paletteDeLOrganisme(conn, orgId));
        aEcrire = []; nonRanges = [];
        for (const l of lignes) {
            const places = placesDansLArchive(arbres.pour(l.program_code), l, groupes, offerts.get(l.program_code) || null);
            if (places.length) aEcrire.push({ l, places });
            else nonRanges.push({ titre: l.title });
        }
        const cle = (p) => [...p.dossiers, p.fichier].join('/');
        aEcrire.sort((a, b) => cle(a.places[0]).localeCompare(cle(b.places[0]), 'fr'));
    } catch (err) {
        console.error('Erreur préparation archive :', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }

    const nom = `${portee.nom.replace(/[\\/:*?"<>|]/g, '-')}.zip`;
    const fichiers = aEcrire.reduce((n, x) => n + x.places.length, 0);
    if (!fichiers) {
        const n = nonRanges.length;
        return res.status(404).json({ message: `Rien à archiver : ${n > 1 ? `les ${n} documents` : 'le document'} de cette sélection ${n > 1 ? 'ne sont rangés' : 'n\'est rangé'} nulle part dans l'arborescence d'archivage.` });
    }
    /* `?compter=1` : ce que l'archive contiendrait, sans l'écrire. L'écran demande d'abord, pour
       répondre un vrai message à une sélection vide au lieu d'un téléchargement raté. */
    if (req.query && req.query.compter) return res.json({ data: { documents: fichiers, nom, hors_arborescence: nonRanges.length } });
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${nom.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nom)}`);
    res.set('Cache-Control', 'no-store');
    const zip = ecrivainZip(res);
    const pris = new Set();
    const inclus = []; const absents = [];
    try {
        for (const { l, places } of aEcrire) {
            const qui = l.scope === 'LEARNER' ? `${l.last_name || ''} ${l.first_name || ''}`.trim() : (l.company_name || '');
            let f;
            try {
                f = await fichierDuCoffre(conn, req.user, l);
            } catch (e) {
                if (!(e && e.code === 'NON_RENDU')) throw e;
                absents.push({ titre: l.title, qui, raison: e.message });
                continue;
            }
            if (!f || !f.buffer || !f.buffer.length) { absents.push({ titre: l.title, qui, raison: 'fichier illisible ou vide' }); continue; }
            const ext = extensionDe(f);
            const quand = l.signed_at || l.sent_at;
            /* UN DOCUMENT, RENDU UNE FOIS, écrit à chacune de ses places — le dossier du stagiaire, et la
               copie de son entreprise : rendre deux fois un PDF composé coûterait deux fois LibreOffice. */
            for (const place of places) {
                /* DEUX DOCUMENTS DE MÊME NOM AU MÊME ENDROIT gardent tous les deux leur place : le second
                   prend « (2) ». Un ZIP accepte les doublons, mais l'extraction écraserait le premier. */
                let chemin = [...place.dossiers, `${place.fichier}${ext}`].join('/');
                for (let n = 2; pris.has(chemin.toLowerCase()); n++) chemin = [...place.dossiers, `${place.fichier} (${n})${ext}`].join('/');
                pris.add(chemin.toLowerCase());
                await zip.ajouter(chemin, f.buffer, quand ? new Date(String(quand).replace(' ', 'T')) : new Date());
                inclus.push({ chemin, statut: l.status, place: place.place, copie: place.arbre === 'entreprise' && l.scope !== 'COMPANY' });
            }
        }
        const maintenant = new Date();
        await zip.ajouter('_sommaire.txt', sommaireDeLArchive(portee, arbres.source, inclus, absents, maintenant, nonRanges), maintenant);
        await zip.terminer();
        res.end();
        logAudit(req, 'archive.export', 'Archive', null);
    } catch (err) {
        if (!(err && err.code === 'ZIP_ABANDON')) console.error('Erreur export archive :', err);
        res.destroy(err);
    }
};

module.exports = { getSuivi, getArchive, importArchive, getArchiveFile, deleteArchive, bulkDeleteArchive,
    getArchiveStockage, exporterArchive, lignesDuCoffre, porteeDeLArchive, sommaireDeLArchive };
