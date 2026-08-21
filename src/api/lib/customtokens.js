// Jetons PERSONNALISÉS : valeurs calculées à partir d'autres jetons / champs via un
// petit modèle SÛR (pas d'exécution de code). Un modèle est du texte libre + des
// références { … } :
//   · {Jour1}                → valeur d'un autre jeton (intégré, field:…, custom:…)
//   · {endDate|-1}           → jeton de type DATE décalé de N jours (ici la veille)
//   · texte littéral         → conservé tel quel
// Exemples : « du {Jour1} au {endDate} », « {endDate|-1} » (avant-dernier jour).

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

// Remplit un modèle à partir d'une table de valeurs { clé: valeur }.
function applyTemplate(template, values) {
    return String(template || '').replace(/\{\s*([^{}|]+?)\s*(?:\|\s*([+-]?\d+)\s*)?\}/g, (m, ref, off) => {
        let v = values[ref];
        if (v == null) v = '';
        if (off) v = shiftDate(v, parseInt(off, 10));
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

module.exports = { applyTemplate, shiftDate, resolveCustomTokens };
