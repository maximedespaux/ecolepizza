// Composition d'un PDF « document » avec en-tête ET pied de page répétés sur CHAQUE
// page — ce que LibreOffice ne sait pas faire depuis du HTML (l'en-tête via <thead>
// se répète mais pas le pied ; et un <thead> casse les sauts de page manuels).
//
// Stratégie robuste, sans nouveau moteur, en s'appuyant sur des faits vérifiés :
//   · LibreOffice respecte précisément les marges @page (hors « 0 », ramené au défaut) ;
//   · une page PDF LibreOffice est TRANSPARENTE là où il n'y a pas de contenu ;
//   · LibreOffice ignore CSS max-width/vertical-align mais respecte les ATTRIBUTS HTML
//     (width des images, valign des cellules).
// Donc :
//   1. le CORPS est rendu seul (flux normal → sauts de page OK), avec des marges
//      @page réservant en haut/en bas la hauteur (mesurée) des bandeaux ;
//   2. l'en-tête et le pied sont rendus chacun sur une page A4 (« mobilier »), l'en-tête
//      calé en haut, le pied calé en bas (valign) ;
//   3. pdf-lib appose ces pages sur chaque page du corps ; les zones vides laissent
//      voir le corps.
// LibreOffice (déjà installé) + pdf-lib (déjà utilisé pour le scellement) suffisent.

const { PDFDocument } = require('pdf-lib');
const { htmlToPdf } = require('./docxpdf.js');
const { fillHtml, letterhead, renderBodyOnlyDoc } = require('./htmlfill.js');

// CSS des bandeaux : interligne SERRÉ (LibreOffice gonfle l'espacement des <p> avec le
// line-height 1.5 du corps ; on le neutralise pour des en-têtes/pieds compacts et une
// hauteur prévisible). ~30 pt par ligne, mesuré.
const STRIP_CSS = `
  * { box-sizing: border-box; }
  body { font-family: "Liberation Sans", Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.2; }
  p { margin: 0; padding: 0; line-height: 1.15; }
  h1,h2,h3,h4 { margin: 0 0 2px; }
  hr { border: none; border-top: 1px solid #999; margin: 0 0 6px; }
  /* Filet uniquement pour le papier à en-tête auto (divs) : un bandeau personnalisé
     a son propre design. Sur du texte <br> centré, un border-top se redessine à
     chaque ligne — d'où l'usage d'un <hr> pour le pied. */
  .doc-head:not(.custom) { border-bottom: 1.5px solid #c0392b; padding-bottom: 6px; }
  .doc-head .org { font-size: 15pt; font-weight: 700; color: #c0392b; }
  .doc-head .org-l { font-size: 8.5pt; color: #555; }
  .doc-foot { padding-top: 2px; font-size: 8.5pt; color: #555; }
  table { border-collapse: collapse; }
  th, td { padding: 3px 6px; }
  img { max-width: 100%; }`;
const TEXT_LINE_PT = 16; // hauteur d'une ligne de bandeau en <br> (interligne serré, mesuré)

const PT_PER_MM = 2.834645669;
const A4H = 297 * PT_PER_MM;                  // hauteur A4 en points
const PX_PER_MM = 96 / 25.4;                 // LibreOffice rend les images à 96 ppp
const SIDE_MM = 18;                          // marge latérale par défaut
const CONTENT_PX = Math.round((210 - 2 * SIDE_MM) * PX_PER_MM); // ≈ 657 px

const HEADER_TOP_MM = 12;   // marge haute de la page mobilier en-tête
const FOOTER_BOTTOM_MM = 10; // distance BAS du pied ↔ bord bas de page
const GAP_MM = 3;           // espace entre bandeau et corps

// Largeur utile (px @96ppp) selon la marge latérale — pour borner les images par zone.
const contentPxFor = (sideMm) => Math.round((210 - 2 * sideMm) * PX_PER_MM);

