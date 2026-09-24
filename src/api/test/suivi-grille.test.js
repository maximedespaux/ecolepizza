/**
 * LE SUIVI QUALIOPI EN GRILLE (demandé le 2026-09-24 : « isn't it possible to make something more
 * clear than a 100 feet long page, scrolling forever ? »).
 *
 * LE DÉFAUT. Chaque dossier se dépliait en feuille de route VERTICALE — une étape par ligne, seize à
 * dix-huit étapes, 1 150 px par dossier. Mesuré en production le jour même : les sept dossiers en
 * cours, ouverts, faisaient 11 445 px, quatorze écrans. Et avant le premier dossier, le bandeau
 * « Ce qui manque » alignait 32 cartes, une par document et par formation.
 *
 * LA GRILLE : une table par formation, une ligne par dossier, une colonne par document, une pastille
 * par case. Une ligne se lit « où en est ce dossier », une colonne « qui n'a pas ce document » ; le
 * pied de chaque colonne remplace les 32 cartes, et le nom de la colonne filtre comme elles.
 *
 * Les jeux d'essai reprennent la forme EXACTE des données de production relevées le 2026-09-24 (même
 * clés d'étapes, mêmes libellés) : c'est sur elles que la fusion des colonnes a un sens — un dossier
 * d'entreprise et un dossier de particulier de NIV1H n'ont pas les mêmes documents.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lireUi = (f) => fs.readFileSync(path.join(UI, f), 'utf8');
const grille = () => import('../../app/ui/lib/grilleSuivi.js');
const etapes = () => import('../../app/ui/lib/etapes.js');
const dossiersASuivre = () => import('../../app/ui/lib/dossiersASuivre.js');

/* Les étapes de NIV1H, dans l'ordre de production. L'entreprise signe un devis professionnel et une
   convention ; le particulier un devis particulier et un contrat ; et le certificat et l'attestation
   n'arrivent pas dans le même ordre chez l'un et chez l'autre. */
const ENTREPRISE = ['devis-professionnel-copie', 'cgv', 'convention', 'invitation', 'livret-accueil', 'droit-image', 'attestation-hygiene', 'certificat-realisation'];
const PARTICULIER = ['devis-particulier', 'cgv', 'contrat', 'invitation', 'livret-accueil', 'droit-image', 'certificat-realisation', 'attestation-hygiene'];
const etape = (type, status = 'A_FAIRE', extra = {}) => ({ type, label: type, status, ...extra });
const dossier = (id, code, types, extra = {}) => ({
    enrollment_id: id, learner_id: `l-${id}`, last_name: id.toUpperCase(), first_name: 'X', program_code: code,
    program_title: `Formation ${code}`, score: 'ORANGE', percent: 10, done: 1, total: types.length,
    documents: types.map((t) => etape(t)), ...extra,
});

/* ─── Les colonnes ──────────────────────────────────────────────────────────────────────────── */

test('les colonnes d\'une formation : TOUTES les étapes de TOUS ses dossiers, dans l\'ordre du parcours', async () => {
    const { colonnesDeFormation } = await grille();
    const cols = colonnesDeFormation([dossier('a', 'NIV1H', ENTREPRISE), dossier('b', 'NIV1H', PARTICULIER)]).map((c) => c.type);
    /* Prendre le parcours d'un seul dossier aurait fait disparaître les documents des autres :
       le devis particulier et le contrat, c'est-à-dire ce qu'on vient chercher chez un particulier. */
    assert.deepStrictEqual(cols, ['devis-professionnel-copie', 'devis-particulier', 'cgv', 'convention', 'contrat',
        'invitation', 'livret-accueil', 'droit-image', 'certificat-realisation', 'attestation-hygiene']);
    assert.strictEqual(new Set(cols).size, cols.length, 'une étape commune ne fait qu\'une colonne');
    /* L'ORDRE NE DÉPEND PAS DE CELUI DES DOSSIERS : le serveur les trie par avancement, qui change
       chaque jour. Sans le départage sur les étapes, le devis et le contrat changeaient de place
       selon le dossier arrivé en tête — mesuré en écrivant ce test. */
    const inverse = colonnesDeFormation([dossier('b', 'NIV1H', PARTICULIER), dossier('a', 'NIV1H', ENTREPRISE)]).map((c) => c.type);
    assert.deepStrictEqual(inverse, cols);
    assert.ok(cols.indexOf('contrat') > cols.indexOf('cgv') && cols.indexOf('convention') > cols.indexOf('cgv'),
        'une étape propre à un dossier se place après celle qui la précède chez lui');
});

