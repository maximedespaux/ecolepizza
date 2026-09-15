/**
 * LE COFFRE DOCUMENTAIRE ÉTAIT LE SEUL STOCK DE DOCUMENTS RESTÉ EN CLAIR.
 *
 * CE QUI ÉTAIT DÉJÀ PROTÉGÉ, et qui rendait l'oubli difficile à voir : les pièces
 * justificatives (scans de carte d'identité), les documents importés, les PDF signés, les
 * signatures manuscrites, les certificats et les numéros de sécurité sociale sont chiffrés en
 * AES-256-GCM depuis leur création. Le coffre — 681 Mo, le PLUS GROS des cinq stocks — ne
 * l'était pas. Il contient pourtant des contrats, des attestations et les feuilles
 * d'émargement signées de toutes les promotions.
 *
 * POURQUOI ÇA COMPTE ALORS QUE LA BASE EST PRIVÉE. La sauvegarde nocturne est un dump de la
 * base entière, gardé quatorze jours. Chaque nuit, ces 681 Mo de documents nominatifs partaient
 * en clair dans un fichier. La clé, elle, n'est PAS dans le dump — elle vit dans un `.env` que
 * `mariadb-dump` ne lit pas. C'est précisément ce qui rend le chiffrement utile ici : une copie
 * égarée de la sauvegarde ne rend plus rien de lisible.
 *
 * CE QUE ÇA NE PROTÈGE PAS, et il faut le dire pour ne pas se raconter d'histoires : qui obtient
 * la racine du serveur VIVANT obtient aussi la clé. Le chiffrement au repos répond à la
 * sauvegarde égarée, au disque mis au rebut, à la base recopiée — pas à la machine prise.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { aRanger, aServir, empreinteClaire } = require('../lib/coffre.js');
const outil = require('../../../database/tools/chiffrer-coffre.js');

const LIRE = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const SUIVI = LIRE('controllers/suivi.controller.js');
const EMARG = LIRE('lib/emargement.js');
const ESPACE = LIRE('controllers/espace.controller.js');
const COMMU = LIRE('controllers/community.controller.js');
const OUTIL = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'database', 'tools', 'chiffrer-coffre.js'), 'utf8');
const MIG153 = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'database', 'migrations', '153_archives_chiffrees.sql'), 'utf8');

/* Les vérifications de SOURCE ci-dessous ignorent les commentaires : une phrase d'explication
   qui cite le motif recherché ferait passer le test au vert sans que le code fasse quoi que ce
   soit. La leçon a déjà été payée deux fois dans ce projet. */
const sansCommentaires = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const PDF = Buffer.from('%PDF-1.4\nUn contrat signé, nominatif.\n%%EOF');

test('CE QUI SORT VERS LA BASE NE CONTIENT PLUS LE DOCUMENT', () => {
    const range = aRanger(PDF);
    assert.ok(!range.file.includes(Buffer.from('contrat signé')),
        'le clair ne doit plus apparaître dans les octets écrits');
    assert.ok(range.file.subarray(0, 5).equals(Buffer.from('encb1')), 'marqueur de chiffrement attendu');
    assert.ok(aServir(range.file).equals(PDF), 'et l\'application doit savoir le rouvrir');
});

test('LA MESURE PORTE SUR LE CLAIR, PAS SUR LE CHIFFRÉ', () => {
    const range = aRanger(PDF);
    assert.strictEqual(range.octets, PDF.length,
        'la taille annoncée est celle du document, pas celle du chiffré (33 octets de plus)');
    assert.strictEqual(range.empreinte, crypto.createHash('sha256').update(PDF).digest('hex'));
    assert.notStrictEqual(range.octets, range.file.length, 'sinon la colonne ne servirait à rien');
});

test('DEUX EXEMPLAIRES DU MÊME DOCUMENT : chiffrés différents, empreinte identique', () => {
    /* C'EST TOUTE LA RAISON D'ÊTRE DE LA COLONNE `empreinte`. AES-GCM tire un IV au hasard :
       le même PDF rangé deux fois produit deux suites d'octets sans rapport. L'écran de
       stockage repérait les doublons avec une empreinte calculée EN BASE sur `file` — après
       chiffrement, il n'en aurait plus signalé aucun, sans erreur ni message. Une panne
       silencieuse, la pire espèce. */
    const a = aRanger(PDF);
    const b = aRanger(PDF);
    assert.ok(!a.file.equals(b.file), 'deux chiffrements ne se ressemblent pas — c\'est voulu');
    assert.strictEqual(a.empreinte, b.empreinte, 'mais c\'est bien le même document');
    assert.notStrictEqual(crypto.createHash('sha256').update(a.file).digest('hex'),
        crypto.createHash('sha256').update(b.file).digest('hex'),
        'une empreinte prise sur le chiffré aurait manqué le doublon');
});