// Ajuste la largeur des images à la largeur cible : LibreOffice les rend à leur taille
// px native (attribut width) en ignorant CSS max-width — sinon un bandeau déborde à droite.
// - toujours RÉDUIT une image plus large que la cible (sinon débordement) ;
// - si `fill` (mode bord à bord), AGRANDIT aussi une bannière (image occupant déjà
//   ≥ 50 % de la cible) pour qu'elle occupe toute la largeur.
function capImages(html, maxPx = CONTENT_PX, fill = false) {
    return String(html || '').replace(/<img\b[^>]*>/gi, (tag) => {
        const wm = tag.match(/\bwidth\s*=\s*["']?(\d+)/i) || tag.match(/width\s*:\s*(\d+)\s*px/i);
        const hm = tag.match(/\bheight\s*=\s*["']?(\d+)/i) || tag.match(/height\s*:\s*(\d+)\s*px/i);
        const w = wm ? Number(wm[1]) : null;
        const h = hm ? Number(hm[1]) : null;
        if (!w) return tag;
        let target = null;
        if (w > maxPx) target = maxPx;                       // trop large → réduire
        else if (fill && w >= maxPx * 0.5) target = maxPx;   // bord à bord → agrandir la bannière
        if (!target || target === w) return tag;
        const nh = h ? Math.round(h * target / w) : null;
        let out = tag
            .replace(/\bwidth\s*=\s*["']?\d+["']?/i, `width="${target}"`)
            .replace(/width\s*:\s*\d+\s*px/i, `width:${target}px`);
        if (nh != null) {
            out = out
                .replace(/\bheight\s*=\s*["']?\d+["']?/i, `height="${nh}"`)
                .replace(/height\s*:\s*\d+\s*px/i, `height:${nh}px`);
        }
        if (!/\bwidth\s*=/.test(out) && !/width\s*:/.test(out)) out = out.replace(/<img\b/i, `<img width="${target}"`);
        return out;
    });
}

// Estime la hauteur (pt) d'un bandeau pour dimensionner la marge réservée du corps.
// Images : largeur bornée → hauteur proportionnelle. Texte : ~16 pt par bloc de ligne.
function estimateStripHeightPt(html) {
    let pt = 0;
    const imgs = String(html || '').match(/<img\b[^>]*>/gi) || [];
    for (const tag of imgs) {
        const wm = tag.match(/\bwidth\s*=\s*["']?(\d+)/i) || tag.match(/width\s*:\s*(\d+)\s*px/i);
        const hm = tag.match(/\bheight\s*=\s*["']?(\d+)/i) || tag.match(/height\s*:\s*(\d+)\s*px/i);
        let w = wm ? Number(wm[1]) : CONTENT_PX;
        let h = hm ? Number(hm[1]) : 0;
        if (w > CONTENT_PX) { if (h) h = h * CONTENT_PX / w; w = CONTENT_PX; }
        if (!h) h = w * 0.22; // aspect de repli si hauteur inconnue
        pt += h * 72 / 96;
    }
    const textBlocks = (String(html || '').replace(/<img\b[^>]*>/gi, '').match(/<(p|div|h[1-6]|li|br)\b/gi) || []).length;
    pt += Math.max(textBlocks, imgs.length ? 0 : 1) * TEXT_LINE_PT;
    pt += 14; // filet + marge du bandeau (.doc-head/.doc-foot border + padding)
    return pt;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Aplati un bandeau composé UNIQUEMENT de paragraphes en lignes séparées par <br> :
// LibreOffice espace largement les <p> et redessine le filet du bandeau à chaque
// paragraphe. En <br>, le bandeau est un seul bloc (un filet, interligne serré).
// L'alignement commun des paragraphes est reporté sur le conteneur. Si le contenu
// n'est pas que des <p> (tableau, image hors <p>, etc.), on le laisse tel quel.
function flattenParagraphs(html) {
    const s = String(html || '').trim();
    if (!s) return { html: s, align: null };
    const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    const inners = [];
    const aligns = new Set();
    let m;
    while ((m = re.exec(s))) {
        const am = m[1].match(/text-align\s*:\s*(left|right|center|justify)/i);
        aligns.add(am ? am[1].toLowerCase() : 'left');
        inners.push(m[2].trim());
    }
    // Contenu « pur paragraphes » ? (rien d'autre que des <p> et des espaces)
    const rest = s.replace(re, '').replace(/\s+/g, '');
    if (!inners.length || rest) return { html: s, align: null };
    return { html: inners.join('<br>'), align: aligns.size === 1 ? [...aligns][0] : null };
}

// Page A4 « mobilier » (en-tête OU pied) : contenu calé en haut via la marge @page.
// Le pied sera ensuite DÉCALÉ vers le bas par pdf-lib (le placer en bas via un tableau
// valign casse le filet du bandeau, redessiné à chaque ligne par LibreOffice).
function furnitureDoc(innerHtml, topMm, sideMm) {
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: ${topMm}mm ${sideMm}mm; }
  html, body { margin: 0; padding: 0; }
${STRIP_CSS}
  .doc-head { margin: 0; } .doc-foot { margin: 0; }
</style></head><body>${innerHtml}</body></html>`;
}

/**
 * Rend un document (corps + en-tête + pied) en PDF avec bandeaux répétés sur chaque page.
 * - bodyHtml : corps (HTML de l'éditeur, avec jetons) ;
 * - headerHtml / footerHtml : bandeaux personnalisés (facultatifs) ;
 * - ctx : contexte de remplissage des jetons (dont ctx.org) ;
 * - useLetterhead : à défaut d'en-tête personnalisé, papier à en-tête auto.
 * Renvoie un Buffer PDF. Peut lever l'erreur NO_SOFFICE (LibreOffice absent).
 */
// Prépare les bandeaux (HTML) et calcule les marges réservées EXACTEMENT comme au rendu
// final. Partagé par composeDocumentPdf et l'API de métriques (repère de fin de page).
function buildLayout({ headerHtml, footerHtml, ctx = {}, useLetterhead = true, sampleValues, bleed = {} }) {
    const org = ctx.org || {};
    // « Bord à bord » (sans marge) par zone : marges latérales / de bord = 0, et images
    // bornées à la LARGEUR PLEINE de la page (au lieu de la largeur utile).
    const hSide = bleed.header ? 0 : SIDE_MM;
    const hTop = bleed.header ? 0 : HEADER_TOP_MM;
    const fSide = bleed.footer ? 0 : SIDE_MM;
    const fBottom = bleed.footer ? 0 : FOOTER_BOTTOM_MM;
    const bSide = bleed.body ? 0 : SIDE_MM;

    let headInner = '';
    if (headerHtml && headerHtml.trim()) {
        const f = flattenParagraphs(capImages(fillHtml(headerHtml, ctx, sampleValues), contentPxFor(hSide), !!bleed.header));
        headInner = `<div class="doc-head custom"${f.align ? ` style="text-align:${f.align}"` : ''}>${f.html}</div>`;
    } else if (useLetterhead && (org.legal_name || org.short_name)) {
        headInner = letterhead(org);
    }
    let footInner = '';
    if (footerHtml && footerHtml.trim()) {
        const f = flattenParagraphs(capImages(fillHtml(footerHtml, ctx, sampleValues), contentPxFor(fSide), !!bleed.footer));
        // <hr> = filet séparateur pleine largeur (fiable, contrairement à un border-top
        // sur du texte <br> centré, redessiné à chaque ligne par LibreOffice).
        footInner = `<div class="doc-foot"${f.align ? ` style="text-align:${f.align}"` : ''}><hr>${f.html}</div>`;
    }

    const hasHeader = !!headInner;
    const hasFooter = !!footInner;
    // Marges du corps adaptées à la hauteur réelle des bandeaux.
    const topMm = hasHeader
        ? clamp(hTop + estimateStripHeightPt(headInner) / PT_PER_MM + GAP_MM, hTop + 6, 120)
        : 20;
    const bottomMm = hasFooter
        ? clamp(fBottom + estimateStripHeightPt(footInner) / PT_PER_MM + GAP_MM, fBottom + 6, 100)
        : 20;

    return { headInner, footInner, hasHeader, hasFooter, topMm, bottomMm, bSide, hTop, hSide, fSide, fBottom };
}

// Renvoie les marges (mm) du corps, telles qu'utilisées au rendu — pour le repère de fin
// de page de l'éditeur. { topMm, bottomMm, contentMm }.
function computeReserves(opts) {
    const { topMm, bottomMm } = buildLayout(opts);
    return { topMm, bottomMm, contentMm: Math.max(0, 297 - topMm - bottomMm) };
}

async function composeDocumentPdf({ bodyHtml, headerHtml, footerHtml, ctx = {}, useLetterhead = true, sampleValues, bleed = {} }) {
    const { headInner, footInner, hasHeader, hasFooter, topMm, bottomMm, bSide, hTop, hSide, fSide, fBottom } =
        buildLayout({ headerHtml, footerHtml, ctx, useLetterhead, sampleValues, bleed });

    const bodyPdf = htmlToPdf(renderBodyOnlyDoc(capImages(bodyHtml, contentPxFor(bSide), !!bleed.body), ctx, { topMm, bottomMm, sideMm: bSide, values: sampleValues }));
    if (!hasHeader && !hasFooter) return bodyPdf;

    const doc = await PDFDocument.load(bodyPdf);
    const [hEmb] = hasHeader ? await doc.embedPdf(htmlToPdf(furnitureDoc(headInner, hTop, hSide)), [0]) : [null];
    const [fEmb] = hasFooter ? await doc.embedPdf(htmlToPdf(furnitureDoc(footInner, HEADER_TOP_MM, fSide)), [0]) : [null];

    // Le pied est rendu en HAUT de sa page mobilier (à HEADER_TOP_MM du bord haut) ; on le
    // décale vers le bas pour amener son BAS à fBottom du bord bas de la page.
    const footerHpt = hasFooter ? estimateStripHeightPt(footInner) : 0;
    const footerShift = fBottom * PT_PER_MM - (A4H - HEADER_TOP_MM * PT_PER_MM - footerHpt);

    for (const pg of doc.getPages()) {
        const { width, height } = pg.getSize();
        if (hEmb) pg.drawPage(hEmb, { x: 0, y: 0, width, height });
        if (fEmb) pg.drawPage(fEmb, { x: 0, y: footerShift, width, height });
    }
    return Buffer.from(await doc.save());
}

module.exports = { composeDocumentPdf, computeReserves };