test('une case dit fait, en cours, à faire, sans objet — ou rien, quand le document n\'est pas dans son parcours', async () => {
    const { etatCase } = await grille();
    const d = { documents: [
        etape('piece:id', 'A_FAIRE', { piece: true, pieceStatus: 'VALIDEE' }),
        etape('devis', 'ENVOYE', { stagiaireSign: true }),
        etape('cgv'),
        etape('diplome', 'A_FAIRE', { remise: true, sansObjet: true }),
    ] };
    // L'état vient de la règle UNIQUE (lib/etapes.js) : une pièce validée est faite, pas « à faire ».
    assert.strictEqual(etatCase(d, 'piece:id').etat, 'done');
    assert.strictEqual(etatCase(d, 'devis').etat, 'progress');
    assert.strictEqual(etatCase(d, 'cgv').etat, 'todo');
    assert.strictEqual(etatCase(d, 'diplome').etat, 'skip');
    /* ABSENT N'EST PAS SANS OBJET : « sans objet » est une décision de l'école sur CE dossier ; un
       contrat sur la ligne d'une entreprise n'a jamais été une question. */
    assert.deepStrictEqual(etatCase(d, 'contrat'), { etat: 'absent', doc: null });
});

/* ─── Les tables ────────────────────────────────────────────────────────────────────────────── */

test('une table par formation, dans l\'ordre d\'arrivée ; une entreprise a un bloc dans chaque formation où elle envoie quelqu\'un', async () => {
    const { tableauxDuSuivi } = await grille();
    const { grouperParEntreprise, sansLesComplets } = await dossiersASuivre();
    const { manquesParFormation } = await etapes();
    const tous = [
        dossier('solo', 'RS7404', ['cgv']),
        dossier('m1', 'NIV1H', ENTREPRISE, { company_id: 'c1', company_name: 'LES ARCADES' }),
        dossier('m2', 'RS7404', ['cgv'], { company_id: 'c1', company_name: 'LES ARCADES' }),
        dossier('m3', 'NIV1H', ENTREPRISE, { company_id: 'c1', company_name: 'LES ARCADES', score: 'VERT', percent: 100 }),
    ];
    const affiches = sansLesComplets(grouperParEntreprise(tous), false);
    const T = tableauxDuSuivi(affiches, tous.filter((d) => d.score !== 'VERT'), manquesParFormation(tous));
    assert.deepStrictEqual(T.map((t) => t.code), ['RS7404', 'NIV1H'], 'la table du premier dossier reçu vient d\'abord');
    const lignes = (t) => t.lignes.map((l) => (l.genre === 'entreprise' ? `[${l.company_name} ${l.n}/${l.complets}]` : l.d.enrollment_id));
    assert.deepStrictEqual(lignes(T[0]), ['solo', '[LES ARCADES 1/0]', 'm2']);
    /* LES COMPLETS SE COMPTENT DANS LA FORMATION, pas dans tout le groupe : m3 (complet, masqué) est
       de NIV1H, et c'est là seulement que l'entreprise dit « dont 1 complet ». */
    assert.deepStrictEqual(lignes(T[1]), ['[LES ARCADES 2/1]', 'm1']);
    assert.ok(T[1].lignes.find((l) => l.d?.enrollment_id === 'm1').membre, 'le stagiaire d\'une entreprise est rangé sous elle');
    assert.strictEqual(T[1].nb, 1, 'le compte de la table est celui des dossiers MONTRÉS');
    assert.strictEqual(T[0].titre, 'Formation RS7404');
});

test('le pied de chaque colonne est le compte de « Ce qui manque », pris sur TOUS les dossiers', async () => {
    const { tableauxDuSuivi } = await grille();
    const { grouperParEntreprise, sansLesComplets } = await dossiersASuivre();
    const { manquesParFormation, dossiersDuManque } = await etapes();
    const tous = [
        dossier('a', 'NIV1H', ['cgv', 'diplome'], { documents: [etape('cgv'), etape('diplome', 'A_FAIRE', { remise: true, sansObjet: true })] }),
        dossier('b', 'NIV1H', ['cgv', 'diplome'], { documents: [etape('cgv', 'GENERE'), etape('diplome', 'A_FAIRE', { remise: true, sansObjet: true })] }),
        dossier('c', 'NIV1H', ['cgv', 'diplome'], { documents: [etape('cgv'), etape('diplome', 'A_FAIRE', { remise: true, sansObjet: true })] }),
    ];
    const manques = manquesParFormation(tous);
    const col = (T, type) => T[0].colonnes.find((c) => c.type === type);
    const T = tableauxDuSuivi(sansLesComplets(grouperParEntreprise(tous), false), tous, manques);
    assert.strictEqual(col(T, 'cgv').manque.n, 2, 'deux dossiers n\'ont pas encore leurs CGV');
    // Une remise écartée n'est pas un manque (migration 161) : sa colonne n'a rien à chercher.
    assert.strictEqual(col(T, 'diplome').manque, null);

    /* FILTRER UNE COLONNE ne change ni ses voisines ni les comptes : sinon la colonne sur laquelle
       on vient de cliquer afficherait « 1 » là où elle disait « 2 », et les autres disparaîtraient
       sous le curseur. */
    const filtre = col(T, 'cgv').manque;
    const vus = dossiersDuManque(tous, filtre);
    assert.deepStrictEqual(vus.map((d) => d.enrollment_id), ['a', 'c']);
    const Tf = tableauxDuSuivi(sansLesComplets(grouperParEntreprise(vus), false), tous, manques);
    assert.deepStrictEqual(Tf[0].colonnes.map((c) => c.type), T[0].colonnes.map((c) => c.type));
    assert.strictEqual(col(Tf, 'cgv').manque.n, 2);
    assert.strictEqual(Tf[0].nb, 2);
});

