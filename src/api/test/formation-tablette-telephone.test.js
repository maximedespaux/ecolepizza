/**
 * « MODIFIER LA FORMATION » SUR TABLETTE ET TÉLÉPHONE — ce que l'école a signalé le 2026-09-17,
 * mesuré dans le navigateur avant d'être corrigé.
 *
 * 1. LA FENÊTRE SORTAIT DE L'ÉCRAN : 840 px de large sur une tablette de 768 px, 506 à 840 px sur
 *    un téléphone de 375 px. Le voile est une grille dont la piste implicite se dimensionne sur le
 *    CONTENU ; un contenu large suffisait à la pousser jusqu'au `max-width` de la fenêtre.
 * 2. LE PARCOURS FAISAIT 2 635 PX DE LARGE : seize jalons en rangée, deux visibles sur un téléphone.
 * 3. CHAQUE ÉTAPE ÉTAIT UNE TUILE CARRÉE : la classe `.pf-opt` servait aussi au sélecteur d'avatar,
 *    dont les règles, déclarées plus loin, gagnaient.
 * 4. Une infobulle INVISIBLE débordait et donnait au formulaire une barre de défilement horizontale.
 * 5. Les onglets se repliaient sur trois lignes ; une fois rendus défilants, la barre s'écrasait à
 *    quinze pixels dans la colonne flexible de la fenêtre (vu à l'aperçu, corrigé avant livraison).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app/ui');
const CSS = fs.readFileSync(path.join(UI, 'styles/app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const PAGE = fs.readFileSync(path.join(UI, 'pages/Formations.jsx'), 'utf8');

/** Le corps d'une règle (ou d'un bloc @media) à partir de son sélecteur exact. */
function bloc(debut) {
    const i = CSS.indexOf(debut);
    assert.ok(i > -1, `règle introuvable : ${debut}`);
    let prof = 0;
    for (let j = CSS.indexOf('{', i); j < CSS.length; j++) {
        if (CSS[j] === '{') prof++;
        else if (CSS[j] === '}' && --prof === 0) return CSS.slice(i, j + 1);
    }
    throw new Error(`règle non refermée : ${debut}`);
}

test('1 — le voile borne sa piste : une fenêtre ne dépasse jamais l\'écran', () => {
    assert.match(bloc('.overlay{position:fixed'), /grid-template-columns:minmax\(0,1fr\)/);
});

test('2 — le parcours passe en colonne sur écran étroit ou tactile', () => {
    const media = bloc('@media (max-width:820px), (pointer:coarse){');
    assert.match(media, /\.parcours\.compact \.parcours-flow\{flex-direction:column;/);
    assert.match(media, /\.parcours\.compact \.pf-node\{min-width:0;max-width:none;/, 'les cartes prennent la largeur');
    assert.match(media, /rotate\(90deg\)/, 'les flèches pointent vers le bas');
});

test('2 bis — au doigt, la poignée et la croix sont des cibles qu\'on ne rate pas', () => {
    const media = bloc('@media (pointer:coarse){\n  .parcours.compact .pf-grip');
    assert.match(media, /\.pf-grip\{[^}]*width:40px;height:40px/);
    assert.match(media, /\.pf-x\{min-width:36px;min-height:36px/);
});

test('3 — plus de collision de classe entre le parcours et le sélecteur d\'avatar', () => {
    assert.doesNotMatch(PAGE, /pf-opt\b/, 'le parcours n\'emploie plus le nom du sélecteur d\'avatar');
    assert.strictEqual(PAGE.split('className="pf-variante"').length - 1, 2, 'les deux flux (dossier, entreprise)');
    // `.pf-opt` ne se définit plus qu'une fois : pour les pastilles d'avatar.
    assert.strictEqual((CSS.match(/(^|\n)\.pf-opt\{/g) || []).length, 1);
    assert.match(bloc('.pf-opt{'), /aspect-ratio:1/, 'et c\'est bien celle du sélecteur d\'avatar');
    assert.doesNotMatch(bloc('.pf-variante{'), /aspect-ratio/);
});

test('4 — une infobulle cachée n\'occupe plus de place', () => {
    assert.match(bloc('.help-dot .tip{'), /display:none/);
    assert.doesNotMatch(bloc('.help-dot .tip{'), /visibility:hidden/,
        '`visibility` cache sans retirer : la bulle débordait toujours');
    assert.match(CSS, /\.help-dot\.open \.tip\{display:block\}/);
});

test('5 — les onglets de la fenêtre défilent, sans s\'écraser', () => {
    assert.match(PAGE, /<div className="tabs tabs-defilantes" role="tablist">/);
    const barre = bloc('.tabs.tabs-defilantes{');
    assert.match(barre, /flex:none/, 'sans lui la barre tombe à quinze pixels dans la colonne de la fenêtre');
    assert.match(barre, /overflow-x:auto/);
    assert.match(bloc('.tabs.tabs-defilantes .tab{'), /white-space:nowrap/);
});

test('l\'aperçu de l\'arborescence passe sous l\'éditeur sur écran étroit', () => {
    /* L'éditeur vit depuis le 2026-09-24 dans la fenêtre de l'arborescence COMMUNE (une pour toutes
       les formations) ; l'onglet de la formation n'en montre plus que l'aperçu. La mise en page, elle,
       n'a pas changé de règle. */
    const COMMUNE = fs.readFileSync(path.join(UI, 'components/ArborescenceCommune.jsx'), 'utf8');
    assert.match(COMMUNE, /<div className="fm-archives">/);
    assert.match(bloc('@media (max-width:640px){\n  .fm-archives'), /\.fm-archives\{grid-template-columns:minmax\(0,1fr\)\}/);
});
