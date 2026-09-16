/**
 * SUR QUELLE SEMAINE L'ÉCRAN S'OUVRE — et le piège des numéros ISO.
 *
 * DEMANDÉ : « par défaut la semaine courante/prochaine qui a des formations ». Avant, l'écran
 * ouvrait sur la session la plus récente au sens du serveur — qui trie par date DÉCROISSANTE,
 * donc sur la plus LOINTAINE DANS LE FUTUR. Mesuré le 2026-09-16 : il s'ouvrait sur une session
 * de novembre (S45) alors que la semaine en cours était la 38. On vient noter ce qu'on
 * enseigne, pas ce qu'on enseignera dans deux mois.
 *
 * LE PIÈGE ISO, qui ne se voit qu'une fois par an. Une semaine ISO appartient à l'année qui
 * contient son JEUDI. Le 1er janvier 2027 est un vendredi : il tombe dans la semaine 53 de
 * 2026, pas dans la semaine 1 de 2027. Utiliser `getFullYear()` ferait chercher « S53 · 2027 »,
 * une semaine qui n'existe pas — et l'écran s'ouvrirait sur la mauvaise, en silence, entre Noël
 * et le nouvel an. Les sessions étant enregistrées en année/semaine ISO, le repère doit se
 * calculer de la même façon.
 */
const test = require('node:test');
const assert = require('node:assert');

const G = (annee, semaine) => ({ cle: `${annee}-${String(semaine).padStart(2, '0')}`, annee, semaine });
/* L'ordre du serveur : date décroissante. C'est lui qui rendait « la première » si lointaine. */
const GROUPES = [G(2026, 45), G(2026, 38), G(2026, 27)];

test('LA SEMAINE ISO EST CELLE DU JEUDI', async () => {
    const { semaineISO } = await import('../../app/ui/lib/sessions.js');
    /* Les quatre bornes qui cassent tout calcul naïf. */
    assert.deepStrictEqual(semaineISO(new Date(2027, 0, 1)), { annee: 2026, semaine: 53 },
        'un vendredi 1er janvier appartient à la dernière semaine de l\'année précédente');
    assert.deepStrictEqual(semaineISO(new Date(2026, 0, 1)), { annee: 2026, semaine: 1 },
        'un jeudi 1er janvier ouvre bien la semaine 1');
    assert.deepStrictEqual(semaineISO(new Date(2023, 0, 1)), { annee: 2022, semaine: 52 },
        'un dimanche 1er janvier clôt l\'année précédente');
    assert.deepStrictEqual(semaineISO(new Date(2026, 8, 16)), { annee: 2026, semaine: 38 },
        'le jour où le défaut a été signalé');
});

test('ON OUVRE SUR LA SEMAINE EN COURS', async () => {
    const { semaineParDefaut } = await import('../../app/ui/lib/sessions.js');
    assert.strictEqual(semaineParDefaut(GROUPES, new Date(2026, 8, 16)), '2026-38',
        'et non sur la session de novembre, qui était le défaut mesuré');
});

test('SINON LA PROCHAINE — LA PLUS PROCHE, PAS LA PREMIÈRE DE LA LISTE', async () => {
    /* LE PIÈGE DE L'ORDRE. La liste est triée par date DÉCROISSANTE : « la prochaine » y est la
       DERNIÈRE des futures. Prendre la première future rendrait S45 au lieu de S38 — le défaut
       qu'on est en train de corriger, recréé par inadvertance. */
    const { semaineParDefaut } = await import('../../app/ui/lib/sessions.js');
    const juillet = new Date(2026, 6, 15); // semaine 29 : S38 et S45 sont devant
    assert.strictEqual(semaineParDefaut(GROUPES, juillet), '2026-38');
});

test('TOUT EST PASSÉ : la plus récente des écoulées, jamais une page vide', async () => {
    const { semaineParDefaut } = await import('../../app/ui/lib/sessions.js');
    const décembre = new Date(2026, 11, 20); // semaine 51 : tout est derrière
    assert.strictEqual(semaineParDefaut(GROUPES, décembre), '2026-45');
});

test('AUCUNE SESSION, OU AUCUNE DATÉE : on ne renvoie pas n\'importe quoi', async () => {
    const { semaineParDefaut } = await import('../../app/ui/lib/sessions.js');
    assert.strictEqual(semaineParDefaut([], new Date()), null);
    assert.strictEqual(semaineParDefaut(null, new Date()), null);
    /* Une session sans semaine (données anciennes) ne doit pas faire échouer le calcul : on
       retombe sur l'ordre du serveur plutôt que de comparer des `null` à des nombres. */
    const orphelines = [{ cle: 'null-null', annee: null, semaine: null }];
    assert.strictEqual(semaineParDefaut(orphelines, new Date()), 'null-null');
});

test('LE CHANGEMENT D\'ANNÉE NE FAIT PAS SAUTER L\'ÉCRAN', async () => {
    const { semaineParDefaut } = await import('../../app/ui/lib/sessions.js');
    /* 2027-01-01 est en S53 · 2026. Une session cette semaine-là doit être choisie — un calcul
       naïf aurait cherché « S53 · 2027 » et ouvert sur autre chose. */
    const g = [G(2027, 2), G(2026, 53), G(2026, 38)];
    assert.strictEqual(semaineParDefaut(g, new Date(2027, 0, 1)), '2026-53');
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
   ET LA PAGE S'EN SERT VRAIMENT.

   Les règles ci-dessus sont éprouvées dans la lib ; encore faut-il que l'écran les APPELLE.
   Trois réintroductions sont restées vertes sans ces trois assertions : remplacer le défaut de
   semaine par « la première de la liste », retirer la colonne Formation, et cesser d'attacher
   le code de formation aux lignes. Une règle juste que personne n'invoque ne sert à rien. */
const fs2 = require('fs');
const path2 = require('path');
const NOTATION = fs2.readFileSync(
    path2.join(__dirname, '..', '..', 'app', 'ui/pages/Notation.jsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('LA PAGE OUVRE SUR LA SEMAINE PAR DÉFAUT, pas sur la première venue', () => {
    assert.match(NOTATION, /setSemaine\(semaineParDefaut\(grouperParSemaine\(l\)\) \|\| ""\)/,
        'sans cet appel, l\'écran repart sur la session la plus lointaine dans le futur');
});

test('LE TABLEAU DE SEMAINE DISTINGUE LES FORMATIONS', () => {
    /* Mêler deux promotions dans un même tableau n'a de sens que si on les distingue : sans le
       badge, « DELAUNEY Paul » et « SWYNGHEDAUW Caroline » se lisent comme une seule promotion. */
    assert.match(NOTATION, /k: "formation", t: "Formation",/, 'la colonne existe');
    assert.match(NOTATION, /_code: lot\.session\.code/,
        'et le code de formation voyage avec chaque ligne, sinon la colonne serait vide');
    assert.match(NOTATION, /s\._code \? \(/, 'la cellule le lit');
});
