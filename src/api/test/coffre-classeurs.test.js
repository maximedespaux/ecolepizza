/**
 * DES CLASSEURS LIBRES DANS LE COFFRE — pour ce qui n'appartient à aucune session.
 *
 * POURQUOI. Le coffre range en année → semaine → formation → stagiaire, parce que c'est
 * l'arborescence d'un contrôle Qualiopi. Mais un organisme détient aussi des pièces qui ne
 * concernent AUCUNE promotion : attestation d'assurance, agrément, certificat Qualiopi,
 * statuts. Elles finissaient hors de l'application, ou rangées sous une semaine qui ne voulait
 * rien dire.
 *
 * LE CHIFFREMENT NE DEMANDE RIEN ICI, et c'est le bénéfice direct de la 153 : tout ce qui entre
 * dans `archive_document` passe par `aRanger()`. Un document déposé dans un classeur est
 * chiffré au repos sans une ligne de plus.
 *
 * PAS DE TABLE DE CLASSEURS, et c'est un choix. L'arbre du coffre est DÉJÀ entièrement dérivé
 * des documents — aucune table ne décrit une année ni une formation, elles existent parce que
 * des documents s'y trouvent. Un classeur suit la même règle : il existe tant qu'il contient
 * quelque chose. On évite l'état mort qu'aucune règle ne nettoie — le dossier vide que plus
 * personne n'ose supprimer parce qu'on ne sait plus s'il servait.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const BASE = path.join(API, '..', '..', 'database');
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const SUIVI = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/suivi.controller.js'), 'utf8'));
const UI = sansCommentaires(fs.readFileSync(path.join(API, '..', 'app', 'ui/pages/Suivi.jsx'), 'utf8'));
const CLIENT = sansCommentaires(fs.readFileSync(path.join(API, '..', 'app', 'ui/api/apiClient.js'), 'utf8'));
const MIG = fs.readFileSync(path.join(BASE, 'migrations', '154_archives_classeurs.sql'), 'utf8');
const REVERT = fs.readFileSync(path.join(BASE, 'migrations', '154_revert_archives_classeurs.sql'), 'utf8');

test('UN CLASSEUR MET EN SOMMEIL TOUT LE CLASSEMENT PAR SESSION', () => {
    /* `parsePath` lit le CHEMIN du fichier pour en tirer une année, une semaine, une formation
       et un stagiaire. Appliquée à un dépôt en classeur, elle inventerait une année à partir
       d'un nom de dossier quelconque sur le poste de la personne — « 2024 » dans
       « Sauvegardes/2024/assurance.pdf » deviendrait l'année du document. Un classeur est
       justement ce qui ne se range PAS ainsi : on ne lit que le nom du fichier. */
    assert.match(SUIVI, /const meta = dossier\s*\n\s*\? \{ year: null, week: null, formation: null, learner: null, title: nomSeul\(/,
        'un dépôt en classeur ne passe pas par parsePath');
    assert.match(SUIVI, /function nomSeul\(rel\)/, 'le titre vient du seul nom de fichier');
});

test('LE DOUBLON SE JUGE DANS LE CLASSEUR, PAS DANS L\'ARBRE', () => {
    /* LE DÉFAUT QU'ON ÉVITE, et il est silencieux. La règle générale compare le titre PLUS
       l'année, la semaine, la formation et le stagiaire. Dans un classeur, ces quatre-là sont
       NULL : deux fichiers nommés « Attestation.pdf », l'un dans « Assurances » et l'autre dans
       « Agréments », se seraient donc pris pour le même document — et le second aurait été
       écarté sans erreur, compté comme « déjà présent ». On aurait cherché longtemps. */
    const zone = SUIVI.slice(SUIVI.indexOf('const dejaLa'), SUIVI.indexOf('for (let i = 0'));
    assert.match(zone, /COALESCE\(dossier, ''\) = COALESCE\(\?, ''\)/,
        'le classeur entre dans la comparaison de doublon');
    assert.match(zone, /\.\.\.\(colDossier \? \[dossier\] : \[\]\)/,
        'et sa valeur part bien en paramètre');
});

test('LE CODE MARCHE AVANT LA MIGRATION 154', () => {
    /* Règle du projet (CLAUDE.md § 2.1). Sans la colonne, le coffre doit se comporter
       EXACTEMENT comme avant — pas échouer sur une erreur SQL, et pas accepter en silence un
       classeur qui n'irait nulle part. */
    assert.match(SUIVI, /const colDossier = await colonneExiste\(conn, 'archive_document', 'dossier'\)/);
    assert.match(SUIVI, /if \(dossier && !colDossier\) return res\.status\(422\)/,
        'un dépôt en classeur sans la colonne est REFUSÉ, pas perdu');
    assert.match(SUIVI, /\$\{colDossier \? 'ad\.dossier' : 'NULL AS dossier'\}/,
        'la liste rend toujours la même forme de ligne');
});

