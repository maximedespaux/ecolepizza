/**
 * LE RÉCAPITULATIF PARTENAIRES DU TABLEAU DE BORD, et les photos d'article à la caisse.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI LES ÉCHÉANCES DE CONTRAT REMONTENT JUSQU'ICI.
 *
 * Une convention qui s'achève ne se manifeste NULLE PART : ni erreur, ni alerte, ni ligne rouge.
 * Elle cesse simplement d'exister — et le jour venu, les offres du partenaire disparaissent de la
 * boutique du stagiaire sans que personne ne comprenne pourquoi. C'est exactement le genre de
 * date qu'on ne va pas chercher, donc qu'il faut APPORTER.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const TDB = sansCommentaires(lire('pages/Dashboard.jsx'));

test('un contrat échu et un contrat proche remontent dans « À traiter »', () => {
    assert.match(TDB, /echus\.length && \{ n: echus\.length, tone: "ember", to: "\/partenaires"/,
        'Un contrat terminé doit apparaître, et en rouge : les offres ont déjà quitté la boutique.');
    assert.match(TDB, /bientot\.length && \{ n: bientot\.length, tone: "orange", to: "\/partenaires"/,
        'Une échéance proche est encore rattrapable, d\'où l\'orange.');
});

test('deux entrées visant la même page ne s\'écrasent pas', () => {
    /* LE DÉFAUT ÉVITÉ DE JUSTESSE : la liste des « à traiter » était clé sur `t.to`. Les deux
       entrées de contrat pointent toutes deux vers /partenaires — React n'en aurait affiché
       QU'UNE, en silence, et le compte de contrats terminés aurait disparu dès qu'un autre
       arrivait à échéance. Aucun message, aucune erreur : juste une ligne manquante. */
    assert.match(TDB, /<Link key=\{t\.label\}/,
        'La clé doit distinguer les entrées, pas leur destination.');
    assert.doesNotMatch(TDB, /<Link key=\{t\.to\}/);
});

test('« sans contrat » n\'est pas compté comme un problème', () => {
    /* Ne pas suivre d'échéance est un choix légitime — un fournisseur de passage, une remise sans
       convention. Les confondre avec des contrats expirés ferait apparaître vingt et un
       « problèmes » sur une page qui doit n'en signaler aucun. */
    assert.match(TDB, /sansContrat: partenaires\.length - suivis\.length/,
        'Les partenaires sans contrat doivent être comptés à part…');
    assert.match(TDB, /\.filter\(\(x\) => x\.c\.suivi\)/,
        '…et seuls les contrats SUIVIS entrer dans le calcul des échéances.');
});

test('les échéances sont triées par urgence', () => {
    /* Sur une liste non triée, le contrat qui expire demain peut se retrouver sous celui qui
       expire dans deux mois. Le récapitulatif servirait alors seulement à compter. */
    assert.match(TDB, /\.filter\(\(x\) => x\.c\.actif === false\)\s*\n?\s*\.sort\(\(a, b\) => a\.c\.jours - b\.c\.jours\)/,
        'Le plus anciennement échu d\'abord.');
    assert.match(TDB, /x\.c\.jours <= BIENTOT_JOURS\)\s*\n?\s*\.sort\(\(a, b\) => a\.c\.jours - b\.c\.jours\)/,
        'Le plus urgent d\'abord.');
});

test('le calcul des échéances ne se refait pas à chaque rendu', () => {
    /* `etatContrat` fait de l'arithmétique de dates. Recalculé dans le corps du composant, il
       repasserait sur vingt-deux partenaires à chaque frappe ailleurs sur la page. */
    assert.match(TDB, /const recapPartenaires = useMemo\(\(\) => \{/);
    assert.match(TDB, /\}, \[partenaires\]\);/, 'et ne dépendre que de la liste des partenaires');
});

test("l'annuaire ne peut pas emporter tout le tableau de bord", () => {
    /* `allSettled` et non `all` : la route des partenaires peut être fermée à un rôle. Avec
       `Promise.all`, un seul refus ferait tomber sessions, dossiers et facturation avec lui. */
    assert.match(TDB, /await Promise\.allSettled\(\[/);
    assert.match(TDB, /getPartenaires\(\),\s*\n\s*\]\);/, 'L\'annuaire doit être dans le lot toléré.');
    assert.match(TDB, /const partenairesData = val\(pa, \{ data: \[\] \}\)\.data \|\| \[\]/,
        'Et son échec doit rendre une liste vide, pas une exception.');
});

test("la photo de la caisse est un carré, pas une bande pleine largeur", () => {
    /* MESURÉ, PUIS CORRIGÉ : en `width:100%`, la vignette faisait 414 px de large pour 72 de
       haut. La grille de la caisse tient sur UNE colonne de 440 px — pas sur trois comme la
       boutique du stagiaire — et `object-fit:contain` laissait donc l'image flotter, minuscule,
       au centre d'une boîte aux lettres. Un carré fixe ne dépend pas du nombre de colonnes. */
    const css = lire('styles/app.css');
    assert.match(css, /\.pos-photo\{width:64px;height:64px/,
        'Une taille fixe, indépendante de la largeur de colonne.');
    assert.doesNotMatch(css, /\.pos-photo\{width:100%/);

    const ventes = sansCommentaires(lire('pages/Ventes.jsx'));
    assert.match(ventes, /<ImageLien src=\{it\.image_url\} className="pos-photo" fallback=\{null\} \/>/,
        'Sans image, on n\'affiche RIEN — un cadre vide aurait l\'air cassé.');
    /* Le composant DOIT être importé : le build ne signale pas une référence indéfinie, et
       React fait tomber toute la page (cf. `jsx-composants-importes.test.js`). */
    assert.match(ventes, /import ImageLien from "\.\.\/components\/ImageLien\.jsx";/);
});
