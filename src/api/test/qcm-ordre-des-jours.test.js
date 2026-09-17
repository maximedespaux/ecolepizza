/**
 * RÉSULTATS QCM : LES QCM D'UNE FORMATION DANS L'ORDRE DES JOURS.
 *
 * LE DÉFAUT, relevé en production le 2026-09-17. Les Résultats QCM rangeaient chaque formation au
 * nombre de réponses, puis au titre. Quatre QCM à égalité (4 réponses chacun) en RS7404 sortaient
 * donc « Évaluation Formative du Jeudi, du Mardi, du Mercredi, Test de positionnement » : la
 * semaine à l'envers, et un ordre qui change dès qu'un stagiaire de plus répond. L'école lit ses
 * résultats comme elle déroule sa formation : le test de positionnement (J-7), puis mardi (J2)…
 *
 * Les Modèles de QCM rangeaient déjà par jour. La règle est désormais partagée (lib/qcmJours.js).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (rel) => fs.readFileSync(path.join(UI, rel), 'utf8');
const regle = () => import('../../app/ui/lib/qcmJours.js');

// QCM d'une seule formation, tels que l'API les rend : le jour de la formation dans `formations`.
const qcm = (title, day, extra = {}) => ({
    title, day, active: 1,
    formations: [{ program_id: 'p-rs', code: 'RS7404', day: null, jour: day }], ...extra,
});

test('RS7404 le 2026-09-17 : le test de positionnement, puis mardi, mercredi, jeudi, vendredi', async () => {
    const { parJour } = await regle();
    // L'ordre dans lequel le serveur les rendait ce jour-là.
    const recus = [
        qcm('Évaluation Formative du Jeudi', 4), qcm('Évaluation Formative du Mardi', 2),
        qcm('Évaluation Formative du Mercredi', 3), qcm('Test de positionnement', -7),
        qcm('Évaluation Formative du Vendredi', 5),
    ];
    assert.deepStrictEqual([...recus].sort(parJour).map((q) => q.title), [
        'Test de positionnement', 'Évaluation Formative du Mardi', 'Évaluation Formative du Mercredi',
        'Évaluation Formative du Jeudi', 'Évaluation Formative du Vendredi',
    ]);
});

test('le jour qui compte est celui de LA formation ; un QCM partagé garde le sien ; sans jour, à la fin', async () => {
    const { parJour, jourAffiche } = await regle();
    // Migration 163 : la formation peut fixer son propre jour, différent de celui du QCM.
    const hygiene = qcm('Évaluation formative Hygiène', 3, { formations: [{ program_id: 'p-h', code: 'NIV1H', day: 4, jour: 4 }] });
    assert.strictEqual(jourAffiche(hygiene), 4);
    const partage = { title: 'Évaluation de satisfaction', day: 5, formations: [
        { program_id: 'p-h', code: 'NIV1H', day: null, jour: 5 }, { program_id: 'p-rs', code: 'RS7404', day: 1, jour: 1 }] };
    assert.strictEqual(jourAffiche(partage), 5, 'plusieurs formations : le jour du QCM');
    const sansJour = qcm('Quiz libre', null);
    assert.deepStrictEqual([sansJour, hygiene, qcm('Test de positionnement', -7)].sort(parJour).map((q) => q.title),
        ['Test de positionnement', 'Évaluation formative Hygiène', 'Quiz libre']);
});

test('à jour et titre égaux, l\'ordre reçu tient : l\'actif reste avant son ancienne version', async () => {
    const { parJour } = await regle();
    const actif = qcm('Évaluation Formative du Mardi', 2, { active: 1, id: 'actif' });
    const ancien = qcm('Évaluation Formative du Mardi', 2, { active: 0, id: 'ancien' });
    assert.deepStrictEqual([actif, ancien].sort(parJour).map((q) => q.id), ['actif', 'ancien']);
});

test('les deux écrans tirent la règle de la même source, et aucun n\'en garde de copie', () => {
    const resultats = lire('pages/ResultatsQCM.jsx');
    assert.match(resultats, /import \{[^}]*\bparJour\b[^}]*\} from "\.\.\/lib\/qcmJours\.js"/);
    assert.match(resultats, /for \(const g of parCle\.values\(\)\) g\.items\.sort\(parJour\);/, 'chaque groupe de formation est trié');
    assert.doesNotMatch(resultats, /responses DESC|b\.responses - a\.responses/, 'plus de rangement au nombre de réponses à l\'écran');

    const modeles = lire('pages/Quiz.jsx');
    assert.match(modeles, /import \{[^}]*\bparJour\b[^}]*\} from "\.\.\/lib\/qcmJours\.js"/);
    assert.doesNotMatch(modeles, /const jourAffiche =/, 'une copie locale finirait par diverger');
});

test('la vue d\'ensemble rend le jour du QCM, repli du jour de chaque formation', () => {
    /* Sans `q.day` dans la requête, `jourPour` ne trouvait aucun jour à reprendre : tout QCM rattaché
       sans jour propre arrivait « sans jour », et le tri le rejetait en fin de liste. */
    const src = fs.readFileSync(path.join(__dirname, '../controllers/quiz.controller.js'), 'utf8');
    const vue = src.slice(src.indexOf('const resultatsOverview'), src.indexOf('const resultatsDetail'));
    assert.match(vue, /SELECT q\.id, q\.title, q\.kind, q\.pass_score, q\.active, q\.program_id,[\s\S]*?q\.day,[\s\S]*?FROM quiz q/);
    assert.match(vue, /formationsDesFiches\(conn, orgId, rows\)/);
});
