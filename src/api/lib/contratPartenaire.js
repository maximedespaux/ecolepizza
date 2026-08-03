/**
 * LE CONTRAT D'UN PARTENAIRE — une seule définition de « encore valable », partagée (migration 131).
 *
 * POURQUOI UN FICHIER POUR TROIS LIGNES DE SQL. La condition sert à QUATRE endroits qui doivent
 * s'accorder : la vitrine du stagiaire, la liste des destinataires nommés dans la demande de
 * consentement, le refus d'export, et l'affichage de l'échéance sur la fiche. Recopiée quatre
 * fois, elle divergerait au premier ajustement — et une divergence ici ne se voit pas : elle
 * produit un partenaire qui n'apparaît plus aux stagiaires mais reçoit encore leurs coordonnées,
 * ou l'inverse. Aucun des deux ne provoque d'erreur.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA DATE DE FIN SE CALCULE, elle n'est pas stockée. Une colonne de plus s'écarterait des deux
 * autres au premier avenant : on corrigerait la durée sans la date de fin, ou l'inverse, et il
 * faudrait ensuite deviner laquelle fait foi.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * UN CONTRAT INCOMPLET N'ÉCARTE PAS, et c'est un arbitrage explicite.
 *
 * Si `contrat = 1` mais qu'aucune date n'est saisie, le partenaire reste actif. Bloquer serait
 * défendable côté données, mais produirait un effet incompréhensible : cocher « il y a un contrat »
 * suffirait à faire disparaître un partenaire de la boutique, sans message et sans rapport visible
 * avec le clic. On préfère laisser passer et SIGNALER l'échéance manquante sur la fiche — un
 * avertissement qu'on peut corriger vaut mieux qu'une coupure qu'on ne s'explique pas.
 *
 * Seul un contrat DATÉ ET ÉCHU écarte.
 */

/**
 * Condition SQL « ce partenaire est encore actif ». `alias` est le préfixe de table (`p`).
 *
 * Écrite en SQL et non en JavaScript parce qu'elle doit pouvoir entrer dans un `WHERE` : filtrer
 * après coup en mémoire obligerait à rapatrier tous les partenaires expirés pour les jeter, et
 * surtout à ne pas oublier de le faire — ce qu'un `WHERE` garantit.
 */
const CONTRAT_VALABLE = (alias = 'p') => `(
    ${alias}.contrat = 0
    OR ${alias}.contrat_debut IS NULL
    OR ${alias}.contrat_duree_mois IS NULL
    OR DATE_ADD(${alias}.contrat_debut, INTERVAL ${alias}.contrat_duree_mois MONTH) >= CURDATE()
)`;

/** Colonne calculée : la date de fin, pour l'afficher. `NULL` si le contrat n'est pas daté. */
const CONTRAT_FIN = (alias = 'p') =>
    `DATE_FORMAT(DATE_ADD(${alias}.contrat_debut, INTERVAL ${alias}.contrat_duree_mois MONTH), '%Y-%m-%d')`;

/**
 * Ajoute des mois à une date, EN ARITHMÉTIQUE PURE — sans jamais construire d'objet `Date`.
 *
 * DEUX PIÈGES, tous deux mesurés sur ce fichier avant correction :
 *
 *  1. LE FUSEAU. `new Date('2026-01-15T00:00:00')` se lit en heure LOCALE, puis `toISOString()`
 *     reconvertit en UTC : à Paris, minuit local devient 22 h ou 23 h la VEILLE. Un contrat de
 *     douze mois signé le 15 janvier finissait donc le 14. Le même piège est déjà documenté dans
 *     `api/lib/horaires.js` — il ne se voit jamais en développant, seulement à l'usage.
 *
 *  2. LE DÉBORDEMENT DE MOIS. `setMonth` ne borne pas : le 31 janvier + 1 mois donnait le 2 MARS,
 *     février n'ayant pas de 31. Un contrat d'un mois en durait deux. MySQL, lui, ramène au
 *     dernier jour du mois (`DATE_ADD('2026-01-31', INTERVAL 1 MONTH)` = 2026-02-28) — et comme
 *     c'est MySQL qui filtre dans `CONTRAT_VALABLE`, un écart ici ferait diverger l'affichage du
 *     filtrage : une fiche annonçant « encore valable » pour un partenaire que la requête écarte.
 */
function ajouterMois(iso, mois) {
    const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
    const total = (m - 1) + Number(mois);
    const annee = a + Math.floor(total / 12);
    const moisFinal = ((total % 12) + 12) % 12;                 // reste positif même si `mois` < 0
    const dernierJour = new Date(Date.UTC(annee, moisFinal + 1, 0)).getUTCDate();
    return [annee, moisFinal + 1, Math.min(j, dernierJour)];    // borné comme le fait MySQL
}

/**
 * L'état du contrat, à partir des colonnes déjà lues — pour l'écran de l'organisme.
 *
 * Rendu en JavaScript et non en SQL : c'est de l'AFFICHAGE, pas du filtrage. Le serveur n'a pas à
 * calculer « dans 23 jours » dans une requête, et la page a besoin du nombre de jours pour choisir
 * sa couleur.
 *
 * `jours` peut être négatif : le contrat est expiré depuis autant de jours. On ne l'écrase pas à
 * zéro — savoir qu'une convention est échue depuis huit mois n'appelle pas le même geste que
 * depuis avant-hier.
 */
function etatContrat(p, aujourdhui = new Date()) {
    if (!p || Number(p.contrat) !== 1) return { suivi: false };
    if (!p.contrat_debut || !p.contrat_duree_mois) {
        // Coché sans échéance : on le DIT, plutôt que d'écarter le partenaire en silence.
        return { suivi: true, incomplet: true, actif: true };
    }
    const [a, m, j] = ajouterMois(p.contrat_debut, p.contrat_duree_mois);
    const deuxChiffres = (n) => String(n).padStart(2, '0');
    const fin = `${a}-${deuxChiffres(m)}-${deuxChiffres(j)}`;
    /* Les deux bornes sont construites de la MÊME façon (composantes entières → `Date.UTC`) : la
       soustraction porte alors sur deux minuits UTC, et aucun décalage horaire ne s'y glisse. */
    const jours = Math.round(
        (Date.UTC(a, m - 1, j)
            - Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate()))
        / 86400000);
    return { suivi: true, incomplet: false, fin, jours, actif: jours >= 0 };
}

module.exports = { CONTRAT_VALABLE, CONTRAT_FIN, etatContrat, ajouterMois };
