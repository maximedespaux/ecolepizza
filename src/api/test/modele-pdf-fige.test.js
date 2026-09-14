/**
 * MODÈLE FIGÉ : un document dont le corps EST un PDF, servi tel quel.
 *
 * LE BESOIN. Un livret d'accueil, un règlement intérieur, un plan d'accès sont mis en page
 * ailleurs — dans un outil de PAO — et personne ne va les ressaisir dans l'éditeur. Ni
 * l'éditeur ni un aller-retour LibreOffice ne les reproduiraient fidèlement : on sert donc le
 * fichier d'origine, sans le toucher.
 *
 * UN EXEMPLAIRE, PAS MILLE. Les octets vivent sur le MODÈLE, pas dans chaque dossier. La
 * tentation était de les recopier dans `document_fichier`, où la chaîne d'affichage existait
 * déjà pour les documents REÇUS par e-mail — mais ceux-là sont propres à un stagiaire, alors
 * qu'un livret est le même pour tous : quelques mégaoctets multipliés par un millier de
 * dossiers, pour mille fois le même fichier.
 *
 * LE DÉFAUT LATENT DÉCOUVERT EN CHEMIN : `uploadTemplate` ne posait JAMAIS `kind`. La colonne
 * vaut `builder` par défaut, si bien qu'un .docx téléversé était bien stocké en base mais que
 * `getTemplateContent` ne le regardait jamais — il cherchait un `body_html` absent et concluait
 * « aucun modèle ». Le fichier dormait, et rien ne le signalait. Le mode .docx n'ayant plus
 * d'interface, personne ne l'avait rencontré.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cheminDb = require.resolve('../config/database.js');
let dernierUpsert = null;
const faux = {
    promise: () => ({
        query: async (sql, params) => {
            if (/^\s*SELECT id FROM document_template/i.test(sql)) return [[]];        // pas encore de ligne
            if (/^\s*INSERT INTO document_template/i.test(sql)) { dernierUpsert = { sql, params }; return [{}]; }
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { uploadTemplate } = require('../controllers/template.controller.js');

const requete = (nom, buffer) => ({
    params: { slug: 'livret-accueil' },
    file: { originalname: nom, buffer, mimetype: 'application/pdf' },
    user: { organization_id: 'o1', id: 'u1' },
    ip: '127.0.0.1', headers: {},
});
function reponse() {
    const r = { code: 200, corps: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corps = b; return r; };
    return r;
}

test('un PDF est accepté et rangé en modèle figé', async () => {
    dernierUpsert = null;
    const res = reponse();
    await uploadTemplate(requete('livret.pdf', Buffer.from('%PDF-1.7\nfaux contenu')), res);
    assert.strictEqual(res.code, 201, `le PDF doit être accepté — reçu ${res.code} : ${JSON.stringify(res.corps)}`);
    assert.ok(dernierUpsert, 'la ligne doit être écrite');
    /* `kind` DOIT être dans les colonnes écrites : sans lui la colonne reste à `builder` et le
       générateur ignore le fichier — le défaut latent décrit en tête. */
    assert.match(dernierUpsert.sql, /\bkind\b/, 'l\'écriture doit poser `kind` explicitement');
    assert.ok(dernierUpsert.params.includes('pdf'), '`kind` doit valoir "pdf"');
});

test('un fichier qui ment sur son extension est refusé', async () => {
    /* On vérifie l'EN-TÊTE, pas le nom : le type MIME vient du navigateur, c'est une
       déclaration du client. Un .docx renommé en .pdf passerait sinon en base et sortirait
       à l'impression sous un en-tête « application/pdf » que rien n'ouvrirait. */
    const res = reponse();
    await uploadTemplate(requete('piege.pdf', Buffer.from('PK\x03\x04 en fait un zip')), res);
    assert.strictEqual(res.code, 422, 'un faux PDF doit être refusé');
});

test('un format non géré est refusé avant toute écriture', async () => {
    dernierUpsert = null;
    const res = reponse();
    await uploadTemplate(requete('livret.odt', Buffer.from('quoi que ce soit')), res);
    assert.strictEqual(res.code, 422);
    assert.strictEqual(dernierUpsert, null, 'rien ne doit être écrit');
});

/* ------------------------------------------------------------------ contrats lus au source */

const CTRL_DOC = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
const CTRL_TPL = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');
const VUE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/ui/components/DocumentViewModal.jsx'), 'utf8');
const MODELES = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/ui/pages/Modeles.jsx'), 'utf8');

