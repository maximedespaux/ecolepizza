/**
 * Identités fictives de l'aperçu (lib/echantillons.js).
 *
 * DEUX DÉFAUTS GELÉS ICI, tous deux constatés sur un aperçu réel de facture.
 *
 * 1. LE NOM RÉEL DE L'UTILISATEUR ÉTAIT UN ÉCHANTILLON. `Acheteur` valait « Guillaume DESPAUX »
 *    et `Jury formateur` « M. Guillaume Despaux — formateur », écrits en dur dans le catalogue.
 *    Devant l'aperçu, on ne pouvait plus dire si le document montrait un exemple ou une vraie
 *    facture sortie de la base — une question qui ne devrait jamais se poser.
 *
 * 2. LES ÉCHANTILLONS N'ÉTAIENT PAS COHÉRENTS ENTRE EUX. Un même aperçu affichait l'acheteur
 *    « Guillaume DESPAUX », l'e-mail « jean.dupont@email.fr » et l'adresse « 12 rue des Fours » :
 *    trois personnes dans un seul document, impossible à relire comme une vraie facture.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { identiteExemple, PERSONNES, ENTREPRISES } = require('../lib/echantillons.js');

/** Retire les accents, pour comparer un prénom à la partie locale d'un e-mail. */
const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

test('une identité tirée est complète', () => {
    const { personne, entreprise } = identiteExemple();
    for (const k of ['civilite', 'prenom', 'nom', 'adresse', 'cp', 'ville', 'tel', 'email']) {
        assert.ok(personne[k], `champ « ${k} » manquant sur la personne`);
    }
    for (const k of ['nom', 'siret', 'tel', 'email']) {
        assert.ok(entreprise[k], `champ « ${k} » manquant sur l'entreprise`);
    }
});

test("l'e-mail désigne la MÊME personne que le nom", () => {
    // C'est le défaut nº 2 : sans cette cohérence, l'aperçu mélange plusieurs identités.
    for (const p of PERSONNES) {
        const attendu = `${sansAccent(p.prenom)}.${sansAccent(p.nom)}@`;
        assert.ok(sansAccent(p.email).startsWith(attendu),
            `${p.prenom} ${p.nom} → ${p.email} : l'e-mail ne correspond pas au nom`);
    }
});

test('le code postal et la ville sont cohérents entre eux', () => {
    // Deux personnes de la même ville doivent partager son code postal.
    const parVille = {};
    for (const p of [...PERSONNES, ...ENTREPRISES.map((e) => ({ ville: e.ville, cp: e.cp }))]) {
        if (!p.ville) continue;
        if (parVille[p.ville]) assert.strictEqual(p.cp, parVille[p.ville], `code postal divergent pour ${p.ville}`);
        parVille[p.ville] = p.cp;
    }
});

test('une graine rend le tirage stable, deux graines le font varier', () => {
    // La graine sert à comparer deux aperçus du même modèle sans que le nom change de longueur
    // entre les deux — une différence de mise en page doit venir du modèle, pas de l'échantillon.
    assert.deepStrictEqual(identiteExemple('facture-stagiaire'), identiteExemple('facture-stagiaire'));
    const vus = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((g) => identiteExemple(g).personne.nom));
    assert.ok(vus.size > 1, 'des graines différentes doivent donner des personnes différentes');
});

test('le tirage sans graine explore bien tout le jeu', () => {
    const vus = new Set();
    for (let i = 0; i < 300; i++) vus.add(identiteExemple().personne.nom);
    assert.strictEqual(vus.size, PERSONNES.length, 'toutes les identités doivent pouvoir sortir');
});

test('aucune PERSONNE d\'exemple ne porte le nom réel de l\'utilisateur', () => {
    /* Garde-fou contre la réintroduction du défaut nº 1 : le nom pourrait revenir sur n'importe
       quel jeton, pas seulement sur les deux d'origine.
    *
    * LE GROUPE « ORGANISME » EST EXCLU, et c'est volontaire. « École Pizzaïolo Despaux » et son
    * responsable « Jean-Jacques Despaux » sont l'école elle-même, pas des figurants : l'aperçu
    * affiche d'ailleurs les valeurs RÉELLES de la fiche organisme (cf. sampleTokenValues), parce
    * qu'un papier à en-tête doit ressembler au vrai. Ce qui n'allait pas, c'était de faire passer
    * l'utilisateur pour un ACHETEUR ou un MEMBRE DU JURY inventé.
    *
    * On interroge le CATALOGUE plutôt que le texte du fichier : le groupe d'un jeton est une
    * donnée structurée, qu'un balayage ligne à ligne ne peut pas voir — la première version de
    * ce test l'a appris en virant au rouge sur le nom de l'école.
    *
    * Le critère final n'est d'ailleurs pas le groupe mais la NATURE de l'échantillon : « Centre
    * examen » vaut « École Pizzaïolo Jean-Jacques Despaux » et vit dans le groupe Examen. Nommer
    * l'établissement est légitime partout ; ce qu'on interdit, c'est le nom porté par une
    * personne d'exemple. */
    const { TOKEN_CATALOG } = require('../lib/tokens.js');
    const nommeLEtablissement = (s) => /école|ecole|pizzaïolo|pizzaiolo/i.test(s);
    for (const g of TOKEN_CATALOG) {
        if (g.group === 'Organisme') continue; // bloc de l'école, responsable inclus
        for (const t of (g.tokens || [])) {
            const s = String(t.sample || '');
            if (nommeLEtablissement(s)) continue;
            assert.ok(!/Despaux/i.test(s),
                `jeton « ${t.key} » (groupe ${g.group}) : échantillon « ${s} »`);
        }
    }
    // Le vivier d'identités fictives ne doit évidemment pas le contenir non plus.
    for (const p of PERSONNES) assert.ok(!/Despaux/i.test(`${p.prenom} ${p.nom}`));
});
