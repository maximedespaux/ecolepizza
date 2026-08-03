/**
 * DEUX PARTENAIRES NE PEUVENT PLUS PORTER LE MÊME NOM (migration 132).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT CONSTATÉ, PAS SUPPOSÉ : l'annuaire contenait DEUX fiches « Berkel », même organisme,
 * même catégorie, même seconde de création. L'une portait le produit « Trancheuses à jambon »,
 * l'autre était entièrement vide. Rien ne l'empêchait — ni contrainte en base, ni contrôle dans
 * `createPartner`, qui ne vérifiait que la PRÉSENCE d'un nom.
 *
 * POURQUOI UN HOMONYME COÛTE PLUS CHER QU'IL N'EN A L'AIR, et c'est ce qui justifie un test :
 *
 *   · la demande de consentement NOMME les destinataires, et ce texte est FIGÉ dans le registre
 *     comme preuve de ce que la personne a lu. Deux fiches homonymes cochées produisent
 *     « …, Berkel, Berkel, … » — une preuve qui a l'air fausse, et qu'on ne peut plus corriger
 *     puisqu'elle doit rester telle qu'elle a été montrée ;
 *   · le semis des produits joint SUR LE NOM : avec deux fiches, le catalogue se dédouble sans
 *     qu'aucune requête n'échoue ;
 *   · et il faut cocher « reçoit les coordonnées » sur la BONNE des deux cartes identiques — se
 *     tromper ne produit aucune erreur, simplement rien ne part.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const API = path.join(__dirname, '..');
const CTRL = fs.readFileSync(path.join(API, 'controllers/partner.controller.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('la création refuse un nom déjà pris', () => {
    assert.match(CTRL, /await nomDejaPris\(req\.user\.organization_id, b\.name\.trim\(\)\)/,
        'Un partenaire homonyme doit être refusé avant insertion.');
    assert.match(CTRL, /status\(409\)/);
});

test('le RENOMMAGE aussi, sinon le garde-fou se contourne en deux clics', () => {
    /* LE TROU ÉVIDENT si l'on ne protège que la création : créer « Berkell », puis le renommer
       « Berkel ». Deux clics, et l'annuaire a de nouveau deux homonymes. */
    assert.match(CTRL, /const updatePartner = async \(req, res\) => \{/,
        'updatePartner doit pouvoir attendre la vérification.');
    assert.match(CTRL, /nomDejaPris\(req\.user\.organization_id, String\(req\.body\.name\)\.trim\(\), req\.params\.id\)/,
        'Le renommage doit vérifier, en s\'excluant lui-même.');
});

test("une fiche n'est pas son propre doublon", () => {
    /* SANS `exclureId`, enregistrer une fiche sans toucher à son nom la déclarerait en conflit
       avec elle-même : corriger une simple faute de ville deviendrait impossible. */
    assert.match(CTRL, /exclureId \? ' AND id <> \?' : ''/,
        'La recherche de doublon doit pouvoir s\'exclure elle-même.');
});

test("l'erreur SQL est traduite, jamais affichée telle quelle", () => {
    /* La contrainte peut parler la première (deux requêtes simultanées). Sans traduction, l'écran
       montrerait « Duplicate entry 'xxx-Berkel' for key 'uq_partner_nom' » — exact, illisible, et
       qui ne dit pas quoi faire. */
    /* TROIS points de traduction, et le troisième est celui qu'on oublie : la création a un
       REPLI « sans les colonnes de contrat » (migration 131 non jouée) qui refait l'INSERT dans
       son propre callback. Ce chemin-là échappe au premier `catch` — la première rédaction de ce
       test comptait 2 et a trouvé le trou. */
    const occurrences = (CTRL.match(/ER_DUP_ENTRY/g) || []).length;
    assert.strictEqual(occurrences, 3,
        'Création, son repli sans colonnes de contrat, ET renommage doivent traduire le conflit.');
});

test('un échec de VÉRIFICATION ne bloque pas la création', () => {
    /* ARBITRAGE : si la requête de contrôle échoue, on laisse passer. La contrainte en base reste
       le filet, et refuser une création parce qu'on n'a pas pu vérifier serait un blocage total
       pour un risque que la base couvre déjà. */
    assert.match(CTRL, /\(err, rows\) => resolve\(!err && rows && rows\.length > 0\)/,
        'Une erreur de lecture doit répondre « pas de doublon », pas bloquer.');
});

test('la migration 132 refuse de mentir', () => {
    const sql = fs.readFileSync(
        path.join(API, '..', '..', 'database', 'migrations', '132_partner_nom_unique.sql'), 'utf8');
    assert.match(sql, /ADD UNIQUE KEY uq_partner_nom \(organization_id, name\)/);
    /* PAS d'`IF NOT EXISTS` ni d'`IGNORE` : la migration DOIT échouer s'il reste des homonymes,
       plutôt que de s'appliquer à moitié et de laisser croire qu'elle protège. Le commentaire
       donne la requête pour les trouver. */
    assert.match(sql, /SELECT organization_id, name, COUNT\(\*\)/,
        'Le fichier doit dire comment trouver les doublons avant de le jouer.');
    // La contrainte porte sur le COUPLE : deux organismes ont chacun droit à leur « Metro ».
    assert.match(sql, /organization_id, name/);

    const revert = fs.readFileSync(
        path.join(API, '..', '..', 'database', 'migrations', '132_revert_partner_nom_unique.sql'), 'utf8');
    assert.match(revert, /DROP INDEX IF EXISTS uq_partner_nom/, 'Tout aller a son revert.');
});
