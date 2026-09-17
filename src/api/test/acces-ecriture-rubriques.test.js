/**
 * LES BOUTONS DE MODIFICATION SUIVENT CE QUE LE SERVEUR ACCEPTE — PAS UNE LISTE DE RÔLES.
 *
 * LE DÉFAUT, signalé le 2026-09-17 (« sur téléphone, des boutons ne sont pas visibles, dans
 * Partenaires ») et constaté sur un compte FORMATEUR à qui l'organisme avait accordé Partenaires,
 * Sessions, Stagiaires et QCM en modification. Le serveur le laissait écrire : depuis la délégation
 * par le menu, `authorizeRoles(...ADMIN_ROLES)` accepte aussi un rôle configurable dont la rubrique
 * est accordée. Mais huit écrans décidaient d'afficher leurs boutons avec
 * `["SUPER_ADMIN", "ADMIN_ORGANISME", "SECRETARIAT"].includes(user?.role)` : pas de « Ajouter un
 * partenaire », pas de formateurs, de consentements, d'intervenants ni de jury sur la session, pas
 * de suppression de réponse de QCM. Rien ne le signalait — la page avait simplement l'air d'être
 * en lecture seule. Le téléphone n'y était pour rien : c'était le compte.
 *
 * Et l'écart jouait dans les deux sens : un secrétariat passé en LECTURE sur une rubrique voyait des
 * boutons que `enforceSectionMode` lui refuse.
 *
 * CE TEST CONFRONTE LA RÈGLE DE L'ÉCRAN (`peutEcrire`, lib/nav.js) À CELLE DU SERVEUR, recomposée à
 * partir des fonctions mêmes des deux gardes — pas à une copie écrite ici.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { CONFIGURABLE_ROLES, modeFor, accesParMenuAutorise, sectionFor } = require('../middlewares/sectionAccess.middleware.js');
const { ADMIN_ROLES } = require('../middlewares/auth.middleware.js');
const regleEcran = () => import('../../app/ui/lib/nav.js');

/* Ce que le serveur fait d'une ÉCRITURE sur une route `authorizeRoles(...ADMIN_ROLES)` de la
   rubrique `section` :
     1. `enforceSectionMode` (monté sur toute l'app) : un rôle configurable sans la rubrique EN
        ÉCRITURE est refusé, quel que soit son rôle ;
     2. `authorizeRoles` : le rôle, sinon l'accès accordé par le menu. */
function serveurAccepte({ role, nav_access: navAccess }, section) {
    const mode = modeFor(navAccess, section);
    if (CONFIGURABLE_ROLES.includes(role) && mode !== 'write') return false;
    if (ADMIN_ROLES.includes(role)) return true;
    return accesParMenuAutorise({ role, method: 'POST', section, mode });
}

const RUBRIQUES = ['/partenaires', '/sessions', '/stagiaires', '/qcm', '/suivi', '/formations', '/modeles'];
const ROLES = ['SUPER_ADMIN', 'ADMIN_ORGANISME', 'SECRETARIAT', 'FORMATEUR', 'AUDITEUR', 'INTERVENANT', 'STAGIAIRE'];
// Toutes les formes que `nav_access` a prises au fil du temps, et que les deux côtés savent lire.
const ACCES = (section) => [
    null,
    { [section]: 'write' },
    { [section]: 'read' },
    { '/dashboard': 'write' },
    JSON.stringify({ [section]: 'write' }),
    JSON.stringify({ [section]: 'read' }),
    [section],            // ancien format : un tableau vaut écriture
    ['/dashboard'],
];

test('l\'écran et le serveur connaissent les mêmes rôles configurables', async () => {
    const { ROLES_CONFIGURABLES } = await regleEcran();
    assert.deepStrictEqual([...ROLES_CONFIGURABLES].sort(), [...CONFIGURABLE_ROLES].sort());
});

test('pour chaque rôle, chaque forme d\'accès et chaque rubrique : l\'écran promet ce que le serveur tient', async () => {
    const { peutEcrire } = await regleEcran();
    const ecarts = [];
    for (const role of ROLES) {
        for (const section of RUBRIQUES) {
            for (const navAccess of ACCES(section)) {
                const user = { role, nav_access: navAccess };
                const ecran = peutEcrire(user, section);
                const serveur = serveurAccepte(user, section);
                if (ecran !== serveur) ecarts.push(`${role} ${section} ${JSON.stringify(navAccess)} : écran ${ecran}, serveur ${serveur}`);
            }
        }
    }
    assert.deepStrictEqual(ecarts, []);
});

test('le compte du signalement : formateur, Partenaires, Sessions, Stagiaires et QCM en modification', async () => {
    const { peutEcrire } = await regleEcran();
    // L'accès relevé en production le 2026-09-17 (rubriques utiles au test seulement).
    const formateur = { role: 'FORMATEUR', nav_access: {
        '/partenaires': 'write', '/sessions': 'write', '/stagiaires': 'write', '/qcm': 'write',
        '/qcm-resultats': 'write', '/communaute': 'write', 'cap:moderate-community': 'write' } };
    for (const r of ['/partenaires', '/sessions', '/stagiaires', '/qcm']) assert.ok(peutEcrire(formateur, r), r);
    // Ce qu'on ne lui a pas accordé reste fermé : le modèle de PV (/modeles), le coffre (/suivi).
    for (const r of ['/modeles', '/suivi', '/formations']) assert.ok(!peutEcrire(formateur, r), r);
    // L'autre formateur, dont l'accès n'a jamais été réglé : le serveur ne lui accepte aucune écriture.
    assert.ok(!peutEcrire({ role: 'FORMATEUR', nav_access: null }, '/sessions'));
    assert.ok(!peutEcrire(null, '/sessions'));
});

