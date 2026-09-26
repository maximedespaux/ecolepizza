/**
 * LE VIDE AUTOUR D'UNE SIGNATURE, RETIRÉ À L'IMPRESSION (lib/rognerSignature.js) — 2026-09-26.
 *
 * Une fois ses proportions gardées (la feuille d'émargement l'écrasait dans une case presque
 * carrée), une signature tracée au milieu du canevas de 520 × 150 n'occupait plus que la moitié
 * de sa case : l'encre sortait à quelques millimètres, et le vide s'imprimait en grand. Le rendu
 * rogne désormais l'image au rectangle de son encre.
 *
 * Le lecteur PNG a été confronté, octet pour octet, à Pillow sur des images de trois encodeurs
 * (librsvg, macOS, Pillow) — les cinq filtres du format y figuraient. Ces tests en gardent la
 * trace avec un encodeur ÉCRIT ICI, indépendant de celui du module, qui choisit le filtre de
 * chaque ligne : un défaut de l'un ne peut pas masquer un défaut de l'autre.
 */
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const { crc32 } = require('../lib/zip.js');
const { rognerSignature, lirePng, GROSSISSEMENT_MAX } = require('../lib/rognerSignature.js');

/* ── Un encodeur PNG indépendant, au filtre choisi ligne par ligne ───────────────────────────────── */
const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
const bloc = (type, data) => {
    const t = Buffer.from(type, 'latin1');
    const n = Buffer.alloc(4); n.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([n, t, data, crc]);
};
const COULEUR = { 1: 0, 2: 4, 3: 2, 4: 6 }; // canaux → type de couleur PNG
function png(largeur, hauteur, canaux, pixels, { filtre = () => 0, idat = null, entete = null } = {}) {
    const pas = largeur * canaux;
    const brut = Buffer.alloc(hauteur * (pas + 1));
    for (let y = 0; y < hauteur; y++) {
        const f = filtre(y);
        brut[y * (pas + 1)] = f;
        for (let x = 0; x < pas; x++) {
            // Le filtre se calcule sur les octets D'ORIGINE des voisins (RFC 2083, § 6).
            const a = x >= canaux ? pixels[y * pas + x - canaux] : 0;
            const b = y ? pixels[(y - 1) * pas + x] : 0;
            const c = x >= canaux && y ? pixels[(y - 1) * pas + x - canaux] : 0;
            const prediction = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
            brut[y * (pas + 1) + 1 + x] = (pixels[y * pas + x] - prediction) & 0xff;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE((entete && entete.largeur) || largeur, 0);
    ihdr.writeUInt32BE((entete && entete.hauteur) || hauteur, 4);
    ihdr[8] = 8;
    ihdr[9] = COULEUR[canaux];
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        bloc('IHDR', ihdr), bloc('IDAT', idat || zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]);
}
const url = (octets) => `data:image/png;base64,${octets.toString('base64')}`;
const relire = (dataUrl) => lirePng(Buffer.from(dataUrl.split(',')[1], 'base64'));

/** Un canevas de signature : 520 × 150, transparent, l'encre (#1e2140) sur les pixels donnés. */
function canevas(encre, { largeur = 520, hauteur = 150, fond = [0, 0, 0, 0] } = {}) {
    const pixels = Buffer.alloc(largeur * hauteur * 4);
    for (let i = 0; i < largeur * hauteur; i++) pixels.set(fond, i * 4);
    for (const [x, y, alpha = 255] of encre) pixels.set([0x1e, 0x21, 0x40, alpha], (y * largeur + x) * 4);
    return { largeur, hauteur, pixels };
}
const rectangle = (x0, y0, x1, y1) => {
    const r = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) r.push([x, y]);
    return r;
};

/* ── Le lecteur ─────────────────────────────────────────────────────────────────────────────────── */
test('les CINQ filtres du PNG se relisent à l\'octet près, pour chaque nombre de canaux', () => {
    let graine = 7;
    const hasard = () => (graine = (graine * 1103515245 + 12345) & 0x7fffffff) & 0xff;
    for (const canaux of [1, 2, 3, 4]) {
        const largeur = 23, hauteur = 11;
        const pixels = Buffer.from(Array.from({ length: largeur * hauteur * canaux }, hasard));
        for (const [nom, filtre] of [['aucun', () => 0], ['gauche', () => 1], ['dessus', () => 2], ['moyenne', () => 3], ['Paeth', () => 4], ['mêlés', (y) => y % 5]]) {
            const lu = lirePng(png(largeur, hauteur, canaux, pixels, { filtre }));
            assert.ok(lu, `${canaux} canaux, filtre ${nom} : lisible`);
            assert.deepStrictEqual([lu.largeur, lu.hauteur, lu.canaux], [largeur, hauteur, canaux]);
            assert.ok(lu.pixels.equals(pixels), `${canaux} canaux, filtre ${nom} : les mêmes octets`);
        }
    }
});

