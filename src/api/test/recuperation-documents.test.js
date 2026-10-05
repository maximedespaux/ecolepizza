/**
 * RÉCUPÉRATION DE PARCOURS (demandé le 2026-10-05, après une session supprimée par erreur).
 *
 * Supprimer une session DÉTACHE ses documents (enrollment_id SET NULL, lien document_formation
 * effacé) : ils survivent mais ne comptent plus dans aucun parcours. Les QCM survivent aussi — leurs
 * réponses (quiz_response) n'ont PAS de clé étrangère sur enrollment_id, donc rien ne les efface,
 * mais leur enrollment_id pointe vers le dossier disparu. En recréant la session et en réinscrivant
 * le stagiaire, on retrouve ses orphelins (documents ET QCM) et on les rattache — DÉTECTER puis
 * CONFIRMER.
 *
 * Le cœur testable est la RÈGLE DE CORRESPONDANCE (lib/recuperationDocuments.js) : quels orphelins
 * appartiennent au parcours. Le reste (requêtes, écran) est gelé par des contrats de source.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ciblesParcours, filtrerRecuperables } = require('../lib/recuperationDocuments.js');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

test('ciblesParcours : slugs des documents + quiz_ids des QCM, séparés', () => {
    const steps = [
        { slug: 'devis', quiz_id: null },
        { slug: 'convention', quiz_id: null },
        { slug: 'eval', quiz_id: 'q1' },   // QCM → quizIds, pas slugs
        { slug: '', quiz_id: null },        // sans slug : ignoré
        { quiz_id: null },                  // idem
    ];
    const c = ciblesParcours(steps);
    assert.deepEqual([...c.slugs].sort(), ['convention', 'devis']);
    assert.deepEqual([...c.quizIds], ['q1']);
});

test('filtrerRecuperables : orphelins du parcours, par MODÈLE ou par QUIZ', () => {
    const cibles = { slugs: new Set(['devis', 'convention']), quizIds: new Set(['q1']) };
    const docs = [
        { id: '1', template_slug: 'devis', quiz_id: null },    // document du parcours : gardé
        { id: '2', template_slug: 'contrat', quiz_id: null },  // hors parcours : écarté
        { id: '3', template_slug: null, quiz_id: 'q1' },       // QCM du parcours : gardé
        { id: '4', template_slug: null, quiz_id: 'q9' },       // QCM d'un autre parcours : écarté
        { id: '5', template_slug: null, quiz_id: null },       // ni modèle ni quiz : écarté
    ];
    assert.deepEqual(filtrerRecuperables(docs, cibles).map((d) => d.id), ['1', '3']);
});

test('serveur : rattachement sans vol, + QCM (document re-lié ET réponses repointées)', () => {
    const c = lire('src/api/controllers/enrollment.controller.js');
    // La garde est DANS le UPDATE du document : même stagiaire, encore orphelin — pas un id à la main.
    assert.match(c, /SET enrollment_id = \?[\s\S]*?AND organization_id = \? AND learner_id = \? AND enrollment_id IS NULL/);
    // On recrée le lien que LIT le parcours (document_formation).
    assert.match(c, /INSERT IGNORE INTO document_formation \(document_id, enrollment_id\)/);
    // QCM : les réponses survivantes sont repointées sur le nouveau dossier, par document_id.
    assert.match(c, /UPDATE quiz_response SET enrollment_id = \?[\s\S]*?WHERE document_id = \? AND organization_id = \? AND learner_id = \?/);
    // Détection : documents de modèle ET QCM (quiz_id), orphelins et sans lien de parcours.
    assert.match(c, /gd\.template_slug IS NOT NULL OR gd\.quiz_id IS NOT NULL/);
    assert.match(c, /gd\.id NOT IN \(SELECT document_id FROM document_formation\)/);
    // createEnrollment RENVOIE l'id : l'écran en a besoin juste après pour la détection.
    assert.match(c, /res\.status\(201\)\.json\(\{ id: enrollmentId/);
});

test('écran : détecter après l\'inscription (individuelle ET groupe), confirmer avant de rattacher', () => {
    const s = lire('src/app/ui/pages/SessionDetail.jsx');
    // Ajout individuel : on détecte avec l'id du dossier créé.
    assert.match(s, /getDocumentsRecuperables\(r\.id\)/, 'détection sur l\'ajout individuel');
    // Inscription de groupe (entreprise) : un par stagiaire réinscrit.
    assert.match(s, /getDocumentsRecuperables\(c\.enrollment_id\)/, 'détection aussi pour chaque dossier d\'une inscription de groupe');
    assert.match(s, /RecuperationDocumentsModal/, 'une fenêtre de confirmation s\'ouvre');
    // File : on rattache le dossier COURANT, puis on passe au suivant.
    assert.match(s, /recupererDocuments\(courant\.enrollmentId, documentIds\)/, 'rattachement dossier par dossier, après confirmation');

    // Serveur : l'inscription de groupe RENVOIE l'id de chaque dossier (l'écran en a besoin).
    const c = lire('src/api/controllers/company.controller.js');
    assert.match(c, /enrollment_id: enrollmentId/, 'registerCompanyStagiaires renvoie l\'id du dossier de chaque stagiaire');
});

test('écran : rattacher un document détaché ÉTAPE PAR ÉTAPE, depuis le coffre', () => {
    const c = lire('src/app/ui/components/EnrollmentParcours.jsx');
    assert.match(c, /getDocumentsRecuperables\(enrollmentId\)/, 'liste les détachés du coffre pour le dossier');
    assert.match(c, /recupererDocuments\(enrollmentId, \[\.\.\.attacheSel\]\)/, 'rattache la sélection au dossier');
    // Seulement sur une étape ENCORE VIDE, et seulement un détaché qui VA à l'étape (clé = slug / quiz).
    assert.match(c, /!step\.docId && etatDe\(step\) === "A_FAIRE" && \(detachesParEtape\.get\(step\.key\)\?\.length > 0\)/,
        'bouton seulement sur une étape vide ayant un détaché correspondant');
});
