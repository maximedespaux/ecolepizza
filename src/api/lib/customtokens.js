// Jetons PERSONNALISÉS : valeurs calculées à partir d'autres jetons / champs via un
// petit modèle SÛR (pas d'exécution de code). Un modèle est du texte libre + des
// références { … } :
//   · {Jour1}                → valeur d'un autre jeton (intégré, field:…, custom:…)
//   · {endDate|-1}           → jeton de type DATE décalé de N jours (ici la veille)
//   · {Prix|-150}            → jeton NUMÉRIQUE augmenté ou diminué (ici 150 € de moins)
//   · {Prix|*20%}            → multiplié (ici 20 % du prix ; {Prix|*0,2} dit la même chose)
//   · {Prix|/3}              → divisé (ici le tiers du prix)
//   · texte littéral         → conservé tel quel
// Exemples : « du {Jour1} au {endDate} », « {endDate|-1} » (avant-dernier jour),
//            « Reste : {Prix|-450} » (prix moins l'acompte), « {Prix|*90%} » (remise de 10 %).
//
// LE MÊME MODIFICATEUR SERT AUX DEUX, et c'est voulu : « décaler de N » se dit pareil sur une
// date et sur un montant. La VALEUR décide — si elle se lit comme une date, on décale des jours ;
// sinon, si elle contient un nombre, on l'additionne. Une valeur qui n'est ni l'un ni l'autre
// ressort inchangée, jamais remplacée par « NaN ». Multiplier ou diviser une date n'a pas de
// sens : elle ressort inchangée elle aussi.
//
// ⚠️ L'APERÇU DE L'ÉDITEUR REFAIT CE CALCUL côté navigateur (src/app/ui/lib/jetonsPerso.js).
// Les deux copies doivent rendre la même chose — `test/jetons-perso-calcul.test.js` les fait
// tourner côte à côte. Toucher l'une sans l'autre, c'est un aperçu qui ment.

const pad = (n) => String(n).padStart(2, '0');

// Parse une date « JJ/MM/AAAA » ou « AAAA-MM-JJ » → Date, sinon null.
function parseDate(v) {
    const s = String(v || '').trim();
    let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return null;
}

