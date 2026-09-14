/**
 * UNE PIÈCE QUI ATTEND SIX FICHIERS N'EN LAISSAIT CHOISIR QU'UN.
 *
 * LE DÉFAUT, constaté en production sur l'étape « Justificatif » : son type de pièce est réglé
 * à six fichiers — un justificatif de domicile tient rarement sur une page — mais le sélecteur
 * s'ouvrait en mode mono-fichier et le code ne lisait que `files[0]`. Les cinq autres pages
 * étaient silencieusement ignorées : aucune erreur, aucun avertissement, juste un dépôt
 * incomplet que personne ne remarque avant le contrôle.
 *
 * DEUX CAUSES SUPERPOSÉES :
 *   1. le parcours ne disait pas COMBIEN de fichiers la pièce attend. Le plafond existait en
 *      base (`piece_type.fichiers_attendus`) et le serveur l'appliquait au dépôt, mais l'écran
 *      ne l'apprenait qu'au moment du refus — trop tard pour ouvrir le bon sélecteur ;
 *   2. `multiple` n'était posé nulle part, et un `<input type="file">` sans lui ne rend qu'un
 *      seul fichier même si l'on en désigne six.
 *
 * L'ATTRIBUT SE POSE AVANT LE CLIC, pas dans le JSX : le sélecteur est UNIQUE et partagé par
 * toutes les étapes. Un document reçu remplace une étape — il est seul par nature ; une pièce
 * peut en attendre plusieurs. L'attribut suit donc l'étape visée.
 *
 * EN SÉRIE, JAMAIS EN PARALLÈLE. La route de dépôt est `single('fichier')` et c'est elle qui
 * compte les fichiers déjà présents pour refuser celui de trop. Deux envois simultanés
 * liraient le même compte et passeraient tous les deux le plafond.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..', '..');
const FICHE = fs.readFileSync(path.join(RACINE, 'app/ui/pages/StagiaireDetail.jsx'), 'utf8');
const ESPACE = fs.readFileSync(path.join(RACINE, 'app/ui/pages/StudentFormationDetail.jsx'), 'utf8');

const { computeDocParcours } = require('../lib/parcours.js');

test('le parcours dit combien de fichiers la pièce attend', () => {
    const parc = computeDocParcours({
        steps: [{ slug: 'piece:1', label: 'Justificatif', piece_id: 'pt-1', fichiers_attendus: 6 }],
        docs: [], pieces: {},
    });
    assert.strictEqual(parc.steps[0].fichiers_attendus, 6);
});

test('sans réglage, une pièce en attend un — jamais zéro', () => {
    /* Zéro ouvrirait un sélecteur qui n'accepte rien. `Math.max(1, …)` couvre aussi bien la
       colonne absente (migration 127 non jouée) que la valeur nulle. */
    const parc = computeDocParcours({
        steps: [{ slug: 'piece:2', label: 'Identité', piece_id: 'pt-2' }],
        docs: [], pieces: {},
    });
    assert.strictEqual(parc.steps[0].fichiers_attendus, 1);
});

test('un document ordinaire reste à un fichier', () => {
    const parc = computeDocParcours({ steps: [{ slug: 'convention', label: 'Convention' }], docs: [], pieces: {} });
    assert.strictEqual(parc.steps[0].fichiers_attendus, 1);
});

for (const [nom, SRC, appel] of [
    ['la fiche stagiaire', FICHE, /fichierRef\.current\.multiple = plusieurs/],
    ['l\'espace du stagiaire', ESPACE, /fileRef\.current\.multiple = \(attendus \|\| 1\) > 1/],
]) {
    test(`${nom} ouvre un sélecteur multiple quand la pièce l'admet`, () => {
        assert.match(SRC, appel, '`multiple` doit être posé avant le clic, pas figé dans le JSX');
        assert.match(SRC, /Array\.from\(e\.target\.files \|\| \[\]\)/,
            'il faut lire TOUS les fichiers, pas seulement le premier');
    });

    test(`${nom} dépose en série et rend compte de ce qui est passé`, () => {
        /* Un dépôt partiel annoncé comme un succès laisserait croire que les six pages sont
           arrivées. Le compte rendu doit nommer le nombre réellement déposé. */
        assert.match(SRC, /for \(const f of fichiers\) \{/, 'les envois doivent être séquentiels');
        assert.doesNotMatch(SRC, /Promise\.all\([^)]*deposerPiece/,
            'jamais en parallèle : deux dépôts liraient le même compte et dépasseraient le plafond');
        assert.match(SRC, /sur \$\{fichiers\.length\}/, 'le compte rendu doit dire combien sont passés');
    });
}

test('la liste des fichiers est lue AVANT la remise à zéro du champ', () => {
    /* `input.value = ""` vide aussi `input.files` : lire après ne rendrait rien, et le dépôt
       paraîtrait ne rien faire. */
    for (const [nom, SRC] of [['fiche', FICHE], ['espace', ESPACE]]) {
        const i = SRC.indexOf('Array.from(e.target.files');
        const j = SRC.indexOf('e.target.value = ""', i - 400);
        assert.ok(i > 0 && j > i, `${nom} : la lecture des fichiers doit précéder la remise à zéro`);
    }
});
