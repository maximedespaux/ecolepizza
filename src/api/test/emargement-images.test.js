/**
 * LES IMAGES DE LA FEUILLE D'ÉMARGEMENT — ce que la refonte de son affichage (2026-09-26) a trouvé :
 *   · LES SIGNATURES ÉCRASÉES. LibreOffice ignore `object-fit` : une image prend EXACTEMENT la
 *     boîte de ses attributs. Un tracé de 520 × 150 s'imprimait dans une case presque carrée, quatre
 *     fois trop étroit pour sa hauteur — sur chaque feuille. `dimensionsImage` lit les proportions
 *     dans les octets, `ajuster` calcule la boîte qui les garde ;
 *   · LE VIDE IMPRIMÉ EN GRAND. Proportions gardées, une signature tracée au milieu du canevas
 *     n'occupait plus que la moitié de sa case : `rognerSignature` retire le transparent autour
 *     (éprouvé à part, rogner-signature.test.js) ;
 *   · UNE SIGNATURE QUI ÉCRIT DANS LA FEUILLE. Aucun des trois chemins d'émargement ne validait
 *     l'image — le rattrapage se contentait d'un préfixe —, et la feuille la glissait telle quelle
 *     dans `src="…"` : un `"` fermait l'attribut, la suite s'imprimait sur la feuille. Validée à
 *     l'écriture (`estSignatureValide`, comme les documents), échappée au rendu.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { crc32 } = require('../lib/zip.js');
const E = require('../lib/emargement.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* Un canevas de signature 520 × 150, transparent, l'encre sur un rectangle : un PNG « filtre 0 ». */
function signaturePng(x0, y0, x1, y1, largeur = 520, hauteur = 150) {
    const pas = largeur * 4;
    const brut = Buffer.alloc(hauteur * (pas + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) brut.set([0x1e, 0x21, 0x40, 255], y * (pas + 1) + 1 + x * 4);
    const bloc = (type, data) => {
        const t = Buffer.from(type, 'latin1');
        const n = Buffer.alloc(4); n.writeUInt32BE(data.length);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
        return Buffer.concat([n, t, data, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4); ihdr[8] = 8; ihdr[9] = 6;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]);
    return `data:image/png;base64,${png.toString('base64')}`;
}

/* Une feuille d'un jour, un stagiaire, sa signature du matin. */
function feuille(signature) {
    const rows = [{ date: '2026-09-14', slot: 'MATIN' }];
    const e = { program_title: 'Fabriquer des pizzas artisanales', program_code: 'RS7404', start_date: '2026-09-14', end_date: '2026-09-14',
        week: 38, year: 2026, program_days: 1, program_hours: 7, program_horaires: '8h45 - 12h00 / 13h00 - 17h15' };
    const org = { legal_name: 'ECOLE PIZZA', town: 'LANNEMEZAN' };
    const participants = [{ role: 'stagiaire', name: 'BERGER Camille', sigOf: () => signature, appliesTo: () => true, presentDe: () => true }];
    return E.renderEmargementHtml({ org, e, rows, participants, config: { slots: ['MATIN'], show_stamp: false }, dateFeuille: '2026-09-14', aujourdHui: '2026-09-26' });
}

/* ── Les proportions ────────────────────────────────────────────────────────────────────────────── */
test('dimensionsImage lit la taille d\'un PNG, d\'un SVG et d\'un JPEG dans leurs premiers octets', () => {
    assert.deepStrictEqual(E.dimensionsImage(signaturePng(10, 10, 20, 20)), { w: 520, h: 150 });
    const svg = (s) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;
    assert.deepStrictEqual(E.dimensionsImage(svg('<svg viewBox="0 0 260 75" preserveAspectRatio="none"></svg>')), { w: 260, h: 75 });
    assert.deepStrictEqual(E.dimensionsImage(svg('<svg width="120" height="40"></svg>')), { w: 120, h: 40 });
    /* Un JPEG : un segment APP0, une table de Huffman (FFC4 — qui n'est PAS un début d'image, bien
       qu'il tombe dans la plage C0 à CF), puis le SOF0 qui porte hauteur 300 et largeur 640. */
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0), 0xff, 0xc4, 0x00, 0x04, 0x00, 0x00,
        0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x80, 0x03, ...Array(12).fill(0)]);
    assert.deepStrictEqual(E.dimensionsImage(`data:image/jpeg;base64,${jpeg.toString('base64')}`), { w: 640, h: 300 });
    for (const illisible of ['data:image/png;base64,QUJD', 'data:image/gif;base64,R0lGODlh', 'pas une image', null]) {
        assert.strictEqual(E.dimensionsImage(illisible), null, String(illisible));
    }
});

