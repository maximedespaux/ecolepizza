/**
 * UN DOCUMENT QUI N'EXISTE QUE POUR UNE ARRIVÉE PAR ENTREPRISE.
 *
 * LE BESOIN, posé par l'école : une convention de formation professionnelle, un accord de prise
 * en charge — des documents qui n'ont aucun sens pour un particulier. Pour les obtenir, il
 * fallait les activer dans « Parcours du dossier », ce qui les donnait justement à ceux qu'ils
 * ne concernent pas. L'exact contraire du besoin.
 *
 * CE QUI LE REND POSSIBLE : la section « À l'arrivée via une entreprise » ne RÉORDONNE pas le
 * parcours du dossier, elle le REMPLACE (`companyParcours` → `if (ent.steps) steps = ent.steps`).
 * Un document qui n'y est que là n'apparaît donc pas chez les stagiaires venus seuls.
 */
const test = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const F = readFileSync(path.join(__dirname, '../../app/ui/pages/Formations.jsx'), 'utf8');
const CO = readFileSync(path.join(__dirname, '../controllers/company.controller.js'), 'utf8');
const SECTION = F.slice(F.indexOf('function CompanySection'));

test('la section entreprise puise dans TOUTES les étapes, actives ou non', () => {
    /* Les deux verrous de l'écran, et aucun ne servait en aval : le serveur mappe les slugs de
       la section sur toutes les étapes candidates, sans regarder `active`, depuis toujours. */
    assert.match(SECTION, /const eligible = steps\.filter\(\(s\) => !value\.includes\(s\.slug\)\);/,
        'plus de filtre sur `active` dans les éligibles');
    assert.match(SECTION, /const chosen = value\.map\(\(sl\) => bySlug\.get\(sl\)\)\.filter\(Boolean\);/,
        'ni dans ce qui est déjà choisi — sinon une étape enregistrée resterait invisible');
});

test('ajouter à la section entreprise n\'active rien', () => {
    /* Activer un document stagiaire l'aurait ajouté aux arrivées INDIVIDUELLES, ce qu'on cherche
       précisément à éviter. La section décide pour elle-même. */
    const add = SECTION.slice(SECTION.indexOf('const add = (slug)'), SECTION.indexOf('const remove = (slug)'));
    assert.ok(!/onToggleActive/.test(add), 'aucune activation à l\'ajout');
    assert.match(add, /onChange\(\[\.\.\.value\.filter\(\(x\) => x !== slug\), slug\]\)/);
});

test('une étape « entreprise seulement » se LIT, elle ne se devine pas', () => {
    // Sans ce repère, on ne comprendrait pas pourquoi elle est absente de l'autre onglet.
    assert.match(SECTION, /!s\.active && !s\.company_level && \(/);
    assert.match(SECTION, /entreprise seulement/);
});

test('et surtout : elle peut être GÉNÉRÉE', () => {
    /* LE DÉFAUT QUI RENDAIT TOUT LE RESTE INUTILE, et qui ne se voyait qu'au clic. La liste du
       parcours entreprise ne filtre pas sur `active` — l'étape s'affichait donc. Mais la
       génération, elle, exigeait `s.active` et répondait « Document introuvable dans le
       parcours ». Visible et impossible.

       Pire, le second filtre : `applicable` retenait les dossiers dont le parcours APPELLE ce
       document. Une étape « entreprise seulement » n'est dans AUCUN parcours individuel — par
       construction, `enrollmentSteps` écarte l'inactif. On aurait eu « 0 document(s) préparé(s) »
       sans un mot d'explication. */
    const g = CO.slice(CO.indexOf('const generateGroupDocuments'), CO.indexOf('const getCompanyLearnerDocuments'));
    assert.match(g, /grp\.allSteps\.find\(\(s\) => s\.slug === slug && \(s\.active \|\| intake\.has\(slug\)\)\)/,
        'la garde accepte une étape de la section entreprise');
    assert.match(g, /const seulementEntreprise = !step\.active && intake\.has\(slug\);/);
    assert.match(g, /seulementEntreprise \? grp\.enrollments : grp\.enrollments\.filter\(\(e\) => e\.slugs\.has\(slug\)\)/,
        'elle vise tout le groupe, sans quoi elle ne viserait personne');
    /* LA SECTION SE LIT PAR LA FONCTION PARTAGÉE, pas par une seconde lecture du JSON écrite
       ici — et elle doit être IMPORTÉE : appelée sans import, le fichier se charge quand même
       et l'erreur n'arrive qu'au clic. */
    assert.match(CO, /const \{ companyStepSlugs(?:, \w+)* \} = require\('\.\.\/lib\/parcours\.js'\);/);
});

test('et un document de GROUPE aussi : la liste de la fiche entreprise le propose', () => {
    /* LA MOITIÉ MANQUANTE DU MÊME DÉFAUT, signalée le 2026-09-23 depuis la fiche entreprise :
       « Ce document n'existe pas dans les formations sélectionnées », alors qu'il est bien dans
       Formations → Parcours documentaire → À l'arrivée via une entreprise.

       `generateGroupDocuments` avait reçu la garde ci-dessus ; `companyDocTemplates`, qui liste
       les documents de GROUPE préparables, était restée sur `s.active` seul. Or l'écran n'active
       RIEN quand on ajoute un document à la section (test « ajouter n'active rien »), et un
       modèle créé depuis la 155 naît hors parcours : AUCUN document de groupe ajouté par l'écran
       d'aujourd'hui ne pouvait donc être préparé. L'étape s'affichait pourtant dans le parcours
       — cette liste-là ne filtre pas sur `active` — et son bouton « Préparer le document »
       s'ouvrait normalement. Visible et impossible, une fois de plus. */
    const t = CO.slice(CO.indexOf('const companyDocTemplates'), CO.indexOf('const listCompanyDocuments'));
    assert.match(t, /const intake = new Set\(await companyStepSlugs\(conn, orgId, program\.id\)\);/);
    assert.match(t, /\.filter\(\(s\) => s\.company_level && \(s\.active \|\| intake\.has\(s\.slug\)\)\)/,
        'la liste accepte une étape de la section entreprise, active ou non');

    /* C'EST CETTE LISTE QUI AUTORISE L'ENVOI, côté écran : le formulaire refuse AVANT d'appeler
       le serveur, si bien que la garde du serveur ne pouvait même pas rattraper le coup. */
    const page = readFileSync(path.join(__dirname, '../../app/ui/pages/EntrepriseDetail.jsx'), 'utf8');
    assert.match(page, /if \(!\(groupTplsBySession\[sid\] \|\| \[\]\)\.some\(\(t\) => t\.slug === prep\.slug\)\) continue;/);
    assert.match(page, /Ce document n'existe pas dans les formations sélectionnées\./);
});
