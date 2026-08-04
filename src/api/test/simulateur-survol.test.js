/**
 * « FAIS TA PIZZA » : L'OR NE VEUT PLUS DIRE QUE LES ÉTOILES.
 *
 * Survoler une farine non choisie — « Tipo 00 » — en bordait le contour d'OR. Or dans ce jeu,
 * l'or a déjà un sens : c'est la couleur des étoiles du verdict (`.sim-stars span.on`), et plus
 * largement, dans Pizza Quest, celle de ce qui est ACQUIS (les étoiles d'un chapitre, un
 * chapitre partiellement réussi, le record d'un mini-jeu). Une pastille non choisie prenait donc
 * au passage de la souris l'apparence de quelque chose de gagné.
 *
 * ⚠ ET CE N'ÉTAIT PAS UNE ANOMALIE — c'est ce que la mesure a montré, contre mon intuition
 * première. Le survol en or est la CONVENTION de l'application : quatorze règles l'emploient
 * (cartes boutique, jours de calendrier, onglets, pastilles de variantes…). Là-bas il n'entre en
 * collision avec rien, et il n'a pas été touché. La correction s'arrête à ce mini-jeu, où l'or
 * dirait deux choses dans le même écran.
 *
 * CE QUE CE TEST NE PEUT PAS VOIR : le rendu. Les trois états ont été mesurés au navigateur, avec
 * une vraie souris — repos gris neutre, survol braise éclaircie, choisi braise pleine et fond
 * teinté. Ce qu'il garde, ce sont les règles qui l'autorisent.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');
/* Le sélecteur est ÉCHAPPÉ avant d'entrer dans une expression régulière : `.sim-pill:hover:not(.on)`
   contient des parenthèses et des points, qu'une simple concaténation transformait en motif —
   la règle n'était alors jamais trouvée, et le test échouait sans que le CSS ait tort. */
const regle = (sel) => {
    const motif = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m = new RegExp(`${motif}\\{([^}]*)\\}`).exec(css);
    assert.ok(m, `règle ${sel} introuvable`);
    return m[1];
};

test('aucun survol de ce jeu n\'emprunte l\'or', () => {
    const dorees = [...css.matchAll(/^\.(sim-[a-z-]*):hover[^{]*\{([^}]*)\}/gm)]
        .filter((m) => /--gold/.test(m[2])).map((m) => m[1]);
    assert.deepStrictEqual(dorees, [],
        `survol(s) en or dans « Fais ta pizza » : ${dorees.join(', ')} — l'or y désigne les étoiles.`);
});

test('l\'or reste la couleur des étoiles, ici et nulle part ailleurs dans le jeu', () => {
    assert.match(css, /\.sim-stars span\.on\{color:var\(--gold\)\}/,
        'Les étoiles du verdict gardent l\'or : c\'est lui qui donne son sens à tout le reste.');
});

test('le survol ne ressemble à aucun des deux autres états', () => {
    const survol = regle('.sim-pill:hover:not(.on)');
    const choisi = regle('.sim-pill.on');
    /* DEUX ESSAIS RATÉS AVANT CELUI-CI, en sens inverse l'un de l'autre :
        · l'OR — la couleur qui, dans Pizza Quest, veut dire « acquis » (les étoiles, un record) ;
        · la BRAISE ÉCLAIRCIE — pire en fait, car c'est la couleur du CHOIX en plus pâle :
          survoler faisait apparaître une seconde pastille « à demi choisie » à côté de la vraie,
          et l'œil ne savait plus laquelle était retenue.
       D'où un survol SANS COULEUR DE SENS : un contour plus marqué que le repos, sur l'aplat
       gris qui dit partout ailleurs « le pointeur est ici ». La braise reste au choix, et à lui
       seul — c'est ce que la dernière assertion garde. */
    assert.match(survol, /border-color:var\(--dim\)/, 'un contour neutre, simplement plus marqué');
    assert.match(survol, /background:var\(--surface2\)/, 'l\'aplat gris du survol');
    assert.doesNotMatch(survol, /ember|gold/, 'ni la couleur du choix, ni celle de la réussite');
    assert.match(choisi, /border-color:var\(--ember1\)/, 'la braise reste au choix');
});

test('`:not(.on)` est explicite, et ne compte pas sur l\'ordre des règles', () => {
    /* Les deux sélecteurs ont la MÊME spécificité : sans `:not(.on)`, seul l'ordre dans la
       feuille fait gagner le choix sur le survol, et un simple déplacement l'inverserait. Ce
       piège s'est refermé le même jour sur `.pq-mini-e`, dont l'override téléphone était placé
       avant sa règle de base et perdait en silence. */
    assert.match(css, /\.sim-pill:hover:not\(\.on\)\{/,
        'Le survol doit s\'exclure lui-même de la pastille choisie.');
});
