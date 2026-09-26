/**
 * LE VIDE AUTOUR D'UNE SIGNATURE, RETIRÉ À L'IMPRESSION.
 *
 * Une signature se trace sur un canevas de 520 × 150 (SignatureModal) et s'enregistre entière : le
 * trait, et tout ce que le doigt n'a pas touché. Sur la feuille d'émargement, l'image garde ses
 * proportions (`ajuster`, lib/emargement.js) dans une colonne de 14 à 22 mm : une signature tracée
 * au milieu du cadre n'en occupait que la moitié, l'encre sortait à quelques millimètres — et le
 * vide s'imprimait en grand.
 *
 * On rogne donc l'image au rectangle de son encre, plus une marge, AU MOMENT DU RENDU. La signature
 * enregistrée n'est pas touchée — c'est elle qui fait foi — et aucun trait ne change : seul le
 * transparent (ou le blanc d'un cachet scanné) qui l'entoure disparaît.
 *
 * PNG 8 bits non entrelacé seulement : ce que produit `canvas.toDataURL("image/png")`. Toute autre
 * image (JPEG, PNG à palette ou à couleur transparente…) revient telle quelle — ne rien rogner n'est
 * jamais faux. Zlib et le CRC de Node suffisent : aucune bibliothèque d'image à installer.
 */
const zlib = require('zlib');
const { crc32 } = require('./zip.js');

const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CANAUX = { 0: 1, 2: 3, 4: 2, 6: 4 }; // niveaux de gris, RVB, gris + alpha, RVBA
/* UNE BORNE, parce que l'image vient d'un stagiaire : un en-tête qui annoncerait 60 000 × 60 000
   ferait allouer des gigaoctets. Un canevas de signature fait 78 000 pixels, un cachet scanné
   quelques centaines de milliers. Au-delà, l'image est rendue telle quelle. */
const PIXELS_MAX = 4000000;
const MARGE = 4;         // pixels gardés autour de l'encre : le trait ne touche pas le bord
/* JAMAIS PLUS DE QUATRE FOIS PLUS GRAND : le cadre rogné garde au moins le quart du canevas dans
   chaque sens. Sans ce plancher, un trait minuscule — un point, un paraphe de deux millimètres —
   deviendrait une tache qui remplit la case, et la feuille montrerait une signature que personne
   n'a tracée. */
const GROSSISSEMENT_MAX = 4;
const ALPHA_VIDE = 24;   // en dessous, un pixel est transparent (le bord adouci d'un trait n'est pas de l'encre)
const BLANC = 232;       // au-dessus sur les trois canaux, un pixel est du papier

/** Les pixels d'un PNG → { largeur, hauteur, canaux, couleur, pixels } (lignes « défiltrées »), ou null. */
function lirePng(octets) {
    if (octets.length < 45 || !octets.subarray(0, 8).equals(SIGNATURE_PNG)) return null;
    let entete = null;
    const idat = [];
    for (let i = 8; i + 12 <= octets.length;) {
        const n = octets.readUInt32BE(i);
        const type = octets.toString('latin1', i + 4, i + 8);
        if (i + 12 + n > octets.length) return null;
        const data = octets.subarray(i + 8, i + 8 + n);
        if (type === 'IHDR' && n >= 13) entete = { largeur: data.readUInt32BE(0), hauteur: data.readUInt32BE(4), profondeur: data[8], couleur: data[9], entrelace: data[12] };
        else if (type === 'IDAT') idat.push(data);
        else if (type === 'tRNS') return null; // une couleur déclarée transparente : la recopie la rendrait opaque
        else if (type === 'IEND') break;
        i += 12 + n;
    }
    if (!entete) return null;
    const { largeur, hauteur, profondeur, couleur, entrelace } = entete;
    const canaux = CANAUX[couleur];
    if (profondeur !== 8 || !canaux || entrelace !== 0 || !largeur || !hauteur || largeur * hauteur > PIXELS_MAX || !idat.length) return null;
    const pas = largeur * canaux;
    const attendu = hauteur * (pas + 1);
    // `maxOutputLength` : un flux qui gonflerait au-delà de l'image annoncée lève, au lieu d'allouer.
    const brut = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: attendu });
    if (brut.length < attendu) return null;
    const pixels = Buffer.alloc(hauteur * pas);
    // Les cinq filtres du PNG (RFC 2083, § 6) : chaque octet est codé par rapport à ses voisins déjà lus.
    for (let y = 0; y < hauteur; y++) {
        const filtre = brut[y * (pas + 1)];
        const src = y * (pas + 1) + 1, dst = y * pas, dessus = dst - pas;
        if (filtre > 4) return null;
        for (let x = 0; x < pas; x++) {
            const a = x >= canaux ? pixels[dst + x - canaux] : 0;            // à gauche
            const b = y ? pixels[dessus + x] : 0;                            // au-dessus
            const c = y && x >= canaux ? pixels[dessus + x - canaux] : 0;    // au-dessus à gauche
            let v = brut[src + x];
            if (filtre === 1) v += a;
            else if (filtre === 2) v += b;
            else if (filtre === 3) v += (a + b) >> 1;
            else if (filtre === 4) {
                const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            }
            pixels[dst + x] = v; // un Buffer garde l'octet de poids faible : l'addition modulo 256 du format
        }
    }
    return { largeur, hauteur, canaux, couleur, pixels };
}

