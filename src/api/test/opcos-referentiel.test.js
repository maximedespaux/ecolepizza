/**
 * La page « OPCO / financeurs » : un référentiel qu'on vient LIRE, et qui doit se chercher.
 *
 * CE QU'ON Y FAIT VRAIMENT. Dix-huit financeurs, presque jamais modifiés — on ouvre cette page
 * pour trouver un numéro, une adresse, un site. Elle n'avait pourtant AUCUNE recherche : on
 * faisait défiler et on lisait. Toutes les autres listes de l'application en ont une (Stagiaires,
 * Partenaires, Journal d'audit) ; celle-ci était la seule à s'en passer, et c'est aussi ce qui la
 * faisait dépareiller.
 *
 * LE DÉFAUT LE PLUS COÛTEUX, et le plus discret : téléphone, e-mail et site étaient concaténés
 * en UNE chaîne de texte séparée par des points médians. Sur un écran dont la raison d'être est
 * « trouver le numéro d'un financeur », on ne pouvait ni appeler, ni écrire, ni ouvrir le site —
 * il fallait sélectionner et recopier à la main.
 *
 * ET UN DÉFAUT DE CONTRASTE, MESURÉ. Une fois les liens posés, ils avaient exactement la couleur
 * du texte voisin (relevé au pixel près : même `rgb()`), donc l'air de texte inerte. Le bleu
 * disponible — `#1d6fb8`, écrit en dur dans `.partner-meta a` — tombait à 3,01:1 sur le fond
 * sombre, SOUS le seuil AA de 4,5:1 : une couleur fixe ne peut pas convenir aux deux thèmes. Le
 * jeton `--blue`, lui, bascule : 11,54:1 en clair, 6,30:1 en sombre.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..', 'app');
const srcPage = fs.readFileSync(path.join(APP, 'ui/pages/Opcos.jsx'), 'utf8');
const srcCss = fs.readFileSync(path.join(APP, 'ui/styles/app.css'), 'utf8');

test('le référentiel se cherche, comme toutes les autres listes', () => {
    // Mêmes briques que les pages voisines : une page qui se cherche autrement oblige à réapprendre.
    assert.match(srcPage, /<div className="filtres">/, 'la barre de filtres commune');
    assert.match(srcPage, /<span className="gs-search"/, 'le champ de recherche commun');
    assert.match(srcPage, /<span className="seg">/, 'le segment commun pour l\'etat');
    /* La recherche porte AUSSI sur le téléphone et l'e-mail : on arrive parfois avec un numéro
       en tête — « qui est ce financeur ? » — et pas avec un nom. Vérifié : « 01 82 » trouve
       Constructys. */
    for (const champ of ['o.name', 'o.code', 'o.town', 'o.email', 'o.phone', 'o.website']) {
        assert.ok(srcPage.includes(champ), `la recherche doit couvrir ${champ}`);
    }
});

test('les contacts sont ACTIONNABLES, pas une chaîne recopiable', () => {
    assert.match(srcPage, /href=\{`tel:\$\{String\(o\.phone\)\.replace\(\/\\s\+\/g, ""\)\}`\}/,
        'le telephone doit s\'appeler — espaces retires, sinon le lien casse');
    assert.match(srcPage, /href=\{`mailto:\$\{o\.email\}`\}/, 'l\'e-mail doit s\'ecrire');
    assert.match(srcPage, /o\.website\.startsWith\("http"\) \? o\.website : `https:\/\/\$\{o\.website\}`/,
        'le site doit s\'ouvrir, meme saisi sans protocole');
    assert.match(srcPage, /target="_blank" rel="noreferrer"/, 'et sans donner la main a l\'onglet ouvert');
    // L'ancienne concaténation ne doit pas revenir.
    assert.doesNotMatch(srcPage, /\$\{o\.phone \|\| ""\}\$\{o\.phone &&/,
        'trois donnees distinctes, trois liens — pas une chaine');
});

test('un lien de contenu se VOIT, et tient dans les deux thèmes', () => {
    /* Le sélecteur global neutralise `a` (couleur héritée, pas de soulignement) et c'est juste :
       la plupart des `<a>` sont des entrées de menu. Mais dans un tableau, un numéro cliquable
       qui ressemble à du texte inerte n'est jamais cliqué. */
    assert.match(srcCss, /\.partner-meta a,\s*\n\.dt a\{color:var\(--blue\)\}/,
        'les liens de contenu doivent porter le JETON, pas une couleur fixe');
    assert.doesNotMatch(srcCss, /\.partner-meta a\{color:#/,
        'un bleu ecrit en dur tombait a 3,01:1 sur fond sombre — sous le seuil AA');
    assert.match(srcCss, /\.dt a:hover,\.dt a:focus-visible\{text-decoration:underline\}/,
        'souligne au survol ET au focus : le clavier doit voir ce que la souris voit');
});

test('trois impasses, trois messages — jamais un conseil hors sujet', () => {
    /* « Essaie un autre terme » quand on n'en a saisi aucun fait chercher ce qu'on a mal tapé,
       alors que c'est le filtre d'état qui vide la liste. */
    assert.match(srcPage, /Aucun financeur ne correspond à « \$\{q\.trim\(\)\} »/, 'recherche infructueuse');
    assert.match(srcPage, /Aucun financeur désactivé/, 'filtre d\'etat sans resultat');
    assert.match(srcPage, /Le référentiel est vide\. Ajoute les financeurs/, 'referentiel reellement vide');
});

test('l\'état d\'un financeur se LIT, il ne se devine pas à une opacité', () => {
    /* Un OPCO désactivé était affiché à 50 % d'opacité au milieu des autres — ce qu'on peut
       prendre pour un défaut d'affichage, et qui ne se voit pas du tout en un coup d'œil. Il est
       désormais masqué par défaut, et porte son étiquette quand on demande à le voir. */
    assert.doesNotMatch(srcPage, /opacity: o\.active \? 1 : 0\.5/, 'plus d\'etat code en demi-teinte');
    assert.match(srcPage, /\{!o\.active \? <Badge tone="n">Désactivé<\/Badge> : null\}/, 'une etiquette explicite');
    assert.match(srcPage, /const \[etat, setEtat\] = useState\("actifs"\)/, 'et « actifs » par defaut');
    /* « Assiduité » occupait une colonne entière pour un tiret sur dix-sept lignes ; elle
       qualifie le financeur, elle ne mérite pas un quart de la largeur. */
    assert.doesNotMatch(srcPage, /k: "assiduite", t: "Assiduité"/, 'plus de colonne pour une exception');
    assert.match(srcPage, /o\.triggers_assiduite \? <Badge tone="a">Attestation<\/Badge>/, 'etiquette a cote du nom');
});