test('UNE LIGNE PAS ENCORE REPRISE SE SERT QUAND MÊME', () => {
    /* Le code doit marcher AVANT et APRÈS la reprise (CLAUDE.md § 2.1) : tant que le script
       n'est pas passé, les 1140 PDF existants sont en clair en base et doivent continuer de
       s'ouvrir. `decryptBytes` rend le tampon tel quel s'il ne porte pas le marqueur. */
    assert.ok(aServir(PDF).equals(PDF));
});

test('UN CONTENU ALTÉRÉ NE SE SERT PAS À MOITIÉ', () => {
    // Le tag GCM détecte la modification : on rend `null`, jamais un document tronqué.
    const abime = Buffer.from(aRanger(PDF).file);
    abime[abime.length - 1] ^= 0xff;
    assert.strictEqual(aServir(abime), null);
});

test('L\'IMPORT D\'ARCHIVES ÉCRIT LE CHIFFRÉ, JAMAIS LE TAMPON REÇU', () => {
    const src = sansCommentaires(SUIVI);
    assert.match(src, /const range = aRanger\(f\.buffer\)/,
        'le fichier reçu passe par aRanger avant d\'atteindre la base');
    const insert = src.slice(src.indexOf('INSERT INTO archive_document'));
    assert.ok(!/f\.buffer\s*[,\]]/.test(insert.slice(0, 900)),
        'le tampon en clair ne doit plus figurer dans les valeurs de l\'INSERT');
});