test('chaque bouton interroge la rubrique de la route qu\'il appelle', () => {
    /* La rubrique vient de l'URL d'API, pas de la page : les deux ne coïncident pas toujours, et
       c'est précisément là qu'un bouton promet ce que le serveur refuse. */
    const attendu = [
        ['partenaires', '', '/partenaires'],          // fiches, catégories, destinataire, export
        ['comptabilite', 'revenus/12', '/partenaires'], // commissions, saisies depuis Partenaires
        ['sessions', 's1/trainers', '/sessions'],
        ['sessions', 's1/consentements/l1', '/sessions'],
        ['sessions', 's1/intervenants', '/sessions'],
        ['sessions', 's1/documents-externes', '/sessions'],
        ['examens', 'decision', '/sessions'],           // le jury
        ['evaluations', 'formation/p1', '/sessions'],   // la grille, enregistrée depuis Formations
        ['documents', 'd1', '/stagiaires'],             // supprimer un document d'intervenant
        ['stagiaires', 'l1', '/stagiaires'],            // décerner un cadre exclusif
        ['quizzes', 'reponse/r1', '/qcm'],              // supprimer une réponse de QCM
        ['suivi', 'archives/delete', '/suivi'],
        ['templates', 'modeles-jury', '/modeles'],      // « Créer le modèle de PV »
    ];
    for (const [base, reste, rubrique] of attendu) assert.strictEqual(sectionFor(base, reste), rubrique, `/api/${base}/${reste}`);
});

const UI = path.join(__dirname, '..', '..', 'app', 'ui');
const lire = (rel) => fs.readFileSync(path.join(UI, rel), 'utf8');

test('les écrans demandent la bonne rubrique', () => {
    const cas = [
        ['pages/Partenaires.jsx', /const canEdit = peutEcrire\(user, "\/partenaires"\);/],
        ['pages/SessionDetail.jsx', /const peutModifier = peutEcrire\(user, "\/sessions"\);/],
        ['components/DocumentsExternes.jsx', /const peutEnvoyer = peutEcrire\(user, "\/sessions"\);/],
        ['components/DocumentsExternes.jsx', /const peutSupprimer = peutEcrire\(user, "\/stagiaires"\);/],
        ['components/CommissionJury.jsx', /const peutEditer = peutEcrire\(user, "\/sessions"\);/],
        ['components/CommissionJury.jsx', /const peutPoserModele = peutEcrire\(user, "\/modeles"\);/],
        ['components/SessionEvaluation.jsx', /const peutConfigurer = peutEcrire\(user, "\/formations"\) && peutEcrire\(user, "\/sessions"\);/],
        ['pages/ResultatsQCM.jsx', /const peutSupprimer = peutEcrire\(user, "\/qcm"\);/],
        ['pages/Suivi.jsx', /const peutModifier = peutEcrire\(user, "\/suivi"\);/],
        ['pages/Communaute.jsx', /const peutDecerner = peutEcrire\(user, "\/stagiaires"\);/],
    ];
    for (const [f, motif] of cas) assert.match(lire(f), motif, f);
    // Le bouton du modèle de PV était offert à tous, et répondait « Accès refusé » hors /modeles.
    assert.match(lire('components/CommissionJury.jsx'), /\{peutPoserModele && \(\s*<button[^>]*onClick=\{poserModele\}/);
    // Le jury et les documents d'intervenant ne sont plus montés sous un drapeau « admin ».
    assert.match(lire('pages/SessionDetail.jsx'), /\{peutModifier && \(\s*<div style=\{\{ marginTop: 16 \}\}>\s*<CommissionJury/);
});

test('plus aucun bouton gardé par la liste de rôles du bureau — sauf l\'annonce, au rôle par décision', () => {
    /* L'ANNONCE est l'exception VOULUE : publier au nom de l'école reste au rôle côté serveur
       (`estStaff`, lib/moderation.js), quoi que le menu accorde. Tout le reste s'accorde rubrique
       par rubrique, et une liste de rôles y ferait revenir le défaut. */
    const fichiers = [];
    const parcourir = (rel) => {
        for (const e of fs.readdirSync(path.join(UI, rel), { withFileTypes: true })) {
            const p = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) parcourir(p);
            else if (/\.(js|jsx)$/.test(e.name)) fichiers.push(p);
        }
    };
    parcourir('');
    const listeBureau = /\[\s*"SUPER_ADMIN",\s*"ADMIN_ORGANISME",\s*"SECRETARIAT"\s*\]\.includes\(user\?\.role\)/;
    const porteurs = [];
    for (const f of fichiers) {
        for (const ligne of lire(f).split('\n')) {
            if (listeBureau.test(ligne) && !/const peutAnnoncer = /.test(ligne)) porteurs.push(`${f} : ${ligne.trim()}`);
        }
    }
    assert.deepStrictEqual(porteurs, []);
});
