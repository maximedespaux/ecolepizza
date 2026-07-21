/**
 * Conformité PDF/A-3 et métadonnées XMP de la facture Factur-X.
 *
 * TROIS DÉFAUTS, UNE MÊME CAUSE : on croyait que le code faisait quelque chose qu'il ne faisait
 * pas. `buildXmp` existait, produisait le bon paquet XMP, et n'était appelé par PERSONNE — d'où
 * « No Factur-X metadata found ». L'export PDF sortait en PDF ordinaire, jamais en PDF/A. Et
 * `pdf-lib` réécrivait le producteur à son propre nom au moment d'enregistrer, désaccordant le
 * dictionnaire d'information et le XMP sans que rien ne le laisse deviner à la lecture.
 *
 * Aucun de ces trois-là ne se voit en ouvrant la facture : elle s'affiche parfaitement.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { fusionnerXmp } = require('../lib/facturx.js');

const brut = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
/**
 * Le code SANS ses commentaires.
 *
 * Indispensable ici, et découvert à la dure : en réintroduisant le défaut d'origine — l'appel
 * au XMP mis en commentaire — AUCUN test ne tombait. L'assertion trouvait `// ecrireXmp(pdf…`
 * et se déclarait satisfaite. Elle vérifiait que le texte existait, pas que le code s'exécute :
 * la même erreur, exactement, que celle qu'elle était censée surveiller.
 */
const lire = (f) => brut(f).replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

/** Le XMP tel que LibreOffice l'écrit en export PDF/A-3. */
const XMP_LO = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
   <pdfaid:part>3</pdfaid:part>
   <pdfaid:conformance>B</pdfaid:conformance>
  </rdf:Description>
  <rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">
   <pdf:Producer>LibreOffice 26.2</pdf:Producer>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

// --- L'export PDF/A-3 -----------------------------------------------------------------------

test('la facture est exportée en PDF/A-3, pas en PDF ordinaire', () => {
    // 113 échecs sur la seule règle DeviceRGB, un par élément coloré. Rattraper ça après coup
    // voudrait dire réécrire chaque opérateur de couleur et embarquer un profil ICC à la main ;
    // le moteur de rendu le fait déjà correctement si on le lui demande.
    const src = lire('lib/docxpdf.js');
    assert.match(src, /SelectPdfVersion[\s\S]{0,60}"value":\s*3/, 'le filtre PDF/A-3 est absent');
    assert.match(src, /pdfa \? FILTRE_PDFA3 : FILTRE_PDF/, 'le filtre choisi ne dépend pas de l\'option');
    // Et l'appel doit vraiment le demander : un filtre disponible mais jamais utilisé ne sert
    // à rien — c'est exactement ce qui est arrivé à buildXmp.
    assert.match(lire('controllers/invoice.controller.js'), /htmlToPdf\(html, true\)/,
        'la facture n\'est pas convertie en PDF/A');
});

// --- Le XMP ---------------------------------------------------------------------------------

