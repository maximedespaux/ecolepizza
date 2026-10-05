/**
 * RÉCUPÉRATION DE PARCOURS après une session supprimée par erreur.
 *
 * Supprimer une session détache ses documents (generated_document.enrollment_id SET NULL) et efface
 * le lien document_formation : le document SURVIT (signature comprise), mais ne compte plus dans
 * aucun parcours. Les QCM survivent AUSSI : quiz_response n'a pas de clé étrangère sur enrollment_id,
 * donc les réponses restent (avec un enrollment_id devenu pendant) et leur document (porteur du
 * quiz_id) est seulement détaché. En recréant la session et en réinscrivant le stagiaire, on retrouve
 * ses orphelins et on les rattache — le parcours retrouve ses étapes faites/signées ET ses QCM.
 *
 * Deux règles PURES, éprouvées sans base (le reste n'est que des requêtes) :
 *  · `ciblesParcours` : ce à quoi un orphelin peut se rattacher dans un parcours — les SLUGS de
 *    modèle (étapes-documents) ET les QUIZ_IDS (étapes QCM). Un QCM n'a pas de template_slug ; il se
 *    reconnaît à son quiz_id, d'où les deux ensembles.
 *  · `filtrerRecuperables` : parmi les documents orphelins d'un stagiaire, ceux qui appartiennent au
 *    parcours — par modèle OU par quiz. C'est le FILTRE que l'écran propose et que le rattachement
 *    applique : les deux doivent dire la même chose, d'où une règle unique.
 */

/** Les cibles de rattachement d'un parcours : { slugs (documents), quizIds (QCM) }. */
function ciblesParcours(steps = []) {
    const slugs = new Set();
    const quizIds = new Set();
    for (const st of steps) {
        if (!st) continue;
        if (st.quiz_id) quizIds.add(st.quiz_id);   // étape QCM : reconnue par son quiz
        else if (st.slug) slugs.add(st.slug);      // étape document : reconnue par son modèle
    }
    return { slugs, quizIds };
}

/** Parmi des documents orphelins, ceux qui appartiennent au parcours (par modèle OU par quiz). */
function filtrerRecuperables(docs = [], { slugs = new Set(), quizIds = new Set() } = {}) {
    return docs.filter((d) => d && (
        (d.template_slug && slugs.has(d.template_slug))
        || (d.quiz_id && quizIds.has(d.quiz_id))
    ));
}

module.exports = { ciblesParcours, filtrerRecuperables };
