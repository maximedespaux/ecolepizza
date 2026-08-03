/**
 * LE REGISTRE DES CONSENTEMENTS — les règles qui rendent un consentement VALIDE.
 *
 * Un consentement invalide est pire que pas de consentement : l'organisme transmet en se croyant
 * couvert. Les quatre règles gelées ici sont celles qui l'invalideraient si elles sautaient.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const UI = path.join(API, '..', 'app', 'ui');
const lire = (p) => fs.readFileSync(p, 'utf8');
const sansCommentaires = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test('un refus ne se redemande jamais', () => {
    /* LA RÈGLE CENTRALE. Reposer la question à chaque connexion à quelqu'un qui a dit non le pousse
       à accepter pour avoir la paix : le consentement cesse d'être « libre » (art. 4(11)) et ne
       couvre plus rien. Seul `accorde === null` — jamais demandé — ouvre la fenêtre. */
    const src = sansCommentaires(lire(path.join(UI, 'components/ConsentModal.jsx')));
    assert.match(src, /liste\.find\(\(f\) => f\.accorde === null\)/,
        'Seule une finalité JAMAIS DEMANDÉE doit déclencher la fenêtre.');
    assert.doesNotMatch(src, /accorde === false/,
        'Un refus ne doit jouer aucun rôle dans le déclenchement : il se retient, il ne se relance pas.');
});

test('fermer sans répondre n\'enregistre rien', () => {
    /* « Ni oui ni non » ne doit pas pouvoir s'écrire comme un refus : on enregistrerait une réponse
       que personne n'a donnée. Le serveur exige donc un booléen explicite. */
    const ctrl = lire(path.join(API, 'controllers/espace.controller.js'));
    const bloc = ctrl.slice(ctrl.indexOf('const setMyConsent'), ctrl.indexOf('const setMyConsent') + 1400);
    assert.match(bloc, /typeof req\.body\?\.accorde !== 'boolean'/,
        'Le serveur doit refuser toute réponse qui ne soit pas explicitement oui ou non.');
    assert.match(bloc, /status\(422\)/);
});

test('les relances sont bornées', () => {
    /* Ne pas répondre n'est pas refuser — la question revient donc. Mais l'insistance produirait
       le consentement extorqué qu'on cherche à éviter : après trois fois, on cesse de la poser. */
    const src = lire(path.join(UI, 'components/ConsentModal.jsx'));
    assert.match(src, /const MAX_RELANCES = 3;/);
    assert.match(src, /if \(relances\(\) >= MAX_RELANCES\) return;/);
});

test('le registre AJOUTE une ligne, il n\'en modifie aucune', () => {
    /* C'est ce qui permet de démontrer l'état AU MOMENT DE CHAQUE ENVOI. Accepter en mars, être
       transmis en avril puis se rétracter en juin ne doit pas rendre l'envoi d'avril indéfendable :
       encore faut-il que la trace de mars existe toujours. */
    const lib = sansCommentaires(lire(path.join(API, 'lib/consentements.js')));
    assert.match(lib, /INSERT INTO consent_record/);
    assert.doesNotMatch(lib, /UPDATE consent_record|DELETE FROM consent_record/,
        'Modifier ou supprimer une ligne détruirait la preuve datée que le registre existe pour produire.');
});

