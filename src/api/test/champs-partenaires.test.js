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