test('TOUTES LES SOURCES DU COFFRE RENDENT LA MÊME FORME', () => {
    /* L'écran distingue un document de classeur d'un document de session sur la SEULE présence
       de `dossier`. Si une source omettait la clé, ses lignes seraient indiscernables de celles
       d'un classeur nommé `undefined` — même raison que l'alias imposé par `colonneOuNull`. */
    assert.strictEqual((SUIVI.match(/NULL AS dossier/g) || []).length, 3,
        'les documents générés (stagiaire et entreprise) et le repli sans colonne');
    assert.match(SUIVI, /dossier: null,/, 'et les pièces justificatives, construites en JS');
});

test('LE DOCUMENT D\'UN CLASSEUR NE S\'AFFICHE PAS AUSSI DANS L\'ARBRE', () => {
    // Sinon il compterait deux fois, et se supprimerait depuis un endroit où il n'est pas.
    assert.match(UI, /buildTree\(filtered\.filter\(\(r\) => !r\.dossier\)\)/);
    assert.match(UI, /if \(!r\.dossier\) continue;/, 'et réciproquement : l\'arbre ne peuple pas les classeurs');
});

test('LA LIGNE DE DOCUMENT N\'EXISTE QU\'UNE FOIS', () => {
    /* Les classeurs affichent EXACTEMENT les mêmes lignes que l'arbre. Recopier ce rendu, c'est
       garantir qu'un jour l'aperçu marchera d'un côté et pas de l'autre, ou que la garde qui
       interdit de supprimer une pièce justificative ne sera corrigée qu'à un seul endroit. */
    assert.match(UI, /const DocLigne = \(\{ d \}\) =>/, 'la ligne est un composant');
    assert.strictEqual((UI.match(/<DocLigne key=\{d\.doc_id\} d=\{d\} \/>/g) || []).length, 2,
        'employé par l\'arbre ET par les classeurs');
    assert.strictEqual((UI.match(/title="Télécharger le PDF"/g) || []).length, 1,
        'le rendu n\'est écrit qu\'une fois');
});

test('L\'INVENTAIRE DE STOCKAGE SITUE UN DOCUMENT DE CLASSEUR', () => {
    // Son détenteur n'est pas un stagiaire : sans le classeur, la ligne s'afficherait nue.
    assert.match(SUIVI, /COALESCE\(learner_name, dossier\)/);
    assert.strictEqual((SUIVI.match(/\$\{quiDetient\} AS learner_name/g) || []).length, 2,
        'dans les DEUX requêtes de l\'inventaire, sinon la moitié des lignes reste anonyme');
});

test('LE CLASSEUR REMONTE JUSQU\'AU SERVEUR', () => {
    assert.match(CLIENT, /export async function importArchives\(files, paths, dossier\)/);
    assert.match(CLIENT, /if \(dossier\) fd\.append\("dossier", dossier\)/);
    assert.match(UI, /importArchives\(files, files\.map\(\(f\) => f\.name\), nom\)/,
        'le dépôt en classeur envoie le nom');
});

