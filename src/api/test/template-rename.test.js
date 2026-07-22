/**
 * Renommer l'identifiant (slug) d'un modèle DOIT répercuter le changement partout.
 *
 * Le slug est un identifiant référencé dans plusieurs tables (parcours program_step, réglage
 * boutique, factures, documents générés, points de rupture d'émargement) et dans du JSON
 * (company_steps, arborescences d'archivage). Le renommer sans cascade orphelinerait ces
 * références. Ces tests gèlent la présence de la cascade et les garde-fous (socle, collision).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/template.controller.js'), 'utf8');
const bloc = src.slice(src.indexOf('const renameTemplate'), src.indexOf('// Échantillon d\'aperçu'));

test('la route de renommage existe', () => {
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes/template.routes.js'), 'utf8');
    assert.match(routes, /router\.put\('\/:slug\/rename', renameTemplate\)/, 'la route PUT /:slug/rename doit être montée');
});

test('le renommage met à jour TOUTES les références connues', () => {
    // Colonnes.
    for (const cible of [
        /UPDATE document_template SET slug = \?/,
        /UPDATE program_step SET slug = \?/,
        /UPDATE shop_settings SET invoice_template_slug = \?/,
        /UPDATE invoice SET template_slug = \?/,
        /UPDATE generated_document SET template_slug = \?/,
        /emargement_break_slug = \?/,
        /company_break_slug = \?/,
    ]) assert.match(bloc, cible, `référence non mise à jour : ${cible}`);
    // JSON : company_steps + les deux arborescences d'archivage, par REPLACE du slug entre guillemets.
    for (const col of ['company_steps', 'archive_tree', 'company_archive_tree']) {
        assert.ok(bloc.includes(col), `colonne JSON ${col} non traitée`);
    }
    assert.match(bloc, /REPLACE\(\$\{col\}, \?, \?\)/, 'le slug JSON doit être remplacé par REPLACE');
});

test('garde-fous : socle non renommable, collision refusée', () => {
    assert.match(bloc, /DEFAULT_SLUGS\.has\(oldSlug\)[\s\S]{0,120}status\(422\)/, 'renommer un modèle du socle doit être refusé');
    assert.match(bloc, /DEFAULT_SLUGS\.has\(newSlug\)[\s\S]{0,120}status\(422\)/, 'un slug du socle comme cible doit être refusé');
    assert.match(bloc, /clash[\s\S]{0,120}status\(422\)/, 'un slug déjà pris doit être refusé');
});

test('la cascade est RÉSILIENTE aux tables/colonnes absentes', () => {
    // Chaque cible passe par `upd`, qui avale ER_NO_SUCH_TABLE / ER_BAD_FIELD_ERROR.
    assert.match(bloc, /ER_NO_SUCH_TABLE.*ER_BAD_FIELD_ERROR|ER_BAD_FIELD_ERROR.*ER_NO_SUCH_TABLE/,
        'les migrations non jouées ne doivent pas faire échouer le renommage');
});
