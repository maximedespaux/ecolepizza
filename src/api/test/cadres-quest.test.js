/**
 * Les cadres de Pizza Quest : la progression du jeu, portée sur l'avatar.
 *
 * CE QUI MANQUAIT. Les cadres récompensaient les formations RÉELLEMENT TERMINÉES — Bronze à
 * une, Maestro à huit. C'est un rythme d'années. Entre deux formations, un stagiaire qui revient
 * jouer tous les jours et boucle ses chapitres ne voyait rien changer : Pizza Quest ne laissait
 * aucune trace hors de Pizza Quest, alors que c'est le seul endroit où il revient de lui-même.
 *
 * TROIS PALIERS PAR FORMATION (moitié · bouclé · sans faute), À LA COULEUR DE CETTE FORMATION.
 * Un « Sans faute » n'existe pas dans l'absolu : il est sans faute SUR quelque chose, et sa
 * teinte le dit. C'est ce qui distingue deux stagiaires du même palier.
 *
 * LES DÉFAUTS GELÉS ICI, dans l'ordre où ils se seraient produits :
 *   · une formation SANS CHAPITRE (banque de questions vide) validait « tous les chapitres à 3
 *     étoiles » — zéro sur zéro est vrai — et distribuait le palier le plus rare à qui n'avait
 *     jamais joué ;
 *   · la moitié arrondie VERS LE BAS fêtait le palier avant qu'il ne soit franchi (2 chapitres
 *     sur 5) ;
 *   · la couleur ne faisait pas partie de la possession : un stagiaire « Sans faute » sur la
 *     formation bleue pouvait porter le rouge d'une formation jamais ouverte — un cadre qui dit
 *     quelque chose de faux, ce qui est pire que de ne rien dire ;
 *   · la règle est ÉCRITE DEUX FOIS (serveur pour la possession, client pour fêter à l'instant
 *     du clic sans aller-retour). Les deux copies sont épinglées ici : les faire diverger casse
 *     le test, pas l'écran.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { palierDuMonde, cadresQuest, possedeCadreQuest, parseCadre, couleurFormation, PALIER_IDS, PALETTE } = require('../lib/cadresQuest.js');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcClient = fs.readFileSync(path.join(APP, 'ui/lib/questPaliers.js'), 'utf8');
const srcServeur = fs.readFileSync(path.join(API, 'lib/cadresQuest.js'), 'utf8');
const srcEspace = fs.readFileSync(path.join(API, 'controllers/espace.controller.js'), 'utf8');
const srcCadres = fs.readFileSync(path.join(APP, 'ui/lib/cadres.js'), 'utf8');
const srcCss = fs.readFileSync(path.join(APP, 'ui/styles/app.css'), 'utf8');
const srcQuest = fs.readFileSync(path.join(APP, 'ui/pages/PizzaQuest.jsx'), 'utf8');

const etoiles = (liste) => Object.fromEntries(liste.map((n, i) => [i, n]));

test('une banque VIDE ne donne aucun cadre', () => {
    /* LE PREMIER DÉFAUT, et le plus vicieux : « tous les chapitres à 3 étoiles » est VRAI sur
       zéro chapitre. Le palier le plus rare serait tombé dans l'escarcelle de tout stagiaire
       ouvrant une formation dont l'école n'a pas encore écrit les questions. */
    assert.strictEqual(palierDuMonde({}, 0), null);
    assert.strictEqual(palierDuMonde(etoiles([3, 3]), 0), null, 'meme avec de la progression fantome');
    assert.deepStrictEqual(cadresQuest({ NIV1: { 0: 3 } }, [{ code: 'NIV1', color: '#111111', chapitres: 0 }]), []);
});

test('la moitié s\'arrondit VERS LE HAUT', () => {
    // Sur 5 chapitres, la moitié c'est 3. Fêter à 2 annoncerait un palier non franchi — et le
    // mot « moitié » perdrait son sens à la première vérification du stagiaire.
    assert.strictEqual(palierDuMonde(etoiles([1, 1]), 5), null, '2 sur 5 : pas encore');
    assert.strictEqual(palierDuMonde(etoiles([1, 1, 1]), 5), 'qdemi', '3 sur 5 : franchi');
    // Nombre pair : 2 sur 4, sans ambiguïté.
    assert.strictEqual(palierDuMonde(etoiles([1, 1]), 4), 'qdemi');
});

