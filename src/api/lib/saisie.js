/**
 * CONVENTIONS DE SAISIE COMMUNES — quels champs s'écrivent en CAPITALES, et comment.
 *
 * POURQUOI UN FICHIER À PART. Une même donnée s'écrit par plusieurs chemins. La ville d'une
 * entreprise arrive par sa fiche, par l'ancienne saisie « en ligne » de la fiche stagiaire
 * (`company: {…}`), et par l'espace du stagiaire lui-même. Chaque chemin recopiait la règle à sa
 * façon, et chacun en oubliait un bout : l'espace stagiaire écrivait le nom et la ville tels que
 * tapés, la saisie en ligne ne passait par aucune normalisation. Les listes ci-dessous sont LA
 * définition ; les contrôleurs se contentent de les appliquer.
 *
 * ET PAS DANS `learner.controller.js` : `company.controller.js` l'importe déjà. L'importer en
 * retour créerait un cycle de `require` — l'un des deux recevrait un module encore vide, et la
 * fonction vaudrait `undefined` au premier appel. Ce fichier n'importe rien.
 */

/* Accents conservés (« Lézignan » donne « LÉZIGNAN » — l'usage français), locale ÉPINGLÉE :
   sans argument, un hôte réglé en turc écrirait « İ » pour « i ». Null et undefined passent. */
function enCapitales(v) {
    return v == null ? v : String(v).trim().toLocaleUpperCase('fr');
}

/* LA VILLE a rejoint les deux listes le 2026-09-17, à la demande de l'école. Relevé ce jour-là en
   production : 670 villes distinctes chez les stagiaires, 667 une fois mises en capitales — trois
   s'écrivaient de deux façons, et comptaient donc double partout où l'on regroupe par ville. */
const CAPITALES_STAGIAIRE = ['last_name', 'town'];
const CAPITALES_ENTREPRISE = ['representative_name', 'town'];

/** Copie de `corps` où les champs listés passent en capitales — QUAND ILS SONT PRÉSENTS : un champ
 *  absent reste absent, sinon une mise à jour partielle viderait ce qu'elle n'a pas envoyé. */
function capitaliser(corps, champs) {
    const out = { ...corps };
    for (const k of champs) if (out[k] != null) out[k] = enCapitales(out[k]);
    return out;
}

module.exports = { enCapitales, capitaliser, CAPITALES_STAGIAIRE, CAPITALES_ENTREPRISE };