test('le PDF figé ne repasse pas par LibreOffice', () => {
    /* Le convertir le dégraderait sans rien apporter : il n'a ni jeton à remplir ni mise en
       page à recalculer. La branche doit donc précéder le repli .docx, qui lui convertit. */
    const bloc = CTRL_DOC.slice(CTRL_DOC.indexOf('async function composeDocPdf'));
    const fin = bloc.indexOf('\n}');
    const corps = bloc.slice(0, fin);
    assert.match(corps, /kind === 'pdf'\) return r\.content\.buffer;/,
        'composeDocPdf doit servir les octets du modèle tels quels');
    assert.ok(corps.indexOf("kind === 'pdf'") < corps.indexOf('docxToPdf'),
        'la branche PDF doit venir AVANT la conversion .docx, sinon le fichier est converti');
});

test('les octets ne sont lus que depuis le modèle, jamais recopiés par dossier', () => {
    const bloc = CTRL_DOC.slice(CTRL_DOC.indexOf('async function modeleFige'));
    const corps = bloc.slice(0, bloc.indexOf('\n}'));
    assert.match(corps, /getTemplateContent\(orgId, doc\.template_slug\)/,
        'la source du fichier est le modèle, résolu par son slug');
    assert.doesNotMatch(corps, /INSERT INTO document_fichier/,
        'un modèle figé ne doit rien écrire dans le dossier du stagiaire');
});

test('la consultation annonce le fichier et ne crie pas « aucun modèle »', () => {
    const bloc = CTRL_DOC.slice(CTRL_DOC.indexOf('const getDocument = async'));
    const corps = bloc.slice(0, bloc.indexOf('\n};'));
    assert.match(corps, /modele_fichier,/, 'le front doit recevoir les métadonnées du fichier');
    assert.match(corps, /no_template: !importe && !modele_fichier &&/,
        'un document dont le corps est un fichier A un modèle — il n\'a simplement pas de corps à rendre');
    assert.doesNotMatch(corps, /taille: fige\.buffer\.length[^\n]*bytes/,
        'jamais les octets dans la réponse JSON : ils se lisent par /:id/fichier');
});

test('la route du fichier sert aussi le PDF du modèle', () => {
    const bloc = CTRL_DOC.slice(CTRL_DOC.indexOf('const getDocumentFile = async'));
    const corps = bloc.slice(0, bloc.indexOf('\n};'));
    assert.match(corps, /modeleFige\(/,
        'faute de fichier reçu, la route doit retomber sur le PDF du modèle');
    assert.ok(corps.indexOf('document_fichier') < corps.indexOf('modeleFige'),
        'le fichier REÇU passe en premier : propre au dossier, il prime sur le modèle commun');
});

test('un modèle figé peut revenir à l\'éditeur', () => {
    /* Sans ce retour, joindre un PDF serait irréversible depuis l'écran. Les octets ne sont
       jamais effacés : seul `kind` bascule, dans les deux sens. */
    assert.match(CTRL_TPL, /\['builder', 'docx', 'pdf'\]\.includes\(b\.kind\)/,
        'saveTemplate doit accepter les trois modes');
    assert.doesNotMatch(CTRL_TPL, /fields\.body_html = null;[\s\S]{0,80}kind: estPdf/,
        'joindre un PDF ne doit pas effacer le corps écrit dans l\'éditeur');
    assert.match(MODELES, /saveTemplate\(t\.slug, \{ kind: "builder" \}\)/,
        'l\'écran doit offrir le retour à l\'éditeur');
});

test('l\'aperçu montre le fichier au lieu de régénérer le modèle', () => {
    assert.match(VUE, /if \(doc\.importe \|\| doc\.modele_fichier\) return;/,
        'aucune demande d\'aperçu quand le corps EST un fichier');
    assert.match(VUE, /const fichier = doc\?\.importe \|\| doc\?\.modele_fichier \|\| null;/,
        'les deux provenances partagent le même affichage');
});

test('« Éditer » n\'est pas le geste mis en avant sur un modèle figé', () => {
    /* LE PIÈGE : le serveur repasse l'étape en mode éditeur dès qu'un corps lui est envoyé
       (`if (b.body_html !== undefined) fields.kind = 'builder'`). Mettre « Éditer » en avant
       sur un livret invite donc à débrancher son PDF en croyant le retoucher. */
    assert.match(MODELES, /estFige\(t\) \? \(\s*<button className="btn sm primary"[^>]*\s*[^>]*disabled=\{busy === t\.slug\}/,
        'sur un modèle figé, le bouton principal doit être « Remplacer le PDF »');
    assert.match(MODELES, /Remplacer le PDF<\/button>/);
});
