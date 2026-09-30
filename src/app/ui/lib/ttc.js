/**
 * LE TTC TEL QUE LA FACTURE LE CALCULE — le seul qu'un écran doit annoncer, puisque c'est lui qu'on
 * encaisse.
 *
 * La facture ventile sa TVA PAR TAUX (`ventilerTva`, src/api/lib/facturx.js), comme Factur-X l'exige :
 * la TVA d'un taux est la base de ce taux multipliée par le taux, arrondie une seule fois. Son total
 * n'est donc pas la somme des TTC de ligne. Or le panier du stagiaire, « Mes demandes », la carte d'une
 * demande, la fenêtre « Facturer la demande » et la caisse additionnaient les TTC de ligne : relevé le
 * 2026-09-30, près d'un panier à deux taux sur quatre encaissait un centime de plus ou de moins que sa
 * facture (33,33 € HT à 20 % et 7,77 € HT à 5,5 % : 48,19 € annoncés et encaissés, 48,20 € facturés),
 * et la facture imprimait « Moyens et montants réglés : 48,19 € » sous son total. Tranché le même
 * jour : tous annoncent le total de la facture.
 *
 * CE QUE ÇA CHANGE À L'ÉCRAN. Avec un article par taux, les lignes s'additionnent exactement : la TVA
 * de chaque taux est celle de sa seule ligne. Plusieurs articles au MÊME taux peuvent ne pas tomber
 * juste — deux articles à 20,83 € HT : « 25 € + 25 € », total 49,99 € —, exactement comme sur la
 * facture, dont la colonne « Total TTC » a la même propriété. C'était déjà le cas avant, et plus
 * souvent : un panier de deux articles sur quatre, quels que soient leurs taux.
 *
 * `ventilerTva` est recopiée OPÉRATION POUR OPÉRATION, dans le même ordre : sur un demi-centime, l'ordre
 * d'une somme flottante suffit à faire basculer un arrondi. Le serveur, lui, appelle la fonction du PDF
 * (src/api/lib/ttc.js). `total-facture-ecrans.test.js` confronte cette copie au PDF sur des milliers de
 * paniers, et chaque écran à cette copie.
 */
export const arrondi = (n) => Math.round(n * 100) / 100;

/**
 * LE TTC D'UN DOCUMENT DE /factures : TVA à 20 % sauf exonération — ces documents ne portent pas
 * d'autre taux —, arrondie une fois sur le total. Le règlement saisi doit tomber dessus au centime, et
 * le serveur le revérifie avec `ventilerTva` (confrontés par `factures-modele-reglement.test.js`).
 */
export function ttcDe(ht, exonere) {
  const base = arrondi(Number(ht) || 0);
  return Number(exonere) ? base : arrondi(base + Math.round(base * 20) / 100);
}

/** Le taux d'une ligne, lu comme `ventilerTva` le lit : un nombre, sinon 20 %. */
const tauxDe = (t) => (t !== null && t !== undefined && Number.isFinite(Number(t)) ? Number(t) : 20);

/** Le HT d'une ligne tel que la facture l'écrit (`invoice_line.amount_net`) : prix × quantité, au centime. */
export const htDeLigne = (prixHt, qte) => Number((Number(prixHt) * (Number(qte) || 0)).toFixed(2));

/**
 * Le TTC d'UNE ligne tel que la facture l'imprime dans sa colonne « Total TTC » (`articleRowTokens`,
 * src/api/lib/tokens.js) : son HT, plus SA TVA arrondie. Pour un seul article, c'est aussi le total de
 * la facture — la ligne et le total d'un panier d'un article ne se contredisent jamais.
 */
export function ttcDeLigne(prixHt, qte, taux) {
  const ht = htDeLigne(prixHt, qte);
  return arrondi(ht + Math.round(ht * tauxDe(taux)) / 100);
}

/**
 * LE TOTAL DE LA FACTURE. `lignes` : [{ ht, taux }], `ht` étant le HT de ligne que la facture écrit
 * (`htDeLigne`, ou le HT remisé de la caisse). Exonérée (art. 261-4-4°) : pas de TVA, le total est le HT.
 */
export function totalFacture(lignes, exonere = false) {
  if (!lignes.length) return { ht: 0, tva: 0, ttc: 0 };
  if (exonere) {
    const net = Number(lignes.reduce((s, l) => s + l.ht, 0).toFixed(2));
    return { ht: net, tva: 0, ttc: net };
  }
  const parTaux = new Map();
  for (const l of lignes) {
    const t = tauxDe(l.taux);
    parTaux.set(t, (parTaux.get(t) || 0) + Number(l.ht || 0));
  }
  // Arrondi PAR GROUPE, comme la ventilation légale.
  const groupes = [...parTaux.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([taux, base]) => ({ base: Math.round(base * 100) / 100, taxe: Math.round(base * taux) / 100 }));
  const ht = Math.round(groupes.reduce((s, g) => s + g.base, 0) * 100) / 100;
  const tva = Math.round(groupes.reduce((s, g) => s + g.taxe, 0) * 100) / 100;
  return { ht, tva, ttc: Math.round((ht + tva) * 100) / 100 };
}

/**
 * LE TOTAL D'UNE DEMANDE BOUTIQUE — panier, « Mes demandes », carte de la demande, fenêtre « Facturer
 * la demande ». `lignes` : [{ source, qty, unit_price_ht, tax_rate }].
 *
 * `facture` est le total de la facture de l'ÉCOLE : ses lignes ÉCOLE à prix connu, celles que
 * `invoiceShopRequest` facture, au centime. Une ligne PARTENAIRE est vendue par le partenaire, sur SA
 * facture : ventilée à part, elle s'ajoute au total de la demande (`ttc`) sans jamais se mêler à la TVA
 * de l'école. Une ligne sans prix (« sur demande ») ne compte pas, et `aDefinir` le dit — sinon le
 * total mentirait par omission.
 */
export function totalDemande(lignes) {
  const ecole = [], partenaire = [];
  let aDefinir = false;
  for (const l of lignes || []) {
    if (l.unit_price_ht == null) { aDefinir = true; continue; }
    (l.source === "ECOLE" ? ecole : partenaire).push({ ht: htDeLigne(l.unit_price_ht, l.qty), taux: l.tax_rate });
  }
  const f = totalFacture(ecole), p = totalFacture(partenaire);
  return { ht: arrondi(f.ht + p.ht), ttc: arrondi(f.ttc + p.ttc), facture: f.ttc, aDefinir };
}
