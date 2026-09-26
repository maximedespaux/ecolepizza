/**
 * LES CADRES DE SIGNATURE DES DOCUMENTS (lib/tokens.js `signatureBox`) — 2026-09-26, après la feuille
 * d'émargement : « fais aussi les proportions des signatures dans les documents ».
 *
 * CE QUE CES TESTS GÈLENT :
 *   · LibreOffice ignore `object-fit` : l'image prenait la boîte du cadre (200 × 64 par défaut). Le
 *     cachet de l'école (226 × 93 en production) s'imprimait élargi d'un tiers, un cachet rond en
 *     ovale plat, et dans un cadre haut le texte du cachet sortait tassé. L'image a désormais la
 *     boîte de SES proportions, et `hspace` / `vspace` rendent l'encombrement du cadre au pixel
 *     près : un document signé se met en page comme le même document vide ;
 *   · la taille choisie sur la puce (data-w / data-h) REMPLAÇAIT les attributs après coup — la même
 *     déformation par un autre chemin. Le cadre est re-rendu à sa taille ;
 *   · une image WebP — le navigateur réduit en WebP les cachets et signatures déposés — sortait en
 *     icône d'image cassée : LibreOffice ne l'ouvre pas en `data:`, mais l'ouvre dans un SVG.
 * Tout a été rendu par LibreOffice avant d'être écrit ici : cachets et signatures, avant / après,
 * encombrement des cadres mesuré à l'identique.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { crc32 } = require('../lib/zip.js');
const { signatureBox, recadrerSignature } = require('../lib/tokens.js');
const { fillHtml } = require('../lib/htmlfill.js');
const { dimensionsImage, cadrer, webpEnSvg, imagesLisiblesParLibreOffice } = require('../lib/imagesPdf.js');
const { rognerSignature, rognerSignatureEnCache } = require('../lib/rognerSignature.js');

/* Un PNG RVBA « filtre 0 » : fond donné, encre (#1e2140) sur les pixels donnés. */
function png(largeur, hauteur, encre, fond = [0, 0, 0, 0]) {
    const pas = largeur * 4;
    const brut = Buffer.alloc(hauteur * (pas + 1));
    for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) brut.set(fond, y * (pas + 1) + 1 + x * 4);
    for (const [x, y] of encre) brut.set([0x1e, 0x21, 0x40, 255], y * (pas + 1) + 1 + x * 4);
    const bloc = (type, data) => {
        const t = Buffer.from(type, 'latin1');
        const n = Buffer.alloc(4); n.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
        return Buffer.concat([n, t, data, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4); ihdr[8] = 8; ihdr[9] = 6;
    return `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]).toString('base64')}`;
}
const contour = (x0, y0, x1, y1) => {
    const r = [];
    for (let x = x0; x <= x1; x++) r.push([x, y0], [x, y1]);
    for (let y = y0; y <= y1; y++) r.push([x0, y], [x1, y]);
    return r;
};
const plein = (x0, y0, x1, y1) => {
    const r = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) r.push([x, y]);
    return r;
};
/* Le cachet de l'école a ces proportions en production (lu le 2026-09-26) : 226 × 93, fond blanc
   opaque, un filet près du bord — rien à rogner. */
const CACHET_ECOLE = png(226, 93, contour(3, 3, 222, 89), [255, 255, 255, 255]);
const CACHET_ROND = png(300, 300, contour(2, 2, 297, 297));
/* Une signature tracée au milieu du canevas de 520 × 150 (SignatureModal). */
const SIGNATURE = png(520, 150, plein(200, 50, 339, 109));

/** Les attributs d'un cadre rendu. */
const lire = (html) => {
    const n = (a) => { const m = new RegExp(`\\s${a}="(\\d+)"`).exec(html); return m ? Number(m[1]) : 0; };
    return { src: (/src="([^"]*)"/.exec(html) || [])[1], l: n('width'), h: n('height'), hs: n('hspace'), vs: n('vspace') };
};
const encombrement = (c) => [c.l + 2 * c.hs, c.h + 2 * c.vs];

/* ── Les proportions ────────────────────────────────────────────────────────────────────────────── */
test('LE CACHET DE L\'ÉCOLE (226 × 93) garde ses proportions dans le cadre de 200 × 64 — et le cadre, son encombrement', () => {
    const c = lire(signatureBox(CACHET_ECOLE, "Signature de l'organisme"));
    assert.strictEqual(c.src, CACHET_ECOLE, 'rien à rogner : l\'image d\'origine');
    assert.deepStrictEqual([c.l, c.h, c.hs, c.vs], [156, 64, 22, 0], 'et non 200 × 64 : le cachet sortait élargi d\'un tiers');
    assert.ok(Math.abs(c.l / c.h - 226 / 93) < 0.02, 'les proportions du cachet');
    assert.deepStrictEqual(encombrement(c), [200, 64], 'l\'encombrement du cadre, au pixel près');
});

