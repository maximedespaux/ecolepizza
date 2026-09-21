// Parcours d'un dossier stagiaire = parcours DOCUMENTAIRE de sa formation.
// Chaque étape est un document (ou un QCM) défini dans le « Parcours documentaire »
// de la formation, filtré aux conditions du dossier. Le statut de chaque étape est
// déduit du document généré correspondant (produit / envoyé / signé).
// Un même calcul alimente la fiche stagiaire et le tableau de session (pipeline).

const SENT = ['ENVOYE', 'CONSULTE', 'SIGNE'];
// Un document DOIT être signé par le stagiaire pour valider l'étape uniquement si
// son modèle le prévoit (Modeles de document : stagiaire_sign). Le parcours n'avance
// alors qu'une fois CE document reçu signé (jamais au simple envoi).
const mustSign = (s) => !!s.stagiaire_sign;
// Une signature (stagiaire OU entreprise) est requise pour valider l'étape.
const needsSignature = (s) => !!s.stagiaire_sign || !!s.company_sign;
const iconFor = (s) => (s.quiz_id ? '❓' : (needsSignature(s) ? '✍️' : '📄'));
const keyFor = (s) => (s.quiz_id ? `quiz:${s.quiz_id}` : s.slug);
function subFor(s) {
    if (s.quiz_id) return 'QCM' + (s.day != null && s.day !== '' ? ` · jour ${s.day}` : '');
    if (s.company_sign) return "À signer par l'entreprise";
    if (mustSign(s)) return 'À signer par le stagiaire';
    return s.doc_type || '';
}

// Retrouve le document produit pour une étape : par slug de modèle en priorité,
// sinon par type ; par quiz_id pour un QCM.
function matchDoc(step, docs) {
    if (step.quiz_id) return docs.find((d) => d.quiz_id === step.quiz_id) || null;
    return docs.find((d) => d.template_slug && d.template_slug === step.slug)
        || docs.find((d) => d.type === step.doc_type) || null;
}

// Étape « faite » : QCM / document à signer par le stagiaire => statut SIGNÉ requis
// (l'étape n'avance qu'à réception de CE document signé) ; autre document => envoyé.
function stepDone(step, doc) {
    if (!doc) return false;
    if (step.quiz_id || needsSignature(step)) {
        return doc.status === 'SIGNE';
    }
    return SENT.includes(doc.status);
}

/* ─── L'ÉTAT RÉEL D'UNE ÉTAPE, QUEL QUE SOIT SON RANG ───────────────────────────────────────
   Demandé le 2026-09-21 : distinguer « pas fait », « envoyé », « reçu » et « validé », et ne plus
   griser une étape parce qu'une étape AVANT elle n'est pas finie. Le parcours ne connaissait que
   son rang — faite / en cours / à venir — : une pièce déposée en troisième position, une
   convention signée derrière une carte d'identité manquante, s'affichaient « à venir », grisées,
   comme si rien n'avait eu lieu.

     A_FAIRE     rien n'est parti (ou la pièce a été refusée : elle est à renvoyer)
     ENVOYE      l'école a envoyé, elle attend le stagiaire — signature, réponse au QCM, accusé
                 de réception d'une remise
     RECU        le stagiaire a déposé une pièce, l'école doit la vérifier
     VALIDE      l'étape est faite
     SANS_OBJET  remise écartée pour ce dossier (migration 161) — comptée faite, sans rien valider

   UN DOCUMENT SANS SIGNATURE est fait dès qu'il est envoyé : il n'attend personne, il est donc
   VALIDE, pas « envoyé » — sinon il resterait bleu pour toujours. */
const ETATS = ['A_FAIRE', 'ENVOYE', 'RECU', 'VALIDE', 'SANS_OBJET'];
function etatEtape(r) {
    if (r.s.piece_id) return { VALIDEE: 'VALIDE', DEPOSEE: 'RECU' }[r.pieceStatus] || 'A_FAIRE';
    if (r.s.remise_id) {
        if (r.sansObjet) return 'SANS_OBJET';
        return { RECUE: 'VALIDE', REMISE: 'ENVOYE' }[r.remiseStatus] || 'A_FAIRE';
    }
    if (r.done) return 'VALIDE';
    return r.doc && SENT.includes(r.doc.status) ? 'ENVOYE' : 'A_FAIRE';
}
/** L'état d'une étape de GROUPE (parcours entreprise), d'après ses compteurs. */
function etatDeGroupe({ done, gen = 0, total = 0 }) {
    if (done) return 'VALIDE';
    if (!total) return 'SANS_OBJET';   // aucun stagiaire concerné
    return gen > 0 ? 'ENVOYE' : 'A_FAIRE';
}
/** Pourcentage d'étapes FAITES — toutes, pas seulement celles qui précèdent la première manquante. */
const pourcentFait = (faites, total) => (total ? Math.round((faites / total) * 100) : 0);

