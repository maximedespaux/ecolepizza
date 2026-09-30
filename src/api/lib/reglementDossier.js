/**
 * LE RÈGLEMENT D'UN DOSSIER — l'acompte est-il payé ? et le solde (le reste) ? (demandé le
 * 2026-09-30, carte « Règlement » de la fiche stagiaire).
 *
 * Du JavaScript PUR, sans base : les tests l'éprouvent seul. Le contrôleur lui donne le prix du
 * dossier, l'acompte convenu, les deux dates cochées à la main, et les factures du dossier (avec ce
 * qui a été encaissé sur chacune) ; il rend deux lignes prêtes à afficher.
 *
 * LOGIQUE HYBRIDE, et la FACTURE l'emporte :
 *   · s'il existe un ACOMPTE facturé → son paiement (table `payment`, règlements REUSSI) fait foi ;
 *   · sinon, l'école a pu cocher « acompte payé le … » (argent reçu hors logiciel) ;
 *   · pareil pour le solde : une FACTURE de solde payée, OU tout l'argent du dossier encaissé, OU
 *     la coche manuelle.
 * « payé » = payé PAR FACTURE **ou** coché à la main ; mais si la facture dit payé, c'est elle qui
 * donne la date et la source. Les deux ne se contredisent donc jamais en silence.
 *
 * EN CENTIMES ENTIERS (cf. CLAUDE.md § 3) : comparer des euros flottants ferait qu'un solde
 * exactement couvert paraîtrait tantôt payé, tantôt non. On compare des centimes.
 */

const cents = (x) => Math.round((Number(x) || 0) * 100);
const euros = (c) => c / 100;
/* La date d'un paiement est un datetime : on n'en garde que le JOUR (« 2026-03-12 »), sans fuseau.
   Le plus RÉCENT d'une liste se prend par comparaison de chaînes ISO (l'ordre y suit le temps). */
const jour = (d) => (d ? String(d).slice(0, 10) : null);
const jourMax = (liste) => liste.map(jour).filter(Boolean).sort().pop() || null;

/**
 * @param {object} o
 * @param {number} o.prix           Prix effectif du dossier (prix du dossier, sinon tarif formation).
 * @param {number|null} o.acompteConvenu  Montant de l'acompte convenu (enrollment.acompte), saisi à la main.
 * @param {string|null} o.acomptePayeLe   « payé le » de l'acompte, coché à la main (YYYY-MM-DD) ou null.
 * @param {string|null} o.soldePayeLe     « payé le » du solde, coché à la main, ou null.
 * @param {Array} o.factures  [{ type:'ACOMPTE'|'FACTURE', numero, montant, paye, dernier_paiement, statut }]
 * @returns {object} { prix, acompte, solde, reste, totalPaye, factures }
 */
function calculerReglement({ prix = 0, acompteConvenu = null, acomptePayeLe = null, soldePayeLe = null, factures = [] } = {}) {
    const prixC = cents(prix);
    // Une facture ANNULÉE ne compte plus, ni pour un montant ni pour un paiement.
    const actives = (Array.isArray(factures) ? factures : []).filter((f) => f && f.statut !== 'ANNULEE');
    const acompteFactures = actives.filter((f) => f.type === 'ACOMPTE');
    const soldeFactures = actives.filter((f) => f.type === 'FACTURE');
    const sommeC = (liste, cle) => liste.reduce((n, f) => n + cents(f[cle]), 0);
    const totalPayeC = sommeC(actives, 'paye');

    // ── Acompte ──────────────────────────────────────────────────────────────────────────────
    const acompteConvenuC = cents(acompteConvenu);
    const acFactureC = sommeC(acompteFactures, 'montant');
    // Le montant de l'acompte : celui de la (des) facture(s) d'acompte s'il y en a, sinon le convenu.
    const acMontantC = acompteFactures.length ? acFactureC : acompteConvenuC;
    const acPayeFactureC = sommeC(acompteFactures, 'paye');
    const acPayeParFacture = acFactureC > 0 && acPayeFactureC >= acFactureC;
    const acompte = ligne({
        montantC: acMontantC,
        payeParFacture: acPayeParFacture,
        dateFacture: acPayeParFacture ? jourMax(acompteFactures.map((f) => f.dernier_paiement)) : null,
        montantPayeC: acPayeFactureC,
        payeLe: acomptePayeLe,
        aUneFacture: acompteFactures.length > 0,
    });

    // ── Solde (le reste) ─────────────────────────────────────────────────────────────────────
    // Le reste à payer, comme le jeton {Reste à payer} des documents : prix − acompte, jamais négatif.
    const resteC = Math.max(0, prixC - acMontantC);
    const soFactureC = sommeC(soldeFactures, 'montant');
    const soPayeFactureC = sommeC(soldeFactures, 'paye');
    // Payé par facture si la (les) facture(s) de solde sont couvertes, OU si tout le prix est encaissé.
    const soldePayeParFacture = (soFactureC > 0 && soPayeFactureC >= soFactureC) || (prixC > 0 && totalPayeC >= prixC);
    const soldeDate = soldePayeParFacture
        ? (soFactureC > 0 && soPayeFactureC >= soFactureC ? jourMax(soldeFactures.map((f) => f.dernier_paiement)) : jourMax(actives.map((f) => f.dernier_paiement)))
        : null;
    const solde = ligne({
        montantC: resteC,
        payeParFacture: soldePayeParFacture,
        dateFacture: soldeDate,
        montantPayeC: soFactureC > 0 ? soPayeFactureC : Math.max(0, totalPayeC - acMontantC),
        payeLe: soldePayeLe,
        aUneFacture: soldeFactures.length > 0,
    });

    return {
        prix: euros(prixC),
        acompte,
        solde,
        reste: euros(resteC),
        totalPaye: euros(totalPayeC),
        factures: actives.map((f) => ({ numero: f.numero, type: f.type, statut: f.statut, montant: euros(cents(f.montant)), paye: euros(cents(f.paye)) })),
    };
}

/* Une ligne (acompte ou solde) : payée dès qu'une facture la couvre OU qu'on l'a cochée ; la facture
   donne alors la date et la source, sinon c'est la coche. Une ligne sans facture pour la porter reste
   « saisissable à la main » — c'est ce que l'écran a besoin de savoir. */
function ligne({ montantC, payeParFacture, dateFacture, montantPayeC, payeLe, aUneFacture }) {
    const payeManuel = !!payeLe;
    const paye = payeParFacture || payeManuel;
    return {
        montant: montantC ? euros(montantC) : null,
        paye,
        date: payeParFacture ? dateFacture : (payeManuel ? jour(payeLe) : null),
        source: payeParFacture ? 'facture' : (payeManuel ? 'manuel' : null),
        montantPaye: euros(montantPayeC || 0),
        // L'écran ne propose la coche/saisie manuelle que si aucune facture ne porte déjà la ligne.
        saisissable: !aUneFacture,
    };
}

module.exports = { calculerReglement };