test('un cachet ROND reste rond, au milieu de son cadre', () => {
    const c = lire(signatureBox(CACHET_ROND, 'Cachet'));
    assert.deepStrictEqual([c.l, c.h, c.hs, c.vs], [64, 64, 68, 0], 'il sortait en ovale plat de 200 × 64');
});

test('une signature tracée au milieu du canevas est ROGNÉE, puis mise à ses proportions', () => {
    const c = lire(signatureBox(SIGNATURE, 'Signature du stagiaire'));
    assert.notStrictEqual(c.src, SIGNATURE, 'le vide autour du trait retiré (lib/rognerSignature.js)');
    assert.deepStrictEqual(dimensionsImage(c.src), { w: 148, h: 68 });
    assert.ok(Math.abs(c.l / c.h - 148 / 68) < 0.03, `${c.l} × ${c.h} : les proportions de l'encre`);
    assert.deepStrictEqual(encombrement(c), [200, 64]);
    // L'image enregistrée, elle, n'est pas touchée : le rognage vit au rendu.
    assert.strictEqual(rognerSignatureEnCache(SIGNATURE), rognerSignature(SIGNATURE));
});

test('cadrer : l\'écart se partage en deux parts égales, et l\'image perd un pixel plutôt que le cadre d\'en gagner un', () => {
    for (const [l, h] of [[200, 64], [201, 65], [37, 11], [300, 80], [120, 90], [1, 1]]) {
        for (const img of [CACHET_ECOLE, CACHET_ROND, SIGNATURE]) {
            const c = cadrer(img, l, h);
            assert.deepStrictEqual([c.largeur + 2 * c.hspace, c.hauteur + 2 * c.vspace], [l, h], `${l} × ${h}`);
            assert.ok(Number.isInteger(c.hspace) && Number.isInteger(c.vspace) && c.largeur >= 1 && c.hauteur >= 1);
        }
    }
});

test('une image ILLISIBLE garde le cadre entier, sans marge : le rendu d\'avant', () => {
    const IMAGE = 'data:image/png;base64,U1RBR0lBSVJF';
    assert.strictEqual(signatureBox(IMAGE, 'Signature'),
        `<img src="${IMAGE}" alt="Signature" width="200" height="64" style="max-width:100%;object-fit:contain;vertical-align:middle" />`);
});

/* ── La taille choisie sur la puce ──────────────────────────────────────────────────────────────── */
const puce = (cle, libelle, taille = '') => `<span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${libelle}"${taille}>${libelle}</span>`;

test('LA TAILLE DE LA PUCE (data-w / data-h) re-rend le cadre : le cachet reste à ses proportions', () => {
    const ctx = { org: { signature_image: CACHET_ECOLE }, learner: {}, slotSignatures: { entreprise: { data: CACHET_ROND, label: 'Cachet' } } };
    const html = fillHtml(`<p>${puce('Signature organisme', "Signature de l'organisme", ' data-w="120" data-h="90"')}</p>`
        + `<p>${puce('sig:entreprise', 'Cachet', ' data-w="240" data-h="90"')}</p>`, ctx);
    const [haut, rond] = [...html.matchAll(/<img [^>]*>/g)].map((m) => lire(m[0]));
    assert.deepStrictEqual([haut.l, haut.h, haut.hs, haut.vs], [120, 48, 0, 21], 'dans un cadre haut, le texte du cachet sortait tassé');
    assert.deepStrictEqual(encombrement(haut), [120, 90]);
    assert.deepStrictEqual([rond.l, rond.h, rond.hs, rond.vs], [90, 90, 75, 0], 'le cachet d\'une entreprise, par un emplacement nommé');
    assert.ok(!/width="120" height="90"/.test(html), 'plus de cadre aux attributs remplacés');
});

