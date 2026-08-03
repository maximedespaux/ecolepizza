/**
 * QUELLES INFORMATIONS PARTENT CHEZ LES PARTENAIRES — le choix de l'école, et ce qu'il engage.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI TIENT TOUT : LA PHRASE SE DÉRIVE DES CHAMPS.
 *
 * Tant que le texte était figé et la liste de champs écrite à côté, les deux pouvaient diverger
 * en silence — l'école retirait le téléphone de l'export et la phrase continuait de l'annoncer,
 * ou l'inverse : un consentement obtenu pour six champs servant à en transmettre sept. En
 * dérivant l'un de l'autre, l'écart devient impossible à produire.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ET L'ASYMÉTRIE ENTRE RETIRER ET AJOUTER, qui est le cœur du sujet.
 *
 * Un consentement porte sur ce qui a été DIT. Retirer un champ s'applique tout de suite à tout le
 * monde : on transmet moins que ce qui a été accepté, ce qui est toujours permis. Ajouter un
 * champ ne vaut QUE pour les réponses suivantes — la personne ne pouvait pas consentir à ce
 * qu'elle ignorait. D'où l'intersection à l'export, et `consent_record.champs` qui fige ce qui a
 * été annoncé à chacun.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const MIG = path.join(API, '..', '..', 'database', 'migrations');
const lib = require('../lib/consentements.js');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('la phrase se construit depuis les champs, et rien d\'autre', () => {
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'lib/consentements.js'), 'utf8'));
    assert.doesNotMatch(src, /formulation:\s*\n?\s*'J\\'accepte/,
        'Aucune formulation ne doit rester écrite en dur à côté de la liste des champs.');
    assert.match(src, /function formulationPour\(champs\)/);
});

test("l'ordre de la phrase ne dépend pas de l'ordre de saisie", () => {
    /* Deux écoles qui cochent les mêmes cases dans un ordre différent doivent obtenir LE MÊME
       texte : sinon le registre garde deux preuves qui n'ont pas l'air d'être la même, et
       comparer une réponse ancienne à la formulation du jour devient impossible. */
    const a = lib.formulationPour(['email', 'nom', 'telephone']);
    const b = lib.formulationPour(['telephone', 'email', 'nom']);
    assert.strictEqual(a, b);
    assert.ok(a.indexOf('mon nom') < a.indexOf('mon adresse e-mail'), "l'ordre d'annonce est fixe");
});

test('une clé inconnue ne peut pas entrer dans la phrase', () => {
    /* La liste vient d'un réglage écrit en base : sans filtrage, une valeur bricolée à la main
       apparaîtrait telle quelle dans un texte à valeur de preuve. */
    assert.deepStrictEqual(lib.champsValides('nom,bidon,email'), ['nom', 'email']);
    assert.ok(!lib.formulationPour(['nom', 'bidon']).includes('bidon'));
});

test('aucun champ coché se DIT, au lieu de produire une phrase bancale', () => {
    /* « J'accepte que l'école communique à ses partenaires » ne veut rien dire, et on le ferait
       pourtant accepter. Tout décocher est un réglage légitime — l'école cesse de transmettre —
       et le texte doit l'énoncer. */
    const p = lib.formulationPour([]);
    assert.match(p, /Aucune information/);
    assert.ok(!p.includes("J'accepte"));
});

test("l'écran et le serveur annoncent les champs avec les MÊMES mots", () => {
    /* DUPLICATION INÉVITABLE, MAIS BORNÉE : l'aperçu doit se former à la frappe, avant tout
       enregistrement, donc l'écran recompose la phrase. Si les deux rédactions divergeaient,
       l'école validerait un texte que le stagiaire ne lirait jamais — et la preuve stockée
       porterait sur l'autre. Ce test les tient collées. */
    const comp = fs.readFileSync(path.join(UI, 'components/ChampsPartenaires.jsx'), 'utf8');
    const bloc = comp.slice(comp.indexOf('const ANNONCES = {'));
    for (const [cle, v] of Object.entries(lib.CHAMPS_TRANSMISSIBLES)) {
        assert.ok(bloc.includes(`${cle}: "${v.annonce.replace(/'/g, "'")}"`)
            || bloc.includes(v.annonce),
            `l'écran doit annoncer « ${cle} » avec les mots du serveur : « ${v.annonce} »`);
    }
    /* Et l'inverse : pas de champ côté écran que le serveur ignore — il apparaîtrait dans
       l'aperçu, puis disparaîtrait de la vraie phrase. */
    for (const m of bloc.matchAll(/^\s{2}([a-z_]+):/gm)) {
        assert.ok(lib.CHAMPS_TRANSMISSIBLES[m[1]], `« ${m[1] }» est annoncé par l'écran seul`);
    }
});