/** Le rectangle de l'encre (pixels opaques et non blancs) → { x0, y0, x1, y1 } inclusifs, ou null. */
function rectangleEncre({ largeur, hauteur, canaux, pixels }) {
    let x0 = largeur, y0 = hauteur, x1 = -1, y1 = -1;
    for (let y = 0; y < hauteur; y++) {
        for (let x = 0; x < largeur; x++) {
            const i = (y * largeur + x) * canaux;
            const alpha = canaux === 4 ? pixels[i + 3] : canaux === 2 ? pixels[i + 1] : 255;
            if (alpha <= ALPHA_VIDE) continue;
            const clair = canaux >= 3 ? Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) : pixels[i];
            if (clair >= BLANC) continue;
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
        }
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** L'intervalle [a, b] (inclusif), élargi autour de son milieu jusqu'à `min` pixels, sans sortir de [0, max]. */
function elargir(a, b, min, max) {
    const manque = min - (b - a + 1);
    if (manque <= 0) return [a, b];
    const fin = Math.min(max, b + Math.ceil(manque / 2));
    const debut = Math.max(0, fin - min + 1);
    return [debut, Math.min(max, debut + min - 1)];
}

function bloc(type, data) {
    const t = Buffer.from(type, 'latin1');
    const longueur = Buffer.alloc(4);
    longueur.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([longueur, t, data, crc]);
}

/**
 * La signature `dataUrl`, rognée au rectangle de son encre (plus MARGE pixels) → un data-URL PNG.
 * Revient INCHANGÉE quand il n'y a rien à gagner ou rien à lire : autre format, image vide,
 * encre qui occupe déjà tout le cadre, fichier abîmé.
 */
function rognerSignature(dataUrl) {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
    if (!m) return dataUrl;
    try {
        const image = lirePng(Buffer.from(m[1], 'base64'));
        if (!image) return dataUrl;
        const r = rectangleEncre(image);
        if (!r) return dataUrl; // aucune encre : rien à cadrer
        const { largeur, hauteur, canaux, couleur, pixels } = image;
        const [x0, x1] = elargir(Math.max(0, r.x0 - MARGE), Math.min(largeur - 1, r.x1 + MARGE), Math.ceil(largeur / GROSSISSEMENT_MAX), largeur - 1);
        const [y0, y1] = elargir(Math.max(0, r.y0 - MARGE), Math.min(hauteur - 1, r.y1 + MARGE), Math.ceil(hauteur / GROSSISSEMENT_MAX), hauteur - 1);
        const l = x1 - x0 + 1, h = y1 - y0 + 1;
        if (l >= largeur * 0.95 && h >= hauteur * 0.95) return dataUrl; // l'encre occupe déjà le cadre
        const pas = l * canaux;
        const brut = Buffer.alloc(h * (pas + 1)); // chaque ligne : le filtre 0 (aucun), puis ses octets
        for (let y = 0; y < h; y++) {
            const debut = ((y0 + y) * largeur + x0) * canaux;
            pixels.copy(brut, y * (pas + 1) + 1, debut, debut + pas);
        }
        const ihdr = Buffer.alloc(13); // compression, filtrage et entrelacement : 0
        ihdr.writeUInt32BE(l, 0);
        ihdr.writeUInt32BE(h, 4);
        ihdr[8] = 8;
        ihdr[9] = couleur;
        const png = Buffer.concat([SIGNATURE_PNG, bloc('IHDR', ihdr), bloc('IDAT', zlib.deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]);
        return `data:image/png;base64,${png.toString('base64')}`;
    } catch {
        return dataUrl; // une image illisible s'imprime comme avant, elle ne fait pas échouer la feuille
    }
}

module.exports = { rognerSignature, lirePng, rectangleEncre, elargir, PIXELS_MAX, MARGE, GROSSISSEMENT_MAX };
