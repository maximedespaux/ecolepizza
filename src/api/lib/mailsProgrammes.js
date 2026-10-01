/**
 * LES ENVOIS PROGRAMMÉS — « trois mois après la fin de la session » (2026-09-23, migration 179).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LE CALCUL EST ICI, PAS DANS UNE REQUÊTE. Une règle dit une DATE DE DÉPART (fin de session,
 * début de session, inscription) et un DÉCALAGE (7 jours avant, 3 mois après). On aurait pu
 * écrire `DATE_ADD(s.end_date, INTERVAL ? MONTH)` et laisser la base décider : ce module existe
 * pour que la règle soit éprouvable SANS base — le 31 janvier plus un mois, une année bissextile,
 * un décalage négatif, autant de cas qu'on veut voir échouer dans un test plutôt qu'en février.
 *
 * LA DATE CIBLE SE CALCULE EN AVANT (date de départ → date d'envoi), et le passage quotidien
 * compare cette cible à AUJOURD'HUI. L'autre sens — remonter d'aujourd'hui vers la date de départ
 * pour filtrer en SQL — paraît plus efficace et se trompe : « un mois avant le 31 mars » n'a pas
 * d'inverse unique, et deux sessions différentes retomberaient sur la même borne.
 *
 * ON RATTRAPE LES JOURS MANQUÉS. La fenêtre va de `depuis` (la création de la règle) à
 * aujourd'hui, et non « exactement aujourd'hui » : un serveur redémarré, une panne d'une nuit, et
 * un envoi programmé ne partirait jamais — personne ne s'en apercevrait, puisque rien n'échoue.
 */

/* Les déclencheurs d'ÉVÉNEMENT (document envoyé / signé, migration 196) vivent à part : ils ne se
   calculent pas dans le temps, ils partent quand le document change d'état. On les lit ici pour que la
   même fonction `lireRegle` valide les deux familles de règles. */
const { estDeclencheurDoc, DECLENCHEURS_DOC, destinataireValide } = require('./reglesDocument.js');

/** Les trois dates de départ possibles. L'écran propose exactement celles-là. */
const DECLENCHEURS = {
    fin_session: {
        libelle: 'la fin de la session',
        /* La colonne lue, et la table où la chercher : le contrôleur compose la requête avec. */
        colonne: 's.end_date',
    },
    debut_session: { libelle: 'le début de la session', colonne: 's.start_date' },
    inscription: { libelle: 'l’inscription du stagiaire', colonne: 'e.created_at' },
};
const UNITES = { jour: 'jour(s)', mois: 'mois', annee: 'année(s)' };
const SENS = { apres: 'après', avant: 'avant' };
const MAX_DECALAGE = { jour: 730, mois: 60, annee: 5 };
/* Un passage n'envoie pas plus que ça : au-delà, c'est une campagne, et le SMTP de l'école la
   traiterait comme telle. Le reste part au passage suivant — rien n'est perdu. */
const MAX_PAR_PASSAGE = 100;