test('la migration 135 fige ce qui a été annoncé, pas seulement le choix du jour', () => {
    const sql = fs.readFileSync(path.join(MIG, '135_partner_champs_transmis.sql'), 'utf8');
    assert.match(sql, /ALTER TABLE organization\s+ADD COLUMN IF NOT EXISTS partner_fields/,
        'le choix de l\'école');
    assert.match(sql, /ALTER TABLE consent_record\s+ADD COLUMN IF NOT EXISTS champs/,
        'ET ce qui a été annoncé à chaque personne — la seconde est la plus importante');
    /* LE DÉFAUT DOIT ÊTRE LES SIX D'ORIGINE : une base qui joue la migration ne doit rien voir
       changer, ni dans le texte, ni dans l'export. */
    assert.match(sql, /DEFAULT 'nom,prenom,email,telephone,formation,dates_session'/);
    assert.ok(fs.existsSync(path.join(MIG, '135_revert_partner_champs_transmis.sql')));
});

test('sans la migration, tout continue comme avant', () => {
    /* Le code doit marcher AVANT comme APRÈS : sans `partner_fields`, on retombe sur les six
       champs d'origine — c'est-à-dire exactement ce qui était annoncé jusqu'alors. */
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'lib/consentements.js'), 'utf8'));
    assert.match(src, /return \[\.\.\.FINALITES\.partenaires\.champsParDefaut\];/,
        'le repli doit exister');
    assert.deepStrictEqual(lib.FINALITES.partenaires.champsParDefaut,
        ['nom', 'prenom', 'email', 'telephone', 'formation', 'dates_session']);
    /* Et une réponse ANTÉRIEURE (champs à NULL) se lit comme ces six-là : c'était la seule liste
       possible à l'époque, donc la seule chose qu'on sache de ce qui lui a été montré. */
    assert.match(src, /champsAnnonces: r\.champs \? champsValides\(r\.champs\) : \[\.\.\.FINALITES\.partenaires\.champsParDefaut\]/);
});

test('le réglage a sa propre rubrique dans Paramètres', () => {
    /* POURQUOI PAS UNE SECTION DE LA FICHE « ORGANISME », où elle se trouvait d'abord. Ce réglage
       ne DÉCRIT pas l'organisme comme sa raison sociale ou son SIRET : il décide de ce qui SORT
       de l'école, information par information, et le texte que des dizaines de personnes liront
       et accepteront en découle mot pour mot. Rangé entre le code NAF et le RIB, il se serait lu
       comme un détail administratif de plus.
       TROIS DÉCLARATIONS SONT NÉCESSAIRES, et en oublier une donne une panne différente à chaque
       fois : sans l'entrée NAV la rubrique n'existe pas, sans SETTINGS_PATHS elle n'apparaît pas
       dans le sommaire, sans la route le clic tombe sur un 404. */
    const nav = fs.readFileSync(path.join(UI, 'lib/nav.js'), 'utf8');
    assert.match(nav, /\{ to: "\/reglages-partenaires", ic: "handshake", label: "Partenaires", roles: ADMIN \}/,
        'la rubrique doit exister dans NAV…');
    assert.match(nav, /SETTINGS_PATHS = \[[^\]]*"\/reglages-partenaires"/,
        '…et figurer dans le sommaire des paramètres');
    assert.match(nav, /"\/reglages-partenaires": "Partenaires"/, 'avec son libellé de fil d\'Ariane');

    const routes = fs.readFileSync(path.join(UI, 'main.jsx'), 'utf8');
    assert.match(routes, /<Route path="reglages-partenaires"[^>]*roles=\{ADMIN\}><ReglagesPartenaires \/>/,
        'la route doit exister, et rester réservée au bureau');

    /* ET LA SECTION NE DOIT PLUS ÊTRE DANS LES RÉGLAGES ORGANISME : l'y laisser en double
       donnerait deux écrans qui écrivent le même réglage, dont un que personne ne penserait à
       rouvrir après avoir modifié l'autre. */
    const reglages = fs.readFileSync(path.join(UI, 'pages/Reglages.jsx'), 'utf8');
    assert.doesNotMatch(reglages, /ChampsPartenaires/,
        'le réglage ne doit vivre qu\'à un seul endroit');
});

