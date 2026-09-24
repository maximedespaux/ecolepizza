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
    assert.match(page, /\{ id: "emargement", label: "Émargement, ma présence", n: emargAFaire \}/);
    /* Le contenu de chaque onglet ne se rend que quand il est actif. */
    assert.match(page, /\{data && onglet === "parcours" && \(/);
    assert.match(page, /\{data && onglet === "emargement" && \(\(\) => \{/);
});

test('la pastille compte ce qui attend une action, par onglet', () => {
    /* Parcours : à fournir (todo) ou à renvoyer (refused) — même règle que « en cours ». */
    assert.match(page, /const parcoursAFaire = etapes\.filter\(\(e\) => e\.etat === "todo" \|\| e\.etat === "refused"\)\.length;/);
    /* Émargement : signable MAINTENANT — ni signé, ni à venir, ni verrouillé. Verrouillé → 0,
       parce que les documents à signer d'abord sont déjà comptés côté parcours. */
    assert.match(page, /const emargAFaire = emgGate\.locked \? 0/);
    assert.match(page, /\.filter\(\(r\) => !r\.signed && r\.date <= \(data\?\.today \|\| ""\)\)\.length/);
    /* La pastille ne s'affiche qu'au-delà de zéro : un onglet sans rien à faire n'en porte pas. */
    assert.match(page, /\{t\.n > 0 && <span className="tab-bulle"/);
    /* La bulle a un libellé accessible : un simple nombre ne dit rien à qui l'écoute. */
    assert.match(page, /aria-label=\{`\$\{t\.n\} à traiter`\}/);
});
