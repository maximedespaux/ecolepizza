/**
 * L'ÉQUIPE DE L'ORGANISME N'EST PLUS AFFICHÉE DANS LES STATISTIQUES (demandé le 2026-10-09).
 *
 * Une statistique de connexion (Qualité & conformité) ne concerne que les STAGIAIRES ; afficher
 * l'équipe (part bleue de la courbe, barre de récence, tuile de synthèse, « X membres de l'équipe »)
 * n'était pas pertinent. Le SERVEUR peut encore rendre `d.equipe` (statistiques-connexions le gèle) —
 * l'ÉCRAN ne la lit simplement plus. Si une part « équipe » revenait dans le rendu, ce test rougit.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const p = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Statistiques.jsx'), 'utf8');

test('la page Statistiques ne lit plus aucune donnée d\'équipe', () => {
    assert.doesNotMatch(p, /d\.equipe/, 'plus de synthèse / barre / segment lus sur d.equipe');
    assert.doesNotMatch(p, /equipe\.recence/, 'récence : plus de barre équipe');
    assert.doesNotMatch(p, /uniques_equipe/, 'résumé : plus de « membres de l\'équipe »');
    assert.doesNotMatch(p, /titre="Équipe"/, 'plus de tuile de synthèse « Équipe »');
});

test('les stats restent STAGIAIRES : synthèse, résumé et assidus filtrés', () => {
    assert.match(p, /titre="Stagiaires"/, 'la synthèse garde la tuile Stagiaires');
    assert.match(p, /\(assidus \|\| \[\]\)\.filter\(\(a\) => a\.stagiaire\)/, 'les plus assidus : stagiaires seulement');
    assert.match(p, /<b>\{s\}<\/b> stagiaire\{s > 1 \? "s" : ""\} se sont connectés/, 'le résumé ne parle plus que de stagiaires');
});
