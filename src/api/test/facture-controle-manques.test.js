/**
 * Une facture incomplète ne doit pas SORTIR en silence — et le n° de TVA du client.
 *
 * LE DÉFAUT GELÉ ICI. `avertirConformite` détectait les manques Factur-X (e-mail et SIRET de
 * l'organisme, e-mail du client) et se contentait d'un `console.warn` côté serveur, plus un
 * en-tête `X-Facturx-Manquants` que rien ne lisait. Le PDF sortait quand même, incomplet : le
 * défaut ne se découvrait qu'au rejet par la plateforme de facturation, des jours plus tard et
 * loin de l'écran où il se corrige. Le commentaire d'alors assumait ce choix — « refuser de la
 * produire bloquerait l'organisme sans rien résoudre » — mais le point d'arrêt est le
 * TÉLÉCHARGEMENT du Factur-X, pas l'encaissement : la vente est déjà enregistrée quand on passe
 * ici, aucune caisse n'est bloquée. `?force=1` reste la porte de sortie.
 *
 * SECOND DÉFAUT : les jetons du MODÈLE n'étaient pas contrôlés du tout sur une facture, alors
 * qu'ils le sont depuis longtemps sur les documents (document.controller). Une facture partait
 * donc avec des trous là où le modèle attendait une adresse ou un numéro de TVA.
 *
 * Le n° de TVA de l'entreprise cliente n'existait pas comme donnée (migration 123) : il fallait
 * le taper dans un libellé, ou l'omettre.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcInvoice = fs.readFileSync(path.join(API, 'controllers/invoice.controller.js'), 'utf8');
const srcCompany = fs.readFileSync(path.join(API, 'controllers/company.controller.js'), 'utf8');
const srcTemplate = fs.readFileSync(path.join(API, 'controllers/template.controller.js'), 'utf8');
const srcFiche = fs.readFileSync(path.join(APP, 'ui/pages/EntrepriseDetail.jsx'), 'utf8');
const MIG = path.join(API, '..', '..', 'database/migrations');

test('la génération de facture REFUSE quand une information Factur-X manque', () => {
    assert.match(srcInvoice, /const manque = avertirConformite\(res, data\)/,
        'le résultat du contrôle doit être exploité, pas seulement journalisé');
    assert.match(srcInvoice, /if \(manque && !force\)[\s\S]{0,200}status\(422\)/,
        'un manque doit produire un refus 422, pas un PDF incomplet');
});

test('le refus PORTE la liste de ce qui manque, dans la forme que l\'interface sait afficher', () => {
    // Le composant DocumentViewModal groupe déjà `missing` par `group` et liste les `label`.
    assert.match(srcInvoice, /missing: manque\.map\(\(libelle\) => \(\{ key: libelle, label: libelle, group: 'Facturation' \}\)\)/,
        'chaque manque doit sortir en { key, label, group }');
});

test('`?force=1` laisse passer une facture non conforme', () => {
    // Sans porte de sortie, un client sans e-mail rendrait sa facture intéléchargeable.
    assert.match(srcInvoice, /req\.query\.force === '1'/, 'l\'échappatoire doit exister');
    assert.match(srcInvoice, /forcable: true/, 'le refus doit annoncer qu\'il est forçable');
});

test('la trace serveur est conservée pour le diagnostic', () => {
    // On remplace un avertissement muet par un refus — sans perdre le journal.
    assert.match(srcInvoice, /console\.warn\(`Facture \$\{data\.number\} : non conforme/);
});

test('les jetons vides du modèle de facture bloquent aussi l\'émission', () => {
    assert.match(srcInvoice, /findMissingTokens\(\[content\.html, content\.header, content\.footer\], ctxFacture\)/,
        'le contrôle des jetons doit s\'appliquer à la facture comme aux documents');
    assert.match(srcInvoice, /if \(jetonsVides\.length\)[\s\S]{0,200}motif:/,
        'des jetons vides doivent produire un refus motivé');
    assert.match(srcInvoice, /e\.missing \? \{ error: 'Informations manquantes', missing: e\.missing \}/,
        'le motif doit être accompagné de la liste, pas d\'une phrase seule');
});

test('le contrôle passe AVANT le rendu, pas après', () => {
    // Rendre puis jeter coûterait une conversion PDF pour rien, et surtout laisserait la porte
    // ouverte à un renvoi accidentel du document incomplet.
    const iControle = srcInvoice.indexOf('const jetonsVides =');
    const iRendu = srcInvoice.indexOf('const html = renderTemplateHtml(');
    assert.ok(iControle > 0 && iRendu > 0 && iControle < iRendu,
        'findMissingTokens doit précéder renderTemplateHtml');
});

test('l\'écran Facturation AFFICHE la liste, il ne la jette plus', () => {
    /* Le serveur envoyait déjà `missing` ; l'écran ne gardait que `err.message` et jetait le
     * reste. On lisait donc « Facture non générée : 2 information(s) à compléter » sans jamais
     * savoir LESQUELLES — un message qui annonce un problème et cache sa solution. */
    const srcFactures = fs.readFileSync(path.join(APP, 'ui/pages/Factures.jsx'), 'utf8');
    assert.match(srcFactures, /if \(err\.missing\) setManques\(/,
        'les deux poignées doivent retenir la liste renvoyée par le serveur');
    assert.strictEqual((srcFactures.match(/if \(err\.missing\) setManques\(/g) || []).length, 2,
        'téléchargement ET aperçu doivent la retenir — pas seulement l\'un des deux');
    assert.match(srcFactures, /<InfosManquantes missing=\{manques\.liste\}/,
        'et l\'afficher avec le panneau partagé');
});

