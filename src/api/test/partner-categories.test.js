/**
 * CATÉGORIES DE PARTENAIRES (migration 129).
 *
 * Elles étaient écrites EN DUR dans l'écran :
 *     FARINE · MATERIEL · FOUR · CHARCUTERIE · FROMAGE · CONSERVE · DISTRIBUTION · AUTRE
 * Huit valeurs choisies une fois, que l'école ne pouvait ni renommer, ni compléter, ni ranger.
 * Un partenaire « Boissons », « Emballage » ou « Assurance » n'avait d'autre place que « AUTRE »,
 * et le filtre de la page perdait son intérêt à mesure que ce fourre-tout grossissait.
 *
 * LES TROIS INVARIANTS GELÉS ICI, chacun pour un dégât précis :
 *
 *  · LE CODE NE SE MODIFIE PAS. Il est stocké tel quel sur chaque partenaire ; le changer les
 *    orphelinerait tous en silence — ils garderaient l'ancien code, plus aucune catégorie ne le
 *    porterait, et ils sortiraient du filtre sans avoir bougé. Seul l'intitulé est libre, ce qui
 *    permet de rebaptiser « Matériel » en « Équipement » sans toucher une seule fiche.
 *
 *  · UNE CATÉGORIE UTILISÉE NE SE SUPPRIME PAS. Même dégât, par un autre chemin. Le serveur dit
 *    COMBIEN de partenaires la portent plutôt que de les déplacer d'office vers « Autre » — ce
 *    serait une décision prise à la place de l'école.
 *
 *  · « AUTRE » NE SE SUPPRIME PAS. C'est le repli du serveur à la création (`b.category ||
 *    'AUTRE'`) : sans elle, un nouveau partenaire naîtrait avec un code que rien ne nomme.
 *
 * ET LE CODE MARCHE AVANT COMME APRÈS LA MIGRATION : sans la table, la route rend la liste
 * d'origine, sans identifiant — l'écran se comporte alors exactement comme avant.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const CTRL = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'partner.controller.js'), 'utf8');
const ROUTES = fs.readFileSync(path.join(__dirname, '..', 'routes', 'partner.routes.js'), 'utf8');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const PAGE = fs.readFileSync(path.join(UI, 'pages/Partenaires.jsx'), 'utf8');
const MIG = path.join(__dirname, '..', '..', '..', 'database', 'migrations');

test("le code d'une catégorie n'est jamais modifiable", () => {
    const bloc = CTRL.slice(CTRL.indexOf('const updatePartnerCategory'), CTRL.indexOf('const deletePartnerCategory'));
    const sansCommentaires = bloc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(sansCommentaires, /sets\.push\('code = \?'\)/,
        'Changer le code orphelinerait en silence tous les partenaires qui le portent.');
    for (const champ of ['label', 'color', 'sort_order']) {
        assert.ok(sansCommentaires.includes(champ), `${champ} doit rester modifiable`);
    }
});

test('une catégorie utilisée ne se supprime pas, et on dit combien', () => {
    const bloc = CTRL.slice(CTRL.indexOf('const deletePartnerCategory'));
    assert.match(bloc, /SELECT COUNT\(\*\) AS n FROM partner WHERE organization_id = \? AND category = \?/,
        'Il faut compter avant de refuser — un refus sans le nombre ne dit pas quoi faire ensuite.');
    assert.match(bloc, /status\(409\)/);
    assert.match(bloc, /Reclassez-le/, "…et dire quoi faire : reclasser, pas se débrouiller.");
});

test('« Autre » est protégée — c\'est le repli du serveur à la création', () => {
    assert.match(CTRL, /const CATEGORIE_SOCLE = 'AUTRE';/);
    const bloc = CTRL.slice(CTRL.indexOf('const deletePartnerCategory'));
    assert.match(bloc, /cat\.code === CATEGORIE_SOCLE/,
        "Sans ce garde-fou, un nouveau partenaire naîtrait avec un code que plus rien ne nomme.");
    // …et c'est bien elle que la création utilise en repli.
    assert.match(CTRL, /b\.category \|\| 'AUTRE'/);
});

test('la route rend la liste d\'origine tant que la migration 129 n\'est pas jouée', () => {
    assert.match(CTRL, /const CATEGORIES_SOCLE = \[/, 'Le repli doit exister…');
    for (const code of ['FARINE', 'MATERIEL', 'FOUR', 'CHARCUTERIE', 'FROMAGE', 'CONSERVE', 'DISTRIBUTION', 'AUTRE']) {
        assert.ok(CTRL.includes(`'${code}'`), `…et contenir ${code}, comme l'écran d'avant`);
    }
    const bloc = CTRL.slice(CTRL.indexOf('const getPartnerCategories'), CTRL.indexOf('const createPartnerCategory'));
    assert.match(bloc, /if \(!isMissingSchema\(e\)\) throw e;/,
        'Seule une table absente déclenche le repli — une vraie erreur SQL doit remonter.');
    assert.match(bloc, /id: null/,
        "Le repli n'a pas d'identifiant : l'écran sait ainsi qu'il n'y a rien à modifier en base.");
});

test('les routes de catégories sont déclarées avant `/:id`', () => {
    /* Aucune n'entre réellement en conflit aujourd'hui (`/categories/:cid` a deux segments là où
       `/:id` n'en a qu'un, et il n'existe ni GET ni POST sur `/:id`). L'ordre le garantit quoi
       qu'on ajoute plus tard : le jour où quelqu'un écrit `router.delete('/:id')` au-dessus,
       `DELETE /categories` partirait supprimer un partenaire nommé « categories ». */
    const cat = ROUTES.indexOf("router.get('/categories'");
    const id = ROUTES.indexOf("router.patch('/:id'");
    assert.ok(cat > 0 && id > 0 && cat < id, 'les routes /categories doivent précéder /:id');
    // Écriture réservée au bureau, lecture ouverte au personnel — comme le reste de l'annuaire.
    assert.match(ROUTES, /router\.post\('\/categories', authorizeRoles\(\.\.\.ADMIN_ROLES\)/);
    assert.match(ROUTES, /router\.get\('\/categories', authorizeRoles\(\.\.\.STAFF_ROLES\)/);
});