/* ── Le rognage ─────────────────────────────────────────────────────────────────────────────────── */
test('une signature tracée au milieu du canevas est rognée au rectangle de son encre, plus 4 pixels', () => {
    // L'encre de x 200 à 339, y 50 à 109, et deux pixels presque transparents qui ne comptent pas.
    const c = canevas([...rectangle(200, 50, 339, 109), [5, 5, 10], [500, 140, 20]]);
    const avant = url(png(c.largeur, c.hauteur, 4, c.pixels, { filtre: (y) => y % 5 }));
    const apres = rognerSignature(avant);
    const lu = relire(apres);
    assert.deepStrictEqual([lu.largeur, lu.hauteur], [148, 68], 'de x 196 à 343, de y 46 à 113');
    for (let y = 0; y < 68; y++) {
        const source = c.pixels.subarray(((46 + y) * 520 + 196) * 4, ((46 + y) * 520 + 196 + 148) * 4);
        assert.ok(lu.pixels.subarray(y * 148 * 4, (y + 1) * 148 * 4).equals(source), `ligne ${y} : les pixels d'origine, intacts`);
    }
});

test('un point minuscule n\'est pas grossi plus de quatre fois : il ne devient pas une tache', () => {
    assert.strictEqual(GROSSISSEMENT_MAX, 4);
    const lu = relire(rognerSignature(url(png(520, 150, 4, canevas([[260, 75]]).pixels))));
    assert.deepStrictEqual([lu.largeur, lu.hauteur], [130, 38], 'le quart du canevas, dans chaque sens');
    // Le point reste au milieu du cadre rogné (x 196 à 325, y 57 à 94).
    const i = ((75 - 57) * 130 + (260 - 196)) * 4;
    assert.deepStrictEqual([...lu.pixels.subarray(i, i + 4)], [0x1e, 0x21, 0x40, 255]);
    // Contre un bord : le cadre glisse, il ne rétrécit pas.
    const bord = relire(rognerSignature(url(png(520, 150, 4, canevas([[1, 1]]).pixels))));
    assert.deepStrictEqual([bord.largeur, bord.hauteur], [130, 38]);
});

test('un cachet scanné sur fond BLANC (RVB, sans transparence) se rogne aussi', () => {
    const largeur = 300, hauteur = 200;
    const pixels = Buffer.alloc(largeur * hauteur * 3, 255);
    for (const [x, y] of rectangle(100, 80, 179, 139)) pixels.set([40, 60, 160], (y * largeur + x) * 3);
    const lu = relire(rognerSignature(url(png(largeur, hauteur, 3, pixels))));
    assert.deepStrictEqual([lu.largeur, lu.hauteur, lu.canaux], [88, 68, 3]);
});

test('RIEN À GAGNER, RIEN À LIRE : l\'image revient telle quelle', () => {
    const vide = url(png(520, 150, 4, canevas([]).pixels));
    assert.strictEqual(rognerSignature(vide), vide, 'aucune encre : rien à cadrer');
    const pleine = url(png(520, 150, 4, canevas([[2, 2], [517, 147]]).pixels));
    assert.strictEqual(rognerSignature(pleine), pleine, 'l\'encre occupe déjà le cadre');
    for (const autre of ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==', 'data:image/png;base64,QUJD', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', '', null, undefined]) {
        assert.strictEqual(rognerSignature(autre), autre, `${String(autre).slice(0, 24)} : inchangé`);
    }
});

test('UNE IMAGE PIÉGÉE ne fait ni allouer ni échouer : elle revient telle quelle', () => {
    // Un en-tête qui annonce 60 000 × 60 000 pixels : plus de quatorze gigaoctets à allouer.
    const geante = url(png(4, 4, 4, canevas([[1, 1]], { largeur: 4, hauteur: 4 }).pixels, { entete: { largeur: 60000, hauteur: 60000 } }));
    const t = Date.now();
    assert.strictEqual(rognerSignature(geante), geante);
    assert.ok(Date.now() - t < 200, 'refusée sur son en-tête, sans rien décompresser');
    /* Un flux qui gonfle au-delà de l'image annoncée : une vraie image de 40 × 10 (encre comprise),
       suivie d'un mégaoctet. Sans `maxOutputLength`, le lecteur décompressait tout — puis rognait. */
    const c = canevas([[20, 5]], { largeur: 40, hauteur: 10 });
    const lignes = Buffer.alloc(10 * (40 * 4 + 1));
    for (let y = 0; y < 10; y++) c.pixels.copy(lignes, y * 161 + 1, y * 160, (y + 1) * 160);
    const bombe = url(png(40, 10, 4, c.pixels, { idat: zlib.deflateSync(Buffer.concat([lignes, Buffer.alloc(1 << 20)])) }));
    assert.strictEqual(rognerSignature(bombe), bombe);
});

test('au-delà de quatre millions de pixels, l\'image n\'est même pas lue', () => {
    /* 2100 × 2000 : dix-sept mégaoctets une fois décompressés, qu'un flux de quelques kilo-octets
       suffit à produire. Un vrai canevas de signature fait 78 000 pixels. */
    const c = canevas([[1000, 1000]], { largeur: 2100, hauteur: 2000 });
    const grande = url(png(2100, 2000, 4, c.pixels));
    assert.ok(grande.length < 200000, 'une image légère à transmettre…');
    assert.strictEqual(rognerSignature(grande), grande, '…mais trop grande pour être décompressée');
});
