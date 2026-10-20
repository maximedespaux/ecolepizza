/**
 * CARTE « ÉMIS » : TOTAL HT ET TOTAL TTC — demandé le 2026-10-20.
 *
 * La carte « Émis (factures) » ne montrait que le total NET (HT). On ajoute le total TTC — la SOMME
 * des TTC par facture (même ttcDe que la colonne « Montant » de la liste, pour que la carte l'égale
 * exactement), sur le même ensemble que le HT du serveur (type FACTURE / ACOMPTE). Le TTC n'apparaît
 * que s'il DIFFÈRE du HT (TVA applicable) : inutile de répéter le même nombre quand elle ne l'est pas.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lireUi = (rel) => fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', rel), 'utf8');

test('la carte « Émis » calcule le total TTC comme la liste (ttcDe, FACTURE/ACOMPTE)', () => {
    const page = lireUi('pages/Factures.jsx');
    assert.match(page, /const emisTtc = useMemo\(\(\) => \(invoices \|\| \[\]\)/);
    assert.match(page, /\.filter\(\(i\) => i\.type === "FACTURE" \|\| i\.type === "ACOMPTE"\)/, 'même ensemble que le HT du serveur');
    assert.match(page, /\.reduce\(\(s, i\) => s \+ ttcDe\(i\.amount_net, i\.tva_exoneree\), 0\)/, 'même ttcDe que la liste');
    assert.match(page, /const emisDiff = Math\.round\(emisTtc \* 100\) !== Math\.round\(Number\(totals\.emis\) \* 100\)/);
});

test('la carte « Émis » affiche HT et TTC quand ils diffèrent, un seul nombre sinon', () => {
    const page = lireUi('pages/Factures.jsx');
    assert.match(page, /value=\{emisDiff \? `\$\{euro\(totals\.emis\)\} HT` : euro\(totals\.emis\)\}/);
    assert.match(page, /sub=\{emisDiff \? `\$\{euro\(emisTtc\)\} TTC` : undefined\}/);
});

/* ─── NUMÉRO PERSONNALISÉ (optionnel, tous types ; ne consomme pas la séquence) — 2026-10-20 ───── */

const lireApi = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('createInvoice : un numéro personnalisé est employé tel quel, unique, SANS toucher la séquence', () => {
    const co = lireApi('controllers/invoice.controller.js');
    const fn = co.slice(co.indexOf('const createInvoice'), co.indexOf('\nconst ', co.indexOf('const createInvoice') + 10));
    assert.match(fn, /const numeroPerso = String\(req\.body\.number \|\| ''\)\.trim\(\);/, 'lu du corps, nettoyé');
    // Rempli → employé AVANT la branche nextNumberForEmitter : la séquence n'est donc pas touchée.
    assert.ok(fn.indexOf('if (numeroPerso) {') >= 0 && fn.indexOf('if (numeroPerso) {') < fn.indexOf('nextNumberForEmitter'),
        'le numéro perso court-circuite la séquence (le compteur reste intact)');
    assert.match(fn, /number = numeroPerso;/);
    assert.match(fn, /SELECT 1 AS x FROM invoice WHERE number = \? LIMIT 1/, 'unicité vérifiée avant l\'écriture');
    assert.match(fn, /numeroPerso\.length > 40/, 'borné à la taille de la colonne (varchar 40)');
    assert.match(fn, /status\(409\)/, 'doublon refusé proprement');
    // Course (deux créations simultanées) : la contrainte uq_invoice_number → 409, pas 500.
    assert.match(co, /err\.code === 'ER_DUP_ENTRY'\) return res\.status\(409\)/);
});

test('le formulaire porte un champ Numéro optionnel, annoncé « automatique si vide », rappel légal', () => {
    const page = lireUi('pages/Factures.jsx');
    assert.match(page, /number: "", template_slug/, 'dans l\'état initial');
    assert.match(page, /<input id="fac-numero"[^>]*value=\{form\.number\}/);
    assert.match(page, /number: form\.number \? form\.number\.trim\(\) : null/, 'envoyé dans le payload');
    assert.match(page, /Automatique si vide/, 'le défaut (numérotation auto) est annoncé');
    assert.match(page, /séquence continue pour les factures/, 'le rappel légal est présent');
});
