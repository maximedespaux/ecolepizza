/**
 * CONVENTIONS DE SAISIE D'UNE ENTREPRISE — mêmes règles que pour un stagiaire, une exception près.
 *
 * · NOM DU RÉFÉRENT en capitales : il ressort tel quel sur les conventions et dans le lien de
 *   signature envoyé au représentant ; « dupont » / « Dupont » / « DUPONT » empêchent tout tri.
 * · E-MAIL normalisé et validé : c'est l'adresse à laquelle part la demande de signature — une
 *   coquille de casse la rend introuvable dans les relances, une adresse malformée ne part pas.
 *
 * L'EXCEPTION, et c'est elle qu'on gèle ici : la RAISON SOCIALE n'est PAS mise en capitales.
 * « SARL Le Petit Four » est un nom officiel ; l'uniformiser ferait mentir chaque document qui le
 * reprend (convention, facture, attestation). La tentation d'appliquer « la même règle partout »
 * est exactement ce que ce test empêche.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { normaliserEntreprise, RE_EMAIL_ENT } = require('../controllers/company.controller.js');

const APP = path.join(__dirname, '..', '..', 'app/ui/pages');
const DETAIL = fs.readFileSync(path.join(APP, 'EntrepriseDetail.jsx'), 'utf8');
const LISTE = fs.readFileSync(path.join(APP, 'Entreprises.jsx'), 'utf8');

test('le NOM DU RÉFÉRENT passe en capitales, accents compris', () => {
    assert.strictEqual(normaliserEntreprise({ representative_name: '  déspaux ' }).representative_name, 'DÉSPAUX');
});

test('la RAISON SOCIALE garde sa casse officielle (seulement épurée)', () => {
    const nom = normaliserEntreprise({ name: '  SARL Le Petit Four  ' }).name;
    assert.strictEqual(nom, 'SARL Le Petit Four', 'ni capitales ni minuscules forcées : c\'est un nom propre');
});

test('l\'e-mail de l\'entreprise est normalisé, et validé', () => {
    assert.strictEqual(normaliserEntreprise({ email: ' Contact@LePetitFour.FR ' }).email, 'contact@lepetitfour.fr');
    assert.ok(RE_EMAIL_ENT.test('contact@lepetitfour.fr'));
    for (const mauvais of ['contact', 'contact@', '@x.fr', 'contact@x', 'a b@x.fr']) {
        assert.ok(!RE_EMAIL_ENT.test(mauvais), `${mauvais} devrait être refusé`);
    }
});

test('un champ absent reste absent', () => {
    const out = normaliserEntreprise({ siret: '879' });
    assert.strictEqual('representative_name' in out, false);
    assert.strictEqual('email' in out, false);
    assert.strictEqual(out.siret, '879');
});

test('les deux écrans appliquent les mêmes conventions, et montrent un exemple', () => {
    // Fiche entreprise : la normalisation passe par le convertisseur, pas par un set() brut.
    assert.match(DETAIL, /function valeurNormalisee/);
    assert.match(DETAIL, /setForm\(\(p\) => \(\{ \.\.\.p, \[k\]: valeurNormalisee\(k, e\.target\.value\) \}\)\)/);
    // Modale de création : même règle, appliquée sur place.
    assert.match(LISTE, /representative_name" \? e\.target\.value\.toLocaleUpperCase\("fr"\)/);
    assert.match(LISTE, /\^\[\^\\s@\]\+@/, 'le format d\'e-mail est vérifié avant l\'envoi');
    // Des exemples de format sur les champs libres des deux écrans.
    for (const attendu of ['placeholder: "879 955 136 00012"', 'placeholder: "65300"', 'placeholder: "DUPONT"']) {
        assert.ok(DETAIL.includes(attendu), `fiche entreprise : ${attendu} manquant`);
    }
    for (const attendu of ['placeholder="SARL Le Petit Four"', 'placeholder="contact@lepetitfour.fr"', 'placeholder="DUPONT"']) {
        assert.ok(LISTE.includes(attendu), `modale de création : ${attendu} manquant`);
    }
});

/* ---------------------------------------------------------------------------------------------
 * INSCRIPTION DE GROUPE — la même exigence de nom que le formulaire, et pas une autre.
 * ------------------------------------------------------------------------------------------- */