test("chaque champ offert sait produire une valeur à l'export", () => {
    /* LE DÉFAUT QUE CE TEST EMPÊCHE : ajouter une case au catalogue sans brancher la valeur.
       L'école la coche, la phrase l'annonce au stagiaire, le stagiaire l'accepte — et la colonne
       sort VIDE dans la liste envoyée. Personne ne s'en aperçoit : ni erreur, ni alerte, juste une
       promesse faite au stagiaire que rien ne tient. */
    const ctrl = fs.readFileSync(path.join(API, 'controllers/consentement.controller.js'), 'utf8');
    const d = ctrl.indexOf('const valeurs = (l) => ({');
    const bloc = ctrl.slice(d, ctrl.indexOf('});', d));
    for (const cle of Object.keys(lib.CHAMPS_TRANSMISSIBLES)) {
        assert.match(bloc, new RegExp(`\\b${cle}:`), `« ${cle} » est cochable mais ne produit rien`);
    }
});

test('les données sensibles ne sont ni offertes ni même LUES', () => {
    /* LA MINIMISATION NE SE JOUE PAS AU CLIC, mais au moment où l'on décide d'offrir la case :
       une case cochable est une case qu'on finit par cocher. La table `learner` porte une
       trentaine de colonnes — numéro de sécurité sociale (chiffré au repos précisément parce
       qu'il ne doit pas circuler), identifiant France Travail, date et lieu de naissance, solde
       CPF, diplômes, coordonnées GPS. Aucune n'a d'usage pour un fournisseur de fours.
       Le solde CPF est le cas le plus net : l'offrir reviendrait à dire à un commercial combien
       la personne peut dépenser avant qu'il ne l'appelle.
       ET ELLES NE SONT PAS LUES NON PLUS : une donnée qu'on ne charge pas ne peut pas partir par
       erreur, même à la faveur d'un `...l` mal placé. */
    const interdits = ['social_security', 'france_travail_id', 'birthday', 'birth_place',
        'cpf_amount', 'diploma_level', 'diploma_name', 'last_experience', 'lat', 'lng'];
    for (const c of interdits) {
        assert.ok(!lib.CHAMPS_TRANSMISSIBLES[c], `« ${c} » ne doit pas être offert au catalogue`);
    }
    const ctrl = fs.readFileSync(path.join(API, 'controllers/consentement.controller.js'), 'utf8');
    const d = ctrl.indexOf('async function sessionAvecInscrits');
    const requete = ctrl.slice(d, ctrl.indexOf('return { session', d));
    for (const c of interdits) {
        assert.ok(!new RegExp(`l\\.${c}\\b`).test(requete),
            `« ${c} » ne doit pas même être LU par la requête de l'export`);
    }
});

test('le représentant de l\'entreprise ne peut pas être transmis', () => {
    /* EXCLUSION D'UNE AUTRE NATURE QUE LES PRÉCÉDENTES : ce n'est pas une question de
     * minimisation, mais de QUI PEUT CONSENTIR.
     *
     * Le représentant légal est un ÊTRE HUMAIN. Ses nom, civilité et fonction sont SES données
     * personnelles, pas celles du stagiaire — aucun stagiaire ne peut consentir à leur
     * transmission, quoi qu'il coche. Un consentement donné par quelqu'un d'autre ne couvre rien.
     *
     * `company.email` et `company.phone` sont écartés pour l'ambiguïté : souvent une adresse
     * générique, parfois celle d'une personne nommée. On ne construit pas une transmission sur
     * « c'est probablement une boîte aux lettres ». */
    for (const c of ['entreprise_representant', 'entreprise_email', 'entreprise_telephone',
        'representative_name', 'representative_role']) {
        assert.ok(!lib.CHAMPS_TRANSMISSIBLES[c], `« ${c} » ne doit pas être offert`);
    }
    const ctrl = fs.readFileSync(path.join(API, 'controllers/consentement.controller.js'), 'utf8');
    const d = ctrl.indexOf('async function sessionAvecInscrits');
    const requete = ctrl.slice(d, ctrl.indexOf('return { session', d));
    for (const col of ['representative_name', 'representative_civ', 'representative_role']) {
        assert.ok(!requete.includes(col), `« ${col} » ne doit pas même être lu`);
    }
    assert.ok(!/c\.email|c\.phone/.test(requete),
        'les coordonnées de l\'entreprise ne doivent pas être lues non plus');
});