test('LA LECTURE D\'UNE ARCHIVE DÉCHIFFRE, ET NE LAISSE PAS DE COPIE EN CACHE', () => {
    const src = sansCommentaires(SUIVI);
    const zone = src.slice(src.indexOf('getArchiveFile'));
    assert.match(zone, /const clair = aServir\(row\.file\)/);
    assert.match(zone, /res\.send\(clair\)/);
    assert.ok(!/res\.send\(row\.file\)/.test(zone), 'plus aucun envoi direct du contenu stocké');
    /* `no-store` COMME POUR UNE PIÈCE D'IDENTITÉ. Chiffrer en base et laisser une copie en
       clair dans le cache disque du navigateur, c'est fermer une porte et en ouvrir une autre —
       un poste partagé garde alors le contrat signé après la déconnexion. */
    assert.match(zone, /Cache-Control['"],\s*['"]no-store, private/);
});

test('L\'ÉCRAN DE STOCKAGE NE COMPTE PLUS SUR UNE EMPREINTE PRISE EN BASE SUR LE CHIFFRÉ', () => {
    const src = sansCommentaires(SUIVI);
    assert.ok(!/MD5\(file\)/.test(src),
        'MD5(file) sur un contenu chiffré ne regroupe plus rien : c\'était le piège');
    assert.match(src, /COALESCE|octets IS NOT NULL/, 'les mesures mémorisées sont lues en priorité');
    assert.match(src, /SHA2\(file, 256\)/,
        'le repli mesure en base les lignes pas encore reprises — même fonction que l\'empreinte mémorisée');
});

test('LA FEUILLE D\'ÉMARGEMENT ENTRE AU COFFRE CHIFFRÉE', () => {
    /* Elle porte les signatures manuscrites de toute la promotion, et c'est la SEULE pièce que
       l'application range au coffre d'elle-même, sans que personne ne l'ait demandé. */
    const src = sansCommentaires(EMARG);
    assert.match(src, /const range = aRanger\(pdf\)/);
    const zone = src.slice(src.indexOf('UPDATE archive_document'));
    assert.ok(!/,\s*pdf,/.test(zone) && !/,\s*pdf\]/.test(zone),
        'le PDF en clair ne doit plus figurer dans les valeurs écrites');
});

test('PHOTOS DE PROFIL ET IMAGES DE LA COMMUNAUTÉ : chiffrées elles aussi', () => {
    const esp = sansCommentaires(ESPACE);
    assert.match(esp, /encryptBytes\(f\.buffer\)/, 'la photo de profil part chiffrée');
    assert.match(esp, /decryptBytes\(row\.bytes\)/, 'et se relit déchiffrée');
    const com = sansCommentaires(COMMU);
    assert.match(com, /encryptBytes\(f\.buffer\)/);
    assert.match(com, /decryptBytes\(i\.bytes\)/);
});

test('L\'OUTIL DE REPRISE REFUSE DE TRAVAILLER SANS LA VRAIE CLÉ', () => {
    /* LES DEUX FAÇONS DE TOUT PERDRE, et les deux garde-fous correspondants.
       Sans SSN_ENC_KEY, lib/crypto.js dérive une clé d'une chaîne publique écrite dans le
       dépôt : on aurait « chiffré » 681 Mo avec un secret que tout le monde peut lire. Avec une
       clé PRÉSENTE MAIS FAUSSE, le coffre deviendrait illisible pour le serveur — et on ne s'en
       apercevrait qu'en ouvrant un document, des semaines plus tard. */
    const src = sansCommentaires(OUTIL);
    assert.match(src, /SSN_ENC_KEY/, 'la variable est contrôlée');
    assert.match(src, /LIKE 'enc:%'/, 'et confrontée à une valeur déjà chiffrée par l\'application');
    assert.match(src, /ouvert === null/, 'un témoin qui ne s\'ouvre pas arrête tout');
});

test('SANS TÉMOIN, L\'OUTIL NE SE LANCE PAS TOUT SEUL', async () => {
    /* DÉFAUT MESURÉ EN PRODUCTION le 2026-09-15 : les trois premières sondes n'ont rien trouvé
       dans une base de 1,4 Go vieille d'un an, et le script a répondu « base neuve ? » avant de
       continuer — à quelques secondes de réécrire 660 Mo. L'explication tient à l'histoire :
       les quatre valeurs chiffrées qui existaient ont été VIDÉES du dump avant l'import d'août
       (clé d'AlwaysData perdue), et trois d'entre elles étaient exactement ces sondes.

       DEUX CORRECTIFS, ET IL FALLAIT LES DEUX : ratisser tout ce que l'application chiffre —
       texte ET octets —, et refuser d'ÉCRIRE quand il n'y a malgré tout aucun témoin. Le cas
       n'est pas théorique : `dotenv` n'écrase pas une variable déjà posée dans l'environnement,
       donc un `SSN_ENC_KEY=…` dans le shell l'emporterait en silence sur le fichier que lit
       l'application. */
    /* ÉPROUVÉ POUR DE VRAI, pas relu. Une fausse connexion répond « la colonne existe » à
       toutes les sondes et « aucune ligne » à toutes les recherches de témoin : c'est
       exactement la situation rencontrée en production. Un test de SOURCE aurait laissé passer
       un `return false` devenu inatteignable — il l'a d'ailleurs laissé passer une fois. */
    const conn = {
        query: async (sql) => (/information_schema/.test(sql) ? [[{ 1: 1 }]] : [[]]),
    };
    const muet = () => {};
    const sansBruit = async (fn) => {
        const [w, e, l] = [console.warn, console.error, console.log];
        console.warn = muet; console.error = muet; console.log = muet;
        try { return await fn(); } finally { console.warn = w; console.error = e; console.log = l; }
    };
    process.env.SSN_ENC_KEY = process.env.SSN_ENC_KEY || 'a'.repeat(64);

    assert.strictEqual(await sansBruit(() => outil.cleConfirmee(conn, { essai: false, sansTemoin: false })),
        false, 'sans témoin et sans le drapeau : on N\'ÉCRIT PAS.');
    assert.strictEqual(await sansBruit(() => outil.cleConfirmee(conn, { essai: true, sansTemoin: false })),
        true, 'un essai reste permis — il n\'écrit rien.');
    assert.strictEqual(await sansBruit(() => outil.cleConfirmee(conn, { essai: false, sansTemoin: true })),
        true, 'passer outre reste possible, mais c\'est un geste explicite.');
});

test('LES TÉMOINS COUVRENT TOUT CE QUE L\'APPLICATION CHIFFRE', () => {
    const texte = outil.SONDES_TEXTE.map((s) => s.join('.'));
    const octets = outil.SONDES_OCTETS.map((s) => s.join('.'));
    for (const attendu of ['learner.social_security', 'attendance_record.signature_data',
        'document_signed_pdf.pdf', 'user.signature_image']) {
        assert.ok(texte.includes(attendu), `${attendu} doit faire partie des témoins cherchés`);
    }
    /* Les colonnes d'OCTETS portent le marqueur binaire « encb1 », pas le préfixe « enc: » :
       les chercher avec le mauvais motif revenait à ne pas les chercher. */
    assert.ok(octets.includes('piece_fichier.bytes'));
    assert.match(sansCommentaires(OUTIL), /= 'encb1'/,
        'les témoins binaires se reconnaissent à leur marqueur, pas au préfixe texte');
});

test('L\'OUTIL VÉRIFIE L\'ALLER-RETOUR AVANT D\'ÉCRASER UN DOCUMENT', () => {
    const src = sansCommentaires(OUTIL);
    assert.match(src, /const relu = decryptBytes\(cible2\)/);
    assert.match(src, /!relu\.equals\(source\)/, 'octet pour octet, pas seulement la longueur');
    assert.match(src, /throw new Error/, 'un échec arrête la reprise entière');
});

test('LA MIGRATION 153 EST REJOUABLE ET N\'EFFACE AUCUN DOCUMENT', () => {
    assert.match(MIG153, /ADD COLUMN IF NOT EXISTS empreinte/);
    assert.match(MIG153, /ADD COLUMN IF NOT EXISTS octets/);
    assert.ok(!/DROP TABLE|DELETE FROM|TRUNCATE/i.test(MIG153), 'elle n\'ajoute que deux colonnes');
});
