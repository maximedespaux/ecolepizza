// Composition d'un PDF « document » avec en-tête ET pied de page répétés sur CHAQUE
// page — ce que LibreOffice ne sait pas faire depuis du HTML (l'en-tête via <thead>
// se répète mais pas le pied ; et un <thead> casse les sauts de page manuels).
//
// Stratégie robuste, sans nouveau moteur, en s'appuyant sur deux faits vérifiés :
//   · LibreOffice respecte précisément les marges @page (hors « 0 », ramené au défaut) ;
//   · une page PDF LibreOffice est TRANSPARENTE là où il n'y a pas de contenu.
// Donc :
//   1. le CORPS est rendu seul (flux normal → sauts de page OK), avec des marges
//      @page réservant en haut/en bas la hauteur des bandeaux ;
//   2. l'en-tête et le pied sont rendus chacun sur une page A4 (« mobilier ») ;
//   3. pdf-lib appose la page en-tête telle quelle (le bandeau tombe en haut) et la
//      page pied décalée vers le bas ; les zones vides laissent voir le corps.
// LibreOffice (déjà installé) + pdf-lib (déjà utilisé pour le scellement) suffisent.

const { PDFDocument } = require('pdf-lib');
const { htmlToPdf } = require('./docxpdf.js');
const { fillHtml, letterhead, renderBodyOnlyDoc, DOC_CSS } = require('./htmlfill.js');

const MM = 2.834645669;   // points PDF par millimètre
const A4H = 841.889763;   // hauteur A4 en points (297 mm)

// Géométrie des bandeaux (mm).
const HEADER_MARGIN_MM = 12;   // position de l'en-tête depuis le haut de sa page mobilier
const FOOTER_MARGIN_MM = 12;   // position du pied depuis le haut de SA page mobilier (avant décalage)
const BODY_TOP_MM = 36;        // marge haute du corps (réserve la zone d'en-tête)
const BODY_BOTTOM_MM = 22;     // marge basse du corps (réserve la zone de pied)
const FOOTER_TOP_FROM_BOTTOM_MM = 18; // où placer le HAUT du pied, mesuré depuis le bas de la page

// Page A4 « mobilier » : contient seulement le bandeau, calé par la marge @page (haut).
function furnitureDoc(innerHtml, marginTopMm) {
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: ${marginTopMm}mm 18mm; }
  html, body { margin: 0; padding: 0; }
${DOC_CSS}
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
async function composeDocumentPdf({ bodyHtml, headerHtml, footerHtml, ctx = {}, useLetterhead = true, sampleValues }) {
    const org = ctx.org || {};

    let headInner = '';
    if (headerHtml && headerHtml.trim()) {
        headInner = `<div class="doc-head custom">${fillHtml(headerHtml, ctx, sampleValues)}</div>`;
    } else if (useLetterhead && (org.legal_name || org.short_name)) {
        headInner = letterhead(org);
    }
    const footInner = (footerHtml && footerHtml.trim())
        ? `<div class="doc-foot">${fillHtml(footerHtml, ctx, sampleValues)}</div>` : '';

    const hasHeader = !!headInner;
    const hasFooter = !!footInner;
    const topMm = hasHeader ? BODY_TOP_MM : 20;
    const bottomMm = hasFooter ? BODY_BOTTOM_MM : 20;

    const bodyPdf = htmlToPdf(renderBodyOnlyDoc(bodyHtml, ctx, { topMm, bottomMm, values: sampleValues }));
    if (!hasHeader && !hasFooter) return bodyPdf;

    const doc = await PDFDocument.load(bodyPdf);
    const [hEmb] = hasHeader ? await doc.embedPdf(htmlToPdf(furnitureDoc(headInner, HEADER_MARGIN_MM)), [0]) : [null];
    const [fEmb] = hasFooter ? await doc.embedPdf(htmlToPdf(furnitureDoc(footInner, FOOTER_MARGIN_MM)), [0]) : [null];

    // Décalage vertical du pied : amène son HAUT (à FOOTER_MARGIN_MM du haut de sa page)
    // à FOOTER_TOP_FROM_BOTTOM_MM du bas de la page finale. Indépendant de la hauteur du pied.
    const footerShift = FOOTER_TOP_FROM_BOTTOM_MM * MM - (A4H - FOOTER_MARGIN_MM * MM);

    for (const pg of doc.getPages()) {
        const { width, height } = pg.getSize();
        if (hEmb) pg.drawPage(hEmb, { x: 0, y: 0, width, height });
        if (fEmb) pg.drawPage(fEmb, { x: 0, y: footerShift, width, height });
    }
    return Buffer.from(await doc.save());
}

module.exports = { composeDocumentPdf };
