/**
 * LE NUMÉRO DE CERTIFICATION d'un dossier (migration 205, demandé le 2026-10-12).
 *
 * Une formation certifiante délivre un parchemin numéroté, UNIQUE par organisme. Le numéro est
 * attribué à la CLÔTURE du jury aux candidats admis (certifié / blocs acquis), en une séquence
 * SIMPLE (1, 2, 3…) qui continue la plus grande déjà posée, puis modifiable à la main. Il s'imprime
 * sur le diplôme par le jeton {Numéro de certification}.
 *
 * Ces tests gèlent les défauts qui coûteraient cher :
 *   · un candidat NON admis recevrait un numéro (un parchemin pour un ajourné) ;
 *   · la séquence RECOMMENCERAIT au lieu de continuer (deux parchemins n° 1) ;
 *   · un numéro saisi invalide (0, « 12,5 », du texte) passerait ;
 *   · le jeton se résoudrait mal, ou bloquerait un document non certifié (il doit être facultatif) ;
 *   · la clôture n'attribuerait pas / la saisie n'imposerait pas l'unicité (lu sur le contrôleur).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { DECISIONS_NUMEROTEES, prochainsNumeros, numeroSaisi } = require('../lib/numeroCertification.js');
const { resolveTokens, findMissingTokens, TOKEN_CATALOG } = require('../lib/tokens.js');

/* ─── Les règles PURES ───────────────────────────────────────────────────────────────────────── */

test('SEULS les admis (certifié / blocs acquis) ont droit à un numéro', () => {
    assert.ok(DECISIONS_NUMEROTEES.has('CERTIFIE'));
    assert.ok(DECISIONS_NUMEROTEES.has('BLOCS_ACQUIS'));
    for (const d of ['AJOURNE', 'ABSENT', 'EXCLU', 'EN_COURS']) {
        assert.ok(!DECISIONS_NUMEROTEES.has(d), `${d} ne doit PAS donner de numéro`);
    }
});

test('la séquence CONTINUE depuis le plus grand numéro déjà attribué, dans l\'ordre reçu', () => {
    // Trois dossiers admis, le dernier numéro posé dans l'organisme est 7 → 8, 9, 10.
    const out = prochainsNumeros([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 7);
    assert.deepStrictEqual(out, [{ id: 'a', numero: 8 }, { id: 'b', numero: 9 }, { id: 'c', numero: 10 }]);
});

test('le tout PREMIER certifié de l\'organisme porte le n° 1', () => {
    assert.deepStrictEqual(prochainsNumeros([{ id: 'x' }], 0), [{ id: 'x', numero: 1 }]);
    assert.deepStrictEqual(prochainsNumeros([], 0), [], 'aucun admis : rien à numéroter');
});

test('un numéro SAISI est un entier positif, ou vide pour effacer — le reste est refusé', () => {
    assert.deepStrictEqual(numeroSaisi('42'), { valeur: 42 });
    assert.deepStrictEqual(numeroSaisi(42), { valeur: 42 });
    assert.deepStrictEqual(numeroSaisi(''), { valeur: null }, 'vide = effacer');
    assert.deepStrictEqual(numeroSaisi(null), { valeur: null });
    assert.ok(numeroSaisi('0').erreur, 'zéro refusé');
    assert.ok(numeroSaisi('-3').erreur, 'négatif refusé');
    assert.ok(numeroSaisi('12,5').erreur, 'décimale refusée');
    assert.ok(numeroSaisi('12.5').erreur, 'décimale refusée');
    assert.ok(numeroSaisi('abc').erreur, 'texte refusé');
});

/* ─── Le jeton {Numéro de certification} ───────────────────────────────────────────────────────── */

test('le jeton imprime le numéro du dossier, vide s\'il n\'est pas attribué', () => {
    assert.strictEqual(resolveTokens({ formations: [{ numero_certification: 42 }] })['Numéro de certification'], '42');
    assert.strictEqual(resolveTokens({ formations: [{ numero_certification: null }] })['Numéro de certification'], '');
    assert.strictEqual(resolveTokens({ formations: [{}] })['Numéro de certification'], '', 'colonne absente (205 non jouée) → vide');
    assert.strictEqual(resolveTokens({})['Numéro de certification'], '', 'sans dossier → vide');
});

test('le jeton est FACULTATIF : un document non certifié ne se bloque pas à la génération', () => {
    /* LE DÉFAUT GELÉ : si {Numéro de certification} quittait OPTIONAL_TOKENS, un modèle de certificat
       partagé entre formations resterait « bloqué, information manquante » sur tout dossier pas
       encore certifié — alors que c'est l'état normal avant la clôture du jury. */
    const corps = '<p>Certificat n° <span data-token="Numéro de certification">x</span></p>';
    assert.deepStrictEqual(findMissingTokens([corps], { formations: [{}] }).map((m) => m.key), []);
});

test('le jeton est AU CATALOGUE, dans le groupe « Examen »', () => {
    const examen = TOKEN_CATALOG.find((g) => g.group === 'Examen');
    assert.ok((examen.tokens || []).some((t) => t.key === 'Numéro de certification'),
        'le jeton doit être proposé dans la palette, pas seulement résoluble');
});

/* ─── Les deux bouts : la clôture attribue, la saisie impose l'unicité ─────────────────────────── */

test('la CLÔTURE du jury attribue les numéros aux admis — idempotent, séquence par organisme', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/examen.controller.js'), 'utf8');
    // La clôture appelle l'attribution après avoir figé le PV.
    const bloc = src.slice(src.indexOf('const cloturerCommission'));
    assert.match(bloc.slice(0, bloc.indexOf('\n};')), /attribuerNumerosCertification\(conn, orgId, req\.params\.id, commission\.resultats\)/);
    // L'attribution ne prend que les admis, ne touche que les dossiers SANS numéro, et continue depuis MAX.
    const attr = src.slice(src.indexOf('async function attribuerNumerosCertification'));
    const corps = attr.slice(0, attr.indexOf('\n}\n'));
    assert.match(corps, /DECISIONS_NUMEROTEES\.has\(r\.decision\)/, 'seuls les admis');
    assert.match(corps, /numero_certification IS NULL/, 'on ne renumérote pas un dossier déjà numéroté');
    assert.match(corps, /MAX\(numero_certification\)/, 'la séquence continue depuis le plus grand');
    assert.match(corps, /ORDER BY l\.last_name, l\.first_name/, 'ordre stable → numéros déterministes');
});

test('la SAISIE à la main impose l\'unicité par organisme et garde le candidat dans sa session', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers/examen.controller.js'), 'utf8');
    const bloc = src.slice(src.indexOf('const setNumeroCertification'));
    const corps = bloc.slice(0, bloc.indexOf('\n};'));
    assert.match(corps, /numeroSaisi\(req\.body\.numero\)/, 'la saisie passe par la validation pure');
    assert.match(corps, /migration 205/, '503 lisible sans la migration');
    assert.match(corps, /numero_certification = \? AND id <> \?/, 'refus (409) d\'un numéro déjà attribué');
    assert.match(corps, /session_id = \? AND learner_id = \? AND organization_id = \?/, 'candidat borné à sa session et son organisme');
    // La route existe, réservée à l'administration, et reste ouverte après clôture.
    const routes = fs.readFileSync(path.join(__dirname, '..', 'routes/examen.routes.js'), 'utf8');
    assert.match(routes, /router\.put\('\/numero', authorizeRoles\(\.\.\.ADMIN_ROLES\), setNumeroCertification\)/);
});
