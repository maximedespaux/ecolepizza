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

/** Les deux déclencheurs d'événement, et l'état du document qui les arme. */
const DECLENCHEURS_DOC = {
    document_envoye: { libelle: 'un document envoyé pour signature', etat: 'ENVOYE' },
    document_signe: { libelle: 'un document signé', etat: 'SIGNE' },
};
const estDeclencheurDoc = (d) => Object.prototype.hasOwnProperty.call(DECLENCHEURS_DOC, d);

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
    DECLENCHEURS_DOC, estDeclencheurDoc, DESTINATAIRES, destinataireValide,
    regleViseDocument, formationsDeRegle, destinatairesDe,
};
