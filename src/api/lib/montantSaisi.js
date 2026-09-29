/**
 * UN MONTANT SAISI, lu comme on l'écrit en France : « 315,93 », « 1 234,56 », « 12,5 € ».
 *
 * Relevé le 2026-09-29 : la dépense « Facture Métro n°007505 », 315,93 € HT, refusée à
 * l'enregistrement — « Libellé et montant valides requis. » — alors que tout était rempli. Le
 * serveur lisait le montant par `Number()`, qui ne connaît que le point : `Number("315,93")` vaut
 * NaN. Or ces champs sont en `inputMode="decimal"`, et un clavier français n'y propose QUE la
 * virgule. Une dépense, une commission, un apport en nature étaient refusés ; une cible ou un
 * dividende visé étaient pire : ignorés en silence, l'ancienne valeur restant en place.
 *
 * Règles :
 *   · les espaces (ordinaires, insécables, fines) et le signe € sont ignorés ;
 *   · une virgule OU un point, seul, sépare les décimales ;
 *   · une virgule ET un point : le DERNIER des deux sépare les décimales, l'autre les milliers
 *     (« 1.234,56 » comme « 1,234.56 ») ;
 *   · un nombre déjà nombre passe tel quel ; tout le reste vaut NaN, que l'appelant refuse.
 *
 * Le point reste la forme ÉCRITE en base (`toFixed(2)`) : lire la virgule ne change rien à ce qui
 * s'écrit (cf. montants-virgule.test.js, « la base garde le point »).
 *
 * La même règle vit côté écran (src/app/ui/lib/montantSaisi.js) : montant-saisi.test.js confronte
 * les deux sur les mêmes cas.
 */
function lireMontant(v) {
    if (typeof v === 'number') return v;
    if (v == null) return NaN;
    let s = String(v).replace(/[\s\u00a0\u202f€]/g, '');
    const virgule = s.lastIndexOf(',');
    const point = s.lastIndexOf('.');
    if (virgule >= 0 && point >= 0) {
        const decimal = virgule > point ? ',' : '.';
        s = s.split(decimal === ',' ? '.' : ',').join('').replace(decimal, '.');
    } else if (virgule >= 0) {
        s = s.replace(',', '.');
    }
    return /^-?(\d+\.?\d*|\.\d+)$/.test(s) ? Number(s) : NaN;
}

module.exports = { lireMontant };
