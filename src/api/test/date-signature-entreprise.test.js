/**
 * {Date de signature de l'entreprise} — la date où le REPRÉSENTANT a signé (demandé le 2026-09-24).
 *
 * Un document co-signé par l'entreprise (convention, contrat financé par l'employeur) porte souvent
 * « Fait à …, le ___ » au-dessus du cachet. Ce ___ est la date où l'ENTREPRISE a signé, pas le
 * stagiaire : deux signataires, deux dates. Le représentant signe dans le cadre `representant`
 * (document_signature), donc sa date vient de `ctx.slotSignatures.representant.date` — surtout pas
 * de la signature « principale » du document (le stagiaire), qui sert déjà {Date signature}.
 */
const test = require('node:test');
const assert = require('node:assert');
const { resolveTokens, frDate, TOKEN_CATALOG, OPTIONAL_TOKENS } = require('../lib/tokens.js');

test('la date vient du cadre `representant`, jamais de la signature du stagiaire', () => {
    const quandEntreprise = new Date('2026-07-06T10:00:00');
    const quandStagiaire = new Date('2026-01-02T10:00:00');
    const v = resolveTokens({
        signature: { date: quandStagiaire, name: 'Jean Dupont' },
        slotSignatures: { representant: { date: quandEntreprise, name: 'Pizza Napoli' } },
    });
    assert.strictEqual(v['Date signature entreprise'], frDate(quandEntreprise));
    /* Elle NE se confond PAS avec la date de signature du stagiaire (le défaut à éviter). */
    assert.strictEqual(v['Date signature'], frDate(quandStagiaire));
    assert.notStrictEqual(v['Date signature entreprise'], v['Date signature']);
});

test('vide tant que l\'entreprise n\'a pas signé — et jamais comptée « manquante »', () => {
    const v = resolveTokens({ signature: { date: new Date('2026-01-02T10:00:00') } });
    assert.strictEqual(v['Date signature entreprise'], '');
    /* Un document que l'entreprise n'a pas encore signé n'est pas « incomplet » à cause de ce jeton. */
    assert.ok(OPTIONAL_TOKENS.has('Date signature entreprise'));
});

test('le jeton est proposé dans la palette, avec les autres champs de l\'entreprise', () => {
    const grp = TOKEN_CATALOG.find((g) => g.group === 'Entreprise');
    assert.ok(grp && grp.tokens.some((t) => t.key === 'Date signature entreprise'),
        'le groupe Entreprise offre la date de signature de l\'entreprise');
});
