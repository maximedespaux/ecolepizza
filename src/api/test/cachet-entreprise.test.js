/**
 * LE CACHET DE L'ENTREPRISE : UN CADRE VIDE, COMME LA SIGNATURE DU STAGIAIRE.
 *
 * DEMANDÉ LE 2026-09-21 : « le cachet de l'entreprise devrait s'afficher comme la signature du
 * stagiaire, pas comme un jeton — un espace blanc là où viendra la signature ».
 *
 * CE QUI MANQUAIT. Le représentant d'une entreprise signe dans la case `representant` — depuis
 * son espace (« signer avec mon cachet »), ou par le lien de signature. Le cachet ne s'imprime
 * donc que là où le modèle porte un cadre `sig:representant`. Or la palette n'en proposait
 * aucun : les blocs nommés (Jury, Formateur, Stagiaire 1…) tirent leur clé de leur libellé, et
 * aucun ne donnait `representant`. Sans ce cadre, le cachet n'apparaissait NULLE PART sur la page
 * — il n'existait que dans le sceau du PDF.
 *
 * ET LE MAUVAIS OUTIL ÉTAIT À PORTÉE DE MAIN : le cachet enregistré (`company.stamp`, une image
 * rangée en texte) était proposé comme « Champ document » de l'entreprise. Inséré, c'était une
 * puce ordinaire, qui s'imprimait en caractères — ou en rien sur un document d'entreprise.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { fillHtml } = require('../lib/htmlfill.js');
const { introspectFields } = require('../lib/conditions.js');

const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const EDITEUR = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'TemplateEditor.jsx'), 'utf8');

test('LE CADRE DE L\'ENTREPRISE EST LA CASE OÙ L\'ENTREPRISE SIGNE', () => {
    /* L'INVARIANT. Trois endroits nomment cette case ; s'ils divergent, le cadre reste vide et le
       cachet ne s'imprime nulle part — sans la moindre erreur. */
    const cadre = /const SIG_ENTREPRISE = \{ key: "sig:([^"]+)", label: "([^"]+)" \};/.exec(EDITEUR);
    assert.ok(cadre, 'SIG_ENTREPRISE introuvable dans l\'éditeur');
    const espace = /slot: '([^']+)', label: 'Signature du représentant'/.exec(lire('controllers/rep.controller.js'));
    const lien = /(?:const|let) slot = String\(\(req\.body \|\| \{\}\)\.slot \|\| '([^']+)'\)/.exec(lire('controllers/document.controller.js'));
    assert.ok(espace && lien, 'cases de signature du représentant introuvables');
    assert.strictEqual(cadre[1], espace[1], 'l\'espace du représentant signe dans une autre case');
    assert.strictEqual(cadre[1], lien[1], 'le lien de signature remplit une autre case');
    assert.strictEqual(cadre[2], 'Cachet de l\'entreprise');
});

const PUCE = '<p><span class="doc-token" contenteditable="false" data-token="sig:representant" '
    + 'data-label="Cachet de l\'entreprise">Cachet de l\'entreprise</span></p>';
const STAGIAIRE = '<p><span class="doc-token" contenteditable="false" data-token="Signature stagiaire" '
    + 'data-label="Signature du stagiaire">Signature du stagiaire</span></p>';

test('AVANT LA SIGNATURE : un espace blanc bordé de pointillés, comme pour le stagiaire', () => {
    const cachet = fillHtml(PUCE, { org: {}, learner: {} });
    assert.match(cachet, /border:1px dashed/, 'le cadre attend sa signature');
    assert.match(cachet, /width="200" height="64"/);
    assert.doesNotMatch(cachet, /Cachet de l'entreprise<\/span>/, 'plus rien d\'une puce dans le document');
    // LE MÊME CADRE que la signature du stagiaire : seul le texte alternatif diffère.
    const stagiaire = fillHtml(STAGIAIRE, { org: {}, learner: {} });
    const sansAlt = (h) => h.replace(/alt="[^"]*"/, 'alt=""');
    assert.strictEqual(sansAlt(cachet), sansAlt(stagiaire));
});

test('APRÈS LA SIGNATURE : le cachet prend la place du cadre', () => {
    const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';
    const signe = fillHtml(PUCE, { org: {}, learner: {}, slotSignatures: { representant: { data: IMAGE, name: 'Pizzeria Exemple' } } });
    assert.ok(signe.includes(`<img src="${IMAGE}"`), 'le cachet enregistré s\'imprime dans le cadre');
    assert.doesNotMatch(signe, /dashed/, 'plus de pointillés une fois signé');
});

test('LE CACHET ENREGISTRÉ N\'EST PLUS PROPOSÉ COMME « CHAMP »', async () => {
    // Le schéma réel de `company` : `stamp` est un MEDIUMTEXT (migration 085), `name` un VARCHAR.
    const conn = { query: async () => [[
        { t: 'company', c: 'name', dt: 'varchar', ct: 'varchar(255)', cm: '' },
        { t: 'company', c: 'stamp', dt: 'mediumtext', ct: 'mediumtext', cm: '' },
    ]] };
    const champs = (await introspectFields(conn)).map((f) => `${f.table}.${f.column}`);
    assert.ok(champs.includes('company.name'), 'les vrais champs restent proposés');
    assert.ok(!champs.includes('company.stamp'), 'une image rangée en texte s\'imprimait en caractères');
});

test('le cadre est offert DÈS QUE LE REPRÉSENTANT SIGNE — document de groupe OU stagiaire co-signé', () => {
    /* LE DÉFAUT QUE CE TEST GÈLE. Le cadre n'était offert que sur un « document entreprise »
       (company_level). Mais le représentant signe dans la case `representant` sur DEUX sortes de
       documents : le document de GROUPE, et le document d'un STAGIAIRE dont « Entreprise » est
       signataire (companySignsDoc = ENTREPRISE parmi les rôles) — une convention, un contrat
       financé par l'employeur. Sur ceux-là, la palette ne proposait aucun cadre : le représentant
       signait, et le cachet n'apparaissait NULLE PART sur la page. Les deux conditions se lisent
       dans la réponse du corps du modèle. */
    const corps = lire('controllers/template.controller.js');
    const debut = corps.indexOf('const getTemplateBody');
    const fonction = corps.slice(debut, corps.indexOf('\n};', debut));
    assert.strictEqual((fonction.match(/company_level: companyLevel/g) || []).length, 3);
    assert.match(fonction, /signers/, 'le corps doit renvoyer les signataires, que l\'éditeur lit');
    // L'éditeur lit les DEUX : le niveau du document ET la présence d'« Entreprise » parmi les signataires.
    assert.match(EDITEUR, /setModeleEntreprise\(!!d\.company_level\);/);
    assert.match(EDITEUR, /setEntrepriseSigne\(Array\.isArray\(d\.signers\) && d\.signers\.includes\("ENTREPRISE"\)\);/);
    // … et n'offre le cadre que là : document de groupe OU « Entreprise » signataire.
    assert.match(EDITEUR, /\{\(modeleEntreprise \|\| entrepriseSigne\) && \(\s*<button className="tok-chip" draggable/);
});