test('LA MIGRATION 154 EST REJOUABLE, ET SON REVERT NE PERD AUCUN DOCUMENT', () => {
    assert.match(MIG, /ADD COLUMN IF NOT EXISTS dossier varchar\(160\)/);
    assert.ok(!/DROP TABLE|DELETE FROM|TRUNCATE/i.test(MIG), 'elle n\'ajoute qu\'une colonne et un index');
    assert.match(REVERT, /DROP COLUMN IF EXISTS dossier/);
    assert.ok(!/DELETE FROM|DROP TABLE/i.test(REVERT),
        'reverter perd le RANGEMENT, jamais les documents — ils retombent dans « Sans session »');
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   ÉPROUVÉ SUR LE VRAI CONTRÔLEUR, pas relu.

   Les vérifications ci-dessus lisent le source — utile pour geler un contrat, aveugle à ce que
   le code FAIT. Celles qui suivent appellent `importArchive` avec une fausse connexion qui
   n'écrit rien et relèvent les valeurs réellement envoyées à la base. C'est la différence entre
   « le motif est présent » et « le document est rangé au bon endroit ».

   Le pool est PARESSEUX (cf. config/database.js) : remplacer `promise()` avant tout appel fait
   qu'aucune connexion n'est jamais ouverte. */
const db = require('../config/database.js');
const { importArchive } = require('../controllers/suivi.controller.js');

async function importer({ chemin, dossier, colDossier = true, mesure = true }) {
    const ecrits = [];
    const vrai = db.promise;
    db.promise = () => ({
        query: async (sql, params) => {
            if (/information_schema/.test(sql)) {
                const col = params[1];
                const la = col === 'empreinte' ? mesure : col === 'dossier' ? colDossier : true;
                return [la ? [{ 1: 1 }] : []];
            }
            if (/SELECT 1 AS oui/.test(sql)) return [[]]; // aucun doublon
            if (/INSERT INTO archive_document/.test(sql)) ecrits.push({ sql, params });
            return [[]];
        },
    });
    const req = {
        user: { organization_id: 'org-1', id: 'u1' },
        files: [{ originalname: 'assurance.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4 x') }],
        body: { paths: JSON.stringify([chemin]), ...(dossier ? { dossier } : {}) },
        headers: {},
    };
    let out = null;
    const res = { status(c) { this._c = c; return this; }, json(j) { out = { code: this._c || 200, j }; return this; } };
    try { await importArchive(req, res); } finally { db.promise = vrai; }
    return { ecrits, out };
}

const CHEMIN = 'Sauvegardes/2024/S12/BP/DUPONT Marie/assurance.pdf';

test('SANS CLASSEUR, LE CHEMIN DIT LE RANGEMENT — comme avant', async () => {
    const { ecrits } = await importer({ chemin: CHEMIN });
    const [org, annee, semaine, formation, stagiaire] = ecrits[0].params;
    assert.strictEqual(org, 'org-1');
    assert.deepStrictEqual([annee, semaine, formation, stagiaire], [2024, 12, 'BP', 'DUPONT Marie']);
});

test('AVEC UN CLASSEUR, LE CHEMIN NE DIT PLUS RIEN', async () => {
    /* LE DÉFAUT QU'ON ÉVITE : `parsePath` lit le chemin du fichier SUR LE POSTE de la personne.
       Un dossier « Sauvegardes/2024/… » n'a rien à voir avec une promotion, mais il en a la
       FORME — et le document d'assurance se serait rangé dans la semaine 12 de 2024, chez une
       stagiaire nommée DUPONT Marie. Introuvable là où on irait le chercher, et faux là où il
       serait. Un classeur met donc tout le classement par session en sommeil. */
    const { ecrits } = await importer({ chemin: CHEMIN, dossier: 'Assurances' });
    const p = ecrits[0].params;
    assert.deepStrictEqual(p.slice(1, 5), [null, null, null, null], 'ni année, ni semaine, ni formation, ni stagiaire');
    assert.strictEqual(p[5], 'assurance', 'le titre est le seul nom du fichier');
    assert.strictEqual(p[p.length - 1], 'Assurances', 'et le classeur est écrit');
});

test('UN DOCUMENT DE CLASSEUR EST CHIFFRÉ COMME LES AUTRES', async () => {
    /* C'est le bénéfice direct de la 153 : tout ce qui entre passe par `aRanger()`. Le contrôle
       tient en arithmétique — 5 octets de marqueur, 12 d'IV, 16 de tag d'authentification. */
    const { ecrits } = await importer({ chemin: CHEMIN, dossier: 'Assurances' });
    const octetsEcrits = ecrits[0].params.find((v) => Buffer.isBuffer(v));
    assert.strictEqual(octetsEcrits.length, 10 + 33, 'le clair ferait 10 octets');
    assert.ok(octetsEcrits.subarray(0, 5).equals(Buffer.from('encb1')), 'marqueur de chiffrement');
    assert.ok(!octetsEcrits.includes(Buffer.from('%PDF')), 'le clair n\'apparaît nulle part');
});

test('SANS LA MIGRATION 154, UN DÉPÔT EN CLASSEUR EST REFUSÉ — pas rangé ailleurs', async () => {
    /* Le pire serait de l'accepter en ignorant le classeur : le document partirait dans l'arbre
       des sessions avec un titre d'assurance, et personne ne saurait qu'il y est. */
    const { ecrits, out } = await importer({ chemin: CHEMIN, dossier: 'Assurances', colDossier: false });
    assert.strictEqual(out.code, 422);
    assert.match(out.j.error, /migration 154/);
    assert.strictEqual(ecrits.length, 0, 'rien n\'est écrit');
});

test('SANS LA 154 ET SANS CLASSEUR, RIEN NE CHANGE', async () => {
    const { ecrits, out } = await importer({ chemin: CHEMIN, colDossier: false });
    assert.strictEqual(out.j.data.imported, 1);
    assert.deepStrictEqual(ecrits[0].params.slice(1, 5), [2024, 12, 'BP', 'DUPONT Marie']);
    assert.ok(!/dossier/.test(ecrits[0].sql), 'la colonne absente n\'est pas nommée');
});
