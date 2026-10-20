/**
 * {Civilité} ET DATES EN FRANÇAIS DANS LES E-MAILS AUTOMATIQUES (demandé le 2026-10-20).
 *
 * DEUX MANQUES, sur les mêmes trois points d'envoi (passage des règles de date, crochet des documents,
 * crochet des remises) :
 *   · {Civilité} n'existait qu'« Écrire à un groupe » : une règle (Envois programmés) ne pouvait pas
 *     écrire « Bonjour M. Dupont ». L'aperçu, lui, le proposait déjà — l'envoi réel ne suivait pas ;
 *   · {Date de fin} / {Date de début} sortaient en AAAA-MM-JJ (telles que `DATE_FORMAT` les rend),
 *     pas au format français JJ/MM/AAAA. Ces dates servent AUSSI au calcul de `dateCible` : on ne les
 *     met en français qu'À L'AFFICHAGE.
 *
 * Les trois copies de la liste de valeurs sont désormais UNE : `valeursRegle`. On gèle ici cette
 * fonction, le format de date, et le fait que les trois points d'envoi passent par elle.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { dateFr, valeursRegle } = require('../lib/mailsProgrammes.js');
const { passerLesReglesMail, JETONS_REGLE } = require('../lib/passageMailsProgrammes.js');

const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

/* ─── Domaine PUR ─────────────────────────────────────────────────────────────────────────────── */

test('dateFr : AAAA-MM-JJ → JJ/MM/AAAA ; vide ou méconnaissable → vide', () => {
    assert.strictEqual(dateFr('2026-05-22'), '22/05/2026');
    assert.strictEqual(dateFr('2026-05-22T10:30:00'), '22/05/2026', 'on ne garde que la date');
    assert.strictEqual(dateFr('2026-01-09'), '09/01/2026', 'les zéros de tête restent');
    assert.strictEqual(dateFr(''), '');
    assert.strictEqual(dateFr(null), '');
    assert.strictEqual(dateFr(undefined), '');
});

test('valeursRegle : {Civilité} rempli, dates en FRANÇAIS, session datée en français', () => {
    const v = valeursRegle({
        civility: 'Mme', first_name: 'Léa', last_name: 'ROUX', formation: 'Pizzaïolo',
        code: 'RS7404', debut: '2026-05-18', fin: '2026-05-22', document: 'Convention',
    }, 'École Pizza');
    assert.strictEqual(v['Civilité'], 'Mme');
    assert.strictEqual(v['Prénom'], 'Léa');
    assert.strictEqual(v.Nom, 'ROUX');
    assert.strictEqual(v['Date de début'], '18/05/2026');
    assert.strictEqual(v['Date de fin'], '22/05/2026');
    assert.strictEqual(v.Session, 'RS7404 du 18/05/2026', 'la date de la session aussi en français');
    assert.strictEqual(v.Document, 'Convention');
    // Rien de donné → tout vide, sauf l'organisme par défaut.
    const vide = valeursRegle();
    assert.strictEqual(vide['Civilité'], '');
    assert.strictEqual(vide['Date de fin'], '');
    assert.strictEqual(vide.Session, '');
    assert.strictEqual(vide.Organisme, 'École Pizza');
});

test('JETONS_REGLE = les clés de valeursRegle, et {Civilité} en est désormais', () => {
    assert.deepStrictEqual(JETONS_REGLE, Object.keys(valeursRegle()),
        'la palette de l\'éditeur et ce que le passage remplit ne peuvent pas diverger');
    assert.ok(JETONS_REGLE.includes('Civilité'));
    assert.strictEqual(JETONS_REGLE[0], 'Civilité', 'proposé en tête, comme on l\'écrit : « Bonjour {Civilité} {Nom} »');
});

/* ─── Le passage (règle de date) : {Civilité} et la date EN FRANÇAIS dans le vrai envoi ────────── */

function fakeConn({ regles, lignes, deja = [] }) {
    return { query: async (sql) => {
        if (/FROM mail_regle WHERE actif = 1/.test(sql)) return [regles];
        if (/FROM enrollment e/.test(sql)) return [lignes];
        if (/FROM mail_regle_envoi WHERE regle_id/.test(sql)) return [deja.map((id) => ({ enrollment_id: id }))];
        if (/^\s*INSERT IGNORE INTO mail_regle_envoi/.test(sql)) return [{}];
        return [[]]; // information_schema (colonneExiste / tableExiste) → absent → repli « sans ciblage »
    } };
}

test('le passage remplit {Civilité} et met {Date de fin} en français (pas en AAAA-MM-JJ)', async () => {
    const regle = {
        id: 'r1', organization_id: 'o1', nom: 'Avis', declencheur: 'fin_session', sens: 'apres',
        decalage: 0, unite: 'jour', program_id: null,
        objet: 'Bonjour {Civilité} {Nom}', corps: 'Votre session s\'est terminée le {Date de fin}.', depuis: '2026-05-01',
    };
    const ligne = {
        enrollment_id: 'e1', learner_id: 'l1', first_name: 'Léa', last_name: 'ROUX', email: 'lea@ex.fr',
        civility: 'Mme', formation: 'Pizzaïolo', code: 'RS7404', debut: '2026-05-18', fin: '2026-05-22', inscrit_le: '2026-05-01',
    };
    const envois = [];
    const r = await passerLesReglesMail({
        conn: fakeConn({ regles: [regle], lignes: [ligne] }),
        orgName: 'École Pizza', zone: 'UTC', instant: new Date('2026-05-25T08:00:00Z'),
        envoyer: async (m) => { envois.push(m); return { sent: true }; },
    });
    assert.strictEqual(r.envoyes, 1);
    assert.match(envois[0].objet, /Mme ROUX/, '{Civilité} = « Mme »');
    assert.match(envois[0].corps, /22\/05\/2026/, '{Date de fin} en français');
    assert.doesNotMatch(envois[0].corps, /2026-05-22/, 'plus jamais la forme AAAA-MM-JJ');
});

/* ─── Les trois points d'envoi passent par la MÊME source (civilité lue, valeursRegle) ─────────── */

test('passage et crochets lisent l.civility et passent par valeursRegle (une seule source)', () => {
    const passage = lire('lib/passageMailsProgrammes.js');
    assert.match(passage, /l\.first_name, l\.last_name, l\.email, l\.civility,/, 'le passage lit la civilité');
    assert.match(passage, /const valeurs = valeursRegle\(ligne, orgName\);/);
    assert.match(passage, /const JETONS_REGLE = Object\.keys\(valeursRegle\(\)\);/, 'dérivé, pas recopié');

    const crochet = lire('lib/crochetMailsDocument.js');
    assert.match(crochet, /l\.email AS stagiaire_email, l\.first_name, l\.last_name, l\.civility\b/, 'document : civilité lue');
    assert.match(crochet, /l\.email AS stagiaire_email, l\.first_name, l\.last_name, l\.civility,/, 'remise : civilité lue');
    assert.strictEqual((crochet.match(/valeursRegle\(\{/g) || []).length, 2, 'document ET remise passent par valeursRegle');
});
