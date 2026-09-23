/**
 * COMBIEN DE PERSONNES L'ENTREPRISE ENVOIE — {Nombre stagiaires} (demandé le 2026-09-23).
 *
 * LA CONVENTION L'ÉCRIT EN TOUTES LETTRES : « la société inscrit 3 salariés à la formation ».
 * Jusqu'ici il fallait compter les lignes de {Stagiaires} à la main, puis retaper le chiffre —
 * deux sources pour un même fait, et la seconde ne bougeait pas quand quelqu'un s'ajoutait à la
 * session. Le document se rend à chaque ouverture : le nombre y est maintenant recalculé.
 *
 * CE QUE CES TESTS GÈLENT :
 *   · le nombre vient de la MÊME liste que {Stagiaires} — pas d'un second comptage ;
 *   · il est VIDE, et non « 0 », hors d'un document d'entreprise ;
 *   · il est FACULTATIF à la génération, comme la liste : un modèle qui le porte reste
 *     imprimable pour un stagiaire seul ;
 *   · il est DANS LA PALETTE. Le catalogue ne suffit pas : un jeton absent de la palette se
 *     résout si on le tape et reste introuvable dans l'éditeur — défaut déjà payé deux fois.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const { TOKEN_CATALOG, resolveTokens, OPTIONAL_TOKENS, findMissingTokens } = require('../lib/tokens.js');

const groupe = (n) => Array.from({ length: n }, (_, i) => ({
    civility: i % 2 ? 'Mme' : 'M.', first_name: `P${i}`, last_name: `NOM${i}`,
}));
const base = { org: {}, learner: {}, company: {}, formations: [] };

test('le nombre est celui de la liste, et il suit les inscriptions', () => {
    for (const n of [1, 3, 12]) {
        const v = resolveTokens({ ...base, groupStagiaires: groupe(n) });
        assert.strictEqual(v['Nombre stagiaires'], String(n));
        /* LA MÊME SOURCE QUE LA LISTE : le nombre doit valoir les lignes imprimées juste à côté. */
        assert.strictEqual(v.Stagiaires.split('<br>').length, n);
    }
});

test('hors d\'un groupe d\'entreprise, il est VIDE et non « 0 »', () => {
    /* « 0 stagiaire » sur une convention individuelle se lirait comme une erreur ; la question
       ne se pose simplement pas. */
    assert.strictEqual(resolveTokens(base)['Nombre stagiaires'], '');
    assert.strictEqual(resolveTokens({ ...base, groupStagiaires: [] })['Nombre stagiaires'], '');

    /* ET IL NE BLOQUE PAS LA GÉNÉRATION : un modèle d'entreprise employé pour un stagiaire seul
       doit rester imprimable — comme {Stagiaires}, dont il partage le sort. */
    assert.ok(OPTIONAL_TOKENS.has('Nombre stagiaires'));
    assert.deepStrictEqual(findMissingTokens(['<p>{Nombre stagiaires} stagiaire(s)</p>'], {}), []);
});

test('il est proposé dans la palette, pas seulement au catalogue', () => {
    /* LA PALETTE N'EST PAS LE CATALOGUE. Un jeton ajouté au seul catalogue se résout quand on le
       tape et n'apparaît nulle part dans l'éditeur : c'est le défaut mesuré sur l'évaluation
       pratique, puis sur l'examen — resté invisible des mois. */
    const ctrl = fs.readFileSync(path.join(API, 'controllers/template.controller.js'), 'utf8');
    assert.match(ctrl, /const tokens = \['Stagiaires', 'Nombre stagiaires'\]/);
    const cat = TOKEN_CATALOG.find((g) => g.group === 'Entreprise').tokens.find((t) => t.key === 'Nombre stagiaires');
    assert.ok(cat, 'et il est au catalogue, avec son exemple');
    assert.strictEqual(cat.sample, '3');
    assert.match(cat.desc || '', /stagiaire\(s\)/, 'l’explication prévient que l’accord reste au modèle');
});
