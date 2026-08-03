/**
 * UN AVATAR EST ROND, QUELLE QUE SOIT SA TAILLE.
 *
 * LE DÉFAUT : `.avatar` portait `flex:0 0 34px`, c'est-à-dire une `flex-basis` de 34px. Dans un
 * conteneur flex en ligne, `flex-basis` PASSE DEVANT `width` — le redimensionnement posé en style
 * inline par les écrans était donc silencieusement ignoré sur la largeur, pendant que la hauteur,
 * elle, obéissait. La fiche stagiaire demandait 44 et obtenait 34×44 ; la caisse demandait 28 et
 * obtenait 34×28. Un `border-radius:50%` sur un rectangle ne fait pas un rond, il fait une ellipse.
 *
 * CE QUI REND LE DÉFAUT DURABLE : rien ne casse. La page s'affiche, l'avatar est là, les initiales
 * sont lisibles — il est juste ovale. Trois écrans avaient d'ailleurs contourné le problème en
 * réécrivant `flex` sur place, chacun de son côté, sans que personne ne remonte à la cause. Ce
 * test gèle la cause, pas les trois symptômes.
 *
 * Il lit le CSS : la géométrie a été MESURÉE dans le navigateur (34, 44, 30, 28 et 24 pixels
 * rendus carrés), ce qu'un test de source ne peut pas faire. Ce qu'il garde, c'est la règle qui
 * l'autorise.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const css = fs.readFileSync(path.join(UI, 'styles/app.css'), 'utf8');
const regle = /^\.avatar\{[^}]*\}/m.exec(css);

test('la classe .avatar ne fixe pas de flex-basis', () => {
    assert.ok(regle, 'la règle .avatar doit rester lisible');
    assert.doesNotMatch(regle[0], /flex:\s*\d/,
        'Une `flex-basis` sur .avatar écrase la largeur inline et rend l\'avatar ovale.');
    assert.match(regle[0], /flex-shrink:\s*0/,
        'Il faut tout de même l\'empêcher de rétrécir dans une ligne serrée.');
    /* La largeur par défaut doit rester : sans base, c'est elle qui gouverne. */
    assert.match(regle[0], /width:\s*34px/, 'La taille par défaut ne change pas.');
    assert.match(regle[0], /height:\s*34px/, 'Carré par défaut, donc rond.');
});

test('aucun écran ne réécrit `flex` pour rattraper la largeur d\'un avatar', () => {
    /* Ces rustines locales marchaient, et c'est le problème : elles rendaient le défaut
       supportable écran par écran, donc invisible. Le quatrième écran l'aurait repayé. */
    const dossiers = ['pages', 'components'];
    const coupables = [];
    for (const d of dossiers) {
        for (const f of fs.readdirSync(path.join(UI, d))) {
            if (!f.endsWith('.jsx')) continue;
            const src = fs.readFileSync(path.join(UI, d, f), 'utf8');
            for (const m of src.matchAll(/className="avatar"[^>]*?style=\{\{([^}]*)\}\}/g)) {
                if (/\bflex:/.test(m[1])) coupables.push(`${d}/${f}`);
            }
        }
    }
    assert.deepStrictEqual([...new Set(coupables)], [],
        'Un avatar n\'a plus besoin de corriger son `flex` : la classe le laisse faire.');
});
