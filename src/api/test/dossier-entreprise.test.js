/**
 * « L'entreprise d'un dossier est celle du DOSSIER, jamais celle de la fiche personne. »
 *
 * LE DÉFAUT QUE CES TESTS VERROUILLENT. `learner.company_id` est posé à vie au premier
 * rattachement, et rien ne le retire ensuite. Tant qu'on le lisait pour décider du parcours,
 * une personne venue une fois par son employeur voyait TOUS ses dossiers suivants basculer en
 * parcours entreprise — y compris ceux qu'elle portait seule. Conséquences observées :
 * l'employeur apparaissait sur des documents qui ne le regardaient pas, et le stagiaire ne
 * pouvait plus signer ses propres papiers.
 *
 * `enrollment.company_id` est la source de vérité, et elle est correctement alimentée : le
 * rattachement par l'entreprise l'écrit (company.controller), et une inscription ordinaire
 * pose NULL (enrollment.controller). Il ne manquait que la discipline de lecture.
 *
 * FORME DES TESTS : on inspecte le SQL réel des contrôleurs, comme pour la Communauté. Une
 * réimplémentation en JavaScript dériverait de la vraie sans que rien ne le signale.
 * Ils n'attrapent pas une jointure qui ramène de mauvaises lignes — ça se vérifie en base —
 * mais ils attrapent le retour du repli vers la fiche personne, qui est précisément le défaut
 * qu'on vient de corriger et le plus facile à réintroduire de bonne foi.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', 'controllers', f), 'utf8');
const suivi = lire('suivi.controller.js');
const espace = lire('espace.controller.js');
const document = lire('document.controller.js');

/** Le code, commentaires retirés : une explication qui cite le défaut ne doit pas le signaler. */
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const CODE = {
    suivi: sansCommentaires(suivi),
    espace: sansCommentaires(espace),
    document: sansCommentaires(document),
};

test('aucun repli du dossier vers la fiche personne', () => {
    // La forme exacte qui a causé le défaut, sous ses deux alias.
    for (const [nom, src] of Object.entries(CODE)) {
        assert.doesNotMatch(src, /COALESCE\(\s*e\.company_id\s*,\s*l\.company_id\s*\)/i,
            `${nom} : le repli vers la fiche personne est revenu`);
        assert.doesNotMatch(src, /COALESCE\(\s*en\.company_id\s*,\s*l\.company_id\s*\)/i,
            `${nom} : le repli vers la fiche personne est revenu`);
    }
});

test('le Suivi affiche l\'entreprise du dossier', () => {
    assert.match(CODE.suivi, /e\.company_id AS company_id/,
        'le Suivi ne lit plus e.company_id pour la colonne Entreprise');
    assert.match(CODE.suivi, /LEFT JOIN company c ON c\.id = e\.company_id/,
        'la jointure entreprise doit partir du dossier');
});

test('le volet entreprise de l\'émargement lit le dossier seul', () => {
    const bloc = CODE.espace.slice(CODE.espace.indexOf('async function companyEmargementGate'));
    const fin = bloc.indexOf('\nasync function');
    const corps = fin > 0 ? bloc.slice(0, fin) : bloc;
    assert.match(corps, /SELECT en\.company_id AS cid/,
        'companyEmargementGate doit lire en.company_id, sans repli');
    assert.doesNotMatch(corps, /JOIN learner l/,
        'la fiche personne n\'a plus rien à faire dans cette requête');
});

test('un document de groupe ne déverrouille pas une AUTRE session', () => {
    // `session_id IS NULL` acceptait les documents de groupe de n'importe quelle session de
    // l'entreprise : une convention signée en mars débloquait la session de septembre.
    const bloc = CODE.espace.slice(CODE.espace.indexOf("scope = 'COMPANY'"));
    const corps = bloc.slice(0, 400);
    assert.doesNotMatch(corps, /session_id IS NULL OR session_id = \?/,
        'les documents de groupe d\'une autre session repassent');
    assert.match(corps, /\? IS NULL OR session_id = \?/,
        'le repli ne doit jouer que si le dossier lui-même n\'a pas de session');
});

test('la signature suit le dossier du document, pas son destinataire', () => {
    const bloc = CODE.document.slice(CODE.document.indexOf('async function docSignedByCompany'));
    const corps = bloc.slice(0, bloc.indexOf('\n}') + 2);
    assert.doesNotMatch(corps, /FROM learner/,
        'docSignedByCompany relit la fiche personne : le stagiaire ne pourra plus signer ses dossiers solo');
    assert.match(corps, /document_formation df/,
        'la signature doit remonter au dossier via document_formation');
    assert.match(corps, /JOIN enrollment e ON e\.id = df\.enrollment_id/);
});

test('le jeton {Entreprise} vient du dossier du document', () => {
    assert.match(CODE.document, /dossierCompanyId/,
        'le remplissage des jetons doit passer par l\'entreprise du dossier');
    assert.doesNotMatch(CODE.document, /isPro && learner && learner\.company_id/,
        'le jeton Entreprise relit la fiche personne');
});

test('« signé par l\'entreprise » se décide document par document', () => {
    // Une valeur unique pour tout le stagiaire ne peut pas être juste quand il a deux dossiers
    // de natures différentes.
    assert.doesNotMatch(CODE.espace, /const hasCompany = !!learner\.company_id/,
        'hasCompany redevient une propriété du stagiaire');
    assert.match(CODE.espace, /MAX\(e\.company_id\) AS doc_company_id/,
        'le rattachement doit remonter par document');
    assert.match(CODE.espace, /d\.doc_company_id && companySignsDoc/,
        'la décision doit se prendre sur le dossier du document');
});

test('les lectures encore centrées sur la personne le sont à bon droit', () => {
    // Toutes les lectures de learner.company_id ne sont pas des défauts : « à quelle entreprise
    // cette PERSONNE est-elle rattachée » reste une question valide pour sa fiche, la carte et
    // ses informations personnelles. Ce test documente la frontière plutôt que de l'interdire.
    const legitimes = ['carte.controller.js', 'learner.controller.js'];
    for (const f of legitimes) {
        const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', f), 'utf8');
        assert.match(src, /company_id/, `${f} : lecture attendue au niveau personne`);
    }
});
