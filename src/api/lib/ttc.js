/**
 * LE TTC TEL QUE LA FACTURE LE CALCULE, côté serveur — pendant de src/app/ui/lib/ttc.js, dont
 * l'en-tête dit pourquoi (tranché le 2026-09-30 : tout ce qui annonce un montant à payer annonce le
 * total de la facture, puisque c'est lui qu'on encaisse).
 *
 * Ici, PAS DE COPIE : le total vient de `ventilerTva`, la fonction même du PDF — TVA arrondie PAR TAUX,
 * comme Factur-X l'exige. L'écran, qui ne peut pas l'importer, en porte une copie ;
 * `total-facture-ecrans.test.js` les tient d'accord sur des milliers de paniers.
 *
 * Sert la carte d'une demande (`listShopRequests`), la notification d'une commande et le prix d'un
 * article dans l'espace stagiaire (espace.controller.js), et la caisse (`checkout`).
 */
const { ventilerTva } = require('./facturx.js');

const arrondi = (n) => Math.round(n * 100) / 100;

/** Le taux d'une ligne, lu comme `ventilerTva` le lit : un nombre, sinon 20 %. */
const tauxDe = (t) => (t !== null && t !== undefined && Number.isFinite(Number(t)) ? Number(t) : 20);

/** Le HT d'une ligne tel que la facture l'écrit (`invoice_line.amount_net`) : prix × quantité, au centime. */
const htDeLigne = (prixHt, qte) => Number((Number(prixHt) * (Number(qte) || 0)).toFixed(2));

/**
 * Le TTC d'UNE ligne tel que la facture l'imprime dans sa colonne « Total TTC » (`articleRowTokens`,
 * lib/tokens.js) : son HT, plus SA TVA arrondie. Pour un seul article, c'est aussi le total de la facture.
 */
function ttcDeLigne(prixHt, qte, taux) {
    const ht = htDeLigne(prixHt, qte);
    return arrondi(ht + Math.round(ht * tauxDe(taux)) / 100);
}

/**
 * LE TOTAL DE LA FACTURE, par `ventilerTva`. `lignes` : [{ ht, taux }], `ht` étant le HT de ligne que
 * la facture écrit. Exonérée (art. 261-4-4°) : pas de TVA, le total est le HT.
 *
 * Sans ligne, zéro — et pas la ligne unique de repli de `ventilerTva`, qui prendrait `amountNet`.
 */
function totalFacture(lignes, exonere = false) {
    if (!lignes.length) return { ht: 0, tva: 0, ttc: 0 };
    const v = ventilerTva({
        amountNet: Number(lignes.reduce((s, l) => s + l.ht, 0).toFixed(2)),
        tvaExoneree: !!exonere,
        taxRate: null,
        lines: lignes.map((l) => ({ amount: l.ht, taxRate: l.taux })),
    });
    return { ht: v.base, tva: v.taxe, ttc: v.grand };
}

/**
 * LE TOTAL D'UNE DEMANDE BOUTIQUE. `lignes` : [{ source, qty, unit_price_ht, tax_rate }].
 *
 * `facture` est le total de la facture de l'ÉCOLE : ses lignes ÉCOLE à prix connu, celles que
 * `invoiceShopRequest` facture. Une ligne PARTENAIRE est vendue par le partenaire, sur SA facture :
 * ventilée à part, elle s'ajoute au total de la demande (`ttc`) sans se mêler à la TVA de l'école. Une
 * ligne sans prix (« sur demande ») ne compte pas, et `aDefinir` le dit.
 */
function totalDemande(lignes) {
    const ecole = [], partenaire = [];
    let aDefinir = false;
    for (const l of lignes || []) {
        if (l.unit_price_ht == null) { aDefinir = true; continue; }
        (l.source === 'ECOLE' ? ecole : partenaire).push({ ht: htDeLigne(l.unit_price_ht, l.qty), taux: l.tax_rate });
    }
    const f = totalFacture(ecole), p = totalFacture(partenaire);
    return { ht: arrondi(f.ht + p.ht), ttc: arrondi(f.ttc + p.ttc), facture: f.ttc, aDefinir };
}

module.exports = { arrondi, htDeLigne, ttcDeLigne, totalFacture, totalDemande };