// Décale une valeur date de `days` jours et la reformate en JJ/MM/AAAA.
// Si la valeur n'est pas une date reconnue, on la renvoie inchangée.
function shiftDate(value, days) {
    const d = parseDate(value);
    if (!d) return value;
    d.setDate(d.getDate() + days);
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/* ─── LE CALCUL SE FAIT SUR L'ÉCRITURE DÉCIMALE, PAS EN FLOTTANTS ─────────────────────────────
   Les flottants se trompent d'un centime, et pas sur des cas d'école : 2,15 € × 30 % vaut 0,645,
   que le binaire range en 0,64499999… — on rendait 0,64 € au lieu de 0,65 € ; 0,35 € × 10 %
   donnait 0,03 € au lieu de 0,04 €. Le montant est lu dans une CHAÎNE (« 2,15 ») et le facteur
   aussi : on calcule donc sur ces écritures, en entiers (BigInt), et l'on n'arrondit qu'UNE fois,
   à la fin — le demi-centime s'éloignant de zéro, comme à la calculette. */
const puissance10 = (e) => 10n ** BigInt(e);

/** « 1 234,56 » → { m: 123456n, e: 2 } (la valeur vaut m × 10^-e) ; null si illisible. */
function decimal(ecriture) {
    const t = String(ecriture).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    if (!/^[+-]?\d+(\.\d+)?$/.test(t)) return null;
    const [entier, fraction = ''] = t.split('.');
    return { m: BigInt(entier + fraction), e: fraction.length };
}

/** La fraction num / den, en CENTIMES arrondis (le demi-centime s'éloigne de zéro). */
function enCentimes(num, den) {
    if (den < 0n) { num = -num; den = -den; }
    const c = ((num < 0n ? -num : num) * 200n + den) / (2n * den);
    return num < 0n ? -c : c;
}

/**
 * Applique une opération au nombre contenu dans `value`, EN CONSERVANT SA MISE EN FORME.
 *
 * `op` : '+' (ajoute `n`, qui porte son signe), '*' ou '/'. `n` est l'ÉCRITURE du nombre
 * (« 0,2 », « -450 ») ; `pct` en fait un pourcentage (« 20 » vaut alors 0,20).
 *
 * Les montants sortent de `euro()` : « 1 500,50 € » — espace insécable en séparateur de milliers,
 * virgule décimale, suffixe « € ». Rendre « 1050.5 » à la place ferait dérailler la facture qu'on
 * voulait juste ajuster. On remplace donc le nombre DANS la chaîne, et on ne le reformate avec des
 * séparateurs que s'il en portait déjà, ou si c'est un MONTANT (il porte « € », comme tout ce que
 * rend `euro()`) : sinon « 2026 » (une année) deviendrait « 2 026 », mais « 900 € » × 2 doit bien
 * donner « 1 800 € », comme `euro()` l'écrirait — pas « 1800 € ».
 *
 * Renvoie null si aucun nombre n'est trouvé, ou si l'opération n'a pas de résultat (÷ 0) —
 * l'appelant laisse alors la valeur intacte.
 */
function calculer(value, op, n, pct = false) {
    const s = String(value == null ? '' : value);
    /* Le motif DOIT se terminer par un chiffre. Avec `[\d\s]*` gourmand, « 1 500 € » faisait
       correspondre « 1 500 » ESPACE COMPRIS : le remplacement emportait l'espace et rendait
       « 1 050€ », collé au symbole. Un détail qui se voit sur chaque facture. */
    const m = s.match(/-?\d(?:[\d\s\u00a0\u202f]*\d)?(?:[.,]\d+)?/);
    if (!m) return null;
    const brut = m[0];
    const a = decimal(brut);
    const b = decimal(n);
    if (!a || !b) return null;
    if (pct) b.e += 2;
    let num, den;
    if (op === '*') { num = a.m * b.m; den = puissance10(a.e + b.e); }
    else if (op === '/') {
        if (b.m === 0n) return null;
        num = a.m * puissance10(b.e); den = b.m * puissance10(a.e);
    } else {
        const e = Math.max(a.e, b.e);
        num = a.m * puissance10(e - a.e) + b.m * puissance10(e - b.e); den = puissance10(e);
    }
    // Deux décimales : on parle d'euros et d'heures, pas de flottants.
    const r = Number(enCentimes(num, den)) / 100;
    const milliers = /[\s\u00a0\u202f]/.test(brut) || s.includes('€');
    const formate = milliers ? r.toLocaleString('fr-FR') : String(r).replace('.', ',');
    return s.replace(brut, formate);
}

/** Ajoute `delta` au nombre contenu dans `value` (cf. `calculer`) ; null s'il n'y en a pas. */
function shiftNumber(value, delta) {
    return calculer(value, '+', String(delta));
}

/* UNE RÉFÉRENCE : {Clé}, ou {Clé|modificateur}. Le modificateur est ±N (décaler, ajouter), *N
   (multiplier) ou /N (diviser) ; N peut porter une virgule et, après * ou /, un « % ».
   UN « % » APRÈS + OU − N'EST PAS ACCEPTÉ. « {Prix|-10%} » se lit « 10 % de remise » pour les uns
   et « moins 0,10 € » pour les autres ; un modèle ambigu imprimé sur un document signé est pire
   qu'un modèle refusé. Refusé, il reste écrit tel quel — l'aperçu le montre aussitôt — et la
   remise s'écrit sans ambiguïté : {Prix|*90%}. */
const REFERENCE = /\{\s*([^{}|]+?)\s*(?:\|\s*(?:([+-]?\d+(?:[.,]\d+)?)|([*/])\s*(\d+(?:[.,]\d+)?)\s*(%?))\s*)?\}/g;

// Remplit un modèle à partir d'une table de valeurs { clé: valeur }.
function applyTemplate(template, values) {
    return String(template || '').replace(REFERENCE, (tout, ref, decalage, op, facteur, pct) => {
        let v = values[ref];
        if (v == null) v = '';
        if (decalage) {
            if (parseDate(v)) {
                // Une date se décale en JOURS entiers : « la veille » n'a pas de demi-journée.
                v = shiftDate(v, Math.trunc(Number(decalage.replace(',', '.'))));
            } else {
                const r = calculer(v, '+', decalage);
                if (r != null) v = r;   // ni date ni nombre → on laisse tel quel
            }
        } else if (op) {
            /* ÷ 0 N'A PAS DE RÉSULTAT : la référence reste écrite telle quelle, comme toute formule
               mal formée — visible à l'aperçu, plutôt qu'un « Infinity » sur le document. */
            if (op === '/' && /^[0.,]+$/.test(facteur)) return tout;
            if (!parseDate(v)) {
                const r = calculer(v, op, facteur, pct === '%');
                if (r != null) v = r;
            }
        }
        return String(v);
    });
}

// Résout tous les jetons personnalisés → { 'custom:<clé>': valeur }. Plusieurs passes
// pour permettre à un jeton personnalisé d'en référencer un autre (avec garde anti-boucle).
function resolveCustomTokens(defs, baseValues) {
    const out = {};
    if (!Array.isArray(defs) || !defs.length) return out;
    const values = { ...baseValues };
    for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        for (const d of defs) {
            if (!d || !d.token_key) continue;
            const key = 'custom:' + d.token_key;
            const val = applyTemplate(d.template, values);
            if (values[key] !== val) { values[key] = val; out[key] = val; changed = true; }
        }
        if (!changed) break;
    }
    return out;
}

module.exports = { applyTemplate, shiftDate, shiftNumber, calculer, resolveCustomTokens };
