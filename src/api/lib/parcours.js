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

module.exports = { computeDocParcours };
