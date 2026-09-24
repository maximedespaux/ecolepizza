/**
 * LE POINT DE RUPTURE DU PARCOURS — le « checkpoint » d'une formation.
 *
 * Posé dans Formations → Parcours documentaire, entre deux étapes : tant que le stagiaire n'a pas
 * SIGNÉ tout ce qu'il doit signer jusqu'à ce point, son émargement reste fermé. Pour un stagiaire
 * arrivé via une entreprise, un second point garde la section « À l'arrivée via une entreprise ».
 *
 * UNE RÈGLE, DEUX LECTEURS (2026-09-21) :
 *   · l'espace du stagiaire, qui ferme l'émargement tant que le point n'est pas franchi
 *     (espace.controller, `emargementGate`) ;
 *   · l'avancement des dossiers (lib/avancement.js), qui dit au tableau de bord quels dossiers
 *     d'une session TERMINÉE restent à suivre : ceux qui ne sont pas à 100 % MAIS dont le stagiaire
 *     a franchi le point — il est venu, il a commencé ; un dossier resté avant le point est celui
 *     d'une personne qui n'est jamais venue, et ne relève plus du suivi.
 * Deux copies de la règle finiraient par diverger : le tableau de bord dirait « franchi » un dossier
 * dont l'émargement est resté fermé, ou l'inverse. Ce module ne lit rien en base : chaque lecteur
 * charge ses données à sa façon, et la DÉCISION est la même.
 */
const { stepSigners } = require('./documents.js');

// Les QCM et l'émargement ne se barrent pas eux-mêmes : ils ne sont jamais exigés par le point.
const exempte = (s) => s.doc_type === 'QCM' || s.doc_type === 'EMARGEMENT';

/**
 * Statuts des documents d'un dossier, par modèle et par type. DEUX VERSIONS D'UN MÊME DOCUMENT
 * (régénéré, reçu puis refait) : une seule SIGNÉE suffit. Pour les documents du stagiaire, la
 * règle dépendait jusqu'ici de l'ORDRE des lignes rendues par la base — la dernière l'emportait,
 * et la requête n'en fixait aucun. Celle des documents de groupe le disait déjà : « un document
 * de groupe non signé ne doit pas être écrasé par un homonyme signé ».
 */
function statutsDocuments(docs) {
    const parSlug = {}, parType = {};
    for (const d of docs || []) {
        if (d.template_slug && parSlug[d.template_slug] !== 'SIGNE') parSlug[d.template_slug] = d.status;
        if (d.type && parType[d.type] !== 'SIGNE') parType[d.type] = d.status;
    }
    return { parSlug, parType };
}

/**
 * VOLET DOSSIER — les étapes exigées : celles DU DOSSIER (parcours résolu, conditions comprises)
 * que le stagiaire signe, jusqu'au point. `seuil` est le rang du point dans le parcours de la
 * FORMATION : le point peut désigner une étape que les conditions du dossier écartent.
 *
 * JAMAIS UN REPLI. Quand aucune variante d'un groupe « OU » ne s'applique, le parcours en garde une
 * pour l'affichage, marquée `repli` (resoudreVariantes) : ce dossier n'aura pas ce document, et
 * l'exiger fermerait l'émargement pour toujours. Constaté le 2026-09-24 sur une stagiaire
 * PROFESSIONNELLE, à qui l'on réclamait le `contrat` des particuliers — son entreprise avait signé
 * la convention, le volet entreprise était franchi, aucun geste ne pouvait satisfaire celui-ci.
 */
function exigencesDossier(etapesDuDossier, seuil) {
    return (etapesDuDossier || []).filter((s) => s.stagiaire_sign && !s.repli && !exempte(s) && Number(s.sort_order) <= seuil);
}
/** Signée par son modèle, ou à défaut par son type (documents antérieurs aux modèles). */
const signeeDossier = (s, statuts) => statuts.parSlug[s.slug] === 'SIGNE' || statuts.parType[s.doc_type] === 'SIGNE';

/**
 * VOLET ENTREPRISE — la section « À l'arrivée via une entreprise » jusqu'au point : ses étapes
 * actives qui ont un signataire. `null` si le point ne désigne aucune étape de la section.
 */
function exigencesEntreprise(liste, pointSlug, etapesParSlug) {
    const idx = (liste || []).indexOf(pointSlug);
    if (idx < 0) return null;
    return liste.slice(0, idx + 1)
        .map((sl) => etapesParSlug.get(sl))
        .filter((s) => s && s.active && !exempte(s) && stepSigners(s).length > 0);
}
/** Un document de GROUPE compte par sa signature collective ; les autres, par le dossier. */
const signeeEntreprise = (s, propres, groupe) => (s.company_level
    ? groupe.parSlug[s.slug] === 'SIGNE'
    : signeeDossier(s, propres));

/** Le bilan d'un volet : { need, done, locked }. Rien d'exigé = rien ne bloque. */
function bilan(exigees, estSignee) {
    const need = exigees ? exigees.length : 0;
    const done = need ? exigees.filter(estSignee).length : 0;
    return { need, done, locked: done < need };
}

module.exports = { statutsDocuments, exigencesDossier, signeeDossier, exigencesEntreprise, signeeEntreprise, bilan };
