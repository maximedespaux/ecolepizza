/**
 * L'ÉCHÉANCE D'UN CONTRAT PARTENAIRE (migration 131) — et les trois façons dont elle peut mentir.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EST NÉCESSAIRE : le calcul existe TROIS FOIS.
 *
 *   · en SQL, dans `CONTRAT_VALABLE` — c'est lui qui FILTRE la vitrine du stagiaire ;
 *   · en JavaScript serveur (`lib/contratPartenaire.js`) — pour refuser un export ;
 *   · en JavaScript navigateur (`app/ui/lib/contrat.js`) — pour AFFICHER la fin pendant la saisie,
 *     avant tout enregistrement, quand il n'y a rien à interroger.
 *
 * Les trois sont inévitables. Ce qui ne l'est pas, c'est qu'ils divergent — et une divergence ici
 * NE PROVOQUE AUCUNE ERREUR : la fiche annonce « valable jusqu'au 28 février » pour un partenaire
 * que la requête écarte déjà, ou l'inverse. Personne ne va chercher un désaccord qui ne plante pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LES DEUX DÉFAUTS GELÉS ICI ONT ÉTÉ ÉCRITS PUIS MESURÉS, ils ne sont pas théoriques.
 *
 *   1. LE FUSEAU — `new Date('2026-01-15T00:00:00')` se lit en heure LOCALE, `toISOString()`
 *      reconvertit en UTC : à Paris, minuit local devient 22 h ou 23 h LA VEILLE. La première
 *      version faisait finir un contrat de douze mois signé le 15 janvier… le 14 janvier.
 *
 *   2. LE DÉBORDEMENT DE MOIS — `setMonth` ne borne pas : 31 janvier + 1 mois donnait le 2 MARS.
 *      Un contrat d'un mois en durait deux. MySQL, lui, ramène au dernier jour du mois.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const serveur = require('../lib/contratPartenaire.js');

/* Les deux fichiers ne partagent pas de module (CommonJS d'un côté, ESM de l'autre, et le
   navigateur ne lit pas `src/api`). On charge donc la version du navigateur en transposant ses
   `export` — grossier, mais c'est le seul moyen de faire tourner LES DEUX sur les mêmes dates,
   ce qui est tout l'objet du test. */
function chargerFront() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'contrat.js'), 'utf8')
        .replace(/^export const /gm, 'const ')
        .replace(/^export function /gm, 'function ');
    const mod = {};
    // eslint-disable-next-line no-new-func
    new Function('module', `${src}\nmodule.exports = { ajouterMois, finISO, etatContrat, frISO };`)(mod);
    return mod.exports;
}
const front = chargerFront();

/* Des dates choisies pour leurs pièges, pas au hasard : passages d'année, fins de mois, année
   bissextile, contrat échu, contrat finissant le jour même. */
const CAS = [
    ['2026-01-15', 12], ['2026-01-15', 6], ['2025-08-03', 12],
    ['2026-01-31', 1], ['2024-01-31', 1], ['2024-02-29', 12],
    ['2025-11-30', 24], ['2026-12-31', 1], ['2026-03-31', 6], ['2026-05-31', 3],
];

test('le calcul du serveur et celui du navigateur ne divergent jamais', () => {
    const jour = new Date('2026-08-03T12:00:00');
    for (const [debut, duree] of CAS) {
        const p = { contrat: 1, contrat_debut: debut, contrat_duree_mois: duree };
        const s = serveur.etatContrat(p, jour);
        const f = front.etatContrat(p, jour);
        assert.deepStrictEqual(
            { fin: f.fin, jours: f.jours, actif: f.actif },
            { fin: s.fin, jours: s.jours, actif: s.actif },
            `Désaccord sur ${debut} + ${duree} mois : la fiche et le filtre diraient des choses `
            + 'différentes, sans qu\'aucune erreur ne soit levée.');
    }
});

test('la date de fin ne recule pas d\'un jour (piège du fuseau)', () => {
    /* LE DÉFAUT EXACT : `new Date(iso)` puis `toISOString()`. Douze mois à partir du 15 doivent
       tomber sur un 15, pas sur un 14 — quel que soit le fuseau de la machine. */
    assert.strictEqual(serveur.etatContrat(
        { contrat: 1, contrat_debut: '2026-01-15', contrat_duree_mois: 12 }).fin, '2027-01-15');
    assert.strictEqual(front.finISO('2026-01-15', 12), '2027-01-15');
    // Et le jour même du terme, le contrat est encore VALABLE : `jours = 0` ne doit pas écarter.
    const j = new Date('2026-08-03T12:00:00');
    const e = serveur.etatContrat({ contrat: 1, contrat_debut: '2025-08-03', contrat_duree_mois: 12 }, j);
    assert.strictEqual(e.jours, 0);
    assert.strictEqual(e.actif, true, 'Le dernier jour du contrat, il court encore.');
});

test('un mois ajouté au 31 ne saute pas dans le mois suivant', () => {
    /* `setMonth` donnait le 2 mars pour 31 janvier + 1 mois. MySQL rend le 28 février
       (`DATE_ADD('2026-01-31', INTERVAL 1 MONTH)`), et c'est MySQL qui filtre. */
    assert.strictEqual(front.finISO('2026-01-31', 1), '2026-02-28');
    assert.strictEqual(front.finISO('2024-01-31', 1), '2024-02-29', 'année bissextile');
    assert.strictEqual(front.finISO('2026-03-31', 1), '2026-04-30');
    assert.strictEqual(front.finISO('2026-12-31', 1), '2027-01-31', 'passage d\'année, sans borne');
});

