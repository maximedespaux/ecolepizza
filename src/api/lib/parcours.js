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

/**
 * Calcule le parcours documentaire d'un dossier.
 * steps = étapes ordonnées (cf. enrollmentSteps) ; docs = generated_document du
 * dossier [{ id, type, status, template_slug, quiz_id }].
 * Renvoie { steps:[{key,ic,label,sub,signable,quiz,docId,docStatus,status}],
 *           percent, currentIndex, currentKey }.
 */
function computeDocParcours({ steps = [], docs = [] } = {}) {
    const rows = steps.map((s) => {
        const doc = matchDoc(s, docs);
        return { s, doc, done: stepDone(s, doc) };
    });

    let currentIndex = rows.findIndex((r) => !r.done);
    if (currentIndex < 0) currentIndex = rows.length;

    const outSteps = rows.map((r, i) => ({
        key: keyFor(r.s), ic: iconFor(r.s), label: r.s.label, sub: subFor(r.s),
        signable: mustSign(r.s), quiz: !!r.s.quiz_id,
        // Document destiné à l'ENTREPRISE : visible dans le parcours du stagiaire mais
        // généré depuis la fiche entreprise (jamais depuis la fiche stagiaire).
        company_level: !!r.s.company_level,
        docId: r.doc ? r.doc.id : null,
        docStatus: r.doc ? r.doc.status : null,
        status: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo',
    }));

    return {
        steps: outSteps,
        percent: rows.length ? Math.round((currentIndex / rows.length) * 100) : 0,
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

module.exports = { computeDocParcours, companyParcours, companyStepSlugs };
