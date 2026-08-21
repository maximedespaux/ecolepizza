// ============================================================================
//  Factur-X — facture électronique française (PDF/A-3 + XML CII embarqué).
//  Profil BASIC (EN 16931). La formation professionnelle est exonérée de TVA
//  (art. 261-4-4° du CGI) : catégorie de taxe « E », taux 0.
//
//  buildCII(data)     -> chaîne XML Cross-Industry Invoice (à valider EN16931)
//  attacherFacturX()  -> attache factur-x.xml a un PDF deja construit
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
 * Le SIREN d'un SIRET : ses neuf premiers chiffres.
 *
 * BT-30 (identifiant d'enregistrement légal du vendeur) attend un SIREN, pas un SIRET. On y
 * écrivait le SIRET complet, et BR-FR-10 le rejetait : « doit être composé exactement de 9
 * chiffres ». Le SIRET n'est pas perdu pour autant — il part en BT-29, sa vraie place.
 *
 * Les deux ne disent pas la même chose : le SIREN identifie l'ENTREPRISE, le SIRET l'un de ses
 * ÉTABLISSEMENTS. Un organisme à deux sites a un SIREN et deux SIRET.
 *
 * Rien n'est deviné : une valeur qui n'a ni 9 ni 14 chiffres est rendue telle quelle, à charge
 * pour le validateur de la signaler. Tronquer une saisie douteuse produirait un identifiant
 * plausible mais faux — le pire résultat possible pour une donnée d'identification.
 */
function siren(siret) {
    const chiffres = String(siret || '').replace(/\D/g, '');
    if (chiffres.length === 14 || chiffres.length === 9) return chiffres.slice(0, 9);
    return chiffres;
}

/**
 * Les trois mentions que la facturation entre professionnels rend obligatoires (BR-FR-05).
 *
 * Elles figuraient déjà en toutes lettres sur le PDF via le modèle de document, mais le PDF
 * n'est pas ce que lit une plateforme : c'est le XML qui fait foi, et il partait sans elles.
 * D'où trois rejets — un par code — sur une facture pourtant complète à l'œil.
 *
 *   PMD  pénalités de retard ......... art. L441-10 C. com., plancher de 3× l'intérêt légal
 *   PMT  frais de recouvrement ....... indemnité forfaitaire de 40 EUR, due de plein droit
 *   AAB  escompte .................... son ABSENCE doit être dite, pas seulement sa présence
 *
 * BR-FR-06 impose de n'écrire chaque code qu'UNE fois : ces notes sont donc posées ici, à un
 * seul endroit, et pas ajoutées à celles que pourrait porter la facture.
 */
const MENTIONS_LEGALES = [
    ['PMD', 'En cas de retard de paiement, des pénalités sont exigibles au taux de trois fois le taux de l\'intérêt légal, sans qu\'un rappel soit nécessaire (art. L441-10 du Code de commerce).'],
    ['PMT', 'Tout retard de paiement entraîne de plein droit une indemnité forfaitaire pour frais de recouvrement de 40 euros (art. L441-10 du Code de commerce et D441-5).'],
    ['AAB', 'Aucun escompte n\'est accordé pour paiement anticipé.'],
];

/**
 * @param {object} d données assemblées (cf. invoice.controller)
 * @returns {string} XML CII (Factur-X BASIC)
 */
/**
 * Ventile une facture par taux de TVA.
 *
 * TROIS CHOSES QUE LE CODE PRÉCÉDENT NE SAVAIT PAS FAIRE, et qui coûtaient de l'argent :
 *
 *   1. Le taux était écrit 20 % EN DUR, alors que la base connaît les vrais taux
 *      (inventory_item.tax_rate, shop_request_line.tax_rate) et que sale.controller les
 *      calcule correctement — sans jamais les conserver. Une farine à 5,5 % partait facturée
 *      à 20 %, soit 14,50 EUR de trop sur 100 EUR.
 *   2. Un panier MIXTE était inexprimable. Factur-X exige un groupe ApplicableTradeTax par
 *      taux ; il n'y en avait qu'un. Un livre à 5,5 % et une pelle à 20 % sur la même facture
 *      produisaient un XML arithmétiquement faux (BR-CO-14).
 *   3. La TVA était calculée sur le TOTAL, pas par groupe. Or l'arrondi légal se fait par
 *      taux : deux groupes arrondis séparément ne donnent pas toujours le total arrondi.
 *
 * Le taux retenu pour une ligne est, dans l'ordre : le sien, celui de la facture, puis 20 %.
 * Ce dernier repli garde les factures ANTÉRIEURES à la migration 108 identiques à ce qu'elles
 * étaient : une pièce comptable déjà envoyée ne doit pas changer de montant quand on rejoue
 * son édition.
 *
 * Exonéré (art. 261-4-4°) court-circuite tout : un seul groupe à 0 %, catégorie E.
 */
function ventilerTva(d) {
    const net = Number(d.amountNet);
    if (d.tvaExoneree) {
        return { groupes: [{ cat: 'E', taux: 0, base: net, taxe: 0 }], base: net, taxe: 0, grand: net };
    }
    const tauxDefaut = Number.isFinite(Number(d.taxRate)) && d.taxRate !== null ? Number(d.taxRate) : 20;
    const lignes = (d.lines && d.lines.length) ? d.lines : [{ name: d.lineName, amount: net }];

    const parTaux = new Map();
    for (const ln of lignes) {
        const t = Number.isFinite(Number(ln.taxRate)) && ln.taxRate !== null && ln.taxRate !== undefined
            ? Number(ln.taxRate) : tauxDefaut;
        parTaux.set(t, (parTaux.get(t) || 0) + Number(ln.amount || 0));
    }
    // Arrondi PAR GROUPE, comme l'exige la ventilation légale.
    const groupes = [...parTaux.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([taux, base]) => ({
            cat: taux === 0 ? 'Z' : 'S',
            taux,
            base: Math.round(base * 100) / 100,
            taxe: Math.round(base * taux) / 100,
        }));
    const base = Math.round(groupes.reduce((s, g) => s + g.base, 0) * 100) / 100;
    const taxe = Math.round(groupes.reduce((s, g) => s + g.taxe, 0) * 100) / 100;
    return { groupes, base, taxe, grand: Math.round((base + taxe) * 100) / 100 };
}

function buildCII(d) {
    const exo = d.tvaExoneree;
    const v = ventilerTva(d);
    const net = v.base, tax = v.taxe, grand = v.grand;
    // Taux de repli pour les LIGNES qui n'en portent pas : celui du premier groupe.
    const cat = v.groupes[0].cat;
    const rate = v.groupes[0].taux.toFixed(2);
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
          <ram:CategoryCode>${exo ? 'E' : (Number(ln.taxRate ?? d.taxRate ?? 20) === 0 ? 'Z' : 'S')}</ram:CategoryCode>
          <ram:RateApplicablePercent>${(exo ? 0 : Number(ln.taxRate ?? d.taxRate ?? 20)).toFixed(2)}</ram:RateApplicablePercent>
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

    // BT-29 = SIRET (l'établissement, schéma 0009) ; BT-30 = SIREN (l'entreprise, schéma 0002).
    // Écrire le SIRET dans BT-30 était le défaut signalé par BR-FR-10.
    const identite = (p) => {
        const s = String(p.siret || '').replace(/\s/g, '');
        if (!s) return { id: '', legal: '' };
        return {
            id: `<ram:ID schemeID="0009">${esc(s)}</ram:ID>`,
            legal: `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${esc(siren(s))}</ram:ID></ram:SpecifiedLegalOrganization>`,
        };
    };
    const idVendeur = identite(d.seller);
    const idClient = identite(d.buyer);

    /**
     * BT-34 / BT-49 — adresse électronique du vendeur et de l'acheteur, obligatoires en France
     * (BR-FR-13 et BR-FR-12). C'est l'adresse où la facture est remise et où l'on répond.
     *
     * ABSENTE = ÉLÉMENT ABSENT, jamais une valeur de remplacement. Une adresse inventée ferait
     * passer la validation en désignant un destinataire qui n'existe pas : le rejet se
     * déplacerait du validateur vers un client qui ne reçoit rien, et bien plus tard.
     */
    const adresseElectronique = (mail) => (mail
        ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${esc(String(mail).trim())}</ram:URIID></ram:URIUniversalCommunication>`
        : '');
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
    ${MENTIONS_LEGALES.map(([code, texte]) => `<ram:IncludedNote>
      <ram:Content>${esc(texte)}</ram:Content>
      <ram:SubjectCode>${code}</ram:SubjectCode>
    </ram:IncludedNote>`).join('\n    ')}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${lineItems}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        ${idVendeur.id}
        <ram:Name>${esc(d.seller.name)}</ram:Name>
        ${idVendeur.legal}
        ${addr(d.seller.address)}
        ${adresseElectronique(d.seller.email)}
        ${sellerTaxReg}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        ${idClient.id}
        <ram:Name>${esc(d.buyer.name)}</ram:Name>
        ${idClient.legal}
        ${addr(d.buyer.address)}
        ${adresseElectronique(d.buyer.email)}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${v.groupes.map((g) => `<ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${money(g.taxe)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${g.cat === 'E' ? exemption : ''}
        <ram:BasisAmount>${money(g.base)}</ram:BasisAmount>
        <ram:CategoryCode>${g.cat}</ram:CategoryCode>
        <ram:RateApplicablePercent>${g.taux.toFixed(2)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`).join('\n      ')}
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

/**
 * Les descriptions XMP propres à Factur-X, à insérer dans le paquet existant.
 *
 * CE BLOC N'ÉTAIT JAMAIS ÉCRIT. `buildXmp` existait, produisait le bon XMP… et n'était appelé
 * par personne. Le validateur le disait sans détour : « No Factur-X metadata found in XMP ».
 * C'est le genre de fonction qui rassure à la lecture du code et ne fait rien à l'exécution.
 *
 * ON COMPLÈTE LE PAQUET, ON NE LE REMPLACE PAS. LibreOffice y a déjà mis l'identification
 * PDF/A (pdfaid) et le producteur, ce dernier devant rester synchronisé avec le dictionnaire
 * d'information du PDF. Réécrire le paquet entier casserait cette cohérence pour ajouter
 * quatre lignes.
 *
 * LE SCHÉMA D'EXTENSION N'EST PAS DÉCORATIF : PDF/A interdit les propriétés XMP d'un espace de
 * noms inconnu, sauf à le décrire. Sans cette description, les quatre propriétés `fx:` que
 * l'on ajoute pour satisfaire Factur-X feraient échouer la conformité PDF/A — on corrigerait
 * un défaut en en créant un autre.
 */
const XMP_FACTURX = `  <rdf:Description rdf:about="" xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
   <fx:DocumentType>INVOICE</fx:DocumentType>
   <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
   <fx:Version>1.0</fx:Version>
   <fx:ConformanceLevel>BASIC</fx:ConformanceLevel>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/" xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#" xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
   <pdfaExtension:schemas>
    <rdf:Bag>
     <rdf:li rdf:parseType="Resource">
      <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
      <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
      <pdfaSchema:prefix>fx</pdfaSchema:prefix>
      <pdfaSchema:property>
       <rdf:Seq>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>Name of the embedded XML invoice file</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>DocumentType</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>INVOICE</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>Version</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The actual version of the Factur-X XML schema</pdfaProperty:description>
        </rdf:li>
        <rdf:li rdf:parseType="Resource">
         <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
         <pdfaProperty:valueType>Text</pdfaProperty:valueType>
         <pdfaProperty:category>external</pdfaProperty:category>
         <pdfaProperty:description>The conformance level of the embedded Factur-X data</pdfaProperty:description>
        </rdf:li>
       </rdf:Seq>
      </pdfaSchema:property>
     </rdf:li>
    </rdf:Bag>
   </pdfaExtension:schemas>
  </rdf:Description>`;

/** Paquet XMP complet, pour un PDF qui n'en porterait aucun. */
function buildXmp() {
    return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
${XMP_FACTURX}
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

/**
 * Ajoute les descriptions Factur-X au paquet XMP d'un PDF, ou en pose un s'il n'en a pas.
 *
 * L'insertion se fait juste avant `</rdf:RDF>` : c'est un conteneur de descriptions, leur
 * ordre est libre. Si le paquet en porte déjà (PDF réémis), on ne double pas — deux
 * déclarations contradictoires vaudraient moins qu'une.
 */
function fusionnerXmp(existant, sync) {
    let xmp = (!existant || !existant.includes('</rdf:RDF>')) ? buildXmp() : existant;
    if (!xmp.includes('urn:factur-x:pdfa:CrossIndustryDocument')) {
        xmp = xmp.replace('</rdf:RDF>', `${XMP_FACTURX}\n </rdf:RDF>`);
    }
    return sync ? synchroniser(xmp, sync) : xmp;
}

/**
 * Aligne le XMP sur le dictionnaire d'information du PDF.
 *
 * PDF/A exige que les deux DISENT LA MÊME CHOSE. Or pdf-lib réécrit le producteur et le
 * créateur à son propre nom dès qu'on enregistre : le fichier annonçait « pdf-lib » dans son
 * dictionnaire et « LibreOffice » dans son XMP, ce qu'aucun validateur ne laisse passer. On ne
 * peut pas empêcher pdf-lib de signer, alors on écrit la même signature des deux côtés.
 *
 * Constaté sur le fichier produit, pas sur le code : rien dans `attacherFacturX` ne laissait
 * deviner qu'enregistrer changerait des métadonnées qu'on n'avait pas touchées.
 */
function synchroniser(xmp, { producer, creator, modifyDate }) {
    const poser = (src, balise, valeur, ns) => {
        const re = new RegExp(`<${balise}>[\\s\\S]*?</${balise}>`);
        if (re.test(src)) return src.replace(re, `<${balise}>${esc(valeur)}</${balise}>`);
        // Aucune occurrence : on ajoute une description portant son propre espace de noms.
        return src.replace('</rdf:RDF>',
            `  <rdf:Description rdf:about="" ${ns}><${balise}>${esc(valeur)}</${balise}></rdf:Description>\n </rdf:RDF>`);
    };
    const NS_PDF = 'xmlns:pdf="http://ns.adobe.com/pdf/1.3/"';
    const NS_XMP = 'xmlns:xmp="http://ns.adobe.com/xap/1.0/"';
    let out = poser(xmp, 'pdf:Producer', producer, NS_PDF);
    out = poser(out, 'xmp:CreatorTool', creator, NS_XMP);
    out = poser(out, 'xmp:ModifyDate', modifyDate, NS_XMP);
    out = poser(out, 'xmp:MetadataDate', modifyDate, NS_XMP);
    return out;
}

/** Construit le PDF lisible + XML embarqué (Factur-X). */
/**
 * Attache le XML Factur-X à un PDF DÉJÀ construit, d'où qu'il vienne.
 *
 * Sépare les deux responsabilités que `buildFacturXPdf` mélangeait : dessiner la facture, et
 * la rendre conforme. Seule la première est affaire de mise en page et peut donc être confiée
 * à un modèle d'organisme ; la seconde est normée (EN 16931) et reste au code.
 */
const PRODUCTEUR = 'Impastio';

async function attacherFacturX(pdfBytes, xml) {
    const pdf = await PDFDocument.load(pdfBytes);
    embedFacturX(pdf, xml);

    // On signe des DEUX côtés, avec la même valeur. `setTitle` a été retiré : il posait un
    // titre dans le dictionnaire sans équivalent dans le XMP, soit exactement l'écart que
    // PDF/A interdit — et un titre « Facture » n'apprenait rien à personne.
    const maintenant = new Date();
    pdf.setProducer(PRODUCTEUR);
    pdf.setCreator(PRODUCTEUR);
    pdf.setModificationDate(maintenant);
    ecrireXmp(pdf, maintenant);

    return Buffer.from(await pdf.save());
}

/** Remplace le flux /Metadata du catalogue par le paquet XMP complété et synchronisé. */
function ecrireXmp(pdf, maintenant) {
    const ctx = pdf.context;
    let existant = null;
    try {
        const flux = pdf.catalog.lookup(PDFName.of('Metadata'));
        if (flux && flux.getContents) existant = Buffer.from(flux.getContents()).toString('utf8');
    } catch { /* pas de XMP lisible : on en pose un complet */ }

    const xmp = fusionnerXmp(existant, {
        producer: PRODUCTEUR,
        creator: PRODUCTEUR,
        modifyDate: maintenant.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    });
    const stream = PDFRawStream.of(
        ctx.obj({ Type: 'Metadata', Subtype: 'XML' }),
        Buffer.from(xmp, 'utf8')
    );
    pdf.catalog.set(PDFName.of('Metadata'), ctx.register(stream));
}

/* La mise en page interne de la facture vivait ici : un en-tete, un tableau et trois totaux
   poses au pixel avec pdf-lib. Elle a ete RETIREE, pas debranchee.

   Aucun organisme ne pouvait la changer, et tant qu'elle existait elle servait de repli
   silencieux : une facture partait avec une presentation que personne n'avait choisie. C'est
   desormais un modele de document de type FACTURE qui la produit — voir buildInvoicePdf dans
   invoice.controller.js. Sans modele, aucune facture n'est emise, et on le dit.

   Un gabarit de secours qui traine finit toujours par resservir. */



/**
 * Ce qui manque pour qu'une facture passe la validation française (XP Z12-012).
 *
 * `buildCII` ne peut PAS inventer ces valeurs : ni un SIRET, ni une adresse électronique. Il
 * pourrait se taire, mais alors le défaut ne se découvrirait qu'au rejet par la plateforme,
 * loin de l'écran où on peut le corriger. Autant le nommer tout de suite, et en français.
 *
 * @returns {string[]} libellés des données manquantes, vide si la facture est complète
 */
function manquantsFacturX(d) {
    const m = [];
    if (!d.seller.email) m.push("l'adresse e-mail de votre organisme (Réglages → Organisme)");
    if (!d.seller.siret) m.push('le SIRET de votre organisme (Réglages → Organisme)');
    if (!d.buyer.email) m.push("l'adresse e-mail du client de cette facture");
    return m;
}

module.exports = { ventilerTva, attacherFacturX, buildCII, manquantsFacturX, fusionnerXmp, siren, TYPE_CODE };