test('les complets masqués n\'apportent pas de colonne ; réaffichés, si', async () => {
    const { tableauxDuSuivi } = await grille();
    const { grouperParEntreprise, sansLesComplets, estComplet } = await dossiersASuivre();
    const { manquesParFormation } = await etapes();
    /* Relevé en production : le seul particulier de NIV1H est complet. Masqué, il ne doit pas
       laisser derrière lui deux colonnes vides (devis particulier, contrat) sur les lignes des
       entreprises — une colonne sans aucune ligne pour la remplir ne dit rien. */
    const tous = [
        dossier('ent', 'NIV1H', ENTREPRISE, { company_id: 'c1', company_name: 'TEST' }),
        dossier('part', 'NIV1H', PARTICULIER, { score: 'VERT', percent: 100 }),
    ];
    const manques = manquesParFormation(tous);
    const colonnes = (voir) => tableauxDuSuivi(sansLesComplets(grouperParEntreprise(tous), voir),
        voir ? tous : tous.filter((d) => !estComplet(d)), manques)[0].colonnes.map((c) => c.type);
    assert.ok(!colonnes(false).includes('contrat'));
    assert.ok(colonnes(true).includes('contrat') && colonnes(true).includes('devis-particulier'));
});

/* ─── La page ───────────────────────────────────────────────────────────────────────────────── */

const SUIVI = lireUi('pages/Suivi.jsx');
const CSS = lireUi('styles/app.css');

