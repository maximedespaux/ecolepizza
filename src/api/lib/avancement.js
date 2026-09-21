const { computeDocParcours, companyParcours } = require('./parcours.js');
const { getEnabledFields, loadDossierFactsMap, loadConditionMap } = require('./conditions.js');
const { loadEquivalences, equivalenceMap } = require('./equivalence.js');
const { enrollmentSteps, formationSteps } = require('../controllers/formationProgram.controller.js');

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
    const fieldCatalog = await getEnabledFields(conn, orgId, 'condition');
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

    // `formationSteps` par formation (toutes les étapes candidates), en cache.
    const cacheEtapes = new Map();
    async function toutesLesEtapes(program) {
        if (cacheEtapes.has(program.id)) return cacheEtapes.get(program.id);
        const all = await formationSteps(conn, orgId, program);
        cacheEtapes.set(program.id, all);
        return all;
    }

    for (const e of dossiers) {
        const vide = { percent: 0, done: 0, total: 0, score: 'ROUGE', signed: 0, toSign: 0, currentKey: null, documents: [] };
        if (!e.program_id) { out.set(e.enrollment_id, vide); continue; }

        const program = { id: e.program_id, code: e.program_code, days: e.program_days, hygiene: e.program_hygiene, rs_code: e.program_rs };
        const ctx = {
            financing: e.financing, rsCode: e.program_rs, hygiene: !!e.program_hygiene,
            jours: e.program_days || 1, agefice: (e.opco || '').toUpperCase() === 'AGEFICE',
            ...(factsMap.get(e.enrollment_id) || {}),
        };
        let steps = await enrollmentSteps(conn, orgId, program, ctx, condById, eqMap);
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
        if (ent.steps) steps = ent.steps;
        if (ent.docs.length) docs.push(...ent.docs);

        const parc = computeDocParcours({
            steps, docs,
            pieces: piecesParDossier.get(e.enrollment_id) || {},
            remises: remisesParDossier.get(e.enrollment_id) || {},
        });
        const total = parc.steps.length;
        /* DEUX NOMBRES, DEUX SENS. `done` compte les étapes FAITES, dans n'importe quel ordre — le
           Suivi en fait la somme par entreprise pour son pourcentage. `etape` est le RANG de la
           prochaine étape, celui qu'affiche le pipeline (« Étape 3/12 »). Tant que le parcours se
           faisait dans l'ordre, les deux coïncidaient ; une étape faite en avance les sépare. */
        const done = parc.done;
        const etape = parc.currentIndex;
        const signable = parc.steps.filter((s) => s.signable || s.quiz);
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
            score: total > 0 && done >= total ? 'VERT' : (done > 0 || anyHandled) ? 'ORANGE' : 'ROUGE',
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
                status: s.docStatus || 'A_FAIRE',
            })) : [],
        });
    }
    return out;
}

module.exports = { avancementDossiers };
