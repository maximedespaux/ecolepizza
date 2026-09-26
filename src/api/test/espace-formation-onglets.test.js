/**
 * L'ESPACE STAGIAIRE SÉPARE PARCOURS ET ÉMARGEMENT EN ONGLETS (demandé le 2026-09-24), chacun avec
 * une pastille qui dit ce qui attend une action — documents à fournir/signer d'un côté,
 * demi-journées à émarger de l'autre — sans avoir à ouvrir l'onglet.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const page = fs.readFileSync(
    path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'StudentFormationDetail.jsx'), 'utf8');

test('deux onglets, parcours par défaut, contenu commuté', () => {
    assert.match(page, /const \[onglet, setOnglet\] = useState\("parcours"\)/);
    /* Les deux intitulés, dans une barre d'onglets standard (.tabs/.tab). */
    assert.match(page, /\{ id: "parcours", label: "Mon parcours", n: parcoursAFaire \}/);
    /* Le second intitulé se raccourcit en « Émargement » sur mobile : le suffixe « , ma présence »
       vit dans un <span class="tab-suite"> que le CSS masque sous le point de rupture. */
    assert.match(page, /label: <>Émargement<span className="tab-suite">, ma présence<\/span><\/>, n: emargAFaire/);
    /* Le libellé complet vit toujours dans le DOM (le <span> est inline) — le CSS ne fait que le
       masquer sur mobile —, mais dans la SOURCE il est coupé par le <span> : on vérifie donc le
       suffixe et son enveloppe, pas la chaîne contiguë. */
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');
    assert.match(css, /@media \(max-width:560px\)\{ \.tab-suite\{display:none\} \}/, 'le suffixe est masqué sur mobile');
    /* Le contenu de chaque onglet ne se rend que quand il est actif. */
    assert.match(page, /\{data && onglet === "parcours" && \(/);
    assert.match(page, /\{data && onglet === "emargement" && \(\(\) => \{/);
});

test('la pastille compte ce qui attend une action, par onglet', () => {
    /* Parcours : à fournir (todo) ou à renvoyer (refused) — même règle que « en cours ». */
    assert.match(page, /const parcoursAFaire = etapes\.filter\(\(e\) => e\.etat === "todo" \|\| e\.etat === "refused"\)\.length;/);
    /* Émargement : signable MAINTENANT — ni signé, ni à venir, ni verrouillé. Verrouillé → 0,
       parce que les documents à signer d'abord sont déjà comptés côté parcours. Depuis le
       2026-09-26, « maintenant » est la fenêtre du serveur (lib/emargementEtat.js) : une
       demi-journée passée n'est plus signable par le stagiaire, elle ne compte donc plus. */
    assert.match(page, /const emargAFaire = emgGate\.locked \? 0/);
    assert.match(page, /\.filter\(\(r\) => aSignerMaintenant\(r, data\?\.today \|\| ""\)\)\.length/);
    /* La pastille ne s'affiche qu'au-delà de zéro : un onglet sans rien à faire n'en porte pas. */
    assert.match(page, /\{t\.n > 0 && <span className="tab-bulle"/);
    /* La bulle a un libellé accessible : un simple nombre ne dit rien à qui l'écoute. */
    assert.match(page, /aria-label=\{`\$\{t\.n\} à traiter`\}/);
});
