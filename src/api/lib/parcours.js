// Parcours (cycle de vie) d'un dossier stagiaire dans une session — dérivé de
// l'étape CRM, des documents produits et des dates de session. Un même calcul
// alimente la fiche stagiaire (parcours détaillé) et le tableau de session (pipeline).

const STAGE_ORDER = ['PROSPECT', 'CONTACTE', 'DEVIS_ENVOYE', 'DEVIS_SIGNE', 'ACOMPTE_PAYE', 'INSCRIT', 'EN_FORMATION', 'TERMINE', 'EVALUATION_ENVOYEE', 'ARCHIVE'];
const SIGN_TYPES = ['DEVIS', 'CONTRAT', 'CONVENTION', 'DROIT_IMAGE'];
const SENT = ['ENVOYE', 'CONSULTE', 'SIGNE'];

// Étapes macro du parcours (ordre = déroulé de l'inscription au suivi).
const STAGES = [
    { key: 'inscription', ic: '📝', label: 'Inscription', sub: 'Expression du stagiaire — confirmation secrétariat' },
    { key: 'generation', ic: '📄', label: 'Génération des documents', sub: 'documents — secrétariat + espace étudiant (sauvegarde)' },
    { key: 'envoi', ic: '✉️', label: 'Envoi automatique', sub: 'Documents envoyés par e-mail' },
    { key: 'signature', ic: '✍️', label: 'Signature électronique', sub: 'Devis & convention à signer' },
    { key: 'acompte', ic: '💳', label: 'Acompte / Prise en charge', sub: 'Stripe · chèque · virement · OPCO — confirmé par le secrétariat' },
    { key: 'convocation', ic: '📧', label: 'Convocation (J-30)', sub: 'Convocation + liste matériel + brochure' },
    { key: 'rappel', ic: '🔔', label: 'Rappel (J-3)', sub: 'Matériel, brochure, accès plateforme' },
    { key: 'formation', ic: '👨‍🍳', label: 'Formation', sub: 'Émargement · questionnaire du niveau' },
    { key: 'evaluation', ic: '😊', label: 'Évaluation à chaud', sub: 'Questionnaire de satisfaction' },
    { key: 'fin', ic: '🎓', label: 'Fin de stage', sub: 'Attestation · Certificat · Facture (par mail)' },
    { key: 'suivi', ic: '⭐', label: 'Suivi 6 mois (formateur)', sub: 'Situation, débouchés, matériel, emploi, formations' },
];

const toDate = (iso) => new Date(iso + 'T00:00:00');
function shiftDays(iso, n) { const d = toDate(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function shiftMonths(iso, n) { const d = toDate(iso); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); }

/**
 * Calcule le parcours d'un dossier.
 * ctx = { crmStage, startDate, endDate, today, docs:[{id,type,status}] }.
 * Renvoie { steps:[{...STAGE, status:'done'|'current'|'todo'}], percent, currentIndex,
 *           currentKey, signableDocId }.
 */
function computeParcours(ctx = {}) {
    const docs = ctx.docs || [];
    const today = ctx.today || new Date().toISOString().slice(0, 10);
    const crmIdx = STAGE_ORDER.indexOf(ctx.crmStage);
    const start = ctx.startDate || null;
    const end = ctx.endDate || null;

    const sentOf = (t) => docs.some((d) => d.type === t && SENT.includes(d.status));
    const has = (t) => docs.some((d) => d.type === t);
    const sentCount = docs.filter((d) => SENT.includes(d.status)).length;
    const signable = docs.filter((d) => SIGN_TYPES.includes(d.type));
    const signablePendingDoc = signable.find((d) => d.status !== 'SIGNE') || null;
    const signableSignedAll = signable.length > 0 && !signablePendingDoc;

    const done = {
        inscription: crmIdx >= 1 || has('FICHE_SEMAINE'),
        generation: docs.length > 0,
        envoi: sentCount > 0 || crmIdx >= 2,
        signature: signable.length > 0 ? signableSignedAll : crmIdx >= 3,
        acompte: crmIdx >= 4,
        convocation: sentOf('CONVOCATION') || sentOf('INVITATION'),
        rappel: !!start && today >= shiftDays(start, -3),
        formation: crmIdx >= STAGE_ORDER.indexOf('TERMINE') || (!!end && today > end),
        evaluation: crmIdx >= STAGE_ORDER.indexOf('EVALUATION_ENVOYEE') || sentOf('EVALUATION_SATISFACTION'),
        fin: sentOf('CERTIFICAT_REALISATION') || sentOf('ATTESTATION_ASSIDUITE'),
        suivi: !!end && today >= shiftMonths(end, 6),
    };

    // Parcours linéaire : la 1re étape non faite est « en cours ».
    let currentIndex = STAGES.findIndex((s) => !done[s.key]);
    if (currentIndex < 0) currentIndex = STAGES.length;

    const steps = STAGES.map((s, i) => ({
        key: s.key, ic: s.ic, label: s.label, sub: s.sub,
        status: i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo',
    }));

    return {
        steps,
        percent: Math.round((currentIndex / STAGES.length) * 100),
        currentIndex,
        currentKey: currentIndex < STAGES.length ? STAGES[currentIndex].key : null,
        signableDocId: signablePendingDoc ? signablePendingDoc.id : null,
    };
}

module.exports = { STAGES, STAGE_ORDER, computeParcours };