test('la formulation et les destinataires sont figés dans chaque réponse', () => {
    const lib = sansCommentaires(lire(path.join(API, 'lib/consentements.js')));
    /* LA PHRASE GELÉE EST CELLE DU MOMENT, et elle est maintenant DÉRIVÉE des champs choisis par
       l'école (migration 135) plutôt qu'écrite en dur. Ce que le test protège n'a pas bougé :
       c'est le TEXTE soumis qui est figé avec la réponse, pas une référence vers un texte qui
       pourrait changer ensuite. La forme, elle, a dû changer — il n'y a plus de `f.formulation`
       à recopier, mais une phrase construite juste avant l'écriture. */
    assert.match(lib, /const formulation = formulationPour\(champs\);/,
        'La phrase soumise doit être construite au moment de la réponse…');
    assert.match(lib, /destinataires\.slice\(0, 500\), formulation\.slice\(0, 600\)/,
        '…puis figée telle quelle : reformuler plus tard ne doit pas réécrire le passé.');
    /* ET LES CHAMPS ANNONCÉS SONT FIGÉS AVEC. La phrase seule ne suffirait pas : en extraire les
       champs demanderait d'analyser de la prose, et une reformulation casserait l'analyse. */
    assert.match(lib, /champs\.join\(','\), src, saisiPar \|\| null\]/,
        'La liste des champs annoncés doit être stockée à côté du texte qu\'elle a produit.');
    /* ET LES DESTINATAIRES SONT LUS EN BASE, pas écrits en dur : on NOMME les entreprises qui
       recevront les coordonnées. Une catégorie vague ne permet pas de savoir à quoi l'on dit oui,
       et une liste figée dans le code aurait vieilli au premier partenaire ajouté. */
    assert.match(lib, /SELECT name FROM partner WHERE organization_id = \?/,
        'Les destinataires doivent venir de la table `partner`.');
    assert.match(lib, /const destinataires = await destinatairesPartenaires\(conn, orgId\);/,
        "…et c'est la liste DU MOMENT DE LA RÉPONSE qui est gelée dans le registre.");
});

test('le chemin du retour existe, dans les deux sens', () => {
    /* Se rétracter doit être aussi simple qu'accepter (art. 7.3) — et c'est la contrepartie de
       « on ne redemande pas » : puisque la fenêtre ne revient plus, il faut un endroit stable. */
    const prof = lire(path.join(UI, 'components/ProfileModal.jsx'));
    assert.match(prof, /function ConsentementsBloc\(\)/);
    assert.match(prof, /basculer\(f, false\)/, 'on doit pouvoir refuser après avoir accepté…');
    assert.match(prof, /basculer\(f, true\)/, '…et accepter après avoir refusé');
});

test('la page de confidentialité dit que cette transmission repose sur l\'accord', () => {
    const page = lire(path.join(UI, 'pages/Confidentialite.jsx'));
    assert.match(page, /Uniquement avec votre accord/,
        "Sans cette mention, un lecteur comprend que ses coordonnées partent de toute façon.");
    assert.match(page, /Mon profil → Visibilité/, 'et la page doit dire OÙ revenir sur sa réponse');
});

test('le code marche sans la migration 130', () => {
    /* Tant qu'elle n'est pas jouée, l'écran ne doit rien proposer plutôt qu'afficher une demande
       qu'il ne pourrait pas enregistrer. */
    const lib = lire(path.join(API, 'lib/consentements.js'));
    assert.match(lib, /if \(isMissingSchema\(e\)\) return null;/);
    const modal = lire(path.join(UI, 'components/ConsentModal.jsx'));
    assert.match(modal, /if \(!Array\.isArray\(liste\)\) return;/);
});

/* ═════════════════════════════════════════════════════════════════════════════════════════════
   CÔTÉ ORGANISME — la liste envoyée au partenaire, et ce qui doit rester impossible.

   L'étape qui protège réellement, c'est celle-ci. Recueillir un consentement puis continuer
   d'envoyer une liste faite à la main est PIRE que de n'avoir rien demandé : on se constitue une
   preuve datée qui documente sa propre infraction. Les règles ci-dessous sont celles qui, si elles
   sautaient, rendraient l'export plus dangereux que le courriel qu'il remplace. */

const CTRL = path.join(API, 'controllers/consentement.controller.js');

