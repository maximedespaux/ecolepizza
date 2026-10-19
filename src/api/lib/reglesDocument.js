/**
 * LES RÈGLES D'E-MAIL DÉCLENCHÉES PAR UN DOCUMENT (migration 196) — « quand la Convention est signée,
 * écrire au stagiaire », demandé le 2026-09-30.
 *
 * Deux déclencheurs d'ÉVÉNEMENT, à côté des déclencheurs de DATE (lib/mailsProgrammes.js) : un
 * document ENVOYÉ pour signature, un document SIGNÉ. Ils partent À L'INSTANT (crochet dans le
 * contrôleur des documents), pas au passage des trente minutes — d'où ni sens ni décalage.
 *
 * DU JAVASCRIPT PUR, sans base : le contrôleur donne le document et les adresses, ces fonctions
 * disent si la règle s'applique et à qui. Le test `regles-document.test.js` les éprouve seules.
 */

/** Les deux déclencheurs d'événement SUR UN DOCUMENT (generated_document), et l'état qui les arme. */
const DECLENCHEURS_DOC = {
    document_envoye: { libelle: 'un document envoyé pour signature', etat: 'ENVOYE' },
    document_signe: { libelle: 'un document signé', etat: 'SIGNE' },
};
const estDeclencheurDoc = (d) => Object.prototype.hasOwnProperty.call(DECLENCHEURS_DOC, d);

/* DÉCLENCHEUR SUR UNE REMISE (demandé le 2026-10-19 : « quand l'école remet l'AGEFICE, écrire »).
   À PART des documents : une remise vit dans remise_type/remise_document (migration 160), jamais
   dans generated_document — d'où un crochet distinct (remise.controller → declencherReglesRemise).
   « remise » = l'école DÉPOSE le document (statut REMISE), pas l'accusé de réception. */
const DECLENCHEURS_REMISE = {
    remise_remise: { libelle: 'un document remis par l’école (remise, ex. AGEFICE)' },
};
const estDeclencheurRemise = (d) => Object.prototype.hasOwnProperty.call(DECLENCHEURS_REMISE, d);
/* Un déclencheur d'ÉVÉNEMENT (immédiat : document OU remise), par opposition à un déclencheur de
   DATE (fin/début de session, inscription — lib/mailsProgrammes.js). Pour un événement, ni sens ni
   décalage, et le « modèle ciblé » (template_slug) est permis. */
const estDeclencheurEvenement = (d) => estDeclencheurDoc(d) || estDeclencheurRemise(d);

/** À qui part le message — le choix se fait règle par règle. */
const DESTINATAIRES = {
    stagiaire: 'Le stagiaire',
    entreprise: 'L’entreprise (représentant)',
    stagiaire_entreprise: 'Le stagiaire et l’entreprise',
};
const destinataireValide = (d) => Object.prototype.hasOwnProperty.call(DESTINATAIRES, d);

/**
 * L'ensemble des formations d'une règle (migration 198), ou `null` pour « toutes ». `program_ids`
 * (la table d'association) fait autorité quand elle porte des lignes ; sinon on retombe sur la
 * colonne `program_id` d'avant (une formation, ou NULL = toutes). Les deux restent donc lisibles,
 * avant comme après la migration.
 */
function formationsDeRegle(regle) {
    const liste = Array.isArray(regle && regle.program_ids) ? regle.program_ids.filter(Boolean) : [];
    if (liste.length) return liste;
    return regle && regle.program_id ? [regle.program_id] : null;
}

/**
 * La règle vise-t-elle CE document ? Chaque filtre renseigné doit correspondre ; un filtre NULL
 * laisse passer. Le modèle (`template_slug`), le stagiaire, l'entreprise, la ou les formations.
 */
function regleViseDocument(regle, doc) {
    if (!regle || !doc) return false;
    if (regle.template_slug && regle.template_slug !== doc.template_slug) return false;
    if (regle.learner_id && regle.learner_id !== doc.learner_id) return false;
    if (regle.company_id && regle.company_id !== doc.company_id) return false;
    const formations = formationsDeRegle(regle);
    if (formations && !formations.includes(doc.program_id)) return false;
    return true;
}

/**
 * La règle (remise_remise) vise-t-elle CETTE remise ? Même logique que `regleViseDocument`, mais le
 * « modèle ciblé » d'une règle de remise est l'ID DU TYPE DE REMISE, rangé dans `template_slug` (on
 * réutilise la colonne : une remise n'a pas de generated_document, donc pas de slug de modèle — et ça
 * évite une migration). `remise` = { remise_type_id, learner_id, company_id, program_id }.
 */
function regleViseRemise(regle, remise) {
    if (!regle || !remise) return false;
    if (regle.template_slug && regle.template_slug !== remise.remise_type_id) return false;
    if (regle.learner_id && regle.learner_id !== remise.learner_id) return false;
    if (regle.company_id && regle.company_id !== remise.company_id) return false;
    const formations = formationsDeRegle(regle);
    if (formations && !formations.includes(remise.program_id)) return false;
    return true;
}

/**
 * Les destinataires EFFECTIFS d'une règle → [{ type, email }]. Une adresse manquante est écartée
 * en silence (une entreprise sans espace n'a pas de représentant à qui écrire) : la règle part à
 * qui elle peut, jamais à personne par erreur.
 */
function destinatairesDe(regle, { stagiaireEmail, entrepriseEmail } = {}) {
    const veutStagiaire = regle.destinataire === 'stagiaire' || regle.destinataire === 'stagiaire_entreprise';
    const veutEntreprise = regle.destinataire === 'entreprise' || regle.destinataire === 'stagiaire_entreprise';
    const out = [];
    if (veutStagiaire && stagiaireEmail) out.push({ type: 'stagiaire', email: stagiaireEmail });
    if (veutEntreprise && entrepriseEmail) out.push({ type: 'entreprise', email: entrepriseEmail });
    return out;
}

module.exports = {
    DECLENCHEURS_DOC, estDeclencheurDoc, DECLENCHEURS_REMISE, estDeclencheurRemise, estDeclencheurEvenement,
    DESTINATAIRES, destinataireValide,
    regleViseDocument, regleViseRemise, formationsDeRegle, destinatairesDe,
};
