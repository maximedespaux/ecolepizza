/**
 * CONVENTIONS DE SAISIE D'UN STAGIAIRE — nom en majuscules, e-mail normalisé, deux champs en listes.
 *
 * Pourquoi côté SERVEUR et pas seulement dans le formulaire : la modale n'est pas le seul chemin
 * d'entrée (reprise de données, second écran, appel direct). Une base où « despaux », « Despaux »
 * et « DESPAUX » cohabitent ne se trie plus, ne se dédoublonne plus, et ressort telle quelle sur
 * les attestations. L'e-mail, lui, EST l'identifiant de connexion du stagiaire : « Jean@X.fr »
 * puis « jean@x.fr » créeraient deux comptes pour la même personne.
 *
 * Vérifié plutôt que supposé : `toUpperCase()` conserve DÉJÀ les accents (« déspaux » donne bien
 * « DÉSPAUX »). Ce qu'épingle `toLocaleUpperCase('fr')`, c'est la LOCALE — sans argument, un hôte
 * turc écrirait « İLE » pour « ile ». Les assertions portent donc sur le RÉSULTAT attendu ; seule
 * la dernière fige la méthode, pour que l'épinglage de locale ne se perde pas à la relecture.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { normaliserSaisie, RE_EMAIL } = require('../controllers/learner.controller.js');

const MODALE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app/ui/components/EditStagiaireModal.jsx'), 'utf8');

test('le NOM est mis en majuscules, accents compris', () => {
    assert.strictEqual(normaliserSaisie({ last_name: 'despaux' }).last_name, 'DESPAUX');
    assert.strictEqual(normaliserSaisie({ last_name: '  Déspaux  ' }).last_name, 'DÉSPAUX',
        'les accents se conservent en capitales (usage français) — pas « DESPAUX »');
    assert.strictEqual(normaliserSaisie({ last_name: 'le Guen' }).last_name, 'LE GUEN');
});

test('l\'e-mail est mis en minuscules et débarrassé des espaces', () => {
    assert.strictEqual(normaliserSaisie({ email: '  Jean.Dupont@Exemple.FR ' }).email, 'jean.dupont@exemple.fr');
    // Le prénom est seulement épuré : on ne touche PAS à sa casse (« Jean-Éric » reste tel quel).
    assert.strictEqual(normaliserSaisie({ first_name: '  Jean-Éric ' }).first_name, 'Jean-Éric');
});

test('un champ absent reste absent (on n\'invente pas de valeur vide)', () => {
    const out = normaliserSaisie({ phone: '0612' });
    assert.strictEqual('last_name' in out, false);
    assert.strictEqual('email' in out, false);
    assert.strictEqual(out.phone, '0612', 'le reste du corps passe intact');
});

test('le format d\'e-mail refuse ce qui ne pourra jamais servir d\'identifiant', () => {
    for (const bon of ['a@b.fr', 'jean.dupont@exemple.co.uk', 'j+tag@x.io']) {
        assert.ok(RE_EMAIL.test(bon), `${bon} devrait être accepté`);
    }
    for (const mauvais of ['jean', 'jean@', '@exemple.fr', 'jean@exemple', 'jean dupont@x.fr', 'a@b.f']) {
        assert.ok(!RE_EMAIL.test(mauvais), `${mauvais} devrait être refusé`);
    }
});

test('la modale applique les mêmes conventions à la frappe', () => {
    assert.match(MODALE, /toLocaleUpperCase\("fr"\)/, 'le nom passe en majuscules en conservant les accents');
    assert.match(MODALE, /onChange=\{setNom\}/, 'le champ Nom utilise le convertisseur, pas set("last_name")');
    assert.match(MODALE, /onChange=\{setEmail\}/, 'le champ e-mail est normalisé à la saisie');
    assert.match(MODALE, /RE_EMAIL|\^\[\^\\s@\]\+@/, 'le format est vérifié avant l\'envoi');
});

test('« Contacté par » et le niveau de diplôme sont des LISTES, sans perdre l\'existant', () => {
    assert.match(MODALE, /const CONTACTS = \["Mail", "Téléphone"\]/);
    assert.match(MODALE, /const DIPLOMES = \[[^\]]*"CAP"[^\]]*"BAC"[^\]]*"BAC \+1"/, 'CAP, BAC, BAC +1…');
    assert.match(MODALE, /<SelectField label="Contacté par"/, 'plus un champ libre');
    assert.match(MODALE, /<SelectField label="Niveau du diplôme le plus élevé"/, 'plus un champ libre');
    /* La reprise d'une valeur hors liste n'est pas un détail : sans elle, ouvrir puis enregistrer
       une ancienne fiche (« Site web », « Bac pro ») effacerait la donnée sans rien demander. */
    assert.match(MODALE, /optionsAvec\(CONTACTS, form\.contacted_by\)/);
    assert.match(MODALE, /optionsAvec\(DIPLOMES, form\.diploma_level\)/);
});

test('les champs libres portent un exemple (placeholder), pas une étiquette répétée', () => {
    for (const attendu of ['placeholder="DUPONT"', 'placeholder="marie.dupont@exemple.fr"',
        'placeholder="06 12 34 56 78"', 'placeholder="65300"', 'placeholder="Lannemezan"']) {
        assert.ok(MODALE.includes(attendu), `${attendu} manquant`);
    }
});