test('les métadonnées Factur-X sont ajoutées au XMP', () => {
    const out = fusionnerXmp(XMP_LO);
    assert.match(out, /urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#/);
    assert.match(out, /<fx:DocumentType>INVOICE<\/fx:DocumentType>/);
    assert.match(out, /<fx:DocumentFileName>factur-x\.xml<\/fx:DocumentFileName>/);
    assert.match(out, /<fx:ConformanceLevel>BASIC<\/fx:ConformanceLevel>/);
});

test('le schéma d\'extension PDF/A décrit les propriétés fx', () => {
    // PDF/A interdit les propriétés XMP d'un espace de noms inconnu. Sans cette description,
    // les quatre propriétés ajoutées pour Factur-X feraient échouer la conformité PDF/A — on
    // corrigerait un défaut en en créant un autre.
    const out = fusionnerXmp(XMP_LO);
    assert.match(out, /pdfaExtension:schemas/);
    assert.match(out, /<pdfaSchema:namespaceURI>urn:factur-x:pdfa[^<]*<\/pdfaSchema:namespaceURI>/);
    for (const p of ['DocumentFileName', 'DocumentType', 'Version', 'ConformanceLevel']) {
        assert.match(out, new RegExp(`<pdfaProperty:name>${p}</pdfaProperty:name>`), `${p} non décrite`);
    }
});

test('l\'identification PDF/A du moteur de rendu est préservée', () => {
    // On COMPLÈTE le paquet, on ne le remplace pas : réécrire l'ensemble pour ajouter quatre
    // lignes ferait perdre pdfaid, que LibreOffice a posé correctement.
    const out = fusionnerXmp(XMP_LO);
    assert.match(out, /<pdfaid:part>3<\/pdfaid:part>/);
    assert.match(out, /<pdfaid:conformance>B<\/pdfaid:conformance>/);
});

test('un PDF sans XMP en reçoit un complet', () => {
    for (const vide of [null, '', 'pas du xmp']) {
        const out = fusionnerXmp(vide);
        assert.match(out, /<pdfaid:part>3<\/pdfaid:part>/, `cas « ${vide} »`);
        assert.match(out, /urn:factur-x:pdfa/, `cas « ${vide} »`);
    }
});

test('réémettre une facture ne double pas les métadonnées Factur-X', () => {
    // Deux déclarations contradictoires vaudraient moins qu'une.
    const une = fusionnerXmp(XMP_LO);
    const deux = fusionnerXmp(une);
    assert.strictEqual(deux, une);
    assert.strictEqual((deux.match(/<fx:DocumentType>/g) || []).length, 1);
});

// --- La cohérence XMP / dictionnaire d'information -------------------------------------------

test('le producteur est écrit de façon identique des deux côtés', () => {
    // PDF/A exige que le dictionnaire d'information et le XMP disent la même chose. pdf-lib
    // signe de son propre nom dès qu'on enregistre : on ne peut pas l'en empêcher, alors on
    // écrit la même signature des deux côtés. Constaté sur le FICHIER, pas sur le code.
    const out = fusionnerXmp(XMP_LO, { producer: 'Impasto', creator: 'Impasto', modifyDate: '2026-07-21T19:49:06Z' });
    assert.match(out, /<pdf:Producer>Impasto<\/pdf:Producer>/);
    assert.doesNotMatch(out, /LibreOffice/, 'l\'ancien producteur subsiste');
    assert.match(out, /<xmp:CreatorTool>Impasto<\/xmp:CreatorTool>/);
    assert.match(out, /<xmp:ModifyDate>2026-07-21T19:49:06Z<\/xmp:ModifyDate>/);
    assert.match(out, /<xmp:MetadataDate>2026-07-21T19:49:06Z<\/xmp:MetadataDate>/);
});

test('une propriété absente du XMP est ajoutée, pas silencieusement perdue', () => {
    // XMP_LO ne porte ni CreatorTool ni date : remplacer sans ajouter aurait laissé le
    // dictionnaire seul à les déclarer, soit précisément l'écart qu'on corrige.
    const out = fusionnerXmp(XMP_LO, { producer: 'Impasto', creator: 'Impasto', modifyDate: '2026-07-21T19:49:06Z' });
    assert.match(out, /xmlns:xmp="http:\/\/ns\.adobe\.com\/xap\/1\.0\/"/);
    assert.match(out, /<xmp:CreatorTool>/);
});

test('attacherFacturX ne pose plus de titre au dictionnaire seul', () => {
    // `setTitle` écrivait dans le dictionnaire sans équivalent XMP : l'écart même que PDF/A
    // interdit. Et « Facture » n'apprenait rien à personne.
    const src = lire('lib/facturx.js');
    const bloc = src.slice(src.indexOf('async function attacherFacturX'));
    assert.doesNotMatch(bloc.slice(0, 800), /pdf\.setTitle\(/);
});

test('le XMP est bien écrit, pas seulement écrivable', () => {
    // LE DÉFAUT D'ORIGINE : `buildXmp` produisait le bon paquet et n'était appelée par
    // personne. Le code se lisait comme s'il faisait le travail.
    //
    // On suit donc la CHAÎNE D'APPEL entière, sur du code décommenté. Vérifier la seule
    // présence de `buildXmp` ne prouverait rien : elle peut être appelée par une fonction que
    // personne n'appelle, ce qui est très exactement le défaut d'origine déplacé d'un cran.
    const src = lire('lib/facturx.js');
    assert.ok(/\bbuildXmp\(\)/.test(src), 'buildXmp définie mais jamais appelée');

    const fusion = src.slice(src.indexOf('function fusionnerXmp'));
    assert.match(fusion.slice(0, 400), /buildXmp\(\)/, 'fusionnerXmp n\'appelle pas buildXmp');

    const ecrire = src.slice(src.indexOf('function ecrireXmp'));
    assert.match(ecrire.slice(0, 800), /fusionnerXmp\(/, 'ecrireXmp n\'appelle pas fusionnerXmp');
    assert.match(ecrire.slice(0, 800), /catalog\.set\(PDFName\.of\('Metadata'\)/,
        'le paquet est construit mais jamais posé dans le PDF');

    const attacher = src.slice(src.indexOf('async function attacherFacturX'));
    assert.match(attacher.slice(0, 800), /^\s+ecrireXmp\(pdf/m, 'attacherFacturX n\'écrit pas le XMP');
});

// --- BT-49 : l'acheteur d'une vente ----------------------------------------------------------

test('une vente conserve la référence du stagiaire, pas seulement son nom', () => {
    // L'acheteur était aplati en « Prénom Nom » et le lien vers sa fiche perdu au moment même
    // où on l'avait : son adresse e-mail, obligatoire (BT-49), restait inatteignable.
    const src = lire('controllers/sale.controller.js');
    assert.match(src, /INSERT INTO invoice[\s\S]{0,220}learner_id/, 'la vente n\'écrit pas learner_id');
    assert.match(src, /ER_BAD_FIELD_ERROR/, 'aucun repli si la migration 111 n\'est pas jouée');
});

test('le stagiaire écrit sur une facture est vérifié comme appartenant à l\'organisme', () => {
    // Il n'était que LU pour en tirer un nom ; il est maintenant ÉCRIT en clé étrangère. Un
    // identifiant venu d'ailleurs créerait une ligne qui pointe hors de l'organisme.
    const src = lire('controllers/sale.controller.js');
    const bloc = src.slice(src.indexOf('const checkout'), src.indexOf('INSERT INTO invoice'));
    assert.match(bloc, /belongsToOrg\(conn, 'learner', learner_id, orgId\)/);
});

test('la facture lit l\'acheteur depuis sa fiche quand elle est reliée', () => {
    const src = lire('controllers/invoice.controller.js');
    const bloc = src.slice(src.indexOf('let buyer ='), src.indexOf('// Lignes de la facture'));
    assert.match(bloc, /if \(inv\.learner_id\)/, 'la référence n\'est pas exploitée');
    // Le nom IMPRIMÉ prime : renommer une fiche ne doit pas récrire une pièce déjà émise.
    assert.match(bloc, /inv\.buyer_name \|\|/, 'le nom stocké doit primer sur celui de la fiche');
});

test('la migration 111 existe avec son retour arrière', () => {
    const dir = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    assert.ok(fs.existsSync(path.join(dir, '111_invoice_buyer_identity.sql')));
    const revert = fs.readFileSync(path.join(dir, '111_revert_invoice_buyer_identity.sql'), 'utf8');
    assert.match(revert, /DROP FOREIGN KEY IF EXISTS fk_invoice_learner/,
        'la contrainte doit tomber avant les colonnes');
});