test('les champs sont groupés par source, et chaque groupe est nommé', () => {
    /* SANS GROUPEMENT, « Ville » apparaîtrait DEUX FOIS dans une liste indifférenciée — celle du
       stagiaire et celle de l'entreprise, même mot pour deux données différentes. Le regroupement
       n'est donc pas cosmétique : il est ce qui rend les étiquettes univoques. */
    for (const [cle, v] of Object.entries(lib.CHAMPS_TRANSMISSIBLES)) {
        assert.ok(lib.GROUPES[v.g], `« ${cle} » doit appartenir à un groupe nommé`);
    }
    const doublons = {};
    for (const v of Object.values(lib.CHAMPS_TRANSMISSIBLES)) {
        const k = `${v.g}|${v.libelle}`;
        assert.ok(!doublons[k], `deux champs « ${v.libelle} » dans le même groupe`);
        doublons[k] = true;
    }
    /* Et l'écran doit bien les rendre groupe par groupe, pas à la file. */
    const comp = fs.readFileSync(path.join(UI, 'components/ChampsPartenaires.jsx'), 'utf8');
    assert.match(comp, /Object\.entries\(data\.groupes\)\.map/);
    assert.match(comp, /data\.catalogue\.filter\(\(c\) => c\.groupe === cle\)/);
});

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   LA MISE À JOUR D'UN CONSENTEMENT, quand l'école élargit sa liste.

   LE DÉFAUT SANS CE MÉCANISME : l'école ajoute « Projet » à sa liste, et l'écran du stagiaire
   continue d'afficher « accepté ». Son accord ne couvre pourtant pas ce champ — il ne figurait pas
   dans ce qu'il a lu. L'export l'exclut donc (intersection), et personne ne comprend pourquoi une
   colonne reste vide. Il faut REPOSER la question, et une seule fois.

   TROIS RÉPONSES POSSIBLES, PAS DEUX, et c'est là que tout se joue :
     · accepter la nouvelle version   → accord sur le périmètre du jour ;
     · CONSERVER SON ACCORD ACTUEL    → accord maintenu, sur le périmètre d'origine ;
     · retirer son accord (profil)    → plus rien ne part.

   La deuxième n'est pas un refus. L'écrire `accorde: false` aurait été plus simple et FAUX :
   l'export aurait exclu la personne de TOUTE transmission, alors qu'elle consent toujours à
   l'ancienne liste — et elle aurait perdu, sans l'avoir demandé, ce qu'elle avait accepté. */

test('un élargissement rouvre la question, un rétrécissement non', () => {
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'lib/consentements.js'), 'utf8'));
    assert.match(src, /ajoutes: par\[k\] && par\[k\]\.accorde \? champs\.filter\(\(c\) => !\(annonces\[k\] \|\| \[\]\)\.includes\(c\)\) : \[\]/,
        'Seuls les champs AJOUTÉS depuis la réponse doivent rouvrir la question…');
    /* …et RIEN pour un rétrécissement : on transmet moins que ce qui a été accepté, ce qui est
       toujours permis. Reposer la question dans ce cas serait une relance sans objet. */
    const lib2 = require('../lib/consentements.js');
    assert.ok(lib2.CHAMPS_TRANSMISSIBLES, 'catalogue chargé');
});

test('un REFUS ne se rouvre pas, même si la liste change', () => {
    /* LA RÈGLE QUI GOUVERNE DÉJÀ LA PREMIÈRE FENÊTRE (art. 4(11)) : reposer la question à qui a
       dit non le pousse à accepter pour avoir la paix, et un consentement arraché ne couvre rien.
       Élargir la liste ne doit donc pas rouvrir un dossier clos — d'où le `par[k].accorde` en tête
       du calcul, qui rend `ajoutes` vide pour un refus. */
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'lib/consentements.js'), 'utf8'));
    assert.match(src, /ajoutes: par\[k\] && par\[k\]\.accorde \?/,
        'Un refus ne doit produire aucun ajout à re-soumettre.');
});

