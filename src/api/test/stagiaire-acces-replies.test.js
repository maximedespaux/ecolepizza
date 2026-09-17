/**
 * MODALE STAGIAIRE — « Niveaux / accès » en BAS, et REPLIÉS.
 *
 * Demandé le 2026-09-17. La liste des codes formation (avec ses cases « terminé ») coupait
 * « Statut & financement » de « Votre projet », au milieu de la fiche d'expression du stagiaire,
 * alors qu'elle se remplit en grande partie seule : l'inscription en session ajoute l'accès. Elle
 * passe en dernière section, dans un volet qui s'ouvre et se ferme.
 *
 * Replié ne veut pas dire muet : le résumé (combien de formations, combien de terminées) reste
 * lisible volet fermé. Sans lui, on ouvrirait chaque fiche pour savoir s'il y a quoi que ce soit
 * dedans — exactement la corvée que le repli devait épargner.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MODALE = fs.readFileSync(path.join(__dirname, '..', '..', 'app/ui/components/EditStagiaireModal.jsx'), 'utf8');
const src = MODALE.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

test('la section est la DERNIÈRE du formulaire', () => {
    const volet = src.indexOf('<details className="acces-formations">');
    assert.ok(volet > -1, 'le volet existe');
    for (const avant of ['>Statut actuel &amp; financement</h3>', '>Votre projet</h3>', '>Entreprise</h3>']) {
        assert.ok(src.indexOf(avant) > -1 && src.indexOf(avant) < volet, `${avant} doit précéder le volet`);
    }
    const finVolet = src.indexOf('</details>', volet);
    assert.ok(finVolet < src.indexOf('</form>'), 'le volet est dans le formulaire');
    assert.strictEqual(src.slice(finVolet + '</details>'.length, src.indexOf('</form>')).trim(), '',
        'rien après lui dans le formulaire');
});

test('le volet est FERMÉ par défaut', () => {
    // Pas d'attribut `open` : l'école a demandé qu'il soit caché tant qu'on ne l'ouvre pas.
    assert.doesNotMatch(src, /<details className="acces-formations"[^>]*\bopen\b/);
});

test('les cases vivent DANS le volet, et nulle part ailleurs', () => {
    const volet = src.slice(src.indexOf('<details className="acces-formations">'), src.indexOf('</details>', src.indexOf('<details className="acces-formations">')));
    assert.match(volet, /onChange=\{\(\) => toggleLevel\(code\)\}/);
    assert.match(volet, /onChange=\{\(\) => toggleFinished\(code\)\}/);
    assert.strictEqual(src.split('toggleLevel(code)').length - 1, 1, 'pas de copie restée à l\'ancienne place');
});

test('fermé, le résumé dit ce qu\'il y a dedans', () => {
    const resume = src.slice(src.indexOf('<summary className="arch-sum arch-y">'), src.indexOf('</summary>'));
    assert.match(resume, /Niveaux \/ accès, codes formation/);
    assert.match(resume, /current\.length === 0 \? "aucune formation"/);
    assert.match(resume, /nbTerminees/);
    // « Terminée » ne se compte que parmi les formations cochées.
    assert.match(src, /const nbTerminees = finished\.filter\(\(c\) => current\.includes\(c\)\)\.length;/);
});
