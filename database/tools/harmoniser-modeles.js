/**
 * LA CHARTE DES DOCUMENTS, APPLIQUÉE AUX MODÈLES DE L'ÉCOLE (demandé le 2026-09-26).
 *
 * « Comme le devis RS7404 retravaillé, fais tous les autres documents. » Les règles vivent dans
 * src/api/lib/charteDocuments.js ; ce script, lui, lit et écrit la base. Seule la FORME change : le
 * texte, les jetons, les images et la charpente sont contrôlés modèle par modèle avant toute écriture.
 *
 * DIX MODÈLES, ET PAS SEIZE. Les six modèles imposés (attestation d'assiduité AGEFICE, certificat de
 * réalisation, grille et procès-verbal du jury, deux factures) ne devaient recevoir que la police
 * (choix de l'école) ; or ils s'impriment DÉJÀ en Arial — la police par défaut du rendu est Liberation
 * Sans, aux mêmes métriques. Les réécrire n'aurait rien changé à l'œil : ils ne sont pas touchés.
 *
 * CE QUI S'ÉCRIT EST CE QUI A ÉTÉ RELU. Chaque modèle a été rendu en PDF, avant et après, et relu page
 * à page. Le script porte l'EMPREINTE de chaque modèle tel qu'il était alors en production, et celle du
 * résultat relu (`RELU`) :
 *   · un modèle MODIFIÉ depuis la relecture n'est pas touché — le script le dit ;
 *   · un résultat qui ne serait pas celui relu (le code aurait bougé) n'est pas écrit non plus ;
 *   · un modèle DÉJÀ harmonisé est reconnu : relancer le script ne fait rien.
 * La migration 183 (la puce de l'acompte, dans quatre modèles) peut être jouée avant ou après : les deux
 * états sont connus.
 *
 * L'ÉCRITURE NE DEVINE RIEN : `UPDATE … WHERE` le corps et le pied sont encore, OCTET POUR OCTET, ceux qui
 * viennent d'être lus — un modèle enregistré à l'instant depuis l'éditeur n'est jamais écrasé. Une
 * sauvegarde des modèles visés part d'abord ; sans elle, rien ne s'écrit.
 *
 * ⚠️ UN ÉDITEUR RESTÉ OUVERT défait tout : le 2026-09-26, le devis RS7404 retravaillé a été remplacé une
 * heure plus tard par l'ancienne mise en forme, enregistrée depuis un onglet ouvert avant. Fermer ou
 * recharger tout onglet « Modèles → éditeur » AVANT de lancer --appliquer.
 *
 *   sudo -u impastio node /opt/impastio/database/tools/harmoniser-modeles.js                  # essai : n'écrit rien
 *   sudo systemctl start impastio-sauvegarde                                                   # la base entière, par prudence
 *   sudo -u impastio node /opt/impastio/database/tools/harmoniser-modeles.js --appliquer      # écrit
 *   sudo -u impastio node /opt/impastio/database/tools/harmoniser-modeles.js --restaurer <sauvegarde.json>
 *   … --modeles cgv,invitation   pour n'en traiter que certains
 *   … --organisme CODE           s'il y a plusieurs organismes en base
 *   … --dossier /chemin          où poser la sauvegarde (défaut : /tmp/impastio-modeles — le redémarrage
 *                                du serveur vide /tmp : la copier ailleurs pour la garder)
 *
 * Le CHEMIN ABSOLU compte (cf. chiffrer-france-travail.js).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const db = require('../../src/api/config/database.js');
const C = require('../../src/api/lib/charteDocuments.js');
const { organismeVise } = require('./completer-entreprises.js');

const VERSION = 1;
const argument = (nom) => { const i = process.argv.indexOf(nom); return i >= 0 ? process.argv[i + 1] : undefined; };

/* LE PROFIL DE CHAQUE MODÈLE — ce que les règles générales ne peuvent pas lire seules. */
const DEVIS = { type: 'charte', corps: 9, interligne: 1.15, couverture: true, zoneInfo: 10, titreDocument: 12, surcharges: [
    // La page du programme : son titre et sa section, comme dans le devis retravaillé.
    { si: /^\{field:training_program\.title\}$/, role: 'titreDocument' },
    { si: /^Déroulé du programme de formation$/, role: 'titre' },
] };
const PROFILS = {
    'devis-rs7404': DEVIS,
    'devis-particulier': DEVIS,
    'devis-professionnel-copie': DEVIS,
    convention: { type: 'charte', corps: 9, interligne: 1.15, surcharges: [
        // L'annexe 2 : le programme porte le titre de la formation (en gras, 12 pt), comme la page programme du devis.
        { si: /^\{field:training_program\.title\}$/, gras: true, role: 'titreDocument' },
        { si: /^Contenu du programme de formation$/, role: 'sousTitre' },
    ] },
    contrat: { type: 'charte', corps: 9, interligne: 1.15, surcharges: [
        // Le titre du contrat et celui de ses annexes sont alignés à gauche : la règle « centré » ne les voit pas.
        { si: /^CONTRAT DE FORMATION PROFESSIONNELLE CONTINUE$/, role: 'titreDocument' },
        { si: /^ANNEXES AU CONTRAT$/, role: 'titreDocument' },
        { si: /^\{field:training_program\.title\}$/, gras: true, role: 'titreDocument' },
        { si: /^Contenu du programme de formation$/, role: 'sousTitre' },
    ] },
    'contrat-hygiene': { type: 'charte', corps: 9, interligne: 1.15, sautsRetires: [
        // Du Carlito 8 pt à l'Arial 9 pt, la page 1 déborde de trois puces : le saut les laissait seules en page 2.
        /^Article 6 : Modalités financières$/,
    ], surcharges: [
        // L'intitulé de la formation, mis en gras dans un h1 : du texte, pas un titre d'article.
        { si: /^Formation spécifique en hygiène alimentaire/, role: 'miseEnAvant' },
    ] },
    cgv: { type: 'charte', corps: 8, sautsRetires: [
        // En 8 pt, le saut d'avant « Propriété intellectuelle » laissait la page 3 aux trois quarts vide.
        /^Propriété intellectuelle$/,
    ], sautsAjoutes: [
        // Et ce titre tombait seul au bas de la page 1, son texte en haut de la page 2.
        /^Financement par le Compte Personnel de Formation \(CPF\)$/,
    ] },
    invitation: { type: 'charte', corps: 9, interligne: 1.15, surcharges: [
        // La formation, centrée entre « Comme convenu… » et « se déroulant » : mise en avant comme ses dates.
        { si: /^\{field:training_program\.title\}/, role: 'miseEnAvant' },
    ] },
    'droit-image': { type: 'charte', corps: 9, interligne: 1.15 },
    'attestation-hygiene': { type: 'charte', corps: 9, interligne: 1.15, surcharges: [
        // Le vrai titre de l'attestation vit dans le cadre, sous le numéro ROFHYA.
        { si: /^Attestation de formation spécifique en hygiène/, role: 'titreDocument' },
    ] },
};