test("l'export ne retient que ceux qui ont accepté", () => {
    const src = sansCommentaires(lire(CTRL));
    /* `=== true` ET NON UNE SIMPLE VÉRITÉ : `accorde` vaut `null` pour « jamais sollicité ». Un
       test lâche (`if (etat.accorde)`) écarterait bien les null aujourd'hui, mais la moindre
       valeur non booléenne — une chaîne '0' lue d'une colonne TINYINT, par exemple — passerait.
       Le filtre porte sur la SEULE valeur qui vaut accord. */
    assert.match(src, /\.filter\(\(l\) => etats\.get\(l\.id\)\?\.accorde === true\)/,
        'La liste doit se composer par un accord EXPLICITE, jamais par absence de refus.');
    /* Et le filtre vit dans le SERVEUR. Le jour où l'écran compose la liste lui-même, il redevient
       possible d'y ajouter quelqu'un — ce qui est exactement le défaut du courriel écrit à la main. */
    const ui = sansCommentaires(lire(path.join(UI, 'components/SessionConsentements.jsx')));
    assert.doesNotMatch(ui, /\.filter\([^)]*accorde/,
        "L'écran ne doit jamais composer la liste : il affiche ce que le serveur a retenu.");
});

test("sans registre lisible, on n'envoie personne", () => {
    /* LE DÉFAUT LE PLUS GRAVE POSSIBLE ICI serait un repli « par défaut » : table absente, donc on
       envoie tout le monde. Rendre une liste sans avoir lu une seule réponse, c'est transmettre
       sans consentement en croyant faire l'inverse. Chaque route doit refuser. */
    const src = sansCommentaires(lire(CTRL));
    const bloc = src.slice(src.indexOf('const produireTransmission'));
    assert.match(bloc, /refusLecture\(res, err/,
        'Une lecture impossible doit refuser, pas produire une liste.');
    assert.doesNotMatch(bloc, /catch[\s\S]{0,200}return res\.json\(\{ data: \{ [^}]*lignes: bloc\.inscrits/,
        'Aucun repli ne doit rendre les inscrits quand les consentements sont illisibles.');
});

test("l'export n'envoie que les champs annoncés au stagiaire", () => {
    /* LE LIEN EST VOLONTAIREMENT DIRECT : ce qui part EST ce que la phrase soumise énumère. Mais
       depuis que l'école choisit ses champs (migration 135), « ce qui a été annoncé » n'est plus
       une constante — c'est ce qui a été dit À CETTE PERSONNE-LÀ, le jour de sa réponse.
       D'où l'INTERSECTION : ce que l'école transmet aujourd'hui ∩ ce qui lui avait été annoncé.
       Restreindre la liste s'applique donc à tout le monde tout de suite ; l'élargir ne vaut que
       pour les réponses suivantes. On transmet toujours MOINS que ce qui a été accepté. */
    const src = sansCommentaires(lire(CTRL));
    assert.match(src, /const choisis = await consentements\.champsOrganisme\(conn, req\.user\.organization_id\);/,
        "L'export doit lire les champs que l'école a choisis…");
    assert.match(src, /choisis\.filter\(\(c\) => annonces\.includes\(c\)\)/,
        "…et les croiser avec ce qui avait été annoncé à CHAQUE stagiaire.");
    assert.doesNotMatch(src, /champs = choisis;/,
        'Envoyer tout ce que l\'école a coché ignorerait ce à quoi chacun a dit oui.');

    const lib = require('../lib/consentements.js');
    /* CHAQUE CHAMP ANNONÇABLE DOIT AVOIR SON MOT DANS LA PHRASE, sinon cocher une case ajouterait
       une colonne à l'export sans rien changer au texte — un consentement obtenu pour six champs
       servant à en transmettre sept. */
    for (const [cle, v] of Object.entries(lib.CHAMPS_TRANSMISSIBLES)) {
        assert.ok(v.annonce && v.annonce.length > 2, `le champ « ${cle} » doit savoir s'annoncer`);
        assert.ok(lib.formulationPour([cle]).includes(v.annonce),
            `« ${cle} » coché doit apparaître dans la phrase`);
    }
    /* ET UN CHAMP NON COCHÉ NE DOIT PAS S'Y GLISSER. */
    const phrase = lib.formulationPour(['nom', 'email']);
    assert.ok(!phrase.includes('téléphone'), 'un champ décoché ne doit pas être annoncé');
    assert.ok(phrase.includes('mon nom') && phrase.includes('mon adresse e-mail'));
});


test("l'organisme ne peut pas fabriquer un accord « donné en ligne »", () => {
    /* Saisir une réponse RECUEILLIE hors ligne est légitime : elle existe déjà, sur un formulaire
       papier, et refuser de l'enregistrer l'exclurait de l'export alors que la personne a accepté.
       Ce qui doit rester impossible, c'est de la faire passer pour un clic du stagiaire :
       `source` + `saisi_par` sont exactement ce qui distingue les deux, et perdre la distinction
       transformerait le registre en preuve fabriquée. */
    const src = sansCommentaires(lire(CTRL));
    assert.match(src, /source === 'espace_stagiaire'[\s\S]{0,300}status\(422\)/,
        "La route de l'organisme doit refuser la source « espace stagiaire ».");
    assert.match(src, /saisiPar: req\.user\.id/,
        'Une réponse saisie par un tiers doit porter le nom de qui la saisit.');

    const lib = require('../lib/consentements.js');
    assert.ok(lib.SOURCES.espace_stagiaire && lib.SOURCES.papier,
        'Les origines doivent rester énumérées : une valeur libre ne prouve rien.');
});

test('le registre reste en AJOUT SEUL', () => {
    /* Toute la valeur probante tient là. Un stagiaire qui accepte en mars, voit ses coordonnées
       transmises en avril puis se rétracte en juin n'invalide pas l'envoi d'avril — encore
       faut-il que la ligne de mars existe toujours. Un UPDATE effacerait la preuve recherchée. */
    const lib = sansCommentaires(lire(path.join(API, 'lib/consentements.js')));
    assert.doesNotMatch(lib, /UPDATE\s+consent_record|DELETE\s+FROM\s+consent_record/i,
        'Le registre ne se modifie ni ne se purge : chaque décision AJOUTE une ligne.');
    assert.match(lib, /INSERT INTO consent_record/);
});

test("le journal des envois garde des identifiants, pas des coordonnées", () => {
    /* Recopier e-mails et téléphones dans `partner_disclosure` créerait une SECONDE base
       personnelle à protéger et à purger, sans rien prouver de plus : les identifiants suffisent à
       répondre à « à qui avez-vous donné mes coordonnées ? » (art. 15). */
    const src = sansCommentaires(lire(CTRL));
    const bloc = src.slice(src.indexOf('INSERT INTO partner_disclosure'), src.indexOf('INSERT INTO partner_disclosure') + 700);
    assert.doesNotMatch(bloc, /\.email|\.phone/,
        'Le journal ne doit pas recopier les coordonnées transmises.');
    assert.match(bloc, /learner_ids/);
});

test("le formateur ne voit pas les consentements", () => {
    /* La minimisation ne s'arrête pas à la porte de l'organisme : savoir qui a refusé de céder ses
       coordonnées n'aide en rien à enseigner, et cette information change le regard porté sur un
       stagiaire. Le formateur lit pourtant tout le reste de la session — d'où ce test, qui gèle
       une exception que la prochaine relecture prendrait sinon pour un oubli. */
    const routes = lire(path.join(API, 'routes/session.routes.js'));
    for (const r of routes.split('\n').filter((l) => /consentements|transmission/.test(l) && /router\./.test(l))) {
        assert.match(r, /ADMIN_ROLES/, `Route trop ouverte : ${r.trim()}`);
        assert.doesNotMatch(r, /STAFF_ROLES/, `Le formateur ne doit pas y accéder : ${r.trim()}`);
    }
});
