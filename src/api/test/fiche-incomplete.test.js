/**
 * LA FICHE STAGIAIRE DIT CE QUI LUI MANQUE (demandé le 2026-09-21).
 *
 * LE DÉFAUT. La carte « Contact & identité » n'affiche que les lignes remplies (`Row` rend `null`
 * sur une valeur vide). Une fiche sans adresse ne montrait donc RIEN à cet endroit — ni ligne
 * vide, ni tiret : l'absence ne se voyait pas. Or l'adresse, le code postal et la ville sont ce
 * que l'école peut envoyer à ses partenaires, et ce qui s'imprime sur les documents du stagiaire.
 * Téléphone et e-mail, eux, sont exigés à la CRÉATION mais pas à la modification : une fiche
 * importée ou corrigée peut n'en avoir aucun.
 *
 * LE CORRECTIF. Le serveur nomme ce qui manque (lib/ficheIncomplete.js), avec la raison — envoyé
 * aux partenaires, ou essentiel —, et la fiche l'annonce dans un bandeau, avec un bouton pour la
 * compléter.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { champsManquants, COLONNES, PROJETS } = require('../lib/ficheIncomplete.js');

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lireUi = (f) => fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui', f), 'utf8');

const COMPLETE = {
    civility: 'M.', last_name: 'HANY', first_name: 'Jérémy', email: 'j@exemple.fr', phone: '06 00 00 00 00',
    address: '1 rue de la Paix', zip_code: '65300', town: 'LANNEMEZAN', professional_status: 'Salarié',
    project_oven: 1,
};
const cles = (l, transmis) => champsManquants(l, transmis).map((m) => m.cle);

test('une fiche complète ne réclame rien', () => {
    assert.deepStrictEqual(champsManquants(COMPLETE, ['civilite', 'nom', 'email', 'adresse', 'code_postal', 'ville', 'projet', 'statut']), []);
});

test('l\'adresse manquante est nommée — et dite envoyée aux partenaires quand l\'école l\'envoie', () => {
    const sansAdresse = { ...COMPLETE, address: null, zip_code: '', town: '   ' };
    /* Des espaces ne sont pas une ville : la saisie les laisse passer, et l'export les enverrait
       tels quels à un partenaire. */
    const m = champsManquants(sansAdresse, ['nom', 'adresse', 'code_postal', 'ville']);
    assert.deepStrictEqual(m.map((x) => [x.cle, x.libelle, x.partenaires]), [
        ['adresse', 'Adresse postale', true], ['code_postal', 'Code postal', true], ['ville', 'Ville', true],
    ]);
    // L'école ne l'envoie pas (ou personne ne reçoit rien) : toujours réclamée, pour les documents.
    assert.deepStrictEqual(champsManquants(sansAdresse, []).map((x) => [x.cle, x.partenaires]),
        [['adresse', false], ['code_postal', false], ['ville', false]]);
});

test('téléphone et e-mail sont toujours réclamés, même si rien ne part chez un partenaire', () => {
    assert.deepStrictEqual(cles({ ...COMPLETE, phone: null, email: '' }, []), ['email', 'telephone']);
});

test('civilité, situation et projet ne sont réclamés QUE si l\'école les envoie', () => {
    const maigre = { ...COMPLETE, civility: null, professional_status: '', project_oven: 0 };
    assert.deepStrictEqual(cles(maigre, []), [], 'rien de tout cela n\'est essentiel');
    assert.deepStrictEqual(cles(maigre, ['civilite', 'statut', 'projet']), ['civilite', 'projet', 'statut'],
        'dans l\'ordre du catalogue, celui de la phrase de consentement');
    // Le projet est six cases : une seule cochée suffit.
    assert.deepStrictEqual(cles({ ...maigre, project_improvement: 1 }, ['projet']), []);
});