test('le cadre VIDE, redimensionné, garde sa taille et son pointillé', () => {
    const html = fillHtml(`<p>${puce('sig:formateur', 'Formateur', ' data-w="150" data-h="50"')}</p>`, { org: {}, learner: {} });
    assert.match(html, /<img src="data:image\/gif;base64,[^"]+" alt="Formateur" width="150" height="50" style="[^"]*border:1px dashed/);
});

test('re-rendue à une autre taille, une signature n\'est PAS rognée une seconde fois', () => {
    /* Un point minuscule : le premier rendu le grossit au plus quatre fois (le quart du canevas).
       Rogné de nouveau, il l'aurait été seize fois. */
    const premier = signatureBox(png(520, 150, [[260, 75]]), 'Signature');
    assert.deepStrictEqual(dimensionsImage(lire(premier).src), { w: 130, h: 38 });
    const second = recadrerSignature(premier, 300, 100);
    assert.strictEqual(lire(second).src, lire(premier).src, 'la même image, pas un second rognage');
    assert.deepStrictEqual(encombrement(lire(second)), [300, 100]);
});

test('re-rendu, le libellé reste échappé UNE fois ; un HTML qui n\'est pas un cadre n\'est pas touché', () => {
    const cadre = signatureBox(CACHET_ECOLE, 'Signature de "Léa" & associés');
    assert.match(recadrerSignature(cadre, 100, 40), /alt="Signature de &quot;Léa&quot; &amp; associés"/);
    assert.strictEqual(recadrerSignature('<table><tr><td>Articles</td></tr></table>', 100, 40), null);
});

test('L\'ÉCHAPPEMENT TIENT : une « signature » piégée ne sort pas de son attribut', () => {
    const html = signatureBox('data:image/png;base64,AA" onerror="alert(1)', 'Signature');
    assert.ok(!html.includes('" onerror="'));
    assert.ok(html.includes('&quot; onerror=&quot;'));
});

/* ── WebP ───────────────────────────────────────────────────────────────────────────────────────── */
/* Trois vraies images WebP de 37 × 11, écrites par Pillow (libwebp) : une par forme de fichier. */
const WEBP = {
    'VP8X (avec perte + transparence : ce que produit un navigateur)': 'UklGRogAAABXRUJQVlA4WAoAAAAQAAAAJAAACgAAQUxQSCIAAAABDzD/ERFCUSQ5USfhkIU1pCKEfyxE9H8RNAbe5h78Pg0AVlA4IEAAAAAQAwCdASolAAsAPrVQoUwnJKMiKqgA4BaJZQDM0B7PzgAA/vH28yZvP/6YZpGaGjEreG2nHqeBwKADFrnaAAAA',
    'VP8 (avec perte, opaque)': 'UklGRmQAAABXRUJQVlA4IFgAAAAwAwCdASolAAsAPrVKoEonJCMhqqwA4BaJZwAATw3U1d8AAP71vSaSuTUihDlAQN/QJaFIpJHpX48dJaZxVlC/dhMWbzG51WTUENLIWuRbhPMxWKF8EgAA',
    'VP8L (sans perte)': 'UklGRjYAAABXRUJQVlA4TCoAAAAvJIACEA8wIeMxQPMf8FAUSU7USThkYQ2pCOEfCxH9XwSNgbe5B79PAwA=',
};

test('les dimensions d\'une image WebP (ses trois formes) et d\'un GIF se lisent dans leurs premiers octets', () => {
    for (const [forme, b64] of Object.entries(WEBP)) {
        assert.deepStrictEqual(dimensionsImage(`data:image/webp;base64,${b64}`), { w: 37, h: 11 }, forme);
    }
    const gif = Buffer.from('GIF89a\x25\x00\x0b\x00\x80\x00\x00', 'latin1').toString('base64');
    assert.deepStrictEqual(dimensionsImage(`data:image/gif;base64,${gif}`), { w: 37, h: 11 });
    assert.strictEqual(dimensionsImage('data:image/webp;base64,UklGRgAAAABXRUJQ'), null, 'tronquée : illisible');
});

test('UNE IMAGE WebP part chez LibreOffice DANS UN SVG, à ses dimensions ; le reste n\'est pas touché', () => {
    const webp = `data:image/webp;base64,${WEBP['VP8X (avec perte + transparence : ce que produit un navigateur)']}`;
    const svg = webpEnSvg(webp);
    assert.match(svg, /^data:image\/svg\+xml;base64,/);
    const dedans = Buffer.from(svg.split(',')[1], 'base64').toString('utf8');
    assert.match(dedans, /viewBox="0 0 37 11"/);
    assert.ok(dedans.includes(`xlink:href="${webp}"`), 'l\'image elle-même, intacte');
    assert.deepStrictEqual(dimensionsImage(svg), { w: 37, h: 11 }, 'les proportions de l\'image, gardées');
    const html = `<p><img src="${webp}" width="74" height="22"/><img src="${CACHET_ECOLE}"/></p>`;
    const pret = imagesLisiblesParLibreOffice(html);
    assert.ok(!pret.includes('data:image/webp'), 'plus aucune image WebP en data:');
    assert.ok(pret.includes(`<img src="${svg}" width="74" height="22"/>`), 'enveloppée à sa place, ses attributs gardés');
    assert.ok(pret.includes(CACHET_ECOLE), 'un PNG passe tel quel');
    const sansWebp = '<p>Rien à envelopper</p>';
    assert.strictEqual(imagesLisiblesParLibreOffice(sansWebp), sansWebp);
});

test('la porte unique vers LibreOffice (htmlToPdf) enveloppe le WebP — documents, feuilles, factures', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'docxpdf.js'), 'utf8');
    assert.match(src, /function htmlToPdf\(html, pdfa\) \{[\s\S]*?convertToPdf\(Buffer\.from\(imagesLisiblesParLibreOffice\(html\), 'utf8'\), 'html', pdfa\)/);
    // La feuille d'émargement lit les mêmes proportions (un cachet WebP y garde sa forme).
    const E = require('../lib/emargement.js');
    assert.strictEqual(E.dimensionsImage, dimensionsImage, 'une seule lecture des dimensions');
});