const { registerCompanyStagiaires } = require('../controllers/company.controller.js');

/** Appelle la route sans base : le contrôle des noms se fait AVANT la moindre requête. */
async function inscrire(stagiaires) {
    let code = 200; let corps = null;
    const res = { status(c) { code = c; return this; }, json(b) { corps = b; return this; } };
    await registerCompanyStagiaires(
        { params: { id: 'c1' }, body: { stagiaires }, user: { organization_id: 'o1', id: 'u1' } }, res);
    return { code, corps };
}

test('une ligne à moitié remplie est refusée, et son RANG est dit', async () => {
    /* LE DÉFAUT : le test était `if (!first && !last) continue;` — un ET. Une ligne où seul le
       prénom figurait passait la garde et créait une fiche à moitié nommée, sans message. La même
       personne était donc refusée par 422 dans la fiche stagiaire et admise en silence ici. */
    const { code, corps } = await inscrire([{ first_name: 'Marie' }]);
    assert.strictEqual(code, 422);
    assert.match(corps.error, /ligne 1/, 'sur vingt lignes collées d\'un coup, il faut savoir LAQUELLE');
});

test('une ligne entièrement vide reste ignorée — ce n\'est pas une faute de saisie', async () => {
    // C'est le résidu d'un copier-coller. Ce qu'on refuse, c'est la ligne À MOITIÉ remplie,
    // la seule qui trahisse une intention incomplète.
    const { code, corps } = await inscrire([
        { first_name: 'Marie', last_name: 'DUPONT' },
        { first_name: '', last_name: '  ' },
        { last_name: 'BERNARD' },
    ]);
    assert.strictEqual(code, 422);
    assert.match(corps.error, /ligne 3/, 'seule la ligne incomplète est signalée…');
    assert.doesNotMatch(corps.error, /ligne 2|2,|, 2/, '…la ligne vide n\'est pas comptée comme une faute');
});

test('le refus a lieu AVANT toute écriture', async () => {
    /* Refuser au dixième d'une liste de vingt laisserait neuf fiches créées et onze non — un état
       que personne ne peut rattraper à la main. C'est la règle déjà posée dans cette fonction pour
       les parcours ; elle vaut aussi pour les noms. Ce test le prouve en s'exécutant SANS base :
       s'il touchait la base, il n'aurait pas pu répondre. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/company.controller.js'), 'utf8');
    const fn = src.slice(src.indexOf('const registerCompanyStagiaires'));
    assert.ok(fn.indexOf('const incompletes') < fn.indexOf('db.promise()'),
        'le contrôle des noms doit précéder la première requête');
});

test('un e-mail malformé est refusé, avec son rang lui aussi', async () => {
    /* Il SERT d'identifiant de connexion. Laissé passer, il ne fait pas échouer l'import : il
       crée douze fiches dont l'une n'aura jamais de compte, sans que personne ne l'apprenne. */
    const { code, corps } = await inscrire([
        { first_name: 'Marie', last_name: 'DUPONT' },
        { first_name: 'Luc', last_name: 'BERNARD', email: 'luc@' },
    ]);
    assert.strictEqual(code, 422);
    assert.match(corps.error, /e-mail invalide.*ligne 2/i);
});

test('le lot applique les MÊMES conventions de saisie que la fiche', () => {
    /* Il ne les appliquait pas : un lot de douze arrivait en « dupont », « Dupont », « DUPONT »
       selon ce qu'avait tapé l'entreprise — le mélange exact que la convention existe pour
       empêcher, et qui rend la liste intriable. La règle est IMPORTÉE du contrôleur stagiaire,
       pas recopiée : deux versions finiraient par diverger. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/company.controller.js'), 'utf8');
    assert.match(src, /const \{ normaliserSaisie, RE_EMAIL \} = require\('\.\/learner\.controller\.js'\)/);
    assert.match(src, /const n = normaliserSaisie\(s\);/, 'chaque ligne du lot passe par la normalisation');
    // Et la suite de la boucle lit la version normalisée, pas la saisie brute.
    assert.doesNotMatch(src, /clean\(s\.civility\)|clean\(s\.phone\)|clean\(s\.email\)/,
        'plus aucune lecture brute de la ligne après normalisation');
});
