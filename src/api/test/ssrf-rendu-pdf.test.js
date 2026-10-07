/**
 * ANTI-SSRF DU RENDU PDF (audit du 2026-10-07, point MOYEN).
 *
 * LibreOffice, à qui l'on donne le HTML d'un modèle, chargeait les ressources EXTERNES qu'il
 * contenait (`<img src=http…>`, `url()`, `@import`, `<link>/<object>/<iframe>`) — une SSRF côté
 * serveur, le corps d'un modèle étant écrit verbatim par le personnel. On retire désormais, avant
 * rendu, tout chargement de ressource qui n'est pas une data URL (logos/cachets/signatures sont déjà
 * des data:). Le pare-feu sans egress sur `soffice` complète ce filtre côté VPS.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { neutraliserRessourcesExternes } = require('../lib/ressourcesExternes.js');

test('image distante / file:// vidées, image data: conservée', () => {
    const r = neutraliserRessourcesExternes(
        '<img src="http://169.254.169.254/latest/meta-data/"><img src="data:image/png;base64,AAAA">');
    assert.doesNotMatch(r, /169\.254\.169\.254/, 'plus de métadonnées cloud');
    assert.match(r, /src=""/, 'le src distant est vidé');
    assert.match(r, /data:image\/png;base64,AAAA/, 'l\'image data: reste');
});

test('tous les schémas non-data sont neutralisés', () => {
    for (const u of ['file:///etc/passwd', '//evil.test/x.png', 'https://evil.test/x.png', 'http://10.0.0.1/']) {
        assert.doesNotMatch(neutraliserRessourcesExternes(`<img src="${u}">`), /evil\.test|etc\/passwd|10\.0\.0\.1/, u);
    }
});

test('les balises de chargement externe sont retirées, le contenu demeure', () => {
    const r = neutraliserRessourcesExternes(
        '<link rel="stylesheet" href="http://evil/x.css"><iframe src="http://evil/"></iframe><object data="http://evil/"></object>CORPS');
    assert.doesNotMatch(r, /evil/);
    assert.doesNotMatch(r, /<link|<iframe|<object/i);
    assert.match(r, /CORPS/);
});

test('CSS : url(distant) et @import neutralisés, url(data:) conservé', () => {
    const r = neutraliserRessourcesExternes(
        '<div style="background:url(http://evil/x.png)"></div><style>@import url(http://evil/y.css);.a{background:url(data:image/png;base64,ZZ)}</style>');
    assert.doesNotMatch(r, /evil/);
    assert.doesNotMatch(r, /@import/);
    assert.match(r, /url\(data:image\/png;base64,ZZ\)/, 'un fond data: reste');
    assert.match(r, /url\(\)/, 'le url() distant est vidé');
});

test('xlink:href distant (SVG <image>) vidé, data: conservé', () => {
    assert.doesNotMatch(neutraliserRessourcesExternes('<image xlink:href="http://evil/x"/>'), /evil/);
    assert.match(neutraliserRessourcesExternes('<image xlink:href="data:image/webp;base64,QQ"/>'), /data:image\/webp;base64,QQ/);
});

test('entrée vide / non chaîne : rendue telle quelle (tolérant)', () => {
    assert.strictEqual(neutraliserRessourcesExternes(''), '');
    assert.strictEqual(neutraliserRessourcesExternes(null), null);
    assert.strictEqual(neutraliserRessourcesExternes(undefined), undefined);
});

test('htmlToPdf filtre AVANT d\'envoyer à LibreOffice (porte unique)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'docxpdf.js'), 'utf8');
    assert.match(src, /neutraliserRessourcesExternes\(String\(html/, 'htmlToPdf neutralise le HTML');
    // La neutralisation passe AVANT l'enveloppe WebP (qui ne produit que des data:).
    assert.ok(src.indexOf('neutraliserRessourcesExternes(String(html') < src.indexOf('imagesLisiblesParLibreOffice(sur)'),
        'ordre : neutralisation puis enveloppe');
});
