/**
 * UN STAGIAIRE RS7404 RECEVAIT LA PASTILLE « RS », JAMAIS « RS7404 ».
 *
 * LE DÉFAUT. À l'inscription, le badge posé sur le stagiaire valait
 * `COALESCE(NULLIF(p.level, ''), p.code)` : le NIVEAU de la formation primait sur son CODE. Or
 * sur les neuf formations de l'organisme, UNE SEULE renseigne `level` — RS7404, à « RS ».
 * Elle était donc la seule à ne jamais donner son code : le stagiaire recevait « RS » quand
 * tous les autres recevaient « NIV1 », « NIV1H », « NIV2 »…
 *
 * PERSONNE NE POUVAIT LE CORRIGER : `level` n'a aucun champ de saisie dans l'écran Formations.
 * La colonne est transportée par les formulaires mais jamais éditable — une donnée invisible
 * qui décidait de ce qui s'affiche.
 *
 * L'ORDRE DE PRIORITÉ ÉTAIT INVERSÉ D'UN ÉCRAN À L'AUTRE, ce qui achevait de rendre le défaut
 * incompréhensible : la carte lit `program_code || level` (le code d'abord), les pastilles de
 * la Communauté remontent au programme pour afficher `p.code`, et seule l'ATTRIBUTION faisait
 * le contraire.
 *
 * LA RÈGLE ÉTAIT ÉCRITE DEUX FOIS — inscription depuis la fiche, et inscription de groupe par
 * l'entreprise. Deux copies d'une même règle finissent par diverger : elle vit désormais dans
 * `lib/badges.js`.
 *
 * LES BADGES DÉJÀ EN BASE NE SONT PAS RÉÉCRITS. Une migration de données devrait découper une
 * colonne CSV pour y remplacer un jeton — « RS » est d'ailleurs un préfixe de « RS7404 », et un
 * REPLACE naïf produirait « RS74047404 ». On traduit à la LECTURE.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { SQL_BADGE_FORMATION, resolveurBadges, resoudreCsv } = require('../lib/badges.js');

const faux = (progs) => ({ query: async () => [progs] });

test('le badge attribué est le CODE de la formation', () => {
    assert.strictEqual(SQL_BADGE_FORMATION, 'p.code AS badge');
    assert.ok(!/level/.test(SQL_BADGE_FORMATION),
        'le niveau ne doit plus décider du badge : une seule formation en a un, et elle perdait son code');
});

test('un badge ancien, écrit sous forme de niveau, se relit comme un code', async () => {
    const resoudre = await resolveurBadges(faux([{ code: 'RS7404', level: 'RS' }, { code: 'NIV1', level: null }]), 'o1');
    assert.strictEqual(resoudre('RS'), 'RS7404');
    assert.strictEqual(resoudre('RS7404'), 'RS7404', 'un badge déjà correct ne bouge pas');
    assert.strictEqual(resoudre('NIV1'), 'NIV1');
});

test('un badge inconnu est rendu tel quel', async () => {
    /* Formation supprimée, ou étiquette posée à la main sur la fiche : mieux vaut afficher
       « ANCIEN » que rien du tout. */
    const resoudre = await resolveurBadges(faux([{ code: 'NIV1', level: null }]), 'o1');
    assert.strictEqual(resoudre('ANCIEN'), 'ANCIEN');
    assert.strictEqual(resoudre(''), '');
    assert.strictEqual(resoudre(null), '');
});

test('les deux écritures d\'une même formation fusionnent en une pastille', async () => {
    /* Un stagiaire inscrit AVANT et APRÈS le correctif porte « RS » et « RS7404 » : deux
       pastilles identiques laisseraient croire à deux formations suivies. */
    const resoudre = await resolveurBadges(faux([{ code: 'RS7404', level: 'RS' }]), 'o1');
    assert.strictEqual(resoudreCsv('RS,RS7404', resoudre), 'RS7404');
    assert.strictEqual(resoudreCsv(' RS ,, NIV1 ', resoudre), 'RS7404,NIV1', 'espaces et trous ignorés');
    assert.strictEqual(resoudreCsv('', resoudre), '');
});

test('la table des formations absente ne casse rien', async () => {
    /* Règle du projet : le code marche avant comme après une migration. */
    const casse = { query: async () => { const e = new Error('x'); e.code = 'ER_NO_SUCH_TABLE'; throw e; } };
    const resoudre = await resolveurBadges(casse, 'o1');
    assert.strictEqual(resoudre('RS'), 'RS', 'sans la table, on rend le badge tel quel');
});

/* ------------------------------------------------------------------ contrats lus au source */

const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const INSCRIPTION = lire('controllers/enrollment.controller.js');
const ENTREPRISE = lire('controllers/company.controller.js');
const STAGIAIRES = lire('controllers/learner.controller.js');

test('les deux chemins d\'inscription partagent la même règle', () => {
    for (const [nom, SRC] of [['fiche stagiaire', INSCRIPTION], ['groupe entreprise', ENTREPRISE]]) {
        assert.match(SRC, /\$\{SQL_BADGE_FORMATION\} FROM training_session s/,
            `${nom} : la règle doit venir de lib/badges.js, pas d'une copie locale`);
        assert.doesNotMatch(SRC, /COALESCE\(NULLIF\(p\.level, ''\), p\.code\) AS badge/,
            `${nom} : l'ancienne règle ne doit plus traîner`);
    }
});

test('la liste des stagiaires traduit les badges avant de les rendre', () => {
    assert.match(STAGIAIRES, /resoudreCsv\(levels, resoudre\)/,
        'sans traduction, les stagiaires inscrits avant le correctif gardent « RS » à l\'écran');
    assert.match(STAGIAIRES, /await resolveurBadges\(db\.promise\(\), req\.user\.organization_id\)/);
});