/**
 * Calcule le parcours documentaire d'un dossier.
 * steps = étapes ordonnées (cf. enrollmentSteps) ; docs = generated_document du
 * dossier [{ id, type, status, template_slug, quiz_id }].
 * Renvoie { steps:[{key,ic,label,sub,signable,quiz,docId,docStatus,status}],
 *           percent, currentIndex, currentKey }.
 */
function computeDocParcours({ steps = [], docs = [], pieces = {}, remises = {} } = {}) {
    const rows = steps.map((s) => {
        // Étape « pièce » (dépôt du stagiaire, ex. carte d'identité) : sa complétion vient de
        // piece_depot.statut, PAS d'un document généré (il n'y en a pas). VALIDÉE ⇒ étape faite,
        // le parcours avance. `pieces` = { [piece_id]: statut } fourni par getParcours.
        if (s.piece_id) {
            const st = pieces[s.piece_id] || null;
            return { s, doc: null, done: st === 'VALIDEE', pieceStatus: st || 'ATTENDUE' };
        }
        /* Étape « remise » (l'école remet un document au stagiaire) : sa complétion vient de
           `remise_document`, pas d'un document généré — il n'y en a pas non plus. DÉPOSER NE
           SUFFIT PAS : seul l'accusé de réception termine l'étape (cf. migration 160).
           « SANS OBJET » (161) la fait compter comme faite ICI, parce que ce calcul mesure une
           PROGRESSION et qu'une étape exclue ne doit rien bloquer. Le décompte de conformité,
           lui, l'écarte des deux côtés de la fraction — c'est `stepState` qui le dit. */
        if (s.remise_id) {
            const r = remises[s.remise_id] || null;
            const sansObjet = !!(r && r.sans_objet);
            return {
                s, doc: null,
                done: sansObjet || (r && r.statut === 'RECUE'),
                remiseStatus: (r && r.statut) || 'ATTENDUE',
                remiseId: (r && r.id) || null,
                sansObjet,
            };
        }
        const doc = matchDoc(s, docs);
        return { s, doc, done: stepDone(s, doc) };
    });

    /* LA PROCHAINE ÉTAPE reste la première non faite : c'est elle qui range la carte du pipeline
       dans sa colonne. Mais l'AVANCEMENT compte toutes les étapes faites — une convention signée
       derrière une pièce manquante était « jamais comptée », et un dossier fait à 11 étapes sur 12
       pouvait afficher 0 %. */
    let currentIndex = rows.findIndex((r) => !r.done);
    if (currentIndex < 0) currentIndex = rows.length;
    const faites = rows.filter((r) => r.done).length;

    const outSteps = rows.map((r, i) => ({
        key: keyFor(r.s), ic: iconFor(r.s), label: r.s.label, sub: subFor(r.s),
        signable: mustSign(r.s), quiz: !!r.s.quiz_id,
        // Document destiné à l'ENTREPRISE : visible dans le parcours du stagiaire mais
        // généré depuis la fiche entreprise (jamais depuis la fiche stagiaire).
        company_level: !!r.s.company_level,
        docId: r.doc ? r.doc.id : null,
        docStatus: r.doc ? r.doc.status : null,
        piece: !!r.s.piece_id, // étape « pièce » (dépôt du stagiaire) — gérée par le panneau Pièces, pas « à préparer »
        /* L'IDENTIFIANT DU TYPE DE PIÈCE, et pas seulement le drapeau. Sans lui, l'écran sait
           qu'une étape est une pièce mais ne peut rien en faire : déposer un fichier pour le
           compte du stagiaire — une carte d'identité reçue par courriel — exige de nommer la
           pièce visée. Il cherchait à la place un MODÈLE DE DOCUMENT portant ce slug, qui
           n'existe pas : une pièce vit dans `piece_type`, pas dans `document_template`. */
        piece_id: r.s.piece_id || null,
        /* COMBIEN DE FICHIERS CETTE PIÈCE ATTEND. Le plafond est appliqué au dépôt (le serveur
           refuse le fichier de trop en nommant le nombre admis), mais l'écran doit le connaître
           AVANT : sans lui, le sélecteur reste mono-fichier et un justificatif en six pages se
           dépose en six allers-retours. */
        fichiers_attendus: Math.max(1, Number(r.s.fichiers_attendus) || 1),
        pieceStatus: r.pieceStatus || null, // ATTENDUE | DEPOSEE | VALIDEE | REFUSEE (étapes « pièce »)
        remise: !!r.s.remise_id,       // étape « remise » — gérée par le panneau Documents remis
        remise_id: r.s.remise_id || null,
        remiseId: r.remiseId || null,  // l'identifiant de LA remise du dossier (pas du type) : c'est lui qu'on exclut
        remiseStatus: r.remiseStatus || null, // ATTENDUE | REMISE | RECUE
        sansObjet: !!r.sansObjet,
        /* `status` garde son sens de RANG (faite / en cours / à venir) pour ceux qui s'en servent
           encore ; `etat` dit ce qui s'est réellement passé, et c'est lui que l'écran affiche. */
        status: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo',
        etat: etatEtape(r),
    }));

    return {
        steps: outSteps,
        percent: pourcentFait(faites, rows.length),
        done: faites,
        currentIndex,
        currentKey: currentIndex < outSteps.length ? outSteps[currentIndex].key : null,
    };
}