test('« conserver » enregistre un ACCORD, pas un refus', () => {
    const ctrl = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/espace.controller.js'), 'utf8'));
    assert.match(ctrl, /if \(req\.body\.conserver === true\)/);
    assert.match(ctrl, /if \(req\.body\.accorde !== true\)/,
        'Conserver un accord suppose de l\'avoir donné : la combinaison refus+conserver n\'a pas de sens.');
    assert.match(ctrl, /champsForces = f\.champsAnnonces;/,
        'Le périmètre refigé doit être CELUI QUI AVAIT ÉTÉ ANNONCÉ, pas celui du jour.');
    assert.match(ctrl, /Aucun accord antérieur à conserver/,
        'Sans accord antérieur, « conserver » doit être refusé plutôt qu\'inventer un consentement.');

    const src = sansCommentaires(fs.readFileSync(path.join(API, 'lib/consentements.js'), 'utf8'));
    assert.match(src, /const champs = champsForces \? champsValides\(champsForces\) : await champsOrganisme\(conn, orgId\);/,
        'La liste figée doit suivre `champsForces` quand il est fourni…');
    assert.match(src, /const formulation = formulationPour\(champs\);/,
        '…et la phrase gelée correspondre à CETTE liste, pas à la nouvelle.');
});

test('le second bouton ne dit pas « Je refuse » en mise à jour', () => {
    /* « Je refuse » aurait laissé croire qu'on retire TOUT son accord, alors qu'on garde
       exactement ce qu'on avait accepté. Le libellé doit dire ce que le serveur enregistre :
       un consentement maintenu, pas une opposition. */
    const comp = fs.readFileSync(path.join(UI, 'components/ConsentModal.jsx'), 'utf8');
    assert.match(comp, /maj \? "Conserver mon accord actuel" : "Je refuse"/);
    assert.match(comp, /maj \? "Accepter la nouvelle version" : "J'accepte"/);
    assert.match(comp, /onClick=\{\(\) => \(maj \? repondre\(true, true\) : repondre\(false\)\)\}/,
        'En mise à jour, le second bouton envoie un ACCORD conservé — pas un refus.');
    /* ET CE QUI S'AJOUTE EST NOMMÉ EN TÊTE : reposer la question sans dire ce qui a changé
       obligerait à relire deux paragraphes pour trouver le mot nouveau. Personne ne le fait. */
    assert.match(comp, /Ce qui s'ajoute à votre accord/);
    assert.match(comp, /aDemander\.ajoutes\.map/);
});

test('la fenêtre se déclenche sur les DEUX cas, et compte ses relances', () => {
    const comp = fs.readFileSync(path.join(UI, 'components/ConsentModal.jsx'), 'utf8');
    assert.match(comp, /liste\.find\(\(f\) => f\.accorde === null\) \|\| liste\.find\(\(f\) => f\.ajoutes\?\.length\)/,
        'Jamais demandé OU liste élargie.');
    /* Le compteur de relances vaut pour les deux : fermer sans répondre ne doit pas produire une
       fenêtre à chaque connexion, sinon l'insistance fabrique le consentement extorqué qu'on
       cherche à éviter. */
    assert.match(comp, /if \(premiere\) \{ setADemander\(premiere\); compterUneRelance\(\); \}/);
});

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   L'EXPORT PAR PARTENAIRE — le pendant de l'export par session. */

test("il n'existe qu'UN SEUL chemin d'export, et il applique l'intersection", () => {
    /* IL Y EN AVAIT DEUX — un par session, un par partenaire — et l'école a tranché : c'est sur la
       fiche du partenaire qu'on choisit à qui l'on écrit, donc là que la liste se prépare. Un même
       geste offert à deux endroits oblige à se demander lequel fait quoi, et sur un écran qui
       manipule des coordonnées cette hésitation est un coût.
       Les deux fonctions extraites du temps où il y en avait deux RESTENT séparées : elles
       nomment ce qu'elles garantissent (`partenaireRecevable` : contrat en cours et destinataire
       déclaré ; `composerLignes` : l'intersection). Les réinliner ferait disparaître ces noms du
       code, et avec eux la raison d'être des contrôles. */
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/consentement.controller.js'), 'utf8'));
    assert.doesNotMatch(src, /const produireTransmission = async/,
        "L'export par session doit avoir disparu du contrôleur, pas seulement de l'écran.");
    assert.strictEqual((src.match(/async function composerLignes\(/g) || []).length, 1);
    assert.strictEqual((src.match(/async function partenaireRecevable\(/g) || []).length, 1);
    assert.match(src, /choisis\.filter\(\(c\) => annonces\.includes\(c\)\)/,
        "L'intersection reste la règle : ce que l'école transmet ∩ ce qui a été annoncé à chacun.");

    /* ON DÉPOUILLE LES COMMENTAIRES : le fichier de routes EXPLIQUE que la transmission a quitté
       cette page, donc le mot y figure. Sans dépouillement, l'assertion échouerait sur sa propre
       explication — le même piège que le `referrerPolicy` trouvé dans sa documentation. */
    const routes = sansCommentaires(fs.readFileSync(path.join(API, 'routes/session.routes.js'), 'utf8'));
    assert.doesNotMatch(routes, /transmission/i,
        'La page d\'une session ne doit plus exposer de route de transmission…');
    assert.match(fs.readFileSync(path.join(API, 'routes/partner.routes.js'), 'utf8'), /router\.post\('\/:id\/transmission'/,
        '…et la fiche du partenaire reste le seul point d\'entrée.');
});


test("l'export par partenaire est BORNÉ dans le temps", () => {
    /* « Tout depuis toujours » enverrait à un fournisseur les coordonnées de gens formés il y a
       six ans, qui ont consenti dans un tout autre contexte. La minimisation ne porte pas que sur
       les CHAMPS : elle porte aussi sur COMBIEN DE PERSONNES. */
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/consentement.controller.js'), 'utf8'));
    const bloc = src.slice(src.indexOf('const produireTransmissionPartenaire'));
    assert.match(bloc, /if \(!depuis \|\| !jusqua\)/, 'la période doit être exigée…');
    assert.match(bloc, /status\(422\)/, '…et son absence refusée');
    assert.match(bloc, /s\.end_date BETWEEN \? AND \?/,
        'On borne sur la date de FIN : une session en cours n\'a pas de stagiaires formés.');
    /* UN STAGIAIRE INSCRIT À DEUX SESSIONS N'APPARAÎT QU'UNE FOIS : le partenaire recevrait sinon
       deux lignes pour la même personne et croirait à deux prospects. */
    assert.match(bloc, /const vus = new Set\(\);/);
    assert.match(bloc, /if \(!vus\.has\(l\.id\)\)/);
});

test("l'export ne propose que les partenaires que le serveur accepterait", () => {
    /* LE FILTRE A CHANGÉ DE PLACE, PAS DE RÔLE. Il y avait un bouton par fiche, masqué pour les
       partenaires inéligibles ; il y a désormais UN bouton pour la page, et c'est sa liste
       déroulante qui écarte les mêmes. La règle est la même — destinataire déclaré ET contrat en
       cours, les deux conditions que le serveur vérifie — et la raison aussi : proposer un
       partenaire que le serveur refusera mène à un refus, qui se lit comme une panne alors que
       c'est un réglage qui manque. */
    const comp = fs.readFileSync(path.join(UI, 'components/ExportPartenaire.jsx'), 'utf8');
    assert.match(comp, /Number\(p\.recoit_coordonnees\) === 1 && etatContrat\(p\)\.actif !== false/,
        'La liste doit écarter les non-destinataires et les contrats échus.');
    /* AUCUN ÉLIGIBLE, AUCUN BOUTON : un bouton dont la liste serait vide n'apprend rien, sinon
       qu'il faut aller cocher quelque chose quelque part — ce qu'il ne dit pas. */
    assert.match(comp, /if \(!eligibles\.length\) return null;/);
    /* ET UN SEUL POUR TOUTE LA PAGE : répété sur vingt-deux fiches, il devenait un élément
       d'interface de plus à ignorer, et laissait croire que chaque partenaire avait le sien. */
    const page = fs.readFileSync(path.join(UI, 'pages/Partenaires.jsx'), 'utf8');
    assert.strictEqual((page.match(/<ExportPartenaire/g) || []).length, 1,
        'Un seul export pour la page, pas un par fiche.');
    assert.match(page, /<ExportPartenaire partenaires=\{partners\}/,
        'Il reçoit la LISTE des partenaires, et choisit lui-même les éligibles.');
});


test("une période sans consentement ne journalise RIEN", () => {
    /* Le journal répond à « à qui avez-vous donné mes coordonnées ? » (art. 15). Y inscrire un
       envoi qui n'a rien envoyé le rendrait faux dans le sens le plus gênant : il annoncerait une
       transmission qui n'a pas eu lieu. */
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/consentement.controller.js'), 'utf8'));
    const bloc = src.slice(src.indexOf('const produireTransmissionPartenaire'));
    const avant = bloc.indexOf('journalise: false');
    const insert = bloc.indexOf('INSERT INTO partner_disclosure');
    assert.ok(avant > 0 && avant < insert,
        'le retour « aucun consentement » doit précéder toute écriture au journal');
});

test("une colonne manquante ne s'annonce pas comme un défaut de code", () => {
    /* ─────────────────────────────────────────────────────────────────────────────────────────
       LE MESSAGE AFFIRMAIT « c'est un défaut du logiciel, pas une migration manquante ». Il avait
       tort, et il a envoyé chercher la panne là où elle n'était pas.

       `CREATE TABLE IF NOT EXISTS` NE RATTRAPE RIEN sur une table déjà présente : si elle existe
       dans une forme antérieure, rejouer la migration l'ignore intégralement — aucune colonne
       ajoutée, aucune erreur levée. On croit la migration passée. C'est ce qui est arrivé à
       `partner_disclosure.champs_envoyes`, et l'export échouait au moment de JOURNALISER, donc
       après avoir composé la liste : le diagnostic n'en était que plus opaque.

       Le message NOMME désormais la colonne et laisse les deux hypothèses ouvertes. Nommer coûte
       une ligne et fait gagner une demi-heure — c'est ce nom qui a permis d'identifier la cause. */
    const src = sansCommentaires(fs.readFileSync(path.join(API, 'controllers/consentement.controller.js'), 'utf8'));
    assert.match(src, /Unknown column '\(\[\^'\]\+\)'/,
        'Le message doit extraire le NOM de la colonne manquante.');
    assert.doesNotMatch(src, /défaut du logiciel, pas \+?\s*'?\+?\s*'?une migration manquante/,
        'Il ne doit plus exclure la piste de la migration.');
    assert.match(src, /CREATE TABLE IF NOT EXISTS` ne /,
        'Et dire POURQUOI une migration jouée peut n\'avoir rien ajouté.');

    /* ET LE RATTRAPAGE EXISTE : `ADD COLUMN IF NOT EXISTS` agit colonne par colonne, seule forme
       réellement rejouable. Il porte sur TOUTES les colonnes, pas seulement celle qui manquait —
       rien ne garantit que les autres soient là. */
    const MIG136 = path.join(MIG, '136_partner_disclosure_colonnes.sql');
    assert.ok(fs.existsSync(MIG136), 'le rattrapage doit exister');
    const sql = fs.readFileSync(MIG136, 'utf8');
    for (const c of ['session_id', 'learner_ids', 'learners_count', 'champs_envoyes', 'envoye_par', 'sent_at']) {
        assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}\\b`), `${c} doit être rattrapée`);
    }
    /* SUR LE SQL DÉPOUILLÉ : le fichier EXPLIQUE pourquoi `CREATE TABLE IF NOT EXISTS` ne
       rattrape rien, donc les mots y figurent — dans un commentaire. Troisième fois aujourd'hui
       qu'une assertion se heurte à sa propre documentation ; il faut dépouiller par défaut. */
    assert.doesNotMatch(sql.replace(/\/\*[\s\S]*?\*\//g, ''), /CREATE TABLE/,
        'Ce fichier COMPLÈTE la table, il ne la crée pas.');
    assert.ok(fs.existsSync(path.join(MIG, '136_revert_partner_disclosure_colonnes.sql')));
});
