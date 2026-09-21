/**
 * UN DOCUMENT D'ENTREPRISE LISTE TOUT LE GROUPE QUI L'A FAIT NAÎTRE.
 *
 * DÉFAUT TROUVÉ LE 2026-09-21, en expliquant le groupe « Groupe entreprise ». Un document
 * d'entreprise (convention…) se génère UN PAR OPCO, et un stagiaire dont la fiche ne porte aucun
 * OPCO est rangé sous celui de son ENTREPRISE — c'est voulu, pour ne pas lui faire un document
 * « sans OPCO » à lui seul. Mais au RENDU, la liste ({Stagiaires}, bloc « par stagiaire ») ne
 * gardait que les stagiaires dont la FICHE portait l'OPCO du document : l'entreprise OCAPIAT
 * envoie Jean (OCAPIAT sur sa fiche) et Marie (rien) ; la génération les met tous deux dans
 * « Convention — OCAPIAT »… et la convention ne nomme que Jean.
 *
 * DEUX ENDROITS ÉCRIVAIENT LA RÈGLE, chacun à sa façon. Elle vit désormais dans
 * lib/documents.js, et le test qui compte est l'INVARIANT : pour n'importe quel groupe produit
 * par la génération, le rendu liste exactement ce groupe.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { groupesParOpco, stagiairesDuDocument, cleOpco } = require('../lib/documents.js');

// Une entreprise sous OCAPIAT : deux salariés, dont un sans OPCO sur sa fiche, et un dirigeant sous AKTO.
const ENTREPRISE = 'OCAPIAT';
const INSCRITS = [
    { id: 'jean', opco: 'OCAPIAT' },
    { id: 'marie', opco: null },
    { id: 'paul', opco: 'Ocapiat ' },   // même OPCO, autre écriture
    { id: 'dirigeant', opco: 'AKTO' },
];
// Ce que lit le rendu : la fiche du stagiaire, et l'OPCO de son entreprise.
const LIGNES = INSCRITS.map((i) => ({ id: i.id, last_name: i.id.toUpperCase(), opco: i.opco, opco_entreprise: ENTREPRISE }));
const ids = (l) => l.map((x) => x.id).sort();

test('MARIE, SANS OPCO SUR SA FICHE, EST DANS LA CONVENTION OCAPIAT — et y figure', () => {
    const groupes = groupesParOpco(INSCRITS, ENTREPRISE);
    assert.deepStrictEqual([...groupes.keys()].sort(), ['AKTO', 'OCAPIAT'], 'deux documents, pas un troisième « sans OPCO »');
    assert.deepStrictEqual(groupes.get('OCAPIAT').ids.sort(), ['jean', 'marie', 'paul']);
    /* LE DÉFAUT, tel qu'il était : l'ancien filtre SQL comparait l'OPCO de la FICHE à celui du
       document. Il est reproduit ici pour qu'on voie ce qu'il faisait — Marie en sortait. */
    const ancienFiltre = (lignes, opco) => lignes.filter((l) => (l.opco || '').trim() === (opco || '').trim());
    assert.deepStrictEqual(ids(ancienFiltre(LIGNES, 'OCAPIAT')), ['jean'], 'Marie et Paul disparaissaient');
    // Et la règle partagée, elle, rend le groupe entier.
    assert.deepStrictEqual(ids(stagiairesDuDocument(LIGNES, 'OCAPIAT')), ['jean', 'marie', 'paul']);
    assert.deepStrictEqual(ids(stagiairesDuDocument(LIGNES, 'AKTO')), ['dirigeant']);
});