test("l'écran n'écrit plus la liste en dur, et affiche le libellé", () => {
    assert.doesNotMatch(PAGE, /const CATEGORIES = \["FARINE"/,
        'La liste en dur ne doit pas revenir : elle est la raison de tout ce chantier.');
    assert.match(PAGE, /const CATEGORIES_REPLI = \[/, 'Il reste un repli, et il est nommé comme tel.');
    assert.match(PAGE, /getPartenaireCategories\(\)/, 'La liste vient du serveur.');
    /* LE BADGE MONTRAIT LE CODE BRUT (« CHARCUTERIE » en capitales) faute d'avoir où ranger un
       intitulé. Et un partenaire portant un code inconnu doit encore afficher quelque chose —
       montrer un vide le ferait passer pour non classé. */
    assert.match(PAGE, /categories\.find\(\(c\) => c\.code === code\)\?\.label \|\| code/);
});

test('la migration libère `partner.category` et sème les huit valeurs', () => {
    const sql = fs.readFileSync(path.join(MIG, '129_partner_category.sql'), 'utf8');
    /* LE `MODIFY` EST LE POINT CRITIQUE. La table `partner` est antérieure au dossier de
       migrations : rien ne dit si la colonne est un ENUM des huit valeurs ou un varchar. Si c'est
       un ENUM, la première catégorie créée par l'école serait REFUSÉE à l'insertion — la
       fonctionnalité ne marcherait que pour les huit d'origine, ce qu'on vient corriger. */
    assert.match(sql, /ALTER TABLE partner\s+MODIFY COLUMN category varchar/,
        "Sans ce MODIFY, un ENUM refuserait toute catégorie nouvelle.");
    assert.match(sql, /CREATE TABLE IF NOT EXISTS partner_category/);
    assert.match(sql, /UNIQUE KEY uq_partcat_code \(organization_id, code\)/);
    assert.match(sql, /WHERE NOT EXISTS/, 'La semence doit être rejouable.');
    assert.ok(fs.existsSync(path.join(MIG, '129_revert_partner_category.sql')), 'un revert est obligatoire');
    // Le revert ne remet PAS l'ENUM : il échouerait sur toute base ayant déjà une catégorie créée.
    const revert = fs.readFileSync(path.join(MIG, '129_revert_partner_category.sql'), 'utf8');
    assert.doesNotMatch(revert, /MODIFY COLUMN category ENUM/);
    assert.match(revert, /DROP TABLE IF EXISTS partner_category/);
});

test('le nombre de produits se lit sans déplier la fiche', () => {
    /* LE DÉFAUT : la section « Produits en boutique » ne charge son catalogue qu'à l'ouverture —
       et c'est le bon choix, vingt-trois partenaires ne doivent pas déclencher vingt-trois
       requêtes. Mais le COMPTE affiché à côté du titre venait de ce même chargement (`rows?.length`,
       `rows` valant `null` tant qu'on n'a pas ouvert). Il fallait donc déplier les vingt-trois
       sections une par une pour savoir lesquelles ont un catalogue. Une sous-requête sur une
       requête qui tourne déjà coûte infiniment moins que ça. */
    assert.match(CTRL, /\(SELECT COUNT\(\*\) FROM partner_product pp WHERE pp\.partner_id = p\.id\) AS products/,
        'La liste des partenaires doit porter le compte.');
    /* ET LA PAGE NE DOIT PAS CASSER SANS LA TABLE : `partner_product` arrive avec la migration 095.
       On rend la liste sans le compte plutôt que de perdre l'écran entier pour une colonne
       d'appoint. */
    const bloc = CTRL.slice(CTRL.indexOf('const getPartners'), CTRL.indexOf('const createPartner'));
    assert.match(bloc, /if \(!isMissingSchema\(e\)\) throw e;/);
    assert.match(bloc, /colonnes\(false\)/, 'un repli sans la sous-requête');

    const comp = fs.readFileSync(path.join(UI, 'components/PartnerProduits.jsx'), 'utf8');
    assert.match(comp, /const nb = rows\?\.length \?\? \(nbInitial != null \? Number\(nbInitial\) : null\);/,
        "Le compte de la liste sert AVANT l'ouverture ; une fois ouvert, `rows` reprend la main — "
        + "sinon un ajout ou un retrait ne se verrait pas dans le titre.");
    assert.match(PAGE, /nbInitial=\{p\.products\}/, 'et la page le transmet');
});
