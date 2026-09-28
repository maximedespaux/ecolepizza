/**
 * UNE PIÈCE À PLUSIEURS FICHIERS : on en dépose jusqu'à l'accord OU jusqu'au plafond (2026-09-24).
 *
 * LE DÉFAUT. Une pièce peut attendre plusieurs fichiers (« Justificatifs », six pages). Le premier
 * fichier déposé faisait passer l'étape en « à vérifier » (DEPOSEE), et le bouton d'envoi
 * DISPARAISSAIT — le stagiaire ne pouvait plus joindre les cinq pages suivantes tant que l'école
 * n'avait pas refusé la pièce. On s'arrête désormais à l'accord (VALIDEE) OU au plafond
 * (`fichiers_attendus`), selon ce qui vient en premier.
 *
 * LE SERVEUR SAIT DÉJÀ LE FAIRE : `deposer` ajoute un fichier tant que le compte est SOUS le
 * plafond et ne répond 409 qu'au-delà. Le blocage était uniquement à l'écran.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(API, '..', 'app', 'ui', 'pages', 'StudentFormationDetail.jsx'), 'utf8');
const ctrl = fs.readFileSync(path.join(API, 'controllers', 'piece.controller.js'), 'utf8');

test('l\'écran laisse ajouter tant que déposé ET sous le plafond', () => {
    /* La règle vit dans l'étape : PAS VALIDÉE, et place restante. Validé → plus rien ; plafond atteint
       → plus rien, MÊME REFUSÉE (2026-09-28) : « Renvoyer » sur une pièce à six fichiers sur six ne
       pouvait que se faire refuser (409). Le stagiaire retire d'abord un fichier (sa corbeille,
       piece-retrait-stagiaire.test.js), et le bouton revient. */
    assert.match(page, /peutAjouter: etat !== "done" && nb < max/);
    /* Le bouton apparaît quand un ajout est possible — à fournir, à renvoyer, ou à compléter. */
    assert.match(page, /\{e\.peutAjouter && \(/);
    /* Et son libellé distingue les trois gestes — « Ajouter » n'est pas « Fournir ». */
    assert.match(page, /e\.etat === "refused" \? "Renvoyer" : e\.nb > 0 \? "Ajouter" : "Fournir"/);
    /* COMBIEN SUR COMBIEN : sans ce repère, le stagiaire ignore combien il peut encore en joindre. */
    assert.match(page, /\{e\.nb\} sur \{e\.max\} déposé/);
    /* `max` est BORNÉ À 1 AU MINIMUM : une pièce sans `fichiers_attendus` explicite en attend un. */
    assert.match(page, /const max = Math\.max\(1, Number\(p\.fichiers_attendus\) \|\| 1\);/);
});

test('le serveur borne au COMPTE, pas au statut : il accepte jusqu\'au plafond', () => {
    /* C'est ce qui rend l'ajout possible sur une pièce déjà « déposée » : le refus vient du
       NOMBRE de fichiers (>= max), pas de l'état de la pièce. Casser ça (revenir à un refus sur
       le statut) referme l'écran sans que l'écran change. */
    assert.match(ctrl, /const \[\[dejaN\]\] = await conn\.query\('SELECT COUNT\(\*\) AS n FROM piece_fichier WHERE depot_id = \?'/);
    assert.match(ctrl, /if \(dejaN\.n >= max\) \{/);
    assert.match(ctrl, /ON DUPLICATE KEY UPDATE statut = VALUES\(statut\)/,
        'le dépôt d’un fichier supplémentaire met à jour le dépôt existant, il ne le refuse pas');
});
