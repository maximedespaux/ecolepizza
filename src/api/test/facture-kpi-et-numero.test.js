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