test('ajuster : la plus grande boîte AUX PROPORTIONS DE L\'IMAGE qui tient dans la case', () => {
    const sig = signaturePng(10, 10, 20, 20); // 520 × 150
    const b = E.ajuster(sig, 18, 23);
    assert.strictEqual(b.largeur, 18, 'une signature large tient par sa largeur');
    assert.ok(Math.abs(b.largeur / b.hauteur - 520 / 150) < 1e-9, 'et garde ses proportions — elle sortait dans une boîte de 18 × 23');
    const haute = E.ajuster(signaturePng(1, 1, 2, 2, 100, 400), 18, 23);
    assert.deepStrictEqual([haute.largeur, haute.hauteur], [23 / 4, 23], 'une image haute tient par sa hauteur');
    assert.deepStrictEqual(E.ajuster('data:image/png;base64,QUJD', 18, 23), { largeur: 18, hauteur: 23 }, 'illisible : la case entière, comme avant');
});

/* ── Dans la feuille ────────────────────────────────────────────────────────────────────────────── */
test('LA FEUILLE imprime la signature ROGNÉE, dans les proportions de son encre', () => {
    const avant = signaturePng(200, 50, 339, 109); // l'encre au milieu du canevas
    const html = feuille(avant);
    const m = /<img src="(data:image\/png;base64,[^"]+)" width="(\d+)" height="(\d+)"/.exec(html);
    assert.ok(m, 'la signature est imprimée');
    assert.notStrictEqual(m[1], avant, 'pas l\'image entière, avec son vide');
    assert.deepStrictEqual(E.dimensionsImage(m[1]), { w: 148, h: 68 }, 'le rectangle de l\'encre, plus 4 pixels');
    const [l, h] = [Number(m[2]), Number(m[3])];
    assert.ok(Math.abs(l / h - 148 / 68) < 0.05, `une boîte de ${l} × ${h} aux proportions de l'encre (et non 520 / 150)`);
});

test('UNE SIGNATURE PIÉGÉE ne sort pas de son attribut : `"` est échappé au rendu', () => {
    const html = feuille('data:image/png;base64,AA" onerror="alert(1)');
    assert.ok(!html.includes('" onerror="'), 'le `"` fermait l\'attribut src');
    assert.ok(html.includes('src="data:image/png;base64,AA&quot; onerror=&quot;alert(1)"'), 'la valeur reste entière, dans son attribut');
    // Le cachet et le logo passent par le même échappement.
    const src = lire('lib/emargement.js');
    assert.strictEqual((src.match(/<img src="\$\{attr\(/g) || []).length, 3, 'les trois images de la feuille : signature, logo, cachet');
    assert.ok(!/<img src="\$\{(?!attr\()/.test(src), 'aucune image glissée sans échappement');
});

/* ── À l'écriture ───────────────────────────────────────────────────────────────────────────────── */
test('LES TROIS CHEMINS D\'ÉMARGEMENT valident l\'image AVANT de l\'écrire', () => {
    const corps = (src, debut) => {
        const i = src.indexOf(debut);
        assert.ok(i >= 0, debut);
        const fin = src.indexOf('\nconst ', i + debut.length);
        return src.slice(i, fin < 0 ? undefined : fin);
    };
    const chemins = [
        ['controllers/espace.controller.js', 'const signMyEmargement = async', 'UPDATE attendance_record SET present = 1', 'le stagiaire signe'],
        ['controllers/attendance.controller.js', 'const signSheet = async', 'INSERT INTO attendance_trainer_sign', 'le formateur signe'],
        ['controllers/attendance.controller.js', 'const rattraperPresence = async', 'UPDATE attendance_record SET present = 1', 'l\'école rattrape'],
    ];
    for (const [fichier, fonction, ecriture, quoi] of chemins) {
        const c = corps(lire(fichier), fonction);
        const v = c.indexOf('estSignatureValide(');
        assert.ok(v > 0, `${quoi} : l'image est validée (${fichier})`);
        assert.ok(c.indexOf(ecriture) > v, `${quoi} : AVANT d'être écrite`);
        assert.match(lire(fichier), /const \{ estSignatureValide \} = require\('\.\.\/lib\/signatures\.js'\);/);
    }
    assert.ok(!lire('controllers/attendance.controller.js').includes('/^data:image\\/png;base64,/.test(signature)'),
        'le simple préfixe laissait passer `data:image/png;base64,AA"…`');
});