test('la page tire tout de la grille : plus de feuille de route, plus de bandeau de cartes', () => {
    assert.match(SUIVI, /import \{ tableauxDuSuivi, etatCase \} from "\.\.\/lib\/grilleSuivi\.js";/);
    assert.match(SUIVI, /tableauxDuSuivi\(affiches, pourColonnes, manques\)/);
    /* Les colonnes viennent de `dossiers`, JAMAIS de `dossiersVus` (le résultat du filtre). */
    assert.match(SUIVI, /\(voirComplets \? dossiers : dossiers\.filter\(\(d\) => !estComplet\(d\)\)\)/);
    assert.doesNotMatch(SUIVI, /Roadmap|className="manque-i"|className="suivi-ligne"/);
    assert.ok(!fs.existsSync(path.join(UI, 'components/Roadmap.jsx')), 'la feuille de route n\'a plus d\'écran : elle part avec lui');
    assert.doesNotMatch(CSS, /\.rm-(step|dot|tag|rail|conn|body)\b|\.roadmap\{/, 'ni son CSS');
});

test('le nom d\'une colonne est le filtre — et il ne s\'offre que s\'il y a quelque chose à trouver', () => {
    assert.match(SUIVI, /<button type="button" className="sg-col-btn" disabled=\{!c\.manque\} aria-pressed=\{actif\}/);
    assert.match(SUIVI, /onClick=\{\(\) => onFiltre\(actif \? null : c\.manque\)\}/, 'recliquer la colonne choisie rend tout');
    assert.match(SUIVI, /<GrilleFormation key=\{t\.code \|\| "-"\} t=\{t\} filtre=\{manqueFiltre\} onFiltre=\{setManqueFiltre\}/);
    // Et la case en dit autant que l'ancienne feuille de route : le document, son état, « à signer ».
    assert.match(SUIVI, /const titre = `\$\{c\.label\} — \$\{e\.lib\}\$\{aSigner \? " · à signer" : ""\}`;/);
});

test('les en-têtes penchés n\'ont pas de fond, et leur place est mesurée sur eux', () => {
    /* Le libellé d'une colonne, tourné à 45°, survole les colonnes suivantes : le fond opaque de tout
       `thead th` (l'en-tête collant de l'application) l'aurait coupé en morceaux. */
    assert.match(CSS, /\.sg-table thead th\{position:static;z-index:auto;background:none;/,
        "ni le z-index:2 de tout thead th : il faisait passer les libellés PAR-DESSUS le nom collé");
    assert.match(CSS, /\.sg-col-btn\{position:absolute;[^}]*transform:rotate\(-45deg\);/);
    /* LES CLICS TRAVERSENT LES EN-TÊTES, seuls les libellés les prennent : relevé au banc, le milieu de
       « Justificatifs » tombait sur l'en-tête (transparent) de « Devis RS7404 », placé après lui, et
       cliquer un nom de document ne filtrait rien. */
    assert.match(CSS, /\.sg-table \.sg-col\{position:relative;width:34px;min-width:34px;max-width:34px;height:var\(--sg-h,150px\);vertical-align:bottom;pointer-events:none\}/);
    assert.match(CSS, /\.sg-col-btn\{[^}]*pointer-events:auto;/);
    /* LA PLACE EST MESURÉE SUR LE DESSIN, pas estimée : getBoundingClientRect rend la boîte d'un
       élément tourné. L'estimation d'abord écrite (le plus long libellé × sin 45°) réservait à droite
       54 px que seuls les DERNIERS libellés peuvent réclamer — assez, au banc, pour faire défiler la
       grille sans raison. */
    assert.match(SUIVI, /\[\.\.\.tete\.current\.querySelectorAll\("\.sg-col-btn"\)\]\.map\(\(b\) => b\.getBoundingClientRect\(\)\)/);
    assert.match(SUIVI, /const bord = av\.getBoundingClientRect\(\)\.right - \(parseFloat\(getComputedStyle\(av\)\.paddingRight\) - 12\);/,
        'le bord du tableau SANS la réserve déjà en place, sinon la mesure se nourrirait d\'elle-même');
    assert.match(SUIVI, /style=\{\{ "--sg-h": `\$\{geo\.h\}px`, "--sg-deborde": `\$\{geo\.deborde\}px` \}\}/);
    assert.match(CSS, /\.sg-table \.sg-av\{[^}]*padding:8px calc\(12px \+ var\(--sg-deborde,0px\)\) 8px 12px/);
    // Mesure refaite quand la police arrive : mesuré sur la police de secours, le libellé déborderait.
    assert.match(SUIVI, /document\.fonts\?\.ready\?\.then\(mesurer\)/);
    assert.doesNotMatch(SUIVI, /PENTE/, 'plus d\'estimation trigonométrique');
});

test('un stagiaire d\'entreprise porte le filet de son entreprise', () => {
    /* Le retrait seul ne suffisait pas : relevé au banc sur NIV1H, une particulière rangée juste après
       le bloc d'une entreprise se lisait comme l'une de ses stagiaires — douze pixels de décalage,
       rien d'autre pour les distinguer. Un filet court le long des stagiaires de l'entreprise. */
    assert.match(SUIVI, /<tr key=\{d\.enrollment_id\} className=\{l\.membre \? "sg-membre" : undefined\}>/);
    assert.match(CSS, /\.sg-membre \.sg-nom::before\{content:"";position:absolute;left:19px;top:0;bottom:-1px;width:2px;background:var\(--border\)\}/);
});

/* ─── Les archives ──────────────────────────────────────────────────────────────────────────── */

test('archives : seule l\'année en cours s\'ouvre, et tout s\'ouvre pendant une recherche', () => {
    /* Même demande : chaque année s'ouvrait avec toutes ses semaines — vingt-sept lignes sur deux
       ans, deux écrans et demi avant d'avoir ouvert quoi que ce soit. */
    assert.doesNotMatch(SUIVI, /<details key=\{Y\.label\} open>/);
    assert.match(SUIVI, /<details key=\{Y\.label\} open=\{recherche \|\| Y\.label === anneeOuverte\}>/);
    /* LA PLUS RÉCENTE QUI A DES DOCUMENTS, pas l'année du calendrier : en janvier, avant le premier
       dépôt, l'année du calendrier n'ouvrirait rien. Et « Sans session » (« - ») n'est pas une année. */
    assert.match(SUIVI, /const anneeOuverte = tree\.find\(\(Y\) => \/\^\\d\{4\}\$\/\.test\(Y\.label\)\)\?\.label;/);
    assert.match(SUIVI, /const recherche = q\.trim\(\) !== "";/);
});
