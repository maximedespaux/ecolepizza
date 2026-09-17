/**
 * LA VILLE EN CAPITALES — stagiaires et entreprises, par TOUS les chemins d'écriture.
 *
 * Demandé le 2026-09-17 : « the name of the town always in CAPSLOCK ». Le mot qui compte est
 * « always ». La ville s'écrit par quatre chemins, et la règle du nom de famille, déjà en place,
 * montrait ce qui arrive quand on n'en couvre que certains : l'espace stagiaire l'ignorait et
 * l'ancienne saisie « en ligne » d'une entreprise aussi. Une ville en capitales sur trois
 * chemins sur quatre, ce n'est pas « toujours » — c'est un mélange qu'on ne voit plus.
 *
 * Relevé en production ce jour-là : 670 villes distinctes chez les stagiaires, 667 une fois en
 * capitales. Trois villes existaient sous deux casses, et comptaient double partout où l'on
 * regroupe par ville (carte, statistiques).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { enCapitales, capitaliser, CAPITALES_STAGIAIRE, CAPITALES_ENTREPRISE } = require('../lib/saisie.js');
const { normaliserSaisie } = require('../controllers/learner.controller.js');
const { normaliserEntreprise } = require('../controllers/company.controller.js');

const RACINE = path.join(__dirname, '..', '..', '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
/* Les commentaires sont retirés avant de chercher un code : ce fichier et ceux qu'il lit
   EXPLIQUENT l'ancienne forme, et une recherche naïve la retrouverait dans l'explication. */
const sansCommentaires = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('la règle : capitales, accents conservés, espaces retirés', () => {
    assert.strictEqual(enCapitales('  lézignan-corbières '), 'LÉZIGNAN-CORBIÈRES',
        'les accents restent — « LEZIGNAN » serait une autre graphie, pas une mise en capitales');
    assert.strictEqual(enCapitales("l'haÿ-les-roses"), "L'HAŸ-LES-ROSES");
    assert.strictEqual(enCapitales(null), null, 'null passe : « vider la ville » doit rester possible');
    assert.strictEqual(enCapitales(undefined), undefined);
});

test('la VILLE figure dans les deux listes, à côté du nom', () => {
    assert.ok(CAPITALES_STAGIAIRE.includes('town'), 'stagiaire');
    assert.ok(CAPITALES_ENTREPRISE.includes('town'), 'entreprise');
    // Les champs déjà en capitales avant la demande n'ont pas été perdus au passage.
    assert.ok(CAPITALES_STAGIAIRE.includes('last_name'));
    assert.ok(CAPITALES_ENTREPRISE.includes('representative_name'));
    // Et la raison sociale n'y est PAS : c'est un nom officiel (cf. entreprise-conventions).
    assert.ok(!CAPITALES_ENTREPRISE.includes('name'));
});

test('un champ absent reste absent — une mise à jour partielle ne vide rien', () => {
    const out = capitaliser({ phone: '0612' }, CAPITALES_STAGIAIRE);
    assert.strictEqual('town' in out, false);
    assert.strictEqual('last_name' in out, false);
});

test('chemin 1 — la fiche stagiaire tenue par l\'école', () => {
    assert.strictEqual(normaliserSaisie({ town: ' saint-gaudens ' }).town, 'SAINT-GAUDENS');
});

test('chemin 2 — la fiche entreprise', () => {
    const out = normaliserEntreprise({ town: 'tarbes', name: 'SARL Le Petit Four' });
    assert.strictEqual(out.town, 'TARBES');
    assert.strictEqual(out.name, 'SARL Le Petit Four', 'la raison sociale garde sa casse');
});

test('chemin 3 — l\'ancienne saisie « en ligne » d\'une entreprise dans la fiche stagiaire', () => {
    /* LE CHEMIN OUBLIÉ. `createLearner` et `updateLearner` acceptent toujours `company: {…}` et
       l'écrivent directement dans `company`, sans passer par `normaliserEntreprise`. Aucun écran
       ne l'envoie plus — mais la route l'accepte, et « toujours » veut dire aussi par là. */
    const out = normaliserSaisie({ company: { town: 'tarbes', representative_name: 'dupont', name: 'SARL Le Petit Four' } });
    assert.strictEqual(out.company.town, 'TARBES');
    assert.strictEqual(out.company.representative_name, 'DUPONT');
    assert.strictEqual(out.company.name, 'SARL Le Petit Four');
    // Et les deux routes lisent bien le corps NORMALISÉ, pas `req.body`.
    const src = sansCommentaires(lire('src/api/controllers/learner.controller.js'));
    for (const fn of ['const createLearner', 'const updateLearner']) {
        const bloc = src.slice(src.indexOf(fn), src.indexOf(fn) + 400);
        assert.match(bloc, /const body = normaliserSaisie\(req\.body\)/, `${fn} doit normaliser avant tout`);
    }
    assert.doesNotMatch(src, /req\.body\.company/, 'aucune lecture brute de l\'entreprise en ligne');
});

