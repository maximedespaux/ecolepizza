// ============================================================================
//  Factur-X — facture électronique française (PDF/A-3 + XML CII embarqué).
//  Profil BASIC (EN 16931). La formation professionnelle est exonérée de TVA
//  (art. 261-4-4° du CGI) : catégorie de taxe « E », taux 0.
//
//  buildCII(data)     -> chaîne XML Cross-Industry Invoice (à valider EN16931)
//  buildFacturXPdf()  -> Uint8Array d'un PDF contenant factur-x.xml + XMP
// ============================================================================
const { PDFDocument, StandardFonts, rgb, PDFName, PDFString, PDFHexString, PDFRawStream } = require('pdf-lib');

const pdfDate = (d) => `D:${d.toISOString().replace(/[-:]/g, '').slice(0, 14)}+00'00'`;

// Embarque factur-x.xml avec le filespec complet (AFRelationship) + /AF au catalogue.
function embedFacturX(pdf, xml) {
    const ctx = pdf.context;
    const bytes = Buffer.from(xml, 'utf8');
    const now = pdfDate(new Date());

    const efStream = PDFRawStream.of(
        ctx.obj({ Type: 'EmbeddedFile', Subtype: PDFName.of('text/xml'), Params: ctx.obj({ Size: bytes.length, ModDate: PDFString.of(now) }) }),
        bytes
    );
    const efRef = ctx.register(efStream);

    const fileSpec = ctx.obj({
        Type: 'Filespec',
        F: PDFString.of('factur-x.xml'),
        UF: PDFHexString.fromText('factur-x.xml'),
        AFRelationship: PDFName.of('Alternative'),
        Desc: PDFString.of('Factur-X'),
        EF: ctx.obj({ F: efRef, UF: efRef }),
    });
    const fileSpecRef = ctx.register(fileSpec);

    const namesDict = ctx.obj({ EmbeddedFiles: ctx.obj({ Names: ctx.obj([PDFHexString.fromText('factur-x.xml'), fileSpecRef]) }) });
    pdf.catalog.set(PDFName.of('Names'), ctx.register(namesDict));
    pdf.catalog.set(PDFName.of('AF'), ctx.obj([fileSpecRef]));
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n) => Number(n || 0).toFixed(2);

// TypeCode UNTDID 1001 : 380 facture, 381 avoir, 386 acompte, 380 par défaut.
const TYPE_CODE = { FACTURE: '380', AVOIR: '381', ACOMPTE: '386', DEVIS: '380' };

/**
 * @param {object} d données assemblées (cf. invoice.controller)
 * @returns {string} XML CII (Factur-X BASIC)
 */
