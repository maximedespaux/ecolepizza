/**
 * Qui paie une commande boutique, et sous quelle forme elle est facturée.
 *
 * LE CHOIX APPARTIENT À L'ÉCOLE, PAS AU STAGIAIRE. Une première version le posait au panier
 * (« à moi » / « à mon entreprise »). C'était une erreur de répartition : le stagiaire ne connaît
 * pas forcément l'accord de prise en charge entre son employeur et l'école, et celle-ci devait de
 * toute façon revérifier derrière. La question se pose donc une seule fois, au bon endroit — à
 * l'émission. Aucune colonne n'est stockée sur la demande : les choix partent directement dans la
 * requête de facturation.
 *
 * TROIS DÉFAUTS GELÉS ICI, tous de la même famille : un choix SUBI au lieu d'être fait.
 *
 * 1. L'ACHETEUR ÉTAIT TOUJOURS LE STAGIAIRE. `invoiceShopRequest` écrivait son nom en dur dans
 *    `buyer_name`. Un stagiaire envoyé par son employeur commande pourtant avec l'argent de
 *    l'entreprise : c'est elle qu'il faut facturer, avec son SIRET et son n° de TVA. Il fallait
 *    créer la facture puis corriger l'acheteur à la main — en y pensant.
 *
 * 2. AUCUNE ENTITÉ ÉMETTRICE. La facture prenait un numéro BQ-AAAA-NNNN à part, hors des
 *    séquences des émettrices. Deux numérotations parallèles pour le même organisme.
 *
 * 3. LE MODÈLE ÉTAIT DEVINÉ au moment du PDF (`pickInvoiceTemplate`) : on découvrait la
 *    présentation retenue en ouvrant le document.
 *
 * L'entreprise proposée est celle de la FICHE du stagiaire, lue au moment de facturer : l'école
 * édite avec l'employeur du jour, sans qu'aucun choix n'ait à être conservé entre-temps.
 *
 * Ces tests lisent le SOURCE (cf. CLAUDE.md § 2.5) : ces fonctions sont des routes Express
 * derrière authentification, et les vérifier à l'exécution demanderait serveur, base et session.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const MIG = path.join(API, '..', '..', 'database/migrations');
const srcShop = fs.readFileSync(path.join(API, 'controllers/shopRequest.controller.js'), 'utf8');
const srcEspace = fs.readFileSync(path.join(API, 'controllers/espace.controller.js'), 'utf8');
const srcPanier = fs.readFileSync(path.join(APP, 'ui/pages/Boutique.jsx'), 'utf8');
const srcOrg = fs.readFileSync(path.join(APP, 'ui/pages/DemandesBoutique.jsx'), 'utf8');

test('le panier stagiaire ne pose AUCUNE question de facturation', () => {
    // Le défaut à ne pas réintroduire : demander au stagiaire qui paie.
    assert.doesNotMatch(srcPanier, /bill_to/, 'le panier ne doit pas envoyer de destinataire');
    assert.doesNotMatch(srcPanier, /billTo/, 'aucun choix de destinataire ne doit subsister au panier');
    assert.doesNotMatch(srcEspace, /bill_to/,
        'la création de demande ne doit rien enregistrer sur le destinataire');
});

test('la 124 ne peut plus être jouée : seul son retour arrière subsiste', () => {
    /* Elle stockait le choix du destinataire sur la demande. Le choix étant revenu à l'école, qui
     * le fait à l'émission, ces colonnes n'ont plus d'alimentation. Le fichier ALLER est supprimé
     * pour qu'aucune base neuve ne les crée ; le REVERT reste, parce que la base de production les
     * a déjà reçues et qu'il faut pouvoir les retirer. Laisser les deux ferait rejouer une
     * migration abandonnée à la prochaine installation. */
    const migs = fs.readdirSync(MIG);
    assert.ok(!migs.includes('124_shop_request_facturation.sql'),
        'le fichier aller de la 124 ne doit plus exister');
    assert.ok(migs.includes('124_revert_shop_request_facturation.sql'),
        'le retour arrière doit rester : la base de production a déjà reçu les colonnes');
});

