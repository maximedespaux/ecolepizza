/**
 * L'INVENTAIRE DE CE QU'ON DÉPOSE SUR L'APPAREIL NE DOIT JAMAIS DEVENIR FAUX.
 *
 * LE DÉFAUT QUE CE FICHIER EXISTE POUR EMPÊCHER, et il n'est pas hypothétique : une page
 * « Confidentialité » écrite à la main devient fausse au premier `localStorage.setItem` ajouté
 * ailleurs. Personne ne pense à rouvrir une page légale en ajoutant une préférence d'affichage.
 * Et une information fausse est PIRE qu'une information absente : elle engage l'organisme, qui
 * déclare ne rien déposer d'autre alors qu'il dépose autre chose.
 *
 * La page se rend donc depuis `lib/traceurs.js`, et ce test compare cette déclaration au CODE
 * RÉEL : toute clé écrite ou lue quelque part doit être déclarée. Ajouter un stockage sans le
 * déclarer casse la suite, ce qui est exactement le rappel qu'il faut à ce moment-là.
 *
 * IL VÉRIFIE AUSSI L'ABSENCE DE TIERS. Le raisonnement juridique de la page — pas de bandeau,
 * parce que tout est strictement nécessaire — s'effondre le jour où un Google Analytics ou un
 * pixel entre dans le bundle. Le test refuse leur seule présence, avant même la question du
 * consentement.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const UI = path.join(__dirname, '..', '..', 'app', 'ui');

function fichiers(dir) {
    const out = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...fichiers(p));
        else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
    }
    return out;
}

/** Les clés réellement utilisées dans le code, avec les constantes résolues. */
function clesUtilisees() {
    const consts = {}, trouvees = new Set();
    const srcs = fichiers(UI).map((f) => [f, fs.readFileSync(f, 'utf8')]);
    for (const [, src] of srcs) {
        for (const m of src.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*(?:\([^)]*\)\s*=>\s*)?[`"']([^`"']*(?:impasto|pizzaquest)[^`"']*)/gi)) {
            consts[m[1]] = m[2];
        }
    }
    for (const [f, src] of srcs) {
        if (f.endsWith('lib/traceurs.js')) continue;   // l'inventaire lui-même ne stocke rien
        for (const m of src.matchAll(/(?:local|session)Storage\.(?:get|set|remove)Item\(\s*([^,)\n]+)/g)) {
            const arg = m[1].trim();
            const lit = arg.match(/^[`"']([^`"']+)/);
            if (lit) { trouvees.add(lit[1]); continue; }
            const nom = arg.match(/^([A-Z_][A-Z0-9_]*)/);
            if (nom && consts[nom[1]]) trouvees.add(consts[nom[1]]);
        }
    }
    return trouvees;
}

/** Normalise : les clés par compte s'écrivent `impasto.avatar.${uid}` dans le code. */
const racine = (k) => k.replace(/\$\{[^}]*\}?.*$/, '').replace(/<[^>]*>$/, '').replace(/\.$/, '');

test('toute clé de stockage utilisée est déclarée dans l\'inventaire', async () => {
    const { TRACEURS } = await import('../../app/ui/lib/traceurs.js');
    const declarees = new Set(TRACEURS.map((t) => racine(t.cle)));
    const manquantes = [...clesUtilisees()].map(racine).filter((k) => !declarees.has(k));
    assert.deepStrictEqual([...new Set(manquantes)], [],
        'Ces clés sont écrites dans le code mais absentes de `lib/traceurs.js` : la page '
        + 'Confidentialité les tait, et elle devient donc fausse.');
});

test('aucun traceur tiers n\'est chargé', () => {
    /* Le raisonnement de la page — pas de bandeau, tout est strictement nécessaire — tombe dès
       qu'un tiers entre dans le bundle : un service tiers pose ses propres traceurs, hors de
       l'exemption, et fait basculer TOUT le site dans l'obligation de consentement. */
    const interdits = /googletagmanager|google-analytics|gtag\(|matomo|piwik|hotjar|fullstory|segment\.com|facebook\.net|doubleclick|clarity\.ms/i;
    const fautes = [];
    for (const f of [...fichiers(UI), path.join(UI, '..', 'index.html')]) {
        if (!fs.existsSync(f)) continue;
        const src = fs.readFileSync(f, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');  // pas sur les commentaires
        if (interdits.test(src)) fautes.push(path.relative(UI, f));
    }
    assert.deepStrictEqual(fautes, [],
        'Un traceur tiers est chargé : la page Confidentialité affirme le contraire, et '
        + "l'exemption de consentement ne tient plus.");
});

test("l'inventaire est complet et daté sur chaque entrée", async () => {
    const { TRACEURS, NATURES } = await import('../../app/ui/lib/traceurs.js');
    for (const t of TRACEURS) {
        assert.ok(NATURES[t.nature], `nature inconnue « ${t.nature} » pour ${t.cle}`);
        assert.ok(t.role && t.role.length > 8, `${t.cle} : le rôle doit être écrit en clair`);
        // LA DURÉE EST L'INFORMATION QU'ON OUBLIE, et c'est une mention obligatoire.
        assert.ok(t.duree && t.duree.length > 3, `${t.cle} : durée de conservation manquante`);
    }
});

test('le cookie de connexion reste protégé', () => {
    /* La page annonce un cookie « httpOnly, illisible par un script ». Si ces options sautaient,
       la page mentirait — et le cookie deviendrait volable par script injecté. */
    const src = fs.readFileSync(path.join(__dirname, '..', 'controllers', 'auth.controller.js'), 'utf8');
    const bloc = src.slice(src.indexOf("res.cookie('auth_token'"), src.indexOf("res.cookie('auth_token'") + 300);
    assert.match(bloc, /httpOnly: true/, 'sans httpOnly, un script de la page peut lire la session');
    assert.match(bloc, /sameSite: 'Lax'/, 'sans sameSite, la session part sur des requêtes cross-site');
    assert.match(bloc, /secure: process\.env\.NODE_ENV === 'production'/, 'en production, HTTPS uniquement');
});