test('chemin 4 — l\'espace du stagiaire (« Mes infos »)', () => {
    /* Ce chemin n'appliquait AUCUNE convention : `clean(b.company_town)`. Un stagiaire défaisait
       en un clic la casse que l'école venait d'imposer, et son propre nom avec. */
    const src = sansCommentaires(lire('src/api/controllers/espace.controller.js'));
    const fn = src.slice(src.indexOf('const updateMyInfos'), src.indexOf('module.exports'));
    assert.match(fn, /const b = capitaliser\(req\.body \|\| \{\}, CAPITALES_STAGIAIRE\);/,
        'le nom du stagiaire suit la règle de la fiche');
    assert.match(fn, /cvals\.town = clean\(enCapitales\(b\.company_town\)\)/, 'la ville de son entreprise aussi');
    assert.doesNotMatch(fn, /clean\(b\.company_town\)/, 'plus d\'écriture brute');
    assert.doesNotMatch(fn, /req\.body\b(?! \|\| \{\}, CAPITALES_STAGIAIRE)/, 'plus aucune lecture brute du corps');
});

test('la règle vit dans un module SANS dépendance — pas de cycle de require', () => {
    /* `company.controller` importe `learner.controller`. Y loger la règle et l'importer depuis
       l'entreprise créerait un cycle : l'un des deux recevrait un module encore vide, et la
       fonction vaudrait `undefined` au premier appel — pas au chargement, où rien ne se voit. */
    assert.doesNotMatch(sansCommentaires(lire('src/api/lib/saisie.js')), /require\(/);
});

test('les quatre formulaires mettent la ville en capitales dès la frappe', () => {
    /* Le serveur le fait de toute façon ; le faire à la frappe évite que la ville change de casse
       sous les yeux de la personne au rechargement suivant — ce qui ressemble à un bug. */
    const modale = lire('src/app/ui/components/EditStagiaireModal.jsx');
    assert.match(modale, /const setVille = \(e\) => setForm\(\(p\) => \(\{ \.\.\.p, town: e\.target\.value\.toLocaleUpperCase\("fr"\) \}\)\);/);
    assert.match(modale, /<Field label="Ville" value=\{form\.town\} onChange=\{setVille\}/, 'ville du stagiaire');
    assert.match(modale, /town: e\.target\.value\.toLocaleUpperCase\("fr"\) \}\)\)\} \/>/, 'ville de la nouvelle entreprise');

    const liste = lire('src/app/ui/pages/Entreprises.jsx');
    assert.match(liste, /const EN_CAPITALES = \["representative_name", "town"\];/);
    assert.match(liste, /\[k\]: EN_CAPITALES\.includes\(k\) \? e\.target\.value\.toLocaleUpperCase\("fr"\)/);

    const fiche = lire('src/app/ui/pages/EntrepriseDetail.jsx');
    assert.match(fiche, /if \(k === "representative_name" \|\| k === "town"\) return v\.toLocaleUpperCase\("fr"\);/);

    const espace = lire('src/app/ui/components/ProfileModal.jsx');
    assert.match(espace, /k === "last_name" \|\| k === "company_town" \? e\.target\.value\.toLocaleUpperCase\("fr"\)/);
});

test('l\'exemple affiché montre le format attendu', () => {
    // « Lannemezan » en exemple sous un champ qui écrit « LANNEMEZAN » : l'exemple contredirait
    // la règle au moment même où on la découvre. Même logique que « DUPONT » pour le nom.
    for (const f of ['src/app/ui/components/EditStagiaireModal.jsx', 'src/app/ui/pages/Entreprises.jsx', 'src/app/ui/pages/EntrepriseDetail.jsx']) {
        const src = lire(f);
        assert.ok(!src.includes('"Lannemezan"'), `${f} : exemple en minuscules`);
        assert.ok(src.includes('"LANNEMEZAN"'), `${f} : exemple en capitales attendu`);
    }
});

test('la migration 162 reprend l\'existant — en comparant les OCTETS', () => {
    const dossier = path.join(RACINE, 'database/migrations');
    const aller = fs.readFileSync(path.join(dossier, '162_villes_capitales.sql'), 'utf8');
    assert.ok(fs.existsSync(path.join(dossier, '162_revert_villes_capitales.sql')), 'le revert existe');
    const sql = aller.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const table of ['learner', 'company']) {
        assert.match(sql, new RegExp(`UPDATE ${table}\\s+SET town = UPPER\\(TRIM\\(town\\)\\)`), `${table} est reprise`);
    }
    /* LE PIÈGE QUE CE TEST GARDE. Les tables sont en `utf8mb4_general_ci`, insensible à la
       casse : `town <> UPPER(town)` y est FAUX pour « Tarbes » contre « TARBES ». Écrite ainsi,
       la migration passerait sans erreur, ne modifierait AUCUNE ligne, et l'on croirait la
       reprise faite. */
    assert.strictEqual((sql.match(/CAST\(town AS BINARY\) <> CAST\(UPPER\(TRIM\(town\)\) AS BINARY\)/g) || []).length, 2);
    assert.doesNotMatch(sql, /\btown\s*<>\s*UPPER/, 'aucune comparaison soumise à la collation');
    assert.doesNotMatch(aller, /^\s*--/m, 'commentaires en blocs (CLAUDE.md § 2.1)');
});