/* LES VERSIONS RELUES : [corps, pied] tels qu'en production le 2026-09-26, puis tels que rendus et relus.
   Les images (data:…) comptent pour un repère : elles ne changent pas, et leur suite se contrôle à part.
   Deux variantes pour les quatre modèles que la migration 183 réécrit. */
const RELU = {
    'devis-rs7404': [
        { avant: ['5c6bec413ef925e5df60bb299846872828dea0f0aacbbb3ec3ea751dc0acd520', '593eecb30d9abf541a501b745311b139360e17911226d30cedb0bc2e08293562'],
          apres: ['b7a7494135045b13db8bf0cadfb753c75aaa005cdb9580ce1d74c39b7c40dd20', 'e0caedcd8e93d04a1f81fd1c9f1acd3197cd99bc251fb9641031c8789e339ade'] }],
    'devis-particulier': [
        { avant: ['ca8eae0193b9906f25bff5e3962ae2b4df298dc57bbf56ec4f84d34ac569db04', '7b570ee21dc40841777562ca305b156aa5194328853bc2a5784674fa48b062c0'],
          apres: ['b2eae03d6452cf6f945438618bb78cb343a698726e03f10b1ae699b21af18975', '67bdc44c45b4914c79274a303f1e2f31db0084821f46be1924011ccdd6512bbe'] },
        { avant: ['3bf339f3fef32248399bc8be0c278db8b4fe35f7f56e3eef253d9b7ca0aa4b4a', '7b570ee21dc40841777562ca305b156aa5194328853bc2a5784674fa48b062c0'],
          apres: ['5d523b59ad3ae389378f02aee968669ce321b1d927c91cf518dff317a81eb309', '67bdc44c45b4914c79274a303f1e2f31db0084821f46be1924011ccdd6512bbe'] }],
    'devis-professionnel-copie': [
        { avant: ['1d7bc508ae2d49ab26feff20b40aa456f7ef969c146c876407851f0dca5c4bb0', 'e6d22267b7108a618d05310e072f19cf9f884d73934e8c4ed876c54b1eb9864d'],
          apres: ['fb561e57ba783a7a32171693ce2febd25ad848777fe7a159c9243b530163b904', '67bdc44c45b4914c79274a303f1e2f31db0084821f46be1924011ccdd6512bbe'] },
        { avant: ['293335941774e7159c4be795203dc727bc711454eb7fad6c4b1f0bf3eb56dbe1', 'e6d22267b7108a618d05310e072f19cf9f884d73934e8c4ed876c54b1eb9864d'],
          apres: ['18e1e8f272565040cb42d503d20e995e5d9da980fd30088e55074a1f2aa49ce4', '67bdc44c45b4914c79274a303f1e2f31db0084821f46be1924011ccdd6512bbe'] }],
    'convention': [
        { avant: ['d4cfdd4e2834282b8eb196090965e2dd5da0c5653bd5179729ad83b99a0158cd', 'c4765cf3fc90c62a40ffbcd7879cd3429114cbfccd824bfd5328b93396df7a46'],
          apres: ['d410a391d6d80bb808e3b5f30422fa5a4b1bc6b7fcd5db2dd1f66da9505cc86b', 'd7ae77083ed8aeef05cc931d2bbf9131ceee0b12496a1ea4bdc31651de294ae8'] },
        { avant: ['2774e874c06e2b7ae875221cd9edc0050ab68891fb8e2f80b37271cdf6dbf2a9', 'c4765cf3fc90c62a40ffbcd7879cd3429114cbfccd824bfd5328b93396df7a46'],
          apres: ['f52192534eeb6d0d71dc13f1ea83c98e2ba492c6c6d4673b6d926eed6b21e7ae', 'd7ae77083ed8aeef05cc931d2bbf9131ceee0b12496a1ea4bdc31651de294ae8'] }],
    'contrat': [
        { avant: ['a913e0032ea11e1d1d1d09360e01033ce6c243ecfaf44d13725aa2f0ddbde13a', 'c4765cf3fc90c62a40ffbcd7879cd3429114cbfccd824bfd5328b93396df7a46'],
          apres: ['aa72c9582e05e19c092faa50e9562aefab35f7cd03b29336ef2f00b4a89096fd', 'd7ae77083ed8aeef05cc931d2bbf9131ceee0b12496a1ea4bdc31651de294ae8'] },
        { avant: ['1c417a8f4c014cb85b59f78d369272c6d63776a5f123a8b143eeffbbc9feca6a', 'c4765cf3fc90c62a40ffbcd7879cd3429114cbfccd824bfd5328b93396df7a46'],
          apres: ['9d705eda893be88cd8126bceb5195b096e9336b812942f7c7241abcd1d7c65b6', 'd7ae77083ed8aeef05cc931d2bbf9131ceee0b12496a1ea4bdc31651de294ae8'] }],
    'contrat-hygiene': [
        { avant: ['c2ea56d739b68149cfe59f3b06336117e84d42f6eebce4976218cbea4aa5e9ea', '40555e3554531b8d9301c1dd26fcdd96e23268449bca70e300585e3baef4769f'],
          apres: ['df11712d63605b796994c9fba6cb861a2201adbbec0c4f05fa7b9515b6cc0b56', 'ecc0a42fb227c4d6630fe96baf1c9b422cd644595d1179d6beb82e5fd88abdf7'] }],
    'cgv': [
        { avant: ['8ce87c69c08d64bd74484851c6f75e3ac7b444ededc0f3f6b2399c80512908a4', '63dc59c38b64b586fdb9635eed6d267904c7c9b9f98c3599ae16c9d2d79c882a'],
          apres: ['cc07f14ab019068854c4842df452ba9c7090a25d4b14ce0e7de470b7cee7d909', 'd7ae77083ed8aeef05cc931d2bbf9131ceee0b12496a1ea4bdc31651de294ae8'] }],
    'invitation': [
        { avant: ['381db67f9d8d5b0e4b2fc19f740d4b05b688d808eede07a0eba562acef6accaa', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
          apres: ['3f9de7a8c7c06d7ce5741705c777cd8cc3bc6048045fc5593ca551ff2db3acfc', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'] }],
    'droit-image': [
        { avant: ['f4435db5a81efc41a0ef208eb34511628801c1d93aa3e095adb52039e7c5662c', '95361614f8f4b655173624c38d7fee9dd291b5cb397c236373802bf5b9c730ac'],
          apres: ['5471521048e057f730a2ffb77592b0508fc05f82736dad2450291770e2d230ad', 'bcff371c19acbf6d2219674ad86515d43a5c212273f524e4fdeeea1094e0148b'] }],
    'attestation-hygiene': [
        { avant: ['70437a9fd0d032742873bbd281a307d4f1722fb83539e70673d3f35c1911539c', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
          apres: ['d9c712e535f097dbd028f0ff6513f43e419b7cc4cbc5bb89a8d3f62e9c6a9dfc', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'] }],
};

const IMAGE = /data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g;
const norme = (s) => String(s || '').replace(IMAGE, '__IMG__');
const empreinte = (s) => crypto.createHash('sha256').update(norme(s), 'utf8').digest('hex');
const images = (s) => (String(s || '').match(IMAGE) || []).join('|');

/**
 * Harmonise UN modèle et contrôle le résultat. → { corps, pied, roles, sautsRetires, sautsAjoutes }, ou
 * lève si le contenu ou la charpente ont bougé — ce qui ne doit jamais arriver, et ne s'écrit donc jamais.
 */
function harmoniserModele(slug, { body_html: corpsAvant, footer_html: piedAvant }) {
    const profil = PROFILS[slug];
    const r = C.harmoniser(corpsAvant || '', profil);
    const pied = C.harmoniserPied(piedAvant || '', profil).html;
    const reference = C.sansSauts(corpsAvant || '', profil);
    const controles = [
        ['texte du corps', C.contenu(reference), C.contenu(r.html)],
        ['charpente du corps', C.charpente(reference), C.charpente(r.html)],
        ['texte du pied', C.contenu(piedAvant || ''), C.contenu(pied)],
        ['charpente du pied', C.charpente(piedAvant || ''), C.charpente(pied)],
        ['images', images(corpsAvant) + '#' + images(piedAvant), images(r.html) + '#' + images(pied)],
    ];
    for (const [quoi, avant, apres] of controles) if (avant !== apres) throw new Error(`${slug} : ${quoi} modifié — rien n'est écrit`);
    const attendus = [(profil.sautsRetires || []).length, (profil.sautsAjoutes || []).length];
    if (r.sautsRetires !== attendus[0] || r.sautsAjoutes !== attendus[1]) throw new Error(`${slug} : sauts de page — ${r.sautsRetires} retiré(s), ${r.sautsAjoutes} ajouté(s), attendu ${attendus.join(' / ')}`);
    // Un pied vide (NULL) le reste : on n'écrit pas '' à sa place.
    return { corps: r.html, pied: piedAvant ? pied : piedAvant, roles: r.roles, sautsRetires: r.sautsRetires, sautsAjoutes: r.sautsAjoutes };
}

/**
 * L'EXAMEN, sans rien écrire. → [{ slug, label, etat, raison?, avant?, apres?, resume? }]
 *   etat : 'pret' | 'deja' (déjà harmonisé) | 'ignore' (modifié depuis la relecture, absent, fichier…)
 */
async function examiner(conn, { organisme, slugs = Object.keys(PROFILS), relu = RELU }) {
    const [lignes] = await conn.query(
        `SELECT slug, label, kind, deleted, body_html, footer_html FROM document_template
          WHERE organization_id = ? AND slug IN (?)`, [organisme.id, slugs]);
    return slugs.map((slug) => {
        const l = lignes.find((x) => x.slug === slug);
        const base = { slug, label: (l && l.label) || slug };
        if (!l || l.deleted) return { ...base, etat: 'ignore', raison: 'absent de la base' };
        if (l.kind !== 'builder' || !l.body_html) return { ...base, etat: 'ignore', raison: `pas un modèle de l'éditeur (${l.kind})` };
        const lu = [empreinte(l.body_html), empreinte(l.footer_html)];
        const versions = relu[slug] || [];
        if (versions.some((v) => v.apres[0] === lu[0] && v.apres[1] === lu[1])) return { ...base, etat: 'deja' };
        const v = versions.find((x) => x.avant[0] === lu[0] && x.avant[1] === lu[1]);
        if (!v) return { ...base, etat: 'ignore', raison: 'modifié depuis la relecture du 2026-09-26 : ce qui a été relu n\'est plus ce qui est en base' };
        const h = harmoniserModele(slug, l);
        if (empreinte(h.corps) !== v.apres[0] || empreinte(h.pied) !== v.apres[1]) {
            return { ...base, etat: 'ignore', raison: 'le résultat n\'est pas celui qui a été relu (le code a changé ?)' };
        }
        const compte = {};
        for (const { role } of h.roles) if (!['vide', 'couverture'].includes(role)) compte[role] = (compte[role] || 0) + 1;
        return { ...base, etat: 'pret', avant: { body_html: l.body_html, footer_html: l.footer_html }, apres: { body_html: h.corps, footer_html: h.pied },
            resume: { roles: compte, sautsRetires: h.sautsRetires, sautsAjoutes: h.sautsAjoutes } };
    });
}

/* Le corps ET le pied doivent être encore, octet pour octet, ceux qu'on a lus (un NULL se compare en ''). */
const TEL_QUEL = `CAST(body_html AS BINARY) = CAST(? AS BINARY) AND CAST(COALESCE(footer_html, '') AS BINARY) = CAST(? AS BINARY)`;

/** APPLIQUE : la sauvegarde d'abord — si elle échoue, rien ne s'écrit —, puis un modèle à la fois. */
async function appliquer(conn, { organisme, slugs, dossier, relu = RELU, maintenant = new Date() }) {
    const examen = await examiner(conn, { organisme, slugs, relu });
    const prets = examen.filter((e) => e.etat === 'pret');
    const bilan = { examen, ecrits: [], sautes: [] };
    if (!prets.length) return { bilan, sauvegarde: null };
    const sauvegarde = ecrire(dossier, `sauvegarde-modeles-${horodatage(maintenant)}.json`, {
        version: VERSION, cree_le: maintenant.toISOString(), organisme: { id: organisme.id, code: organisme.code || null },
        modeles: prets.map((e) => ({ slug: e.slug, avant: e.avant, apres: e.apres })),
    });
    for (const e of prets) {
        const [res] = await conn.query(
            `UPDATE document_template SET body_html = ?, footer_html = ?
              WHERE organization_id = ? AND slug = ? AND kind = 'builder' AND deleted = 0 AND ${TEL_QUEL}`,
            [e.apres.body_html, e.apres.footer_html, organisme.id, e.slug, e.avant.body_html, e.avant.footer_html || '']);
        if (res && res.affectedRows === 1) bilan.ecrits.push(e.slug);
        else bilan.sautes.push({ slug: e.slug, raison: 'enregistré entre-temps (éditeur ?) : non écrasé' });
    }
    return { bilan, sauvegarde };
}

/** RESTAURE : chaque modèle revient à son état d'avant — s'il n'a pas été modifié depuis l'application. */
async function restaurer(conn, { sauvegarde }) {
    if (!sauvegarde || sauvegarde.version !== VERSION || !Array.isArray(sauvegarde.modeles)) throw new Error('sauvegarde illisible, ou d\'une autre version de ce script');
    const bilan = { restaures: [], sautes: [] };
    for (const m of sauvegarde.modeles) {
        const [res] = await conn.query(
            `UPDATE document_template SET body_html = ?, footer_html = ?
              WHERE organization_id = ? AND slug = ? AND ${TEL_QUEL}`,
            [m.avant.body_html, m.avant.footer_html, sauvegarde.organisme.id, m.slug, m.apres.body_html, m.apres.footer_html || '']);
        if (res && res.affectedRows === 1) bilan.restaures.push(m.slug);
        else bilan.sautes.push({ slug: m.slug, raison: 'modifié depuis l\'application : non écrasé' });
    }
    return bilan;
}

function preparerDossier(dossier) {
    fs.mkdirSync(dossier, { recursive: true, mode: 0o700 });
    fs.accessSync(dossier, fs.constants.W_OK);
    return dossier;
}
const horodatage = (d = new Date()) => d.toISOString().replace(/[:.]/g, '-');
/** `wx` : ne JAMAIS écraser un fichier existant — une sauvegarde précédente moins que tout autre. */
function ecrire(dossier, nom, contenu) {
    const f = path.join(dossier, nom);
    fs.writeFileSync(f, JSON.stringify(contenu, null, 1), { mode: 0o600, flag: 'wx' });
    return f;
}

const ROLES = { titreDocument: 'titre du document', titre: 'titre', sousTitre: 'sous-titre', libelle: 'libellé', titreTexte: 'titre + texte',
    corps: 'texte', miseEnAvant: 'mis en avant', petit: 'petite mention', version: 'version', cellule: 'cellule' };
function ligneExamen(e) {
    if (e.etat === 'deja') return `  ✓ ${e.slug} — déjà harmonisé`;
    if (e.etat === 'ignore') return `  – ${e.slug} — ignoré : ${e.raison}`;
    const r = e.resume;
    const roles = Object.entries(r.roles).map(([k, n]) => `${n} ${ROLES[k] || k}`).join(', ');
    const sauts = [r.sautsRetires && `${r.sautsRetires} saut(s) de page retiré(s)`, r.sautsAjoutes && `${r.sautsAjoutes} ajouté(s)`].filter(Boolean).join(', ');
    return `  → ${e.slug} — ${roles}${sauts ? ` ; ${sauts}` : ''}`;
}

if (require.main === module) (async () => {
    const conn = db.promise();
    const dossier = argument('--dossier') || path.join(os.tmpdir(), 'impastio-modeles');
    const liste = argument('--modeles');
    const slugs = liste ? liste.split(',').map((s) => s.trim()).filter(Boolean) : Object.keys(PROFILS);
    try {
        const inconnus = slugs.filter((s) => !PROFILS[s]);
        if (inconnus.length) throw new Error(`modèle(s) sans profil : ${inconnus.join(', ')} (connus : ${Object.keys(PROFILS).join(', ')})`);
        if (process.argv.includes('--restaurer')) {
            const f = argument('--restaurer');
            if (!f) throw new Error('--restaurer attend le chemin d\'une sauvegarde');
            console.log('\nModèles de documents — RESTAURATION\n');
            const b = await restaurer(conn, { sauvegarde: JSON.parse(fs.readFileSync(path.resolve(f), 'utf8')) });
            console.log(`  ${b.restaures.length} restauré(s) : ${b.restaures.join(', ') || '—'}`);
            for (const s of b.sautes) console.log(`  – ${s.slug} : ${s.raison}`);
            console.log('');
            return;
        }
        const organisme = await organismeVise(conn, argument('--organisme'));
        if (process.argv.includes('--appliquer')) {
            console.log(`\nModèles de documents — APPLICATION de la charte — ${organisme.code || organisme.legal_name}\n`);
            const { bilan, sauvegarde } = await appliquer(conn, { organisme, slugs, dossier: preparerDossier(dossier) });
            for (const e of bilan.examen) console.log(ligneExamen(e));
            if (sauvegarde) console.log(`\n  Sauvegarde : ${sauvegarde}`);
            console.log(`  ${bilan.ecrits.length} modèle(s) écrit(s)${bilan.ecrits.length ? ` : ${bilan.ecrits.join(', ')}` : ''}.`);
            for (const s of bilan.sautes) console.log(`  – ${s.slug} : ${s.raison}`);
            if (sauvegarde) console.log(`\n  Pour revenir en arrière : sudo -u impastio node ${__filename} --restaurer ${sauvegarde}`);
            console.log('');
        } else {
            console.log(`\nModèles de documents — ESSAI (rien n'est écrit en base) — ${organisme.code || organisme.legal_name}\n`);
            const examen = await examiner(conn, { organisme, slugs });
            for (const e of examen) console.log(ligneExamen(e));
            const n = examen.filter((e) => e.etat === 'pret').length;
            console.log(`\n  ${n} modèle(s) prêt(s).`);
            if (n) {
                console.log('  Fermer d\'abord tout onglet « Modèles → éditeur » ouvert : il réécrirait l\'ancienne mise en forme.');
                console.log('  Puis : sudo systemctl start impastio-sauvegarde');
                console.log(`         sudo -u impastio node ${__filename} --appliquer\n`);
            } else console.log('');
        }
    } catch (err) {
        console.error('\nÉchec :', err.message, '\n');
        process.exitCode = 1;
    } finally {
        await db.end();
    }
})();

module.exports = { examiner, appliquer, restaurer, harmoniserModele, PROFILS, RELU, empreinte, norme, VERSION };
