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
