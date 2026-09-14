/**
 * LE POINT D'ACCÈS À L'ÉMARGEMENT NE POUVAIT PAS S'OUVRIR.
 *
 * LE DÉFAUT, constaté avec une stagiaire de la session NIV1H en cours : l'écran annonçait des
 * documents obligatoires non atteints, alors qu'elle avait tout signé — et reculer le point de
 * rupture n'y changeait rien.
 *
 * LA CAUSE. `dossierEmargementGate` composait sa liste d'exigences avec `matchStep`, qui ne
 * connaît que les conditions INTÉGRÉES (financement, code RS, hygiène, jours, AGEFICE). Les
 * conditions PERSONNALISÉES — celles que l'organisme écrit dans Modèles → Conditions, sous la
 * forme `{ conditions: ['financeur-particulier'] }` — n'y sont même pas lues : `matchStep` ne
 * regarde jamais la clé `conditions` et rend `true`.
 *
 * MESURÉ SUR LES DONNÉES RÉELLES. Le parcours d'un dossier PARTICULIER en NIV1H compte cinq
 * étapes avant le point d'accès, dont deux à signer : devis particulier et contrat, tous deux
 * SIGNÉS. La garde en exigeait QUATRE — les deux variantes de devis ET les deux de contrat,
 * pourtant mutuellement exclusives. Elle comptait 2 sur 4.
 *
 * CE QUI REND LE DÉFAUT PARTICULIÈREMENT MAUVAIS : il ne se contourne pas. Deux des quatre
 * documents ne peuvent PAS exister pour ce dossier, donc aucun geste ne satisfait la garde, et
 * déplacer le point de rupture ne sert à rien tant qu'il reste au-delà de la première variante.
 * L'utilisateur a essayé — c'est ce qui a fait remonter le problème.
 *
 * LA GARDE LIT DÉSORMAIS `enrollmentSteps`, comme le suivi, le pipeline et l'espace stagiaire :
 * conditions personnalisées et équivalences « OU » comprises. Une garde ne peut pas exiger
 * autre chose que ce que le parcours affiche, sinon elle réclame l'impossible.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { matchStep } = require('../lib/documents.js');
const ESPACE = fs.readFileSync(path.join(__dirname, '..', 'controllers/espace.controller.js'), 'utf8');

test('matchStep ignore les conditions personnalisées — c\'est un fait, pas un bug', () => {
    /* On GÈLE ce comportement plutôt que de l'élargir : `matchStep` est le filtre des
       conditions intégrées, appelé là où les conditions personnalisées n'ont pas été chargées.
       Lui faire deviner un `{conditions:[…]}` sans la carte des conditions ni les faits du
       dossier reviendrait à inventer une réponse. Ce qu'il faut, c'est ne pas l'appeler seul
       quand on décide d'un accès. */
    const ctx = { financing: 'PARTICULIER', hygiene: true, jours: 5, rsCode: null, agefice: false };
    assert.strictEqual(matchStep({ conditions: ['financeur-professionnel'] }, ctx), true,
        'il rend vrai faute de savoir : la clé `conditions` ne lui est pas destinée');
    // Les conditions intégrées, elles, sont bien appliquées.
    assert.strictEqual(matchStep({ financing: 'PROFESSIONNEL' }, ctx), false);
    assert.strictEqual(matchStep({ financing: 'PARTICULIER' }, ctx), true);
});

test('la garde résout le parcours DU DOSSIER, pas celui de la formation', () => {
    const bloc = ESPACE.slice(ESPACE.indexOf('async function dossierEmargementGate'));
    const corps = bloc.slice(0, bloc.indexOf('\n}'));
    assert.ok(corps.length > 400, 'corps de la garde introuvable');
    assert.match(corps, /await enrollmentSteps\(conn, orgId, program, ctx\)/,
        'la liste des exigences doit venir du parcours résolu du dossier');
    const code = corps.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    assert.doesNotMatch(code, /matchStep\(/,
        'filtrer avec matchStep seul laisse passer les variantes exclues par une condition personnalisée');
});

test('les faits du dossier sont chargés avant de filtrer', () => {
    /* Sans eux, `enrollmentSteps` évaluerait les conditions personnalisées contre un contexte
       vide — et retomberait dans le défaut qu'on vient de corriger, par un autre chemin. */
    const bloc = ESPACE.slice(ESPACE.indexOf('async function dossierEmargementGate'));
    const corps = bloc.slice(0, bloc.indexOf('\n}'));
    assert.match(corps, /loadDossierFactsMap\(conn, orgId, \[e\.enrollment_id\], catalogue\)/);
    assert.match(corps, /Object\.assign\(ctx, faits\.get\(e\.enrollment_id\) \|\| \{\}\)/);
});

test('le seuil vient toujours du parcours de la FORMATION', () => {
    /* Le point de rupture peut désigner une étape que les conditions du dossier écartent : son
       `sort_order` doit rester lisible, sinon la garde s'ouvrirait en grand par accident. */
    const bloc = ESPACE.slice(ESPACE.indexOf('async function dossierEmargementGate'));
    assert.match(bloc, /const pSteps = await formationSteps\(conn, orgId, program\);/);
    assert.match(bloc, /const threshold = Number\(brk\.sort_order\);/);
});

test('les QCM et l\'émargement ne se barrent pas eux-mêmes', () => {
    const bloc = ESPACE.slice(ESPACE.indexOf('async function dossierEmargementGate'));
    assert.match(bloc, /s\.doc_type !== 'QCM' && s\.doc_type !== 'EMARGEMENT'/);
});
