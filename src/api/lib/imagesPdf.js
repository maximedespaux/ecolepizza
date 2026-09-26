/**
 * LES IMAGES QUI PARTENT DANS UN PDF — ce que LibreOffice en fait, et ce qu'on fait avant lui.
 *
 * Deux défauts de LibreOffice, éprouvés au rendu le 2026-09-26 (CLAUDE.md § 3) :
 *   · IL IGNORE `object-fit` : une image prend EXACTEMENT la boîte de ses attributs `width` /
 *     `height`. Toute signature, tout cachet s'imprimait déformé — un cachet rond devenait un
 *     ovale plat dans le cadre de 200 × 64 des documents. On calcule donc nous-mêmes la boîte aux
 *     proportions de l'image (`ajuster`, `cadrer`), et c'est `hspace` / `vspace` (attributs que
 *     LibreOffice honore) qui rendent au cadre son encombrement exact ;
 *   · IL N'OUVRE PAS une image WebP en `data:` : il imprime une icône d'image cassée. Le même
 *     fichier, lui, s'ouvre — et une image WebP DANS un SVG aussi. Or le navigateur réduit en
 *     WebP les cachets, logos et signatures déposés (lib/image.js, depuis le 2026-09-23).
 *     `imagesLisiblesParLibreOffice` les enveloppe donc d'un SVG juste avant la conversion.
 *
 * Les dimensions se lisent dans les premiers octets (`dimensionsImage`), sans décoder l'image :
 * aucune bibliothèque d'image à installer.
 */

/**
 * LES DIMENSIONS D'UNE IMAGE `data:` — PNG, JPEG, GIF, WebP, SVG → { w, h }, ou null.
 */
function dimensionsImage(dataUrl) {
    const m = /^data:image\/([a-z+]+);base64,(.*)$/i.exec(String(dataUrl || ''));
    if (!m) return null;
    const type = m[1].toLowerCase();
    try {
        if (type === 'png') {
            const b = Buffer.from(m[2].slice(0, 44), 'base64'); // l'en-tête IHDR tient dans les 33 premiers octets
            return b.length >= 24 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
        }
        if (type === 'gif') {
            const b = Buffer.from(m[2].slice(0, 16), 'base64'); // « GIF89a », puis largeur et hauteur de l'écran logique
            return b.length >= 10 && b.toString('latin1', 0, 3) === 'GIF' ? { w: b.readUInt16LE(6), h: b.readUInt16LE(8) } : null;
        }
        if (type === 'webp') {
            const b = Buffer.from(m[2].slice(0, 64), 'base64');
            if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null;
            const bloc = b.toString('latin1', 12, 16);
            // Avec perte (VP8) : après l'étiquette de trame et le code de départ 9D 01 2A, deux fois 14 bits.
            if (bloc === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
            // Sans perte (VP8L) : l'octet 0x2F, puis largeur − 1 et hauteur − 1 sur 14 bits chacune.
            if (bloc === 'VP8L' && b[20] === 0x2f) return { w: 1 + (((b[22] & 0x3f) << 8) | b[21]), h: 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)) };
            // Étendu (VP8X : transparence, animation) : largeur − 1 et hauteur − 1 sur 24 bits.
            if (bloc === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
            return null;
        }
        if (type === 'svg+xml') {
            const svg = Buffer.from(m[2], 'base64').toString('utf8');
            const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
            if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
            const w = /\bwidth="([\d.]+)/.exec(svg); const h = /\bheight="([\d.]+)/.exec(svg);
            return w && h ? { w: Number(w[1]), h: Number(h[1]) } : null;
        }
        if (type === 'jpeg' || type === 'jpg') {
            const b = Buffer.from(m[2], 'base64');
            for (let i = 2; i + 9 < b.length;) {
                if (b[i] !== 0xff) return null;
                const marqueur = b[i + 1];
                // SOF0 à SOF15, sauf DHT (C4), JPG (C8) et DAC (CC) : la hauteur puis la largeur.
                if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
                i += 2 + b.readUInt16BE(i + 2);
            }
        }
    } catch { /* image illisible : la boîte entière */ }
    return null;
}

/** La plus grande boîte aux proportions de l'image qui tient dans `largeur` × `hauteur` (unités libres). */
function ajuster(dataUrl, largeur, hauteur) {
    const d = dimensionsImage(dataUrl);
    if (!d || !d.w || !d.h) return { largeur, hauteur };
    const k = Math.min(largeur / d.w, hauteur / d.h);
    return { largeur: d.w * k, hauteur: d.h * k };
}

/**
 * UN CADRE DE `largeur` × `hauteur` PIXELS, L'IMAGE À SES PROPORTIONS DEDANS → { largeur, hauteur,
 * hspace, vspace }, en pixels entiers : l'image mesure largeur × hauteur, et `hspace` / `vspace`
 * (marges de chaque côté) rendent EXACTEMENT l'encombrement du cadre — un document dont le cadre
 * est signé se met en page comme celui dont il ne l'est pas. L'écart se répartit en deux parts
 * égales : l'image perd au besoin un pixel plutôt que le cadre d'en gagner un.
 * Image illisible : le cadre entier, sans marge (le rendu d'avant).
 */
function cadrer(dataUrl, largeur, hauteur) {
    const d = dimensionsImage(dataUrl);
    if (!d || !d.w || !d.h) return { largeur, hauteur, hspace: 0, vspace: 0 };
    const k = Math.min(largeur / d.w, hauteur / d.h);
    let l = Math.max(1, Math.min(largeur, Math.round(d.w * k)));
    let t = Math.max(1, Math.min(hauteur, Math.round(d.h * k)));
    if ((largeur - l) % 2) l += l > 1 ? -1 : 1;
    if ((hauteur - t) % 2) t += t > 1 ? -1 : 1;
    return { largeur: l, hauteur: t, hspace: (largeur - l) / 2, vspace: (hauteur - t) / 2 };
}

/** Une image WebP, enveloppée d'un SVG à ses dimensions : LibreOffice l'ouvre ainsi (voir en tête). */
function webpEnSvg(dataUrl) {
    const d = dimensionsImage(dataUrl);
    if (!d || !d.w || !d.h) return dataUrl;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${d.w}" height="${d.h}" viewBox="0 0 ${d.w} ${d.h}">`
        + `<image width="${d.w}" height="${d.h}" xlink:href="${dataUrl}"/></svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/**
 * Le HTML qui part chez LibreOffice, ses images WebP enveloppées d'un SVG. Appelé par `htmlToPdf`
 * (lib/docxpdf.js), la porte unique : documents, feuilles d'émargement, factures, aperçus. Le HTML
 * servi au navigateur n'est pas touché — le navigateur, lui, lit le WebP.
 */
function imagesLisiblesParLibreOffice(html) {
    const s = String(html == null ? '' : html);
    if (!s.includes('data:image/webp;base64,')) return s;
    return s.replace(/data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}/g, (u) => webpEnSvg(u));
}

module.exports = { dimensionsImage, ajuster, cadrer, webpEnSvg, imagesLisiblesParLibreOffice };
