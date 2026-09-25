/**
 * LES MONTANTS TELS QU'ILS S'IMPRIMENT — virgule décimale, deux décimales, toujours.
 *
 * Les factures sortaient « 17.82 € », avec un point. C'est la forme que produit `toFixed(2)`,
 * pas celle qu'on écrit en français — et la palette de jetons, elle, promettait déjà la virgule
 * dans ses exemples : le document n'imprimait pas ce que l'écran annonçait.
 *
 * ⚠️ CE FORMAT EST CELUI DU PAPIER, ET DE LUI SEUL. Deux autres endroits gardent le point, et
 * doivent le garder :
 *   · `lib/facturx.js` — le XML embarqué dans le PDF. La norme (EN 16931 / UN-CEFACT) impose le
 *     point décimal ; une virgule y rendrait la facture illisible pour la machine qui la reçoit,
 *     c'est-à-dire précisément ce à quoi sert Factur-X ;
 *   · `controllers/comptabilite.controller.js` — des valeurs écrites EN BASE, pas affichées.
 * Un seul format pour les trois usages ne peut pas exister : ce sont trois lecteurs différents.
 *
 * PAS DE SÉPARATEUR DE MILLIERS, volontairement : « 1500,00 € » et non « 1 500,00 € ». Une espace
 * dans un nombre change la largeur de chaque colonne de chaque modèle de facture, et les tableaux
 * à hauteur réservée comptent leurs lignes (cf. CLAUDE.md § 5). C'est une décision à part, qui se
 * prendra en regardant un vrai PDF — pas un effet de bord d'un changement de virgule.
 *
 * DEUX DÉCIMALES MÊME SUR UN COMPTE ROND : « 300,00 € ». Une colonne où « 300 € » côtoie
 * « 17,82 € » ne s'aligne plus sur la virgule, et un total sans décimale se lit comme un arrondi.
 */

/** Le signe d'un montant qui s'arrondit à zéro n'a rien à dire : « -0,00 € » alarme pour rien. */
const sansZeroNegatif = (s) => (/^-0[,.]?0*$/.test(s) ? s.slice(1) : s);

/** « 17,82 € ». Rend une chaîne VIDE sur une valeur illisible — jamais « NaN € » sur une facture. */
function montantFr(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return `${sansZeroNegatif(n.toFixed(2).replace('.', ','))} €`;
}

/** « 20,00 % » — la TVA s'écrit comme les montants qu'elle calcule, juste au-dessus. */
function pourcentFr(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return `${sansZeroNegatif(n.toFixed(2).replace('.', ','))} %`;
}

/**
 * UN NOMBRE DE « CHAMP DOCUMENT » ({field:training_program.price}…) tel qu'un DOCUMENT l'imprime.
 *
 * La valeur sortait brute : « 1750 » pour un prix, « 82.5 » pour un pourcentage — pendant que la
 * palette annonçait « 1 500 » en exemple. Relevé le 2026-09-26 sur six modèles (devis, convention,
 * contrat, attestation) qui impriment le prix de la formation par ce champ.
 *
 * CE N'EST PAS `montantFr`, ET C'EST VOULU. Celui-ci écrit les pièces COMPTABLES (factures), sans
 * séparateur de milliers pour ne pas changer la largeur de leurs colonnes. Un champ document vit
 * dans un devis ou une convention, où les jetons nommés écrivent déjà « 1 500 € » (`euro()`,
 * lib/tokens.js) : le champ suit la même typographie, symbole en moins — le modèle l'écrit
 * lui-même après la puce, et le mettre ici le doublerait.
 *
 *   · un MONTANT (prix, acompte, montant CPF…) : milliers séparés, et deux décimales s'il a des
 *     centimes — « 1 750 », « 1 750,50 » ;
 *   · tout autre nombre : la virgule décimale, SANS séparateur — une année reste « 2025 ».
 *
 * `cle` est « table.colonne ». Une valeur qui n'est pas un nombre ressort telle quelle ; une CHAÎNE
 * n'est lue comme un nombre que dans une colonne de montant (un DECIMAL arrive en texte, « 1750.00 »),
 * jamais ailleurs : un code postal ou un SIRET sont faits de chiffres, et ne sont pas des nombres.
 */
const COLONNE_MONTANT = /(^|_)(price|prix|acompte|amount|montant|capital|total)(_|$)/;
function nombreChamp(cle, v) {
    const colonne = String(cle || '').split('.').pop();
    const montant = COLONNE_MONTANT.test(colonne);
    let n = v;
    if (typeof v === 'string') {
        if (!montant || !/^-?\d+(\.\d+)?$/.test(v.trim())) return v;
        n = Number(v);
    }
    if (typeof n !== 'number' || !Number.isFinite(n)) return String(v);
    const centimes = montant && !Number.isInteger(n);
    return n.toLocaleString('fr-FR', {
        useGrouping: montant,
        minimumFractionDigits: centimes ? 2 : 0,
        maximumFractionDigits: 2,
    });
}

module.exports = { montantFr, pourcentFr, nombreChamp };
