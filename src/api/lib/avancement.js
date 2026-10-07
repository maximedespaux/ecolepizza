const { computeDocParcours, companyParcours } = require('./parcours.js');
const { champsDesConditions, loadDossierFactsMap, loadConditionMap } = require('./conditions.js');
const { loadEquivalences, equivalenceMap } = require('./equivalence.js');
const { enrollmentSteps, formationSteps, resoudreVariantesEntreprise } = require('../controllers/formationProgram.controller.js');
const { loadOrgSteps } = require('../controllers/template.controller.js');
const PointDeRupture = require('./pointDeRupture.js');

/* LES POINTS DE RUPTURE DE CHAQUE FORMATION, en une requête : celui du parcours du dossier
   (migration 076), la section entreprise et son point (092, 100). Colonnes absentes : aucun point,
   donc rien ne bloque — comme pour l'émargement. */
async function pointsDesFormations(conn, orgId) {
    const out = new Map();
    try {
        const [rows] = await conn.query(
            `SELECT id, emargement_break_slug AS bs, company_steps AS cs, company_break_slug AS cbs
               FROM training_program WHERE organization_id = ?`, [orgId]);
        for (const r of rows) {
            let cs = r.cs;
            if (typeof cs === 'string') { try { cs = JSON.parse(cs); } catch { cs = []; } }
            out.set(r.id, { dossier: r.bs || null, entreprise: r.cbs || null, section: Array.isArray(cs) ? cs : [] });
        }
    } catch (err) {
        if (!(err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE'))) throw err;
    }
    return out;
}

/**
 * AVANCEMENT RÉEL D'UN DOSSIER — le pourcentage d'étapes franchies de son parcours.
 *
 * POURQUOI CE CALCUL SORT DU SUIVI. Il n'y vivait que pour le tableau de conformité, alors que
 * deux autres écrans affichaient, eux, la colonne `enrollment.conformite_score`. Or cette
 * colonne n'est JAMAIS recalculée : elle est écrite « ROUGE » à l'inscription et plus rien ne
 * la touche. Mesuré en production sur les cinq dossiers de l'école : tous stockés à « ROUGE »,
 * alors que leur avancement réel valait 31 %, 0 %, 19 %, 44 % et 19 %. Le tableau de bord et la
 * page session affichaient donc une constante déguisée en indicateur.
 *
 * On ne remplit pas la colonne pour autant : un avancement se périme à chaque document envoyé,
 * chaque pièce validée, chaque étape ajoutée au parcours d'une formation. Une valeur stockée
 * devrait être invalidée depuis une dizaine d'endroits, et le jour où l'un d'eux est oublié,
 * l'écran ment sans que rien ne le signale — exactement ce qui vient d'arriver. On calcule.
 *
 * LE CALCUL RESTE ICI, EN UN SEUL EXEMPLAIRE, et chaque écran l'appelle avec ses propres
 * droits : `/api/suivi` est réservé aux rôles d'audit, quand un formateur peut ouvrir une
 * session. Faire appeler le suivi par la page session aurait vidé les pourcentages pour lui.
 */

/**
 * @param dossiers lignes portant au minimum { enrollment_id, program_id } et, quand elles
 *        existent, financing / opco / program_* / enr_company_id / session_id.
 * @param avecDocuments true pour obtenir en plus la feuille de route (le suivi en a besoin,
 *        pas une pastille de pourcentage : c'est le gros de la charge utile).
 * @returns Map enrollment_id -> { percent, done, total, score, signed, toSign, currentKey, documents }
 */
async function avancementDossiers(conn, orgId, dossiers, { avecDocuments = false } = {}) {
    const out = new Map();
    if (!dossiers || !dossiers.length) return out;

    // Conditions, équivalences et faits : chargés UNE fois pour toute la série.
    const condById = await loadConditionMap(conn, orgId);
    const eqMap = equivalenceMap(await loadEquivalences(conn, orgId));
    const fieldCatalog = await champsDesConditions(conn, orgId, condById);
    const factsMap = await loadDossierFactsMap(conn, orgId, dossiers.map((e) => e.enrollment_id), fieldCatalog);

    /* Statut des pièces déposées, pour tous les dossiers en une requête. Une étape « pièce »
       n'a pas de document généré : sa complétion vient de `piece_depot`. Sans ces statuts, le
       parcours s'arrête à la première pièce et le pourcentage plafonne. */
    const piecesParDossier = new Map();
    try {
        const [pd] = await conn.query(
            'SELECT enrollment_id, piece_type_id, statut FROM piece_depot WHERE organization_id = ?', [orgId]);
        for (const r of pd) {
            if (!piecesParDossier.has(r.enrollment_id)) piecesParDossier.set(r.enrollment_id, {});
            piecesParDossier.get(r.enrollment_id)[r.piece_type_id] = r.statut;
        }
    } catch (err) {
        // Migration 127 non jouée : aucune pièce, le parcours reste lisible sans elles.
        if (!(err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE'))) throw err;
    }

    /* Statut des REMISES, même principe et même prudence. `sans_objet` (161) est lu à part de
       la table : sans la colonne, on relit sans elle et aucune remise n'est exclue — le
       comportement d'avant la migration. */
    const remisesParDossier = new Map();
    try {
        const selRemises = (col) =>
            `SELECT id, enrollment_id, remise_type_id, statut${col} FROM remise_document WHERE organization_id = ?`;
        let rd;
        try { [rd] = await conn.query(selRemises(', sans_objet'), [orgId]); }
        catch (e) {
            if (!(e && e.code === 'ER_BAD_FIELD_ERROR')) throw e;
            [rd] = await conn.query(selRemises(''), [orgId]);
        }
        for (const r of rd) {
            if (!remisesParDossier.has(r.enrollment_id)) remisesParDossier.set(r.enrollment_id, {});
            remisesParDossier.get(r.enrollment_id)[r.remise_type_id] =
                { id: r.id, statut: r.statut, sans_objet: !!r.sans_objet };
        }
    } catch (err) {
        // Migration 160 non jouée : aucune remise, le parcours reste lisible sans elles.
        if (!(err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE'))) throw err;
    }

    /* LE POINT DE RUPTURE FRANCHI ? Le tableau de bord garde en vue les dossiers d'une session
       TERMINÉE qui ne sont pas à 100 % — mais seulement si le stagiaire a franchi le point : resté
       avant, c'est quelqu'un qui n'est jamais venu, et son dossier ne relève plus du suivi. La
       règle est celle de l'émargement (lib/pointDeRupture.js) ; les données, celles déjà chargées
       ici — aucune requête de plus par dossier. */
    const points = await pointsDesFormations(conn, orgId);
    let etapesOrg = null; // chargées une fois, et seulement si un dossier d'entreprise en a besoin

    // `formationSteps` par formation (toutes les étapes candidates), en cache.
    const cacheEtapes = new Map();
    async function toutesLesEtapes(program) {
        if (cacheEtapes.has(program.id)) return cacheEtapes.get(program.id);
        const all = await formationSteps(conn, orgId, program);
        cacheEtapes.set(program.id, all);
        return all;
    }

    for (const e of dossiers) {
        const vide = { percent: 0, done: 0, total: 0, score: 'ROUGE', signed: 0, toSign: 0, currentKey: null, documents: [], point_franchi: true };
        if (!e.program_id) { out.set(e.enrollment_id, vide); continue; }

        const program = { id: e.program_id, code: e.program_code, days: e.program_days, hygiene: e.program_hygiene, rs_code: e.program_rs };
        const ctx = {
            financing: e.financing, rsCode: e.program_rs, hygiene: !!e.program_hygiene,
            jours: e.program_days || 1, agefice: (e.opco || '').toUpperCase() === 'AGEFICE',
            ...(factsMap.get(e.enrollment_id) || {}),
        };
        let steps = await enrollmentSteps(conn, orgId, program, ctx, condById, eqMap);
        const etapesDuDossier = steps; // avant la section entreprise : c'est elle que lit le point du dossier
        const [docs] = await conn.query(
            `SELECT gd.id, gd.type, gd.status, gd.template_slug, gd.quiz_id
             FROM generated_document gd JOIN document_formation df ON df.document_id = gd.id
             WHERE df.enrollment_id = ?
             ORDER BY gd.created_at DESC`,
            [e.enrollment_id]
        );
        /* Dossier envoyé par une entreprise : même parcours que l'entreprise (section
           company_steps, TOUTES les étapes) + statut des documents de GROUPE rattaché. */
        const ent = await companyParcours(conn, orgId,
            { programId: program.id, companyId: e.enr_company_id, sessionId: e.session_id },
            () => toutesLesEtapes(program));
        /* Le point de rupture se juge sur les documents DU DOSSIER et, à part, sur ceux du GROUPE —
           comme l'émargement : on les distingue avant de les réunir pour le parcours. */
        const propres = PointDeRupture.statutsDocuments(docs);
        const groupe = PointDeRupture.statutsDocuments(ent.docs);
        // Le parcours entreprise est une liste explicite : on n'y collapse QUE les groupes
        // d'équivalence « OU » (devis pro / devis AGEFICE → un seul jalon, la variante applicable),
        // sans jamais filtrer les étapes isolées par condition. Cf. resoudreVariantesEntreprise.
        if (ent.steps) steps = resoudreVariantesEntreprise(ent.steps, ctx, condById, eqMap);
        if (ent.docs.length) docs.push(...ent.docs);

        const pt = points.get(program.id) || {};
        let franchi = true;
        if (pt.dossier) {
            const brk = (await toutesLesEtapes(program)).find((s) => s.slug === pt.dossier);
            if (brk) {
                const exigees = PointDeRupture.exigencesDossier(etapesDuDossier, Number(brk.sort_order));
                if (PointDeRupture.bilan(exigees, (s) => PointDeRupture.signeeDossier(s, propres)).locked) franchi = false;
            }
        }
        // Volet entreprise : seulement pour un dossier ARRIVÉ par une entreprise (enrollment.company_id).
        if (franchi && e.enr_company_id && pt.entreprise && pt.section && pt.section.length) {
            if (!etapesOrg) etapesOrg = new Map((await loadOrgSteps(orgId)).map((s) => [s.slug, s]));
            /* Les étapes FACULTATIVES de la formation (migration 188) ne ferment rien : elles viennent
               de son parcours, que les modèles de l'organisme (`etapesOrg`) ne connaissent pas. */
            const facultatifs = new Set((await toutesLesEtapes(program)).filter((x) => x.facultatif).map((x) => x.slug));
            const exigees = PointDeRupture.exigencesEntreprise(pt.section, pt.entreprise, etapesOrg, facultatifs);
            if (exigees && PointDeRupture.bilan(exigees, (s) => PointDeRupture.signeeEntreprise(s, propres, groupe)).locked) franchi = false;
        }

        const parc = computeDocParcours({
            steps, docs,
            pieces: piecesParDossier.get(e.enrollment_id) || {},
            remises: remisesParDossier.get(e.enrollment_id) || {},
        });
        /* LES ÉTAPES DUES SEULEMENT : une étape facultative (migration 188) n'entre dans aucun des deux
           nombres. `parc.total` le dit ; `parc.steps` les garde toutes pour l'affichage. */
        const total = parc.total;
        /* DEUX NOMBRES, DEUX SENS. `done` compte les étapes FAITES, dans n'importe quel ordre — le
           Suivi en fait la somme par entreprise pour son pourcentage. `etape` est le RANG de la
           prochaine étape, celui qu'affiche le pipeline (« Étape 3/12 »). Tant que le parcours se
           faisait dans l'ordre, les deux coïncidaient ; une étape faite en avance les sépare.
           Le rang se compte parmi les étapes DUES (`parc.rang`), comme `total` sur lequel il se lit. */
        const done = parc.done;
        const etape = parc.rang;
        const signable = parc.steps.filter((s) => !s.facultatif && (s.signable || s.quiz));
        const anyHandled = parc.steps.some((s) => ['GENERE', 'ENVOYE', 'CONSULTE', 'SIGNE'].includes(s.docStatus));

        out.set(e.enrollment_id, {
            percent: parc.percent,
            done,
            etape,
            total,
            /* L'ÉTAPE COURANTE, pour le tableau du pipeline : c'est elle qui décide dans quelle
               COLONNE tombe la carte. Sans les pièces au calcul, elle désignait la première
               pièce du parcours et la carte n'en bougeait plus — quatre dossiers à moitié faits
               restaient empilés dans la toute première colonne. */
            currentKey: parc.currentKey,
            /* Le point de rupture du parcours est-il franchi ? Vrai aussi quand la formation n'en
               pose aucun : rien ne bloque — la règle de l'émargement. */
            point_franchi: franchi,
            /* Complet quand tout le DÛ est fait ; un parcours dont tout est facultatif l'est d'office
               (rien n'est dû), un parcours vide ne l'est pas. */
            score: parc.steps.length > 0 && done >= total ? 'VERT' : (done > 0 || anyHandled) ? 'ORANGE' : 'ROUGE',
            signed: signable.filter((s) => s.docStatus === 'SIGNE').length,
            toSign: signable.length,
            // Format attendu par la feuille de route (Roadmap). Omis quand personne ne le lit.
            documents: avecDocuments ? parc.steps.map((s, i) => ({
                num: i + 1, type: s.key, label: s.label,
                stagiaireSign: !!s.signable, quiz: !!s.quiz,
                company_level: !!s.company_level,
                /* Une pièce n'a PAS de document généré : son état ne peut pas venir de
                   `docStatus`, qui vaudrait « à faire » à vie. */
                piece: !!s.piece,
                pieceStatus: s.pieceStatus || null,
                remise: !!s.remise, remiseStatus: s.remiseStatus || null, sansObjet: !!s.sansObjet,
                facultatif: !!s.facultatif, // hors décompte : la grille le montre, le bandeau ne le réclame pas
                status: s.docStatus || 'A_FAIRE',
            })) : [],
        });
    }
    return out;
}

/**
 * « À CLÔTURER » — un dossier dont le PARCOURS est à 100 %, mais dont la FORMATION n'est pas encore
 * déclarée terminée (demandé le 2026-10-07). Le parcours est CALCULÉ (avancementDossiers), la
 * formation terminée est DÉCLARÉE par l'école (`learner.completed_levels`, une liste de codes de
 * formation acquise, ALIMENTÉE avec `program.code` par la fiche) : les deux peuvent diverger, et
 * c'est précisément ce qu'on veut voir. Règle PURE, partagée par le suivi et la liste des stagiaires,
 * SANS la condition « session passée » (on signale dès 100 %, choix de l'école). On compare les
 * codes BRUTS, ceux qu'écrit la fiche — pas la forme traduite pour l'affichage.
 */
function estACloturer(percent, programCode, completedCsv) {
    if (Number(percent) < 100 || !programCode) return false;
    const faits = String(completedCsv || '').split(',').map((s) => s.trim()).filter(Boolean);
    return !faits.includes(programCode);
}

/**
 * Les dossiers « à clôturer » de l'organisme : [{ enrollment_id, learner_id, program_code }].
 * Même pool que le suivi (TOUS les dossiers) ; le pourcentage vient d'`avancementDossiers` (sans la
 * feuille de route : une pastille n'en a pas besoin).
 */
async function dossiersACloturer(conn, orgId) {
    const [enr] = await conn.query(
        `SELECT e.id AS enrollment_id, e.learner_id, e.financing, e.session_id,
                e.company_id AS enr_company_id, l.opco, l.completed_levels,
                p.id AS program_id, p.code AS program_code, p.days AS program_days,
                p.hygiene AS program_hygiene, p.rs_code AS program_rs
           FROM enrollment e
           LEFT JOIN learner l ON l.id = e.learner_id
           LEFT JOIN training_session s ON s.id = e.session_id
           LEFT JOIN training_program p ON p.id = s.program_id
          WHERE e.organization_id = ?`, [orgId]);
    const av = await avancementDossiers(conn, orgId, enr);
    const out = [];
    for (const e of enr) {
        const a = av.get(e.enrollment_id);
        if (a && estACloturer(a.percent, e.program_code, e.completed_levels)) {
            out.push({ enrollment_id: e.enrollment_id, learner_id: e.learner_id, program_code: e.program_code });
        }
    }
    return out;
}

module.exports = { avancementDossiers, estACloturer, dossiersACloturer };