test('L\'INVARIANT : chaque document liste exactement le groupe qui l\'a fait naître', () => {
    /* Plusieurs configurations, dont les cas limites : une entreprise SANS OPCO (les sans-OPCO
       forment alors leur propre document), et des écritures qui ne diffèrent que par la casse. */
    const CAS = [
        [INSCRITS, ENTREPRISE],
        [INSCRITS, ''],
        [INSCRITS, null],
        [[{ id: 'a', opco: '' }, { id: 'b', opco: '  ' }, { id: 'c', opco: 'akto' }], 'AKTO'],
        [[{ id: 'seul', opco: null }], null],
    ];
    for (const [inscrits, opcoEntreprise] of CAS) {
        const lignes = inscrits.map((i) => ({ id: i.id, opco: i.opco, opco_entreprise: opcoEntreprise }));
        for (const g of groupesParOpco(inscrits, opcoEntreprise).values()) {
            assert.deepStrictEqual(ids(stagiairesDuDocument(lignes, g.opco)), [...g.ids].sort(),
                `entreprise « ${opcoEntreprise} », document « ${g.opco} »`);
        }
    }
});

test('{OPCO} DIT, DANS LE BLOC, LA MÊME CHOSE QUE LE TITRE DU DOCUMENT', () => {
    /* Marie est listée sous « Convention — OCAPIAT » : une case OPCO vide à côté de son nom
       contredirait le document qui la contient. */
    const marie = stagiairesDuDocument(LIGNES, 'OCAPIAT').find((l) => l.id === 'marie');
    assert.strictEqual(marie.opco, 'OCAPIAT');
    assert.ok(!('opco_entreprise' in marie), 'la colonne technique ne descend pas dans les jetons');
});

test('un document d\'avant le regroupement par OPCO liste tout le monde, comme avant', () => {
    // Migration 089 non jouée : la colonne `opco` n'existe pas, `gdInfo.opco` vaut undefined.
    assert.deepStrictEqual(ids(stagiairesDuDocument(LIGNES, undefined)), ['dirigeant', 'jean', 'marie', 'paul']);
    assert.strictEqual(cleOpco(' Ocapiat '), 'OCAPIAT');
});

// ── Les deux contrôleurs emploient la règle partagée, et rien d'autre ──────────────────────
const lire = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('la génération et le rendu lisent la même règle', () => {
    const generation = lire('controllers/company.controller.js');
    assert.match(generation, /groups = groupesParOpco\(enr, company\.opco\);/);
    assert.doesNotMatch(generation, /const raw = \(e\.opco \|\| company\.opco \|\| ''\)\.trim\(\);/, 'plus de copie locale');
    const rendu = lire('controllers/document.controller.js');
    assert.match(rendu, /groupStagiaires = stagiairesDuDocument\(gs, gdInfo\.opco\);/);
    assert.match(rendu, /c\.opco AS opco_entreprise/, 'le rendu doit connaître l\'OPCO de l\'entreprise pour appliquer l\'héritage');
    assert.doesNotMatch(rendu, /TRIM\(COALESCE\(l\.opco, ''\)\) = \?/, 'le filtre SQL qui écartait Marie');
});

test('l\'aide de « Jetons perso » nomme un groupe qui EXISTE dans la palette', () => {
    /* Elle renvoyait au « groupe Entreprise » — la palette ne connaît que « Groupe entreprise ».
       Le nom est lu à sa source : renommer le groupe sans l'aide fera virer ce test. */
    const nom = /return \{ group: '([^']+)', tokens \};\s*\}\s*\n\s*\/\*\*/.exec(lire('controllers/template.controller.js'))
        || /function groupTokensGroup\(\)[\s\S]*?group: '([^']+)'/.exec(lire('controllers/template.controller.js'));
    assert.ok(nom, 'nom du groupe introuvable dans groupTokensGroup');
    // Le texte AFFICHÉ, commentaires retirés : le commentaire qui raconte l'ancien libellé le cite.
    const fenetre = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'components', 'CustomTokenManager.jsx'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(fenetre.includes(`« ${nom[1]} »`), `l'aide doit citer « ${nom[1]} »`);
    assert.doesNotMatch(fenetre, /\(groupe Entreprise\)/);
    // Et la palette dit où un jeton « par stagiaire » fonctionne, à chaque survol.
    const editeur = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'TemplateEditor.jsx'), 'utf8');
    assert.match(editeur, /montrerTip\(e, \{ \.\.\.t, desc: descParStagiaire\(t\) \}, g\.group\)/);
});