test('l\'aperçu propage `missing` comme le téléchargement', () => {
    // `download()` le propageait depuis toujours ; `facturXUrl` levait une Error nue, donc
    // l'aperçu perdait la liste alors que le téléchargement l'avait.
    const srcApi = fs.readFileSync(path.join(APP, 'ui/api/apiClient.js'), 'utf8');
    const bloc = /export async function facturXUrl[\s\S]*?\n\}/.exec(srcApi)[0];
    assert.match(bloc, /if \(d\.missing\) err\.missing = d\.missing/, 'la liste doit survivre à l\'aperçu');
    assert.match(bloc, /if \(d\.forcable\) err\.forcable = true/, 'et le droit de forcer avec elle');
});

test('le panneau des manques est PARTAGÉ entre documents et factures', () => {
    // Deux copies divergeraient : l'une gagnerait un groupe ou un libellé, pas l'autre.
    const srcPanneau = fs.readFileSync(path.join(APP, 'ui/components/InfosManquantes.jsx'), 'utf8');
    assert.match(srcPanneau, /groupes\[m\.group \|\| "Autres"\]/,
        'le regroupement par origine doit vivre à un seul endroit');
    const srcModal = fs.readFileSync(path.join(APP, 'ui/components/DocumentViewModal.jsx'), 'utf8');
    assert.match(srcModal, /import InfosManquantes from "\.\/InfosManquantes\.jsx"/,
        'l\'écran des documents doit utiliser le composant partagé');
    assert.doesNotMatch(srcModal, /groups\[m\.group \|\| "Autres"\]/,
        'et ne plus porter sa propre copie du regroupement');
});

test('« Générer quand même » n\'apparaît que si le serveur l\'autorise', () => {
    // Un refus dû à des jetons de modèle vides n'est PAS forçable : le document sortirait troué.
    const srcFactures = fs.readFileSync(path.join(APP, 'ui/pages/Factures.jsx'), 'utf8');
    assert.match(srcFactures, /\{manques\.forcable && \(/,
        'le bouton doit être conditionné au drapeau du serveur');
});

test('la migration 123 ajoute le n° de TVA client, avec son revert', () => {
    const up = fs.readFileSync(path.join(MIG, '123_company_vat_number.sql'), 'utf8');
    const down = fs.readFileSync(path.join(MIG, '123_revert_company_vat_number.sql'), 'utf8');
    assert.match(up, /ADD COLUMN IF NOT EXISTS vat_number/, 'ajout rejouable sans risque');
    assert.match(down, /DROP COLUMN IF EXISTS vat_number/, 'retrait rejouable sans risque');
    assert.doesNotMatch(up, /^\s*--/m, 'commentaires en blocs, jamais en --');
});

test('écrire le n° de TVA ne casse PAS une base où la 123 n\'est pas jouée', () => {
    // Sans la sonde, un INSERT sur une colonne absente ferait échouer la création d'entreprise
    // ENTIÈRE (ER_BAD_FIELD_ERROR) — on perdrait la fiche pour un champ facultatif.
    assert.match(srcCompany, /const COMPANY_COLS_OPT = \['vat_number'\]/);
    assert.match(srcCompany, /information_schema\.columns[\s\S]{0,160}table_name = 'company'/,
        'la colonne optionnelle doit être sondée');
    assert.doesNotMatch(srcCompany, /const cols = COMPANY_COLS\.filter/,
        'création et mise à jour doivent passer par la liste sondée');
});

test('le jeton du n° de TVA client est insérable dans un modèle de facture', () => {
    // Un jeton résolvable mais introuvable dans la palette n'existe pas pour qui construit
    // son modèle (cf. le commentaire de factureTokensGroup).
    assert.match(srcTemplate, /field:company\.vat_number/, 'le jeton doit être dans la palette');
    assert.match(srcTemplate, /'Acheteur \(facture\)'/, 'et dans le groupe Acheteur (facture)');
});

test('le champ se saisit sur la fiche entreprise', () => {
    assert.match(srcFiche, /k: "vat_number"/, 'le champ doit exister dans le formulaire');
    assert.match(srcFiche, /placeholder=\{placeholder \|\| ""\}/,
        'le formulaire doit savoir rendre un exemple de format');
});