test('bouclé puis sans faute, et on ne garde que le meilleur', () => {
    assert.strictEqual(palierDuMonde(etoiles([1, 2, 1]), 3), 'qfini', 'tous faits, etoiles quelconques');
    assert.strictEqual(palierDuMonde(etoiles([3, 3, 3]), 3), 'qparfait');
    /* Un chapitre à 0 étoile n'est PAS terminé. Le jeu n'enregistre que 1 à 3 (il faut la
       moitié des bonnes réponses pour valider un chapitre), mais une donnée à 0 — venue d'une
       vieille version ou d'une écriture partielle — ne doit pas compter pour un chapitre fait,
       sans quoi « Monde bouclé » tomberait sur un monde à moitié joué. */
    assert.strictEqual(palierDuMonde(etoiles([3, 0, 3]), 3), 'qdemi', '2 chapitres reellement faits sur 3');
    assert.strictEqual(palierDuMonde(etoiles([3, 0, 3, 0]), 4), 'qdemi', 'et jamais « boucle »');
});

test('le cadre prend la COULEUR de la formation', () => {
    const [c] = cadresQuest({ NIV1: etoiles([3, 3]) }, [{ code: 'NIV1', title: 'Niveau I', color: '#0e9aa7', chapitres: 2 }]);
    assert.strictEqual(c.valeur, 'qparfait|#0e9aa7', 'palier ET teinte, sur la forme des avatars');
    assert.strictEqual(c.title, 'Niveau I');
    // Formation sans couleur : un anneau transparent serait une récompense invisible.
    const [d] = cadresQuest({ X: etoiles([1, 1]) }, [{ code: 'X', color: null, chapitres: 2 }]);
    assert.match(d.valeur, /^qfini\|#[0-9a-f]{6}$/, 'repli sur une couleur reelle');
});

test('LA COULEUR DU MONDE, pas une couleur de repli', () => {
    /* MESURÉ SUR LA BASE RÉELLE, et c'est ce qui a sauvé la fonctionnalité : sur six formations,
       QUATRE ont `color = NULL`. La première version se contentait de la colonne et retombait sur
       un rouge unique — presque tous les cadres seraient sortis de la même couleur, et « la
       couleur de ta formation » n'aurait rien voulu dire.
       Le jeu ne s'est jamais contenté de la colonne : il retombe sur `colorOf`. Le cadre reprend
       la même table, et le même hachage pour un code non répertorié. */
    assert.strictEqual(couleurFormation('NIV1', null), '#1e3a8a', 'la palette, comme dans le jeu');
    assert.strictEqual(couleurFormation('NIV2', null), '#eab308');
    assert.strictEqual(couleurFormation('NIV1H', '#47cfeb'), '#47cfeb', 'la colonne prime quand elle existe');
    /* Les valeurs de hachage sont RELEVÉES DANS LE NAVIGATEUR : `hashColor` produit une chaîne
       `hsl(...)` que seul le moteur CSS sait résoudre. On a demandé au navigateur de résoudre
       `hsl(354,52%,42%)` (NIVEXP) et `hsl(297,52%,42%)` (XYZ) — la conversion serveur tombe au
       bit près. Ce test est ce qui empêche les deux de dériver. */
    assert.strictEqual(couleurFormation('NIVEXP', null), '#a3333f', 'hsl(354,52%,42%) resolu par Chrome');
    assert.strictEqual(couleurFormation('XYZ', null), '#9d33a3', 'hsl(297,52%,42%)');

    // Et la table elle-même doit rester celle du client, entrée par entrée.
    const srcLevels = fs.readFileSync(path.join(APP, 'ui/lib/levels.js'), 'utf8');
    const bloc = /const PALETTE = \{([\s\S]*?)\n\};/.exec(srcLevels)[1];
    const duClient = Object.fromEntries([...bloc.matchAll(/([A-Z0-9_]+):\s*"(#[0-9a-f]{6})"/g)].map((m) => [m[1], m[2]]));
    assert.deepStrictEqual(PALETTE, duClient, 'les deux palettes doivent rester identiques');
});

test('la couleur fait partie de la POSSESSION', () => {
    const possedes = cadresQuest({ NIV1: etoiles([3, 3]) }, [{ code: 'NIV1', color: '#0e9aa7', chapitres: 2 }]);
    assert.ok(possedeCadreQuest('qparfait|#0e9aa7', possedes));
    /* LE DÉFAUT : sans ce contrôle, « Sans faute » repeint aux couleurs d'une formation jamais
       ouverte passait — le cadre affirmait alors quelque chose de faux. */
    assert.ok(!possedeCadreQuest('qparfait|#dc3e37', possedes), 'pas la couleur d\'un autre monde');
    assert.ok(!possedeCadreQuest('qparfait', possedes), 'ni sans couleur du tout');
    assert.ok(!possedeCadreQuest('maestro|#0e9aa7', possedes), 'ni un palier qui n\'en est pas un');
    // La casse de l'hexadécimal ne doit pas décider d'une possession.
    assert.ok(possedeCadreQuest('qparfait|#0E9AA7', possedes));
});

test('la forme « palier|#rrggbb » se relit, et refuse le reste', () => {
    assert.deepStrictEqual(parseCadre('qdemi|#abcdef'), { id: 'qdemi', couleur: '#abcdef' });
    assert.deepStrictEqual(parseCadre('maestro'), { id: 'maestro', couleur: null });
    assert.deepStrictEqual(parseCadre('qdemi|rouge'), { id: 'qdemi', couleur: null }, 'pas un hexa : pas de couleur');
    assert.deepStrictEqual(parseCadre(null), { id: null, couleur: null });
});

test('LA MÊME RÈGLE des deux côtés', () => {
    /* Elle est écrite deux fois, et c'est assumé : le serveur décide de la possession, le client
       recalcule pour fêter à l'INSTANT du clic — un aller-retour ferait arriver la fête après
       que le stagiaire a refermé la fenêtre. Ce test est le lien entre les deux copies. */
    for (const src of [srcClient, srcServeur]) {
        assert.match(src, /if \(!nbChapitres\) return null;/, 'le garde-fou de la banque vide');
        assert.match(src, /if \(parfaits >= nbChapitres\) return 'qparfait';|if \(parfaits >= nbChapitres\) return "qparfait";/);
        assert.match(src, /Math\.ceil\(nbChapitres \/ 2\)/, 'la moitie arrondie vers le haut');
    }
    // Et les trois identifiants doivent être les mêmes, sinon un cadre gagné serait inconnu.
    for (const id of PALIER_IDS) assert.ok(srcCadres.includes(id), `${id} doit exister cote client`);
});

test('le serveur REFUSE un cadre de quête non gagné', () => {
    /* Le seul cadre dont la possession se vérifie à l'écriture, et pour une raison précise : la
       couleur. Les autres cadres ne peuvent rien affirmer de faux ; celui-ci, si. */
    assert.match(srcEspace, /if \(!possedeCadreQuest\(cadre, possedes\)\) \{/, 'controle a l\'ecriture');
    assert.match(srcEspace, /Ce cadre de Pizza Quest n\\'est pas encore débloqué\./);
    // Dérivé à CHAQUE lecture, jamais stocké : un chapitre ajouté par l'école doit défaire un
    // « Monde bouclé », sinon le cadre ment dès le lendemain.
    assert.match(srcEspace, /const quest_cadres = await cadresQuestDuStagiaire\(conn, learner, progress\);/);
    assert.match(srcEspace, /LEFT JOIN quest_chapter c ON c\.program_id = p\.id AND c\.active = 1/,
        'seuls les chapitres ACTIFS comptent');
    assert.match(srcEspace, /if \(isMissingSchema\(e\)\) return \[\];/, 'migration absente : liste vide, pas d\'erreur');
});

test('la teinte passe par une VARIABLE, jamais par la classe', () => {
    /* L'organisme choisit la couleur de ses formations : écrire une règle CSS par formation est
       impossible. Une seule règle par palier, déclinée par `--cadre-c`. */
    assert.match(srcCadres, /export const cadreStyle = \(valeur\) => \{/);
    assert.match(srcCadres, /"--cadre-c": couleur/);
    for (const p of PALIER_IDS) assert.match(srcCss, new RegExp(`\\.cadre-${p}[,{]`), `la regle .cadre-${p} doit exister`);
    assert.match(srcCss, /\.cadre-qdemi,\.cadre-qfini,\.cadre-qparfait\{--cadre-c:#dc3e37;/,
        'un repli, sinon une formation sans couleur donne un anneau TRANSPARENT');
});

test('la fête tombe au franchissement, une seule fois', () => {
    // Comparer l'AVANT et l'APRÈS : regarder la progression seule referait la fête à chaque
    // chapitre terminé après le palier.
    assert.match(srcClient, /export function paliersFranchis\(code, avant, apres, nbChapitres\)/);
    assert.match(srcClient, /if \(!b \|\| a === b\) return null;/, 'rien a feter si le palier n\'a pas change');
    assert.match(srcClient, /return dejaFete\(code, b\) \? null : b;/, 'et la memoire tranche le reste');
    assert.match(srcQuest, /const palier = paliersFranchis\(code, avant, apres, nb\);/, 'appele au bon endroit');
    assert.match(srcQuest, /if \(palier\) \{ marquerFete\(code, palier\); setFete\(\{ palier, monde \}\); \}/);
    // La fête montre le VRAI cadre (mêmes classes) : un dessin approchant finirait par diverger.
    assert.match(srcQuest, /className=\{`pq-fete-cadre cadre cadre-\$\{palier\}`\}/);
});