test('ni la formation ni l\'entreprise ne se complètent sur la fiche stagiaire', () => {
    const rien = {};
    const tout = ['formation', 'dates_session', 'entreprise', 'entreprise_siret', 'entreprise_adresse', 'entreprise_cp', 'entreprise_ville'];
    for (const cle of tout) assert.ok(!cles(rien, tout).includes(cle), `${cle} ne vient pas de la fiche`);
});

test('le bandeau lit les MÊMES colonnes que l\'export envoyé aux partenaires', async () => {
    /* Sinon il dirait complet un champ que l'export enverrait vide — ou l'inverse. */
    const EXPORT = lire('controllers/consentement.controller.js');
    for (const [cle, col] of Object.entries(COLONNES)) {
        assert.match(EXPORT, new RegExp(`\\b${cle}: l\\.${col} \\|\\| ''`), `${cle} → ${col}`);
    }
    /* LE PROJET : la même phrase, construite par la même fonction (lib/projet.js). Le bandeau le dit
       manquant exactement quand le partenaire recevrait une phrase vide — case par case, sur tout le
       catalogue de l'écran. Une case de l'AVANCEMENT seule (local trouvé…) ne suffit pas : elle ne
       part pas au partenaire. */
    assert.match(EXPORT, /projet: phraseProjet\(l\),/);
    assert.match(EXPORT, /const \{ phraseProjet, colonnesProjetSql \} = require\('\.\.\/lib\/projet\.js'\);/);
    const { CASES_PROJET, PRECISIONS_FOUR } = await import('../../app/ui/lib/projet.js');
    const { phraseProjet, COLONNES_PHRASE } = require('../lib/projet.js');
    assert.deepStrictEqual(PROJETS, COLONNES_PHRASE, 'le bandeau lit les colonnes de la phrase');
    for (const k of CASES_PROJET) {
        // Une précision du four coche « Four » à l'enregistrement (normaliserSaisie).
        const l = { ...COMPLETE, project_oven: PRECISIONS_FOUR.includes(k) ? 1 : 0, [k]: 1 };
        const manque = cles(l, ['projet']).includes('projet');
        assert.strictEqual(manque, phraseProjet(l) === '', `${k} : le bandeau et l'export disent la même chose`);
    }
    assert.ok(cles({ ...COMPLETE, project_oven: 0, project_premises: 1 }, ['projet']).includes('projet'),
        'l\'avancement seul ne renseigne pas le projet');
});

test('la fiche est servie avec ce qui lui manque, et ne tombe pas si le calcul échoue', () => {
    const CTRL = lire('controllers/learner.controller.js');
    const corps = CTRL.slice(CTRL.indexOf('const getLearner = async'), CTRL.indexOf('const createLearner = async'));
    /* Personne ne reçoit rien (la 131 démarre à zéro destinataire) : rien n'est « envoyé aux
       partenaires ». */
    assert.match(corps, /\(await aDesDestinataires\(conn, orgId\)\) \? await champsOrganisme\(conn, orgId\) : \[\]/);
    assert.match(corps, /learner\.champs_manquants = champsManquants\(learner, transmis\);/);
    assert.match(corps, /try \{[\s\S]*champsManquants\(learner, transmis\)[\s\S]*\} catch \(e\) \{/,
        'un registre illisible prive du bandeau, pas de la fiche');
});

test('l\'écran annonce ce qui manque, avec de quoi le compléter', () => {
    const FICHE = lireUi('pages/StagiaireDetail.jsx');
    assert.match(FICHE, /<FicheIncomplete manquants=\{l\.champs_manquants\} onCompleter=\{\(\) => setEditOpen\(true\)\} \/>/);
    const BANDEAU = lireUi('components/FicheIncomplete.jsx');
    assert.match(BANDEAU, /if \(!Array\.isArray\(manquants\) \|\| manquants\.length === 0\) return null;/,
        'rien ne manque, ou serveur d\'avant : pas de bandeau');
    assert.match(BANDEAU, /Compléter la fiche/);
    // Pas de tiret cadratin dans l'interface (commit 5bc392e4).
    assert.doesNotMatch(BANDEAU.replace(/\/\*[\s\S]*?\*\//g, ''), /—/);
});
