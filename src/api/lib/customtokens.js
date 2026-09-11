// Jetons PERSONNALISÉS : valeurs calculées à partir d'autres jetons / champs via un
// petit modèle SÛR (pas d'exécution de code). Un modèle est du texte libre + des
// références { … } :
//   · {Jour1}                → valeur d'un autre jeton (intégré, field:…, custom:…)
//   · {endDate|-1}           → jeton de type DATE décalé de N jours (ici la veille)
//   · {Prix|-150}            → jeton NUMÉRIQUE augmenté ou diminué (ici 150 € de moins)
//   · texte littéral         → conservé tel quel
// Exemples : « du {Jour1} au {endDate} », « {endDate|-1} » (avant-dernier jour),
//            « Reste : {Prix|-450} » (prix moins l'acompte).
//
// LE MÊME MODIFICATEUR SERT AUX DEUX, et c'est voulu : « décaler de N » se dit pareil sur une
// date et sur un montant. La VALEUR décide — si elle se lit comme une date, on décale des jours ;
// sinon, si elle contient un nombre, on l'additionne. Une valeur qui n'est ni l'un ni l'autre
// ressort inchangée, jamais remplacée par « NaN ».

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

/**
 * Ajoute `delta` au nombre contenu dans `value`, EN CONSERVANT SA MISE EN FORME.
 *
 * Les montants sortent de `euro()` : « 1 500,50 € » — espace insécable en séparateur de milliers,
 * virgule décimale, suffixe « € ». Rendre « 1050.5 » à la place ferait dérailler la facture qu'on
 * voulait juste ajuster. On remplace donc le nombre DANS la chaîne, et on ne reformate avec des
 * séparateurs que si l'original en avait : sinon « 2026 » (une année) deviendrait « 2 026 ».
 *
 * Renvoie null si aucun nombre n'est trouvé — l'appelant laisse alors la valeur intacte.
 */
function shiftNumber(value, delta) {
    const s = String(value == null ? '' : value);
    /* Le motif DOIT se terminer par un chiffre. Avec `[\d\s]*` gourmand, « 1 500 € » faisait
       correspondre « 1 500 » ESPACE COMPRIS : le remplacement emportait l'espace et rendait
       « 1 050€ », collé au symbole. Un détail qui se voit sur chaque facture. */
    const m = s.match(/-?\d(?:[\d\s\u00a0\u202f]*\d)?(?:[.,]\d+)?/);
    if (!m) return null;
    const brut = m[0];
    const n = Number(brut.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    // Deux décimales : on parle d'euros et d'heures, pas de flottants.
    const r = Math.round((n + delta) * 100) / 100;
    const avaitSeparateur = /[\s\u00a0\u202f]/.test(brut);
    const formate = avaitSeparateur ? r.toLocaleString('fr-FR') : String(r).replace('.', ',');
    return s.replace(brut, formate);
}

// Remplit un modèle à partir d'une table de valeurs { clé: valeur }.
function applyTemplate(template, values) {
    return String(template || '').replace(/\{\s*([^{}|]+?)\s*(?:\|\s*([+-]?\d+(?:[.,]\d+)?)\s*)?\}/g, (m, ref, off) => {
        let v = values[ref];
        if (v == null) v = '';
        if (off) {
            const n = Number(String(off).replace(',', '.'));
            if (parseDate(v)) {
                // Une date se décale en JOURS entiers : « la veille » n'a pas de demi-journée.
                v = shiftDate(v, Math.trunc(n));
            } else {
                const r = shiftNumber(v, n);
                if (r != null) v = r;   // ni date ni nombre → on laisse tel quel
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

module.exports = { applyTemplate, shiftDate, shiftNumber, resolveCustomTokens };