test('un contrat coché sans dates ne fait disparaître personne', () => {
    /* ARBITRAGE EXPLICITE : bloquer sur une case cochée ferait disparaître un partenaire de la
       boutique sans message et sans rapport visible avec le clic. On signale, on n'écarte pas. */
    for (const impl of [serveur, front]) {
        const e = impl.etatContrat({ contrat: 1 });
        assert.strictEqual(e.incomplet, true);
        assert.strictEqual(e.actif, true, 'Une échéance manquante n\'est pas une échéance passée.');
    }
    // Et la clause SQL dit la même chose : les deux `IS NULL` sont ce qui laisse passer.
    const sql = serveur.CONTRAT_VALABLE('p');
    assert.match(sql, /p\.contrat_debut IS NULL/);
    assert.match(sql, /p\.contrat_duree_mois IS NULL/);
    assert.match(sql, /p\.contrat = 0/, 'Ne pas suivre de contrat ne doit rien bloquer.');
    assert.match(sql, />= CURDATE\(\)/, 'Le jour du terme, le contrat court encore.');
});

test('un contrat échu retire le partenaire des trois endroits, pas d\'un seul', () => {
    /* LE DÉFAUT QUE CE TEST EMPÊCHE : brancher le filtre à un seul endroit. Un partenaire retiré
       de la vitrine mais toujours destinataire des coordonnées est le pire des deux mondes — il
       n'apparaît nulle part, donc personne ne pense à vérifier ce qu'il reçoit encore. */
    const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.match(lire('lib/consentements.js'), /CONTRAT_VALABLE\('p'\)/,
        'Un partenaire échu ne doit plus être NOMMÉ dans la demande de consentement.');
    assert.match(lire('controllers/espace.controller.js'), /CONTRAT_VALABLE\('p'\)/,
        'Ses offres ne doivent plus être présentées aux stagiaires.');
    assert.match(lire('controllers/consentement.controller.js'), /contrat\.suivi && contrat\.actif === false/,
        "L'export doit refuser de produire sa liste.");
});

test("l'écran ne recalcule pas la date avec un objet Date", () => {
    /* Le piège du fuseau revient par la porte de l'affichage : `new Date(iso).toLocaleDateString()`
       recule d'un jour sur un fuseau négatif. Une échéance affichée la veille de son terme est
       exactement le genre d'erreur qu'on ne remarque qu'en la subissant. */
    const ui = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Partenaires.jsx'), 'utf8');
    assert.doesNotMatch(ui, /frDate\(c\.fin\)/,
        'La date de fin doit être formatée par découpage de chaîne (`frISO`), jamais via `new Date`.');
    assert.match(ui, /frISO\(c\.fin\)/);
});

test('un contrat terminé suspend la case « reçoit les coordonnées » sans l\'effacer', () => {
    /* DEUX DÉFAUTS OPPOSÉS, ET IL FAUT ÉVITER LES DEUX.
     *
     *  · LAISSER LA CASE ACTIVE ET COCHÉE. Le serveur refuse déjà l'export pour un contrat échu :
     *    l'écran dirait alors le contraire de ce qui se passe, et le refus n'arriverait qu'au
     *    moment de produire la liste — loin du réglage qui semblait l'autoriser.
     *
     *  · ÉCRIRE 0 EN BASE. On perdrait, sans le dire, l'information de qui était destinataire
     *    avant l'échéance. Au renouvellement il faudrait la reconstituer de mémoire — et une
     *    autorisation de transmettre des données personnelles ne se reconstitue pas de mémoire.
     *
     * La sortie est d'afficher l'ÉTAT EFFECTIF (rien n'est transmis) tout en gardant la valeur
     * stockée, et de l'écrire noir sur blanc pour que la case qui se recoche au renouvellement ne
     * passe pas pour un défaut. */
    const ui = fs.readFileSync(
        path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'Partenaires.jsx'), 'utf8');

    assert.match(ui, /const recoitEffectif = Number\(p\.recoit_coordonnees\) === 1 && !contratEchu;/,
        "La case doit montrer l'état EFFECTIF, pas la valeur brute de la colonne.");
    assert.match(ui, /checked=\{recoitEffectif\}/);
    assert.match(ui, /disabled=\{destBusy === p\.id \|\| contratEchu\}/,
        'Un contrat terminé doit rendre la case inerte.');

    /* AUCUNE ÉCRITURE AUTOMATIQUE : `basculerDestinataire` ne doit être appelée que par un geste
       de l'utilisateur (`onChange`). Un appel ailleurs signifierait qu'on efface le réglage. */
    const appels = ui.match(/basculerDestinataire\(/g) || [];
    assert.strictEqual(appels.length, 2,
        'Un contrat échu ne doit rien ÉCRIRE : seuls la déclaration et le `onChange` subsistent.');

    // Et l'utilisateur doit lire POURQUOI : une commande grisée sans explication se lit en panne.
    assert.match(ui, /Suspendu tant que le contrat n'est pas renouvelé\. Le réglage est conservé\./);
});