/**
 * Le parcours « à l'arrivée via une entreprise » d'un dossier rattaché à une entreprise.
 *
 * Un dossier envoyé par un employeur ne suit PAS le parcours du stagiaire seul : il suit la
 * section `company_steps` de la formation, plus courte, et une partie de ses documents sont
 * générés au niveau du GROUPE (scope COMPANY) — donc invisibles si l'on ne regarde que
 * `document_formation`.
 *
 * POURQUOI CETTE FONCTION EXISTE. Ce traitement était écrit deux fois, presque à l'identique,
 * dans le Suivi Qualiopi et dans la fiche dossier — et il MANQUAIT dans le tableau du Pipeline,
 * qui affichait donc les mêmes dossiers à 1/14 (7 %) là où le Suivi disait 1/2 (50 %). Trois
 * écrans, trois vérités. Une copie oubliée est le mode de panne normal d'un bloc dupliqué :
 * il vit ici désormais, et les trois appellent le même code.
 *
 * Renvoie `{ steps, docs }` :
 *   · `steps` = les étapes du parcours entreprise, ou `null` si ce dossier n'en relève pas
 *     (pas d'entreprise, ou formation sans section entreprise) — l'appelant garde alors son
 *     parcours habituel ;
 *   · `docs` = les documents de groupe à AJOUTER à ceux du dossier.
 *
 * Dégrade en silence si les colonnes manquent (migrations 077/092 non jouées) : un parcours
 * un peu faux vaut mieux qu'un écran en erreur.
 */
const absente = (err) => err && (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE');

/**
 * Les slugs de la section « à l'arrivée via une entreprise » d'une formation, dans l'ordre.
 *
 * Séparé de companyParcours parce qu'on en a besoin SANS dossier : le tableau du Pipeline
 * doit prévoir une colonne pour ces étapes avant même de savoir si un dossier les empruntera.
 */
async function companyStepSlugs(conn, orgId, programId) {
    if (!programId) return [];
    try {
        const [[pr]] = await conn.query(
            'SELECT company_steps FROM training_program WHERE id = ? AND organization_id = ?', [programId, orgId]);
        let cs = pr && pr.company_steps;
        if (typeof cs === 'string') { try { cs = JSON.parse(cs); } catch { cs = []; } }
        return Array.isArray(cs) ? cs : [];
    } catch (err) { if (!absente(err)) throw err; return []; }
}

async function companyParcours(conn, orgId, { programId, companyId, sessionId }, loadAllSteps) {
    const vide = { steps: null, docs: [] };
    if (!companyId || !programId) return vide;

    const ordre = await companyStepSlugs(conn, orgId, programId);
    let steps = null;
    if (ordre.length) {
        const all = await loadAllSteps();
        const bySlug = new Map(all.map((s) => [s.slug, s]));
        steps = ordre.map((sl) => bySlug.get(sl)).filter(Boolean);
        if (!steps.length) steps = null; // section qui ne pointe que vers des étapes disparues
    }

    // Documents de GROUPE, strictement ceux de CETTE session : une convention signée pour la
    // session de mars n'a pas à faire avancer celle de septembre.
    let docs = [];
    try {
        const [rows] = await conn.query(
            `SELECT id, type, status, template_slug, quiz_id FROM generated_document
             WHERE organization_id = ? AND company_id = ? AND session_id = ? AND scope = 'COMPANY'
             ORDER BY created_at DESC`,
            [orgId, companyId, sessionId]
        );
        docs = rows;
    } catch (err) { if (!absente(err)) throw err; }

    return { steps, docs };
}

module.exports = { computeDocParcours, companyParcours, companyStepSlugs, etatDeGroupe, pourcentFait, ETATS };
