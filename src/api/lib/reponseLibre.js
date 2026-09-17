/**
 * RÉPONSE LIBRE (question « TEXT » des QCM, migration 164) — les règles, écrites une fois.
 *
 * LA LIMITE EST EN MOTS, pas en caractères : c'est ainsi que l'école l'a demandée (« quelque chose
 * comme 128 mots »), et c'est ainsi qu'on lit une consigne de rédaction. Un mot est une suite de
 * caractères entre deux espaces, qui contient AU MOINS UNE LETTRE OU UN CHIFFRE : « l'école » et
 * « porte-pelle » en font un chacun, comme dans un traitement de texte.
 *
 * LA LETTRE OBLIGATOIRE N'EST PAS UN RAFFINEMENT. En français, « : », « ? », « ! », « ; » et « — »
 * s'écrivent précédés d'une espace : compter les blocs entre espaces faisait de chacun un mot, et
 * « le gluten : la pâte » en comptait cinq. Une réponse de 128 mots correctement ponctuée aurait été
 * refusée pour dépassement. Vu sur banc d'essai le 2026-09-17, avant toute mise en service.
 *
 * LE MÊME COMPTE DES DEUX CÔTÉS. L'écran compte pendant la frappe (ui/lib/mots.js) et le serveur
 * recompte à l'envoi ; s'ils divergeaient, le compteur afficherait « 128 / 128 » sur une réponse
 * refusée pour dépassement. Un test vérifie qu'ils rendent le même nombre sur les mêmes textes.
 */
const { colonneExiste } = require('./colonnes.js');

const MOTS_MAX_DEFAUT = 128;
// Bornes du réglage dans l'éditeur : au-delà de mille mots, ce n'est plus une question de QCM.
const MOTS_MAX_PLAFOND = 1000;
/* Garde-fou en CARACTÈRES, indépendant de la limite en mots : un texte sans espace (collé par
   erreur) compte UN mot et pourrait peser des mégaoctets. 128 mots n'approchent jamais 5 000. */
const CARACTERES_MAX = 5000;

function compterMots(texte) {
    const t = String(texte == null ? '' : texte).trim();
    return t ? t.split(/\s+/).filter((bloc) => /[\p{L}\p{N}]/u.test(bloc)).length : 0;
}

/** La limite d'une question : la sienne si elle est valable, sinon 128. */
function motsMaxDe(question) {
    const n = Math.trunc(Number(question && question.max_words));
    return Number.isFinite(n) && n > 0 ? Math.min(n, MOTS_MAX_PLAFOND) : MOTS_MAX_DEFAUT;
}

/**
 * La base connaît-elle le type `TEXT` ? Il faut L'ENUM étendu ET la colonne `max_words`.
 *
 * On regarde la DÉFINITION de la colonne, pas le résultat d'un essai : hors mode strict, un ENUM
 * qui ignore une valeur l'enregistre en chaîne vide au lieu de la refuser — l'essai « réussirait »
 * en abîmant la question. Sans cache, pour la raison écrite dans colonnes.js : une migration jouée
 * pendant que le serveur tourne doit être vue tout de suite.
 */
async function reponseLibreDisponible(conn) {
    try {
        const [r] = await conn.query(
            `SELECT COLUMN_TYPE AS t FROM information_schema.columns
              WHERE table_schema = DATABASE() AND table_name = 'quiz_question' AND column_name = 'type' LIMIT 1`);
        const t = Array.isArray(r) && r[0] ? String(r[0].t || '') : '';
        return t.includes("'TEXT'") && await colonneExiste(conn, 'quiz_question', 'max_words');
    } catch { return false; }
}

module.exports = { MOTS_MAX_DEFAUT, MOTS_MAX_PLAFOND, CARACTERES_MAX, compterMots, motsMaxDe, reponseLibreDisponible };