test('la facture suit le destinataire choisi, pas le stagiaire en dur', () => {
    assert.match(srcShop, /const versEntreprise = req\.body\?\.bill_to === 'ENTREPRISE' && !!r\.company_id/,
        'le choix vient de l\'école, et reste borné à un employeur réel');
    assert.match(srcShop, /versEntreprise[\s\S]{0,80}r\.company_name/,
        'l\'acheteur doit devenir le nom de l\'entreprise');
});

test('une entité émettrice donne SON numéro, sinon on garde le compteur BQ', () => {
    assert.match(srcShop, /resolveEmitter\(conn, orgId, req\.body\?\.billing_profile_id/,
        'l\'émettrice doit être résolue depuis le choix de l\'organisme');
    assert.match(srcShop, /if \(emetteur\) \{[\s\S]{0,120}nextNumberForEmitter/,
        'avec une émettrice, le numéro vient de sa séquence');
    assert.match(srcShop, /`BQ-\$\{year\}-\$\{String\(n\)\.padStart\(4, '0'\)\}`/,
        'sans émettrice, le compteur BQ historique doit rester');
});

test('le modèle de facture est enregistré au lieu d\'être deviné', () => {
    assert.match(srcShop, /const slugChoisi = req\.body\?\.template_slug \|\| null/,
        'le modèle vient du choix fait à l\'émission');
    assert.match(srcShop, /ajouter\('template_slug', slugChoisi\)/,
        'le slug doit être figé sur la facture (migration 121)');
});

test('aucune colonne facultative n\'est écrite sans avoir été sondée', () => {
    // Le défaut classique de ce projet : un INSERT qui échoue en entier sur une base dont une
    // migration n'est pas jouée.
    assert.match(srcShop, /if \(await colonneFacture\(conn, col\)\) \{ ic\.push\(col\); iv\.push\(val\); \}/,
        'chaque colonne optionnelle doit passer par la sonde');
});

test('l\'entreprise proposée est celle de la FICHE du stagiaire', () => {
    // Et pas une entreprise figée sur la demande : l'école facture au moment où elle édite,
    // avec l'employeur du jour.
    assert.match(srcShop, /LEFT JOIN company c ON c\.id = l\.company_id/,
        'la jointure doit partir du stagiaire');
    assert.match(srcShop, /l\.company_id, c\.name AS company_name/);
});

test('on ENCAISSE avant de facturer, des deux côtés et sur le serveur', () => {
    /* Le flux enchaînait Prête → Facturé → Payé : la facture précédait l'encaissement, alors
     * qu'elle est censée le constater. Les deux interfaces étaient d'accord entre elles, mais en
     * désaccord avec l'ordre déclaré par le serveur (STATUSES) — personne ne pouvait dire lequel
     * faisait foi. Les trois disent maintenant la même chose. */
    const attendu = '"NOUVELLE", "EN_PREPARATION", "PRETE", "PAYE", "FACTUREE", "REMISE"';
    assert.ok(srcOrg.includes(`const FLOW = [${attendu}]`), 'ordre côté organisme');
    assert.ok(srcPanier.includes(`const DEMANDE_FLOW = [${attendu}]`), 'ordre côté stagiaire');
    assert.match(srcShop, /'NOUVELLE', 'EN_PREPARATION', 'PRETE', 'PAYE', 'FACTUREE', 'REMISE'/,
        'ordre côté serveur');
});

test('la facture naît PAYÉE, avec le moyen de règlement', () => {
    // Elle sortait en BROUILLON, sans trace de la façon dont elle avait été réglée : il fallait
    // la rouvrir pour la solder, alors que l'argent était encaissé à l'étape précédente.
    assert.match(srcShop, /'FACTURE', number, totalHt\.toFixed\(2\), 0, 'PAYEE'/,
        'le statut doit être PAYEE à la création');
    assert.match(srcShop, /ajouter\('payment_method', moyen\)/);
    assert.match(srcShop, /ajouter\('due_date', echeance\)/);
});

test('le suivi de la commande ne réécrit PLUS le statut de la facture', () => {
    /* Le défaut que l'inversion aurait créé : revenir de « Remis » à « Facturé » repassait la
     * facture de PAYÉE à ÉMISE — un simple retour en arrière dans le suivi faisait réapparaître
     * une créance déjà réglée. La facture reçoit son statut une fois, à sa création. */
    assert.doesNotMatch(srcShop, /UPDATE invoice SET status = 'PAYEE'/,
        'le passage à Payé ne doit plus toucher la facture');
    assert.doesNotMatch(srcShop, /UPDATE invoice SET status = 'EMISE'/,
        'et le retour en arrière encore moins');
});

test('l\'échéance n\'est acceptée qu\'au format date', () => {
    // Une chaîne libre passée telle quelle à MySQL donnerait une date nulle silencieuse.
    assert.ok(srcShop.includes('/^\\d{4}-\\d{2}-\\d{2}$/.test'),
        'la date doit être validée avant écriture');
});

test('le règlement se ventile en PLUSIEURS moyens, avec leurs montants', () => {
    /* Un champ unique ne pouvait dire qu'UN moyen : régler 30 € en espèces et le reste en carte
     * obligeait à en choisir un et à taire l'autre — la facture mentait sur l'encaissement.
     * On réutilise le composant de la caisse plutôt que d'en écrire un second : deux versions
     * divergeraient sur le solde de la dernière ligne ou la saisie d'un chèque. */
    assert.match(srcOrg, /import PaiementSplit, \{ resolvePayments \} from "\.\.\/components\/PaiementSplit\.jsx"/,
        'le composant de la caisse doit être réutilisé, pas recopié');
    assert.match(srcOrg, /<PaiementSplit options=\{moyens\} total=\{totalTtc\}/,
        'la ventilation doit porter sur le total réellement encaissé');
    assert.match(srcOrg, /payments: resolvePayments\(paiements, totalTtc\)\.parts/,
        'le solde doit être résolu comme à la caisse avant envoi');
    assert.doesNotMatch(srcOrg, /<label>Moyen de paiement<\/label>/,
        'le champ unique doit avoir disparu');
});

test('le serveur enregistre la ventilation, pas seulement un résumé', () => {
    assert.match(srcShop, /const ventilation = parts\.length \? JSON\.stringify\(parts\) : null/);
    assert.match(srcShop, /ajouter\('payment_split', ventilation\)/,
        'le détail chiffré doit être conservé');
    assert.match(srcShop, /parts\.map\(\(p\) => p\.method\)\.join\(' \+ '\)/,
        'et le résumé lisible reconstruit à partir des parts');
});

test('la modale propose l\'échéance du jour et les moyens de l\'organisme', () => {
    assert.match(srcOrg, /<label>Date d'échéance<\/label>/);
    assert.match(srcOrg, /useState\(\(\) => new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\)/,
        'l\'échéance doit être pré-remplie au jour même');
    assert.match(srcOrg, /getShopSettings\(\)/,
        'les moyens doivent venir des réglages de l\'organisme, pas d\'une liste recopiée');
});

test('l\'organisme choisit avant d\'émettre, il ne subit plus', () => {
    assert.match(srcOrg, /function FacturerModal/, 'un choix doit être proposé avant création');
    assert.match(srcOrg, /if \(nextIsFacture\) return setFactureOuverte\(true\)/,
        '« Suivant » vers Facturé doit ouvrir le choix, plus facturer directement');
    assert.match(srcOrg, /const \[billTo, setBillTo\] = useState\("STAGIAIRE"\)/,
        'par défaut on facture le stagiaire : la prise en charge est l\'exception');
    for (const champ of ['bill_to', 'billing_profile_id', 'template_slug']) {
        assert.match(srcOrg, new RegExp(champ), `${champ} doit être envoyé par la modale`);
    }
});
