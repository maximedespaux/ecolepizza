const test = require('node:test');
const assert = require('node:assert');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const path = require('node:path');

const UI = path.join(__dirname, '../../app/ui');
function fichiers(dir) {
    return readdirSync(dir).flatMap((e) => {
        const p = path.join(dir, e);
        return statSync(p).isDirectory() ? fichiers(p) : (p.endsWith('.jsx') ? [p] : []);
    });
}
const JSX = fichiers(UI).map((p) => [path.relative(UI, p), readFileSync(p, 'utf8')]);

test('le fond d\'une modale ne la ferme pas', () => {
    /* LE DÉFAUT : un clic à côté de la fenêtre la fermait et jetait tout ce qui venait d'être
       saisi. Sur « Nouveau stagiaire », c'est une fiche entière — état civil, diplôme, projet,
       entreprise — perdue sur un geste qui ne demandait rien.

       C'était écrit CINQUANTE-QUATRE FOIS, une par fenêtre, chacune à la main. Une règle en
       cinquante-quatre exemplaires ne se change pas : elle se re-décide au cas par cas, et elle
       diverge. Elle vaut désormais partout, et ce test la tient. */
    const coupables = JSX.filter(([, s]) => /className="overlay"[^>]*onClick/.test(s)).map(([f]) => f);
    assert.deepStrictEqual(coupables, [],
        'on sort par la croix ou par le bouton d\'enregistrement, jamais par accident');
});

test('toute modale offre une croix — sans quoi on y serait enfermé', () => {
    /* LE COROLLAIRE, ET IL EST VITAL. Retirer la fermeture au fond n'est sûr QUE si chaque
       fenêtre offre une autre sortie. Les cinquante-quatre portent la croix `.modal .x` ; une
       nouvelle qui l'oublierait piégerait la personne dans un écran qu'elle ne pourrait plus
       quitter — un défaut bien pire que celui qu'on vient de corriger. */
    const sansCroix = [];
    for (const [f, s] of JSX) {
        const lignes = s.split('\n');
        lignes.forEach((l, i) => {
            if (!/className="overlay"/.test(l)) return;
            // La croix vit dans l'en-tête de la boîte, quelques lignes plus bas.
            if (!/className="x"/.test(lignes.slice(i, i + 90).join('\n'))) sansCroix.push(`${f}:${i + 1}`);
        });
    }
    assert.deepStrictEqual(sansCroix, [], 'chaque fenêtre doit offrir une sortie visible');
});
