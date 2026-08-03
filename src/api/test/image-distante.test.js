/**
 * LES IMAGES HÉBERGÉES AILLEURS (migration 133) — ce qui doit rester impossible, et ce qu'on doit
 * continuer de dire.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * DEUX SUJETS DISTINCTS DANS UN SEUL FICHIER, parce qu'ils naissent du même choix.
 *
 *  1. LA VALEUR FINIT DANS UN `src`. Une adresse acceptée sans contrôle y entre telle quelle. Le
 *     filtre est une LISTE BLANCHE (`http:`/`https:`) et non une liste noire — une liste noire
 *     serait toujours en retard d'un schéma.
 *
 *  2. UNE IMAGE DISTANTE EST UNE REQUÊTE VERS UN TIERS. Ce n'est pas le serveur qui va la
 *     chercher, c'est le NAVIGATEUR DU STAGIAIRE : le site du fournisseur voit passer son adresse
 *     IP. La page « Confidentialité » affirmait « AUCUN TIERS n'est chargé ». Cette phrase est
 *     devenue fausse le jour où la première image distante s'est affichée — et rien ne l'aurait
 *     signalé, puisque le test des traceurs ne cherche que des domaines de mesure d'audience.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { validerImage, LONGUEUR_MAX } = require('../lib/imageDistante.js');
const UI = path.join(__dirname, '..', '..', 'app', 'ui');

test('seuls http et https sont acceptés', () => {
    for (const bon of ['https://x.fr/a.png', 'http://x.fr/a.jpg', 'https://cdn.x.fr/p?w=200&h=200']) {
        assert.strictEqual(validerImage(bon).ok, true, `${bon} doit passer`);
    }
    /* LISTE BLANCHE, PAS LISTE NOIRE. `javascript:` ne s'exécute plus dans un `<img src>` sur les
       navigateurs actuels — mais la même chaîne finit un jour dans un `<a href>` au gré d'une
       refonte, et on ne laisse pas entrer en base une valeur dont l'innocuité dépend du contexte
       où on la relira. `data:` passerait « ça commence par un protocole connu » tout en logeant
       un SVG avec script sans jamais quitter la base. */
    for (const mauvais of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
        'file:///etc/passwd', 'ftp://x.fr/a.png', 'vbscript:msgbox']) {
        assert.strictEqual(validerImage(mauvais).ok, false, `${mauvais} doit être refusé`);
    }
});

test('vider le champ retire l\'image, ce n\'est pas une erreur', () => {
    /* Refuser la chaîne vide rendrait une image IMPOSSIBLE À RETIRER : on pourrait en poser une,
       jamais l'enlever — exactement le défaut qui avait été corrigé sur la remise stagiaire. */
    assert.deepStrictEqual(validerImage('').valeur, null);
    assert.deepStrictEqual(validerImage('   ').valeur, null);
    assert.strictEqual(validerImage('').ok, true);
    // `undefined` = champ NON ENVOYÉ, ce qui ne doit rien écrire du tout : distinct d'un vidage.
    assert.strictEqual(validerImage(undefined).valeur, undefined);
});

test('une adresse trop longue est refusée, jamais tronquée', () => {
    /* Tronquer donnerait une image qui ne s'affiche jamais, sans que rien ne dise pourquoi : le
       lien serait en base, l'air correct, et simplement coupé au 500ᵉ caractère. */
    const trop = `https://x.fr/${'a'.repeat(LONGUEUR_MAX)}.png`;
    const r = validerImage(trop);
    assert.strictEqual(r.ok, false);
    assert.match(r.message, /tronquée/);
});

test('« http:// » passe mais avertit', () => {
    /* ARBITRAGE : beaucoup de sites de fournisseurs traînent encore en HTTP. Le refuser serait
       excessif ; le laisser passer en silence produirait une image qui marche en local (serveur
       de développement en clair) et manque en ligne (contenu mixte bloqué) — le pire des deux. */
    assert.strictEqual(validerImage('http://x.fr/a.png').ok, true);
    assert.match(validerImage('http://x.fr/a.png').avertissement, /bloque les images non/);
    assert.strictEqual(validerImage('https://x.fr/a.png').avertissement, null);
});

