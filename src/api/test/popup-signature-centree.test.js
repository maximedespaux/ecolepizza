/**
 * LA POPUP DE SIGNATURE NE SE CENTRAIT PAS SUR L'ÉCRAN.
 *
 * LE DÉFAUT, mesuré dans le navigateur sur l'émargement d'une session (fenêtre 1217×827, page
 * défilée de 1363 px) : le voile `.overlay` de la fenêtre de signature, pourtant
 * `position:fixed;inset:0`, ne faisait pas 1217×827 à (0,0) mais **893×528 à (291,228)**. Il
 * épousait la CARTE d'émargement. La fenêtre se centrait donc sur la carte, et selon le
 * défilement son pied — le bouton « Signer le document » — sortait du champ de vision.
 *
 * LA CAUSE est une matrice invisible. `.card` portait `animation:rise .45s var(--ease) both`, et
 * `@keyframes rise` finit sur `transform:none`. Mais une animation qui INTERPOLE une
 * transformation ne rend jamais le mot-clé : elle fige la valeur CALCULÉE. À la fin, ce n'est
 * donc pas `none` mais `matrix(1, 0, 0, 1, 0, 0)` — l'identité, rigoureusement invisible à
 * l'œil. Or toute transformation non nulle fait de l'élément le BLOC CONTENEUR de ses
 * descendants `position:fixed` : `inset:0` cesse de désigner l'écran pour désigner la carte.
 * Relevé sur la page : les 6 cartes sur 6 portaient la matrice, animation `finished`.
 *
 * `both` = `backwards` + `forwards`. Seul `backwards` sert ici — il tient l'état de départ
 * pendant le `animation-delay`, ce dont dépendent les cascades `.grid > *:nth-child(n)`.
 * `forwards` ne faisait que retenir un état final DÉJÀ identique à l'état naturel, au prix de
 * cette matrice. Vérifié après correction, même sonde : overlay 1217×827 à (0,0), fenêtre
 * centrée.
 *
 * DEUXIÈME VERROU, indépendant du premier : `SignatureModal` passe par un portail vers
 * `document.body`. `Emargement` la monte à l'intérieur d'une `<Card>`, et `.card.hover:hover`
 * translate la carte de 2 px — le survol remontant depuis la fenêtre elle-même, le défaut
 * serait revenu par intermittence, sous la souris. Sans ancêtre, plus rien à piéger.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const racine = path.join(__dirname, '..', '..', 'app/ui');
const CSS = fs.readFileSync(path.join(racine, 'styles/app.css'), 'utf8');
const SIGNATURE = fs.readFileSync(path.join(racine, 'components/SignatureModal.jsx'), 'utf8');

/* Les conteneurs susceptibles d'abriter un `position:fixed` : une carte, la fenêtre modale
   elle-même (liste déroulante, popup imbriquée), la carte de l'espace stagiaire. */
const CONTENEURS = [
    ['.card', /^\.card\{[^}]*animation:rise[^}]*\}/m],
    ['.modal', /^\.modal\{[^}]*animation:rise[^}]*\}/m],
    ['.stu-app .card', /^\.stu-app \.card\{animation:stuPop[^}]*\}/m],
];

test('aucun conteneur ne fige de transformation après son animation d\'entrée', () => {
    for (const [nom, motif] of CONTENEURS) {
        const regle = CSS.match(motif);
        assert.ok(regle, `règle ${nom} introuvable — le sélecteur a changé, vérifier le défaut à la main`);
        assert.ok(
            /\bbackwards\}/.test(regle[0]),
            `${nom} doit finir en \`backwards\` : \`both\` fige la matrice identité et fait de `
            + `l'élément le bloc conteneur des fenêtres \`position:fixed\` ouvertes depuis son `
            + `contenu. Règle lue : ${regle[0]}`
        );
        assert.ok(!/\bboth\}/.test(regle[0]), `${nom} porte encore \`both\``);
    }
});

test('les animations visées finissent bien sur l\'état naturel', () => {
    /* C'est ce qui rend `backwards` sans effet visible : l'image finale de l'animation est
       déjà ce que l'élément vaut sans elle. Si une image de fin cessait d'être neutre, passer
       de `both` à `backwards` produirait un saut — d'où ce garde-fou. */
    for (const nom of ['rise', 'stuPop']) {
        const kf = CSS.match(new RegExp(`@keyframes ${nom}\\{[^}]*\\}[^}]*\\}`));
        assert.ok(kf, `@keyframes ${nom} introuvable`);
        assert.match(kf[0], /to\{opacity:1;transform:none\}/,
            `@keyframes ${nom} doit finir sur l'état naturel (opacity:1;transform:none)`);
    }
});

test('la fenêtre de signature est rendue dans document.body, hors de tout ancêtre', () => {
    assert.match(SIGNATURE, /import \{ createPortal \} from "react-dom";/,
        'SignatureModal doit importer createPortal');
    assert.match(SIGNATURE, /return createPortal\(\s*<div className="overlay"/,
        'le rendu doit partir d\'un createPortal, pas d\'un return direct');
    assert.match(SIGNATURE, /<\/div>,\s*document\.body\s*\);/,
        'la cible du portail doit être document.body');
});
