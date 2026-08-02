/**
 * Un apport partenaire se CORRIGE, et il s'affiche pour ce qu'il est.
 *
 * PREMIER DÉFAUT — `PATCH /comptabilite/revenus/:id` n'avait AUCUN appelant. La route existe,
 * valide ses champs, vérifie que le partenaire appartient bien à l'organisme et journalise à
 * l'audit : du code complet, jamais exécuté. Un apport ne pouvait donc que se supprimer et se
 * ressaisir — et comme il entre dans le chiffre d'affaires, une faute de frappe sur le montant
 * n'attendait pas la seconde saisie.
 *
 * SECOND DÉFAUT, et c'est lui qui rendait le premier dangereux — la liste des commissions
 * renvoyée par `/api/partenaires` ne SÉLECTIONNAIT PAS `re.category`, et `apportsOfPartner`
 * écrivait le type en dur à "COMMISSION". Une subvention s'affichait donc comme une commission.
 * Anodin en lecture seule ; au moment d'ouvrir un formulaire de modification, le champ « Type »
 * serait arrivé sur « Commission » pour une subvention, et l'aurait CONVERTIE à l'enregistrement.
 * Le défaut d'affichage devenait un défaut de donnée.
 *
 * TROISIÈME POINT — la page /produit-divers a été supprimée (elle ne montrait plus qu'un
 * sous-ensemble de Comptabilité, la saisie étant passée sur Partenaires). Le contrôle d'accès
 * par rubrique rattachait `comptabilite/revenus*` à cette page : laissé tel quel, il aurait
 * désigné une rubrique absente du menu — donc introuvable dans `nav_access`, donc 403 sur
 * l'enregistrement d'une commission pour tout rôle configurable.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const APP = path.join(API, '..', 'app');
const srcPartCtrl = fs.readFileSync(path.join(API, 'controllers/partner.controller.js'), 'utf8');
const srcSection = fs.readFileSync(path.join(API, 'middlewares/sectionAccess.middleware.js'), 'utf8');
const srcPage = fs.readFileSync(path.join(APP, 'ui/pages/Partenaires.jsx'), 'utf8');
const srcApports = fs.readFileSync(path.join(APP, 'ui/lib/apports.js'), 'utf8');
const srcClient = fs.readFileSync(path.join(APP, 'ui/api/apiClient.js'), 'utf8');
const srcNav = fs.readFileSync(path.join(APP, 'ui/lib/nav.js'), 'utf8');
const srcMain = fs.readFileSync(path.join(APP, 'ui/main.jsx'), 'utf8');

test('la modification d\'un apport a enfin un appelant', () => {
    assert.match(srcClient, /export function updateRevenue\(id, payload\)[\s\S]{0,160}method: "PATCH"/,
        'le client doit exposer le PATCH');
    assert.match(srcPage, /await updateRevenue\(apport\.srcId, \{/,
        'la page Partenaires doit appeler la mise a jour');
    // Les noms de champs du serveur ne sont PAS ceux de l'affichage (`categorie`, `montant`) :
    // se tromper ici ne casse rien au build et n'enregistre simplement rien.
    for (const champ of ['label:', 'categorie:', 'montant:', 'date:', 'partner_id:']) {
        assert.ok(srcPage.includes(champ), `le PATCH doit transmettre ${champ}`);
    }
});

test('la NATURE de l\'apport survit à un aller-retour', () => {
    assert.match(srcPartCtrl, /SELECT re\.id, re\.partner_id, re\.label, re\.amount, re\.category/,
        'la requete doit ramener `category`, sinon tout apport passe pour une commission');
    assert.match(srcApports, /type: c\.category \|\| "COMMISSION"/,
        'le type affiche doit venir de la donnee, pas d\'une constante');
    assert.doesNotMatch(srcApports, /src: "revenue", real: true,\s*\n\s*type: "COMMISSION"/,
        'le type ne doit plus etre ecrit en dur');
});

test('on ne propose de modifier que ce qui PEUT l\'être', () => {
    // Les contributions en nature n'ont ni PATCH ni route de mise à jour : un bouton
    // « Modifier » sur ces lignes ouvrirait un formulaire incapable d'enregistrer.
    assert.match(srcPage, /a\.src === "revenue" && \(/,
        'le bouton « Modifier » doit etre reserve aux commissions (revenue_extra)');
    assert.match(srcPage, /APPORT_TYPES\.filter\(\(t\) => t\.cash\)/,
        'le choix de type se limite aux natures « cash » : changer de table est hors de portee du PATCH');
});

test('la page « Produit divers » a bien disparu, ET son contrôle d\'accès a suivi', () => {
    assert.ok(!fs.existsSync(path.join(APP, 'ui/pages/ProduitDivers.jsx')), 'le fichier doit etre supprime');
    for (const [nom, src] of [['nav.js', srcNav], ['main.jsx', srcMain]]) {
        assert.ok(!/produit-divers|ProduitDivers/.test(src), `reference residuelle dans ${nom}`);
    }
    // Le point qui casse en silence : la rubrique doit suivre le geste, pas rester orpheline.
    assert.match(srcSection, /if \(base === 'comptabilite' && \/\^revenus\(\\\/\|\$\)\/\.test\(reste \|\| ''\)\) return '\/partenaires';/,
        'les revenus doivent relever de /partenaires — une rubrique qui existe encore dans le menu');
    const rubriques = new Set([...srcNav.matchAll(/\{ to: "([^"]+)"/g)].map((m) => m[1]));
    assert.ok(rubriques.has('/partenaires'),
        'la rubrique visee par le controle d\'acces doit exister dans le menu, sinon nav_access ne peut pas l\'accorder');
});