function buildCII(d) {
    const exo = d.tvaExoneree;
    const cat = exo ? 'E' : 'S';
    const rate = exo ? '0.00' : '20.00';
    const net = Number(d.amountNet);
    const tax = exo ? 0 : Math.round(net * 20) / 100;
    const grand = net + tax;
    const typeCode = TYPE_CODE[d.type] || '380';

    // Une ou plusieurs lignes (plusieurs dossiers/formations sur une facture).
    const lines = (d.lines && d.lines.length) ? d.lines : [{ name: d.lineName, amount: net }];
    const lineItems = lines.map((ln, i) => `<ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(ln.name || 'Prestation de formation')}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${money(Number(ln.amount))}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">1.00</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${cat}</ram:CategoryCode>
          <ram:RateApplicablePercent>${rate}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${money(Number(ln.amount))}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('\n    ');

    const addr = (a) => `<ram:PostalTradeAddress>
        ${a.zip ? `<ram:PostcodeCode>${esc(a.zip)}</ram:PostcodeCode>` : ''}
        ${a.line ? `<ram:LineOne>${esc(a.line)}</ram:LineOne>` : ''}
        ${a.city ? `<ram:CityName>${esc(a.city)}</ram:CityName>` : ''}
        <ram:CountryID>FR</ram:CountryID>
      </ram:PostalTradeAddress>`;

    const sellerSiret = d.seller.siret ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(d.seller.siret.replace(/\s/g, ''))}</ram:ID></ram:SpecifiedLegalOrganization>` : '';
    const buyerSiret = d.buyer.siret ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(d.buyer.siret.replace(/\s/g, ''))}</ram:ID></ram:SpecifiedLegalOrganization>` : '';
    // BT-31 (n° TVA, schéma VA) si disponible, sinon BT-32 (identifiant fiscal, schéma FC = SIRET).
    // Requis par BR-S-02 dès qu'une ligne est au taux normal.
    const sellerTaxReg = d.seller.vat
        ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(String(d.seller.vat).replace(/\s/g, ''))}</ram:ID></ram:SpecifiedTaxRegistration>`
        : (d.seller.siret ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(d.seller.siret.replace(/\s/g, ''))}</ram:ID></ram:SpecifiedTaxRegistration>` : '');
    const exemption = exo ? '<ram:ExemptionReason>Exonération de TVA — article 261-4-4° du CGI (formation professionnelle)</ram:ExemptionReason>' : '';
    // BR-CO-25 : montant dû positif -> échéance (BT-9) OU conditions de paiement (BT-20) obligatoires.
    const paymentTerms = `<ram:SpecifiedTradePaymentTerms>
        <ram:Description>${esc(d.dueDate ? 'Paiement à la date d\'échéance indiquée.' : 'Paiement à réception de la facture.')}</ram:Description>${d.dueDate ? `
        <ram:DueDateDateTime><udt:DateTimeString format="102">${d.dueDate}</udt:DateTimeString></ram:DueDateDateTime>` : ''}
      </ram:SpecifiedTradePaymentTerms>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(d.number)}</ram:ID>
    <ram:TypeCode>${typeCode}</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${d.issueDate}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${lineItems}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(d.seller.name)}</ram:Name>
        ${sellerSiret}
        ${addr(d.seller.address)}
        ${sellerTaxReg}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(d.buyer.name)}</ram:Name>
        ${buyerSiret}
        ${addr(d.buyer.address)}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${money(tax)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${exemption}
        <ram:BasisAmount>${money(net)}</ram:BasisAmount>
        <ram:CategoryCode>${cat}</ram:CategoryCode>
        <ram:RateApplicablePercent>${rate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      ${paymentTerms}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${money(net)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${money(net)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${money(tax)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${money(grand)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${money(grand)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

// XMP Factur-X (identification PDF/A-3 + extension Factur-X).
function buildXmp() {
    return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>BASIC</fx:ConformanceLevel>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/** Construit le PDF lisible + XML embarqué (Factur-X). */
async function buildFacturXPdf(d, xml) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const red = rgb(0.86, 0.24, 0.22);
    const dark = rgb(0.12, 0.13, 0.25);
    let y = 800;
    const text = (t, x, size = 10, f = font, color = dark) => { page.drawText(String(t), { x, y, size, font: f, color }); };

    text(d.seller.name, 40, 14, bold);
    y -= 16; text(`${d.seller.address.line || ''} · ${d.seller.address.zip || ''} ${d.seller.address.city || ''}`, 40, 9);
    y -= 12; text(`SIRET ${d.seller.siret || '—'}${d.seller.vat ? ` · TVA ${d.seller.vat}` : ''}`, 40, 9);
    y -= 30; text(`${d.typeLabel} ${d.number}`, 40, 18, bold, red);
    y -= 20; text(`Date : ${d.issueDate.slice(6, 8)}/${d.issueDate.slice(4, 6)}/${d.issueDate.slice(0, 4)}`, 40, 10);
    if (d.dueDate) { y -= 13; text(`Échéance : ${d.dueDate.slice(6, 8)}/${d.dueDate.slice(4, 6)}/${d.dueDate.slice(0, 4)}`, 40, 10); }

    y -= 26; text('Client', 40, 9, bold);
    y -= 14; text(d.buyer.name, 40, 11, bold);
    y -= 13; text(`${d.buyer.address.line || ''} ${d.buyer.address.zip || ''} ${d.buyer.address.city || ''}`, 40, 9);
    if (d.buyer.siret) { y -= 12; text(`SIRET ${d.buyer.siret}`, 40, 9); }

    // Ligne + totaux
    const net = Number(d.amountNet);
    const tax = d.tvaExoneree ? 0 : Math.round(net * 20) / 100;
    y -= 34; text('Désignation', 40, 9, bold); text('Montant HT', 460, 9, bold);
    y -= 4; page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1, color: red });
    const pdfLines = (d.lines && d.lines.length) ? d.lines : [{ name: d.lineName, amount: net }];
    for (const ln of pdfLines) {
        y -= 16; text(String(ln.name || 'Prestation de formation').slice(0, 78), 40, 10); text(`${Number(ln.amount).toFixed(2)} €`, 460, 10);
    }
    y -= 24; text('Total HT', 380, 10); text(`${net.toFixed(2)} €`, 460, 10);
    y -= 14; text('TVA', 380, 10); text(`${tax.toFixed(2)} €`, 460, 10);
    y -= 14; text('Total TTC', 380, 11, bold); text(`${(net + tax).toFixed(2)} €`, 460, 11, bold);

    y -= 22; text(d.dueDate ? "Conditions de paiement : à la date d'échéance indiquée." : 'Conditions de paiement : à réception de la facture.', 40, 8, font, rgb(0.4, 0.4, 0.4));
    if (d.tvaExoneree) { y -= 14; text('TVA non applicable — art. 261-4-4° du CGI (formation professionnelle).', 40, 8, font, rgb(0.4, 0.4, 0.4)); }
    y -= 30; text('Facture électronique conforme Factur-X (EN 16931, profil BASIC).', 40, 8, font, rgb(0.4, 0.4, 0.4));

    pdf.setTitle(`${d.typeLabel} ${d.number}`);
    pdf.setProducer('Impasto — École Pizza');
    pdf.setCreator('Impasto Factur-X');

    // XML embarqué (cœur de la facture électronique) + AF/AFRelationship.
    embedFacturX(pdf, xml);

    // Métadonnées XMP (identification PDF/A-3 + Factur-X).
    try {
        const xmp = buildXmp();
        const stream = pdf.context.stream(xmp, { Type: 'Metadata', Subtype: 'XML' });
        const ref = pdf.context.register(stream);
        pdf.catalog.set(PDFName.of('Metadata'), ref);
    } catch (e) {
        console.error('XMP:', e.message);
    }

    // Sans flux d'objets compressés : structures Factur-X directement lisibles.
    return pdf.save({ useObjectStreams: false });
}

module.exports = { buildCII, buildFacturXPdf, TYPE_CODE };
