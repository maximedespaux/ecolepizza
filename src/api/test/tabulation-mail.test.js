/**
 * LA TOUCHE TAB INSÈRE UNE TABULATION DANS LES ZONES DE TEXTE DU MAILING (2026-10-06).
 *
 * Demandé : dans la rédaction des e-mails, Tab doit insérer une tabulation (U+0009) au lieu de
 * changer de champ. On ne détourne que Tab SEUL (Maj+Tab reste la sortie, pour ne pas piéger le
 * clavier), et seulement si la tabulation est bien entrée (sinon on laisse Tab changer de champ).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const cheminLib = path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'tabulation.js');

test('estTabulation : vrai pour Tab seul, faux avec un modificateur ou une autre touche', async () => {
    const { estTabulation } = await import(cheminLib);
    assert.strictEqual(estTabulation({ key: 'Tab' }), true);
    assert.strictEqual(estTabulation({ key: 'Tab', shiftKey: true }), false, 'Maj+Tab sort du champ');
    assert.strictEqual(estTabulation({ key: 'Tab', ctrlKey: true }), false);
    assert.strictEqual(estTabulation({ key: 'Tab', altKey: true }), false);
    assert.strictEqual(estTabulation({ key: 'Tab', metaKey: true }), false);
    assert.strictEqual(estTabulation({ key: 'Enter' }), false);
    assert.strictEqual(estTabulation(null), false);
});

test('insererTabulation : insère \\t et retient Tab quand l\'insertion réussit', async () => {
    const { insererTabulation } = await import(cheminLib);
    let appel = null; let empeche = false;
    global.document = { execCommand: (cmd, _ui, texte) => { appel = { cmd, texte }; return true; } };
    try {
        const ok = insererTabulation({ key: 'Tab', preventDefault: () => { empeche = true; } });
        assert.strictEqual(ok, true);
        assert.deepStrictEqual(appel, { cmd: 'insertText', texte: '\t' }, 'une tabulation, via insertText (onChange suit)');
        assert.strictEqual(empeche, true, 'Tab ne change pas de champ');
    } finally { delete global.document; }
});

test('insererTabulation : si l\'insertion échoue, on NE retient PAS Tab (pas de piège clavier)', async () => {
    const { insererTabulation } = await import(cheminLib);
    let empeche = false;
    // execCommand indisponible / qui échoue : Tab doit garder son rôle de navigation.
    global.document = { execCommand: () => false };
    try {
        const ok = insererTabulation({ key: 'Tab', preventDefault: () => { empeche = true; } });
        assert.strictEqual(ok, false);
        assert.strictEqual(empeche, false, 'on laisse Tab changer de champ plutôt que d\'enfermer l\'utilisateur');
    } finally { delete global.document; }
    // Maj+Tab n'est jamais détourné.
    assert.strictEqual(insererTabulation({ key: 'Tab', shiftKey: true, preventDefault: () => { throw new Error('ne doit pas être appelé'); } }), false);
});

test('les zones de texte du Mailing câblent la tabulation', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Mailing.jsx'), 'utf8');
    assert.match(page, /import \{ insererTabulation \} from "\.\.\/lib\/tabulation\.js";/);
    // Les trois zones de rédaction : textes des e-mails automatiques, envoi groupé, règle programmée.
    assert.strictEqual((page.match(/onKeyDown=\{insererTabulation\}/g) || []).length, 3);
});