test('le composant d\'affichage ne fuite pas la page consultée', () => {
    /* `referrerPolicy="no-referrer"` EST LA PRÉCAUTION LA MOINS ÉVIDENTE ET LA PLUS IMPORTANTE.
       Sans elle, le fournisseur reçoit l'ADRESSE DE LA PAGE en cours : il n'apprend pas seulement
       qu'un visiteur a chargé son image, mais ce que cette personne regardait — et sur un espace
       stagiaire, une URL peut désigner une session ou une commande. L'image s'affiche exactement
       pareil sans. */
    /* ON DÉPOUILLE LES COMMENTAIRES AVANT DE CHERCHER, et ce n'est pas une précaution de style :
       le fichier EXPLIQUE `referrerPolicy="no-referrer"` juste au-dessus de l'attribut. Sans
       dépouillement, retirer l'attribut laissait le test au vert — il trouvait la mention dans la
       prose. Vérifié en supprimant réellement l'attribut : la suite restait verte. Un test qui lit
       du source doit lire du CODE, sinon il atteste d'une intention au lieu d'un comportement. */
    const c = fs.readFileSync(path.join(UI, 'components/ImageLien.jsx'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.match(c, /referrerPolicy="no-referrer"/,
        "Sans cela, le site tiers apprend quelle page le stagiaire consultait.");
    assert.match(c, /onError=\{\(\) => setMorte\(true\)\}/,
        "Un lien mort doit disparaître, pas afficher l'icône brisée du navigateur.");
    assert.match(c, /loading="lazy"/,
        'Quarante articles ne doivent pas déclencher quarante requêtes au premier affichage.');
});

test('la page Confidentialité ne dit plus « aucun tiers »', () => {
    /* LE DÉFAUT QUE CE TEST EXISTE POUR EMPÊCHER : ajouter une fonctionnalité qui contacte un
       tiers en laissant une page à valeur légale affirmer le contraire. La nuance entre « aucun
       TRACEUR tiers » (vrai) et « aucun tiers » (faux) porte toute la différence. */
    const t = fs.readFileSync(path.join(UI, 'lib/traceurs.js'), 'utf8');
    assert.doesNotMatch(t, /AUCUN TIERS n'est chargé/,
        'Des images sont chargées depuis les sites des fournisseurs : la phrase est devenue fausse.');
    assert.match(t, /AUCUN TRACEUR TIERS n'est\s+\* chargé/,
        'La formulation exacte doit rester : pas de traceur, mais bien des tiers contactés.');
});

test('le chargement d\'images tierces est DÉCLARÉ, pas seulement commenté', () => {
    /* Un commentaire dans le code ne remplit aucune obligation d'information : c'est la page qui
       informe, et elle se rend depuis `TRANSMISSIONS`. */
    const t = fs.readFileSync(path.join(UI, 'lib/traceurs.js'), 'utf8');
    const bloc = t.slice(t.indexOf('export const TRANSMISSIONS'));
    assert.match(bloc, /Sites des fournisseurs et partenaires \(images\)/,
        'La page doit nommer ce destinataire.');
    assert.match(bloc, /adresse IP/, 'Et dire ce qui est transmis.');
    assert.match(bloc, /no-referrer/, 'Et ce qui ne l\'est PAS, grâce à la précaution prise.');
});

test('la migration 133 a son revert, et ne recrée pas une colonne existante', () => {
    const MIG = path.join(__dirname, '..', '..', '..', 'database', 'migrations');
    const sql = fs.readFileSync(path.join(MIG, '133_images_distantes.sql'), 'utf8');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS logo_url varchar\(500\)/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS image_url varchar\(500\)/);
    /* `partner_product.image_url` EXISTE DÉJÀ depuis la 095 : la recréer ici serait sans effet
       (IF NOT EXISTS) mais ferait croire qu'elle est nouvelle. Le fichier doit le dire. */
    assert.match(sql, /existe DÉJÀ, depuis la 095/);
    assert.ok(fs.existsSync(path.join(MIG, '133_revert_images_distantes.sql')), 'un revert est obligatoire');
});

test('aucun `null` de la base n\'entre dans un champ de formulaire', () => {
    /* LE DÉFAUT, MESURÉ SUR LA VRAIE BASE : 22 fiches partenaires, et TOUS les champs facultatifs
     * à `null` — contact, téléphone, site, ville, remise, offre, notes, logo. Ouvrir n'importe
     * quelle fiche rendait huit champs NON CONTRÔLÉS, dont les deux zones de texte.
     *
     * `{ ...EMPTY, ...partner }` avait l'air correct : EMPTY pose des chaînes vides, la fiche
     * complète. Sauf que la fiche apporte ses propres `null`, et qu'ils ÉCRASENT les chaînes
     * vides. React abandonne alors le champ au DOM : `setForm` cesse d'être la source de vérité,
     * et le seul signe est un avertissement en console que personne ne lit.
     *
     * ET LE PIÈGE DE MESURE VAUT D'ÊTRE NOTÉ : on ne peut PAS le constater en lisant `.value`
     * dans le navigateur. La propriété DOM d'un champ est toujours une chaîne — React y met « »
     * tout en avertissant. Une vérification par `.value` rend « aucune valeur nulle » aussi bien
     * avant qu'après correction : elle ne prouve rien.
     *
     * La correction PARCOURT les clés d'EMPTY au lieu de les citer. Les traiter à la main, c'est
     * en oublier un au prochain ajout — c'est exactement ce qui venait de se produire : trois
     * champs rattrapés sur onze. */
    const page = fs.readFileSync(path.join(UI, 'pages/Partenaires.jsx'), 'utf8');
    assert.match(page,
        /for \(const k of Object\.keys\(EMPTY\)\) if \(partner\[k\] !== undefined && partner\[k\] !== null\)/,
        'La normalisation doit être générique, pas champ par champ.');
    assert.doesNotMatch(page, /useState\(\(\) => \(\{\s*\.\.\.EMPTY, \.\.\.partner,/,
        'Le simple étalement laisse passer les `null` de la base.');

    /* Et la photo d'un article doit être RELUE à l'édition : sans elle, le champ s'ouvrait vide
       alors que l'article en avait une — impossible de la voir ni de la corriger, seulement d'en
       coller une autre à l'aveugle. */
    const inv = fs.readFileSync(path.join(UI, 'pages/Inventaire.jsx'), 'utf8');
    assert.match(inv, /image_url: item\.image_url \|\| ""/,
        "openEdit doit charger la photo existante, et sans jamais laisser passer `null`.");
});
