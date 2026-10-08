/**
 * UN STAGIAIRE NE CONSULTE PAS LES DOCUMENTS DE GROUPE DE SON ENTREPRISE — il en voit le STATUT.
 *
 * L'HISTOIRE. Le 2026-10-08 au matin, on avait OUVERT en lecture au stagiaire les documents de
 * GROUPE (devis, convention, CGV — créés SANS `learner_id`, ils appartiennent à la société) liés à
 * son dossier par `document_formation`, parce que son parcours les affichait et qu'un clic rendait
 * « Accès refusé ». L'école a TRANCHÉ l'inverse le même jour : ces pièces regardent l'entreprise,
 * pas le stagiaire. Il doit seulement SAVOIR si c'est fait ou non (le statut, dans son parcours),
 * jamais en lire le CONTENU.
 *
 * LA RÈGLE RETENUE (`lecteurDuDocument`, partagée par les quatre routes de lecture) : le stagiaire
 * lit son document NOMINATIF (`learner_id`), et un document rattaché à son dossier SEULEMENT s'il
 * n'est PAS un document d'entreprise (`gd.company_id IS NULL` — typiquement un document de session).
 * Un document de GROUPE (`company_id` renseigné) lui est REFUSÉ, même lié à son inscription. Le
 * représentant de l'entreprise, lui, le lit et le signe par un autre chemin (`/api/rep/...`).
 *
 * Le filtre `company_id IS NULL` vit DANS la requête de lien (pas sur l'objet `doc`) : certaines
 * routes ne chargent pas cette colonne, la lire en base est le seul moyen sûr.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { lecteurDuDocument } = require('../controllers/document.controller.js');

// Un `conn` factice : chaque requête répond selon ce qu'elle cherche, sans base. La requête de
// lien EXCLUT déjà les documents d'entreprise (gd.company_id IS NULL) — `lieNonEntreprise` modélise
// donc « lié à un document consultable », ce que la vraie requête renvoie après ce filtre.
function connFactice({ owner = false, lieNonEntreprise = false, signe = false } = {}) {
    return {
        async query(sql) {
            if (/FROM learner WHERE id = \? AND user_id = \?/.test(sql)) return [owner ? [{ id: 'l1' }] : []];
            if (/FROM document_formation df/.test(sql)) return [lieNonEntreprise ? [{ ok: 1 }] : []];
            if (/FROM document_signature WHERE document_id/.test(sql)) return [signe ? [{ id: 's1' }] : []];
            throw new Error('requête inattendue : ' + sql);
        },
    };
}
const docGroupe = { id: 'd1', learner_id: null, company_id: 'c1', organization_id: 'o1' }; // document d'ENTREPRISE
const stagiaire = { role: 'STAGIAIRE', id: 'u1' };

test('le personnel lit tout, sans la moindre requête', async () => {
    const conn = { query() { throw new Error('aucune requête attendue pour le personnel'); } };
    for (const role of ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR']) {
        assert.strictEqual(await lecteurDuDocument(conn, { role, id: 'x' }, docGroupe), true, role);
    }
});

test('LA RÈGLE : un document de GROUPE de l\'entreprise N\'EST PAS consultable par le stagiaire', async () => {
    // Lié à son dossier, mais c'est un document d'entreprise : la requête de lien (gd.company_id IS
    // NULL) ne renvoie rien → refusé. Il en verra le statut dans son parcours, pas le contenu.
    assert.strictEqual(await lecteurDuDocument(connFactice({ lieNonEntreprise: false }), stagiaire, docGroupe), false);
});

test('un document de SESSION (sans company_id) rattaché à son dossier reste lisible', async () => {
    // Pas un document d'entreprise : la requête de lien le renvoie → autorisé (comportement inchangé).
    const docSession = { id: 'd3', learner_id: null, company_id: null, organization_id: 'o1' };
    assert.strictEqual(await lecteurDuDocument(connFactice({ lieNonEntreprise: true }), stagiaire, docSession), true);
});

test('un stagiaire SANS lien ni case de signature ne lit pas (anti-IDOR conservé)', async () => {
    assert.strictEqual(await lecteurDuDocument(connFactice({}), stagiaire, docGroupe), false);
});

test('le document NOMINATIF du stagiaire reste lisible par lui', async () => {
    const docPropre = { id: 'd2', learner_id: 'l1', organization_id: 'o1' };
    assert.strictEqual(await lecteurDuDocument(connFactice({ owner: true }), stagiaire, docPropre), true);
});

test('le signataire attribué (document sans learner_id) ouvre ce qu\'on lui fait signer', async () => {
    assert.strictEqual(await lecteurDuDocument(connFactice({ signe: true }), { role: 'EXTERNE', id: 'u2' }, docGroupe), true);
});

test('la requête de lien EXCLUT les documents d\'entreprise, et reste bornée à l\'organisme', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function lecteurDuDocument'), src.indexOf('async function lecteurDuDocument') + 1100);
    assert.match(fn, /JOIN generated_document gd ON gd\.id = df\.document_id/, 'la requête de lien joint le document…');
    assert.match(fn, /AND gd\.company_id IS NULL/, '…pour écarter les documents d\'ENTREPRISE');
    assert.match(fn, /WHERE df\.document_id = \? AND l\.user_id = \? AND e\.organization_id = \?/, 'bornée à l\'organisme');
});

test('les QUATRE lectures emploient la règle partagée ; SIGNER garde son propre contrôle', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
    for (const [h, borne] of [['const getDocument = async', 1200], ['async function fillForRequest', 1200], ['const downloadProof = async', 1200]]) {
        const z = src.slice(src.indexOf(h), src.indexOf(h) + borne);
        assert.match(z, /lecteurDuDocument\(conn, req\.user,/, `${h} doit employer lecteurDuDocument`);
    }
    assert.match(src, /const allowed = await lecteurDuDocument\(conn, req\.user, sdoc\);/);
    const sign = src.slice(src.indexOf('const signDocument = async'), src.indexOf('const signDocument = async') + 5000);
    assert.doesNotMatch(sign, /lecteurDuDocument/, 'signDocument garde son contrôle, la lecture ne l\'élargit pas');
});