/** AAAA-MM-JJ d'une date, quelle que soit sa forme d'origine (Date, chaîne, datetime). */
function jourDe(v) {
    if (!v) return null;
    if (typeof v === 'string') {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
        return m ? m[0] : null;
    }
    if (v instanceof Date && !Number.isNaN(v.getTime())) {
        const p = (n) => String(n).padStart(2, '0');
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return null;
}

/**
 * La date d'envoi : la date de départ, décalée.
 *
 * LES MOIS ET LES ANNÉES SE COMPTENT EN MOIS, PAS EN JOURS — « trois mois après le 30 novembre »
 * est le 28 février ou le 1er mars selon qu'on compte en mois ou en 90 jours. On garde le mois
 * civil, et on BORNE AU DERNIER JOUR du mois d'arrivée : le 31 janvier plus un mois donnerait
 * sinon le 3 mars, ce que personne n'appelle « un mois plus tard ».
 */
function dateCible({ depart, sens = 'apres', decalage = 0, unite = 'jour' }) {
    const jour = jourDe(depart);
    if (!jour) return null;
    const [a, m, j] = jour.split('-').map(Number);
    const signe = sens === 'avant' ? -1 : 1;
    const n = Math.max(0, Math.round(Number(decalage) || 0)) * signe;
    if (unite === 'jour') {
        const d = new Date(Date.UTC(a, m - 1, j + n));
        return d.toISOString().slice(0, 10);
    }
    const mois = unite === 'annee' ? n * 12 : n;
    const total = (a * 12) + (m - 1) + mois;
    const annee = Math.floor(total / 12);
    const moisCible = (total % 12 + 12) % 12;
    /* Le 0e jour du mois SUIVANT est le dernier du mois visé : 28, 29, 30 ou 31, sans table. */
    const dernier = new Date(Date.UTC(annee, moisCible + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(annee, moisCible, Math.min(j, dernier)));
    return d.toISOString().slice(0, 10);
}

/** « 3 mois après la fin de la session » — la règle dite en une ligne, pour l'écran et le journal. */
function phraseRegle(r) {
    /* Un déclencheur d'événement n'a ni décalage ni sens : il se dit « Quand un document est signé ». */
    if (r && estDeclencheurDoc(r.declencheur)) return `Quand ${DECLENCHEURS_DOC[r.declencheur].libelle}`;
    const d = DECLENCHEURS[r && r.declencheur];
    if (!d) return '';
    const n = Math.max(0, Math.round(Number(r.decalage) || 0));
    if (n === 0) return `Le jour de ${d.libelle}`;
    const unite = UNITES[r.unite] || UNITES.jour;
    return `${n} ${unite} ${SENS[r.sens] || SENS.apres} ${d.libelle}`;
}

/**
 * Ce que l'école enregistre pour une règle → `{ valeurs }` ou `{ erreur }`.
 *
 * LE DÉCALAGE EST BORNÉ, et pas seulement « positif » : « 4000 jours après » n'est pas une règle,
 * c'est une faute de frappe qui dormirait onze ans avant de se voir.
 */
function lireRegle(b = {}, { jetons = [] } = {}) {
    const nom = String(b.nom == null ? '' : b.nom).replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!nom) return { erreur: 'Donnez un nom à cette règle : c’est ce qui la distingue dans la liste.' };
    const declencheur = String(b.declencheur || '');
    const estDoc = estDeclencheurDoc(declencheur);
    if (!estDoc && !DECLENCHEURS[declencheur]) return { erreur: 'Choisissez à partir de quel événement l’envoi se fait.' };

    /* LE DÉCALAGE N'EXISTE QUE POUR LES DÉCLENCHEURS DE DATE : un événement (document envoyé / signé)
       part à l'instant. Pour une règle d'événement, sens et décalage sont laissés à leur valeur neutre. */
    let unite = 'jour';
    let sens = 'apres';
    let decalage = 0;
    if (!estDoc) {
        unite = UNITES[b.unite] ? b.unite : 'jour';
        sens = SENS[b.sens] ? b.sens : 'apres';
        decalage = Math.max(0, Math.round(Number(b.decalage) || 0));
        if (decalage > MAX_DECALAGE[unite]) {
            return { erreur: `Le décalage ne peut pas dépasser ${MAX_DECALAGE[unite]} ${UNITES[unite]}.` };
        }
        /* UNE INSCRIPTION N'A PAS D'AVANT : elle n'est pas connue avant d'exister. Le dire vaut mieux
           que d'enregistrer une règle qui ne partirait jamais. */
        if (declencheur === 'inscription' && sens === 'avant' && decalage > 0) {
            return { erreur: 'Une inscription ne se connaît pas à l’avance : choisissez « après ».' };
        }
    }
    /* À QUI part le message (migration 196) : le stagiaire par défaut, comme les règles d'avant. */
    const destinataire = destinataireValide(b.destinataire) ? b.destinataire : 'stagiaire';
    const objet = String(b.objet == null ? '' : b.objet).replace(/\s+/g, ' ').trim().slice(0, 200);
    const corps = String(b.corps == null ? '' : b.corps).replace(/\r\n?/g, '\n').trim().slice(0, 4000);
    if (!objet) return { erreur: 'L’objet est obligatoire.' };
    if (!corps) return { erreur: 'Écrivez le message qui partira.' };
    const connus = new Set(jetons);
    const inconnu = [...(objet.match(/\{[^{}]+\}/g) || []), ...(corps.match(/\{[^{}]+\}/g) || [])]
        .map((j) => j.slice(1, -1).trim()).find((j) => !connus.has(j));
    if (inconnu) return { erreur: `Le jeton {${inconnu}} n’existe pas. Disponibles : ${jetons.map((j) => `{${j}}`).join(', ')}.` };
    /* UNE OU PLUSIEURS FORMATIONS (migration 198). `program_ids` est la liste choisie ; vide = toutes.
       `program_id` reste EN PHASE : une seule formation → cette colonne la porte (et un revert de la
       198 la conserve) ; zéro ou plusieurs → NULL. L'ancien client n'envoie que `program_id` : on le
       relit comme une liste d'un élément, pour ne rien perdre d'une page ouverte avant le déploiement. */
    const brut = Array.isArray(b.program_ids) ? b.program_ids : (b.program_id ? [b.program_id] : []);
    const program_ids = [...new Set(brut.filter((x) => typeof x === 'string' && x).map(String))].slice(0, 50);
    const program_id = program_ids.length === 1 ? program_ids[0] : null;
    return { valeurs: {
        nom, declencheur, sens, decalage, unite,
        program_id, program_ids,
        /* Le modèle filtré n'a de sens que pour un événement de document ; une règle de date filtre
           par formation. Le ciblage stagiaire / entreprise vaut pour les deux familles. */
        template_slug: (estDoc && b.template_slug) ? String(b.template_slug).slice(0, 60) : null,
        destinataire,
        learner_id: b.learner_id ? String(b.learner_id) : null,
        company_id: b.company_id ? String(b.company_id) : null,
        objet, corps, actif: b.actif === false ? 0 : 1,
    } };
}

module.exports = {
    DECLENCHEURS, UNITES, SENS, MAX_DECALAGE, MAX_PAR_PASSAGE,
    jourDe, dateCible, phraseRegle, lireRegle,
};
