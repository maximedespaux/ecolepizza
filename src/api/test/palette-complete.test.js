/**
 * LA PALETTE DE L'ÉDITEUR, AUDITÉE JETON PAR JETON — demandé le 2026-09-26 : « vérifie TOUS les jetons
 * de chaque catégorie, corrige-les et complète-les ».
 *
 * L'AUDIT, fait sur les réglages de PRODUCTION (les Champs documents cochés, lus par l'API), a trouvé :
 *   · des jetons INTROUVABLES — ils se remplissaient si on les tapait, sans figurer dans aucun groupe :
 *     le groupe « Financeur (OPCO) » entier, le reste à payer, le HT, la TVA, le taux et le TTC, la date
 *     de signature du stagiaire, son identifiant France Travail, l'adresse de l'entreprise sur une
 *     ligne, le nom complet de son référent ; et, faute de leur champ coché, le lieu de naissance, le
 *     statut professionnel, la fonction du référent, le formateur ;
 *   · un jeton MORT : {Formateur}, proposé, ne se remplissait jamais — la requête ne lisait pas la
 *     colonne ;
 *   · QUATORZE DOUBLONS : « Organisme » (les champs) et « Émetteur (identité) » (les jetons nommés)
 *     alignaient les mêmes données sous les mêmes libellés ; le groupe « calculé » répétait les durées
 *     de la formation, et y rangeait le formateur et le prix ;
 *   · des LIBELLÉS de développeur : « Formation · Prerequisites », « Entreprise · Representative civ »,
 *     et, pour le prénom du référent, le commentaire de la colonne (« … Cf. migration 174. ») ;
 *   · des colonnes de RÉGLAGE offertes comme des données du dossier (arborescences en JSON,
 *     interrupteurs des e-mails, cadres de Pizza Quest), et un « Logo » qui aurait imprimé son image
 *     en caractères ;
 *   · des EXEMPLES faux : la forme juridique d'une entreprise illustrée par « Demandeur d'emploi », le
 *     lieu de naissance par une date, « Exemple » partout où le motif ne savait pas, un prix promis
 *     « 1 500 » et imprimé « 1500 ».
 * Chaque test ci-dessous gèle l'un de ces défauts, sur la VRAIE fonction qui sert la palette.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

/* LES CHAMPS DOCUMENTS DE PRODUCTION, relevés le 2026-09-26 par l'API (GET /api/conditions/fields) :
   colonne:type — t texte, n nombre, b case, e liste (valeurs), i image — et « * » quand le champ est
   coché pour la palette. */
const PRODUCTION = {
    organization: 'legal_name:t* short_name:t* legal_status:t code:t manager:t* siret:t* vat_number:t* nda:t* naf_ape:t* address:t* zip_code:t* town:t* phone:t* email:t* iban:t* bic:t* bank_name:t* qualiopi:b emargement_config:t logo_image:t* partner_fields:t mail_credentials:b mail_reset:b mail_forgot:b mail_security:b mail_notifications:b archive_tree:t company_archive_tree:t',
    enrollment: 'financing:e(PARTICULIER|PROFESSIONNEL) price:n* acompte:n* crm_stage:e(PROSPECT|CONTACTE|INSCRIT) conformite_score:e(VERT|ORANGE|ROUGE)',
    company: 'name:t* siret:t* naf_ape:t* address:t* zip_code:t* town:t* email:t* phone:t* opco:t* legal_status:t* representative_civ:t* representative_first_name:t* representative_name:t* representative_role:t vat_number:t*',
    training_session: 'year:n* week:n* trainer:t status:e(PLANIFIEE|CONFIRMEE|EN_COURS|TERMINEE|ANNULEE)',
    learner: 'contacted_by:t civility:t* first_name:t* last_name:t* email:t* phone:t* birth_place:t address:t* zip_code:t* town:t* diploma_level:t diploma_name:t diploma_year:t last_experience:t experience_value:t experience_unit:t professional_status:t levels:t completed_levels:t cpf_amount:n current_contract:t financing:e(PARTICULIER|PROFESSIONNEL) opco:t* project_creation:b avatar:t profile_visibility:t cadre:t cadres_exclusifs:t note_libre:t a_recontacter:b',
    training_program: 'code:t level:t title:t* days:n* hours:n* price:n* audience:t* objectives:t* objective_general:t* duration_detail:t* program_detail:t* rs_code:t* hygiene:b* active:b archive_tree:t company_archive_tree:t needs_emargement:b horaires:t* emargement_break_slug:t company_steps:t company_break_slug:t prerequisites:t*',
};
const COCHES_SPECIAUX = ['virtual.certifiante', 'virtual.evaluation_reussie', 'virtual.evaluation_percent', 'organization.signature_image'];
/* Le commentaire que la colonne porte réellement en base (migration 174) : c'est lui qui s'affichait. */
const COMMENTAIRES = { 'company.representative_first_name': 'Prenom du referent. representative_name porte alors le nom seul. Cf. migration 174.' };

function schemaDeProduction(retouches = {}) {
    const colonnes = [];
    const reglages = [];
    for (const [t, liste] of Object.entries(PRODUCTION)) {
        for (const entree of liste.split(' ')) {
            const m = /^(\w+):([tnbe])(\*?)(?:\(([^)]*)\))?$/.exec(entree);
            const [, c, type, coche, valeurs] = m;
            const [dt, ct] = type === 'e' ? ['enum', `enum(${valeurs.split('|').map((v) => `'${v}'`).join(',')})`]
                : { t: ['varchar', 'varchar(255)'], n: ['int', 'int(11)'], b: ['tinyint', 'tinyint(1)'] }[type];
            colonnes.push({ t, c, dt, ct, cm: COMMENTAIRES[`${t}.${c}`] || '' });
            const cle = `${t}.${c}`;
            const actif = cle in retouches ? retouches[cle] : !!coche;
            reglages.push({ source_table: t, column_name: c, enabled: actif ? 1 : 0, enabled_condition: actif ? 1 : 0, label: null });
        }
    }
    for (const cle of COCHES_SPECIAUX) {
        const [t, c] = cle.split('.');
        reglages.push({ source_table: t, column_name: c, enabled: 1, enabled_condition: 1, label: null });
    }
    return { colonnes, reglages };
}

const ORG = {
    legal_name: 'École Pizza — Jean-Jacques Despaux', short_name: 'École Pizza', manager: 'Jean-Jacques Despaux',
    siret: '879 955 136 00012', nda: '76 65 00989 65', naf_ape: '8559A', address: '101 rue Alsace Lorraine',
    zip_code: '65300', town: 'LANNEMEZAN', phone: '05 62 50 18 64', email: 'contact@ecole-pizza.com',
    vat_number: 'FR00879955136', iban: 'FR76 1111', bic: 'AGRIFRPP', bank_name: 'Crédit Agricole', code: 'EPJJD',
};
const JETONS_PERSO = [
    { token_key: 'Periode', label: 'Periode de la formation', category: 'Session', template: "Du {Jour1} jusqu'au {endDate}" },
    { token_key: 'Acompte', label: 'Acompte de la formation (30%)', category: 'Formation', template: '{field:training_program.price|*0.30}' },
];

let base = schemaDeProduction();
let modele = null;
const faux = {
    promise: () => ({
        query: async (sql) => {
            const q = sql.replace(/\s+/g, ' ');
            if (/FROM information_schema\.COLUMNS/.test(q)) return [base.colonnes];
            if (/FROM condition_field WHERE organization_id/.test(q)) return [base.reglages];
            if (/SELECT \* FROM organization WHERE id/.test(q)) return [[ORG]];
            if (/FROM custom_token/.test(q)) return [JETONS_PERSO];
            if (/FROM document_template WHERE organization_id = \? AND slug/.test(q)) return [modele ? [modele] : []];
            return [[]];
        },
    }),
    query: (sql, params, cb) => { if (typeof cb === 'function') cb(null, {}); },
};
const cheminDb = require.resolve('../config/database.js');
require.cache[cheminDb] = { id: cheminDb, filename: cheminDb, loaded: true, exports: faux };

const { getTokens, REGLES_PALETTE } = require('../controllers/template.controller.js');
const { TOKEN_CATALOG, resolveTokens } = require('../lib/tokens.js');
const { fillHtml } = require('../lib/htmlfill.js');
const { introspectFields } = require('../lib/conditions.js');

const TYPES = {
    stagiaire: { company_level: 0, doc_type: 'DEVIS' },
    entreprise: { company_level: 1, doc_type: 'CONVENTION' },
    facture: { company_level: 0, doc_type: 'FACTURE' },
};
async function palette(cas = 'stagiaire', retouches) {
    base = schemaDeProduction(retouches);
    modele = TYPES[cas];
    let corps = null;
    const res = { status() { return this; }, json(b) { corps = b; return this; } };
    await getTokens({ user: { organization_id: 'o1' }, query: { slug: 'modele' } }, res);
    return corps;
}
const groupeDe = (data, cle) => (data.find((g) => g.tokens.some((t) => t.key === cle)) || {}).group;
const jeton = (data, cle) => data.flatMap((g) => g.tokens).find((t) => t.key === cle);

test('AUCUN JETON INTROUVABLE : chaque jeton du catalogue est proposé, ou a une raison écrite de ne pas l\'être', async () => {
    /* L'exception doit être l'une des cinq que la palette déclare, jamais un oubli. C'est ce qui manquait
       depuis toujours : le catalogue grandissait, la palette suivait à la main, et le second geste
       s'oubliait (évaluation, examen, {Today}, {D_Naissance}, et encore treize jetons le 2026-09-26). */
    const { JUMEAUX, ANCIENS_NOMS, OFFERTS_PAR_L_EDITEUR, FACTURE_SEULEMENT, groupeEnPalette } = REGLES_PALETTE;
    for (const cas of Object.keys(TYPES)) {
        const { data } = await palette(cas);
        const proposes = new Set(data.filter((g) => !/^Ligne de /.test(g.group)).flatMap((g) => g.tokens.map((t) => t.key)));
        const groupes = new Set(data.map((g) => g.group));
        const masques = cas === 'entreprise'
            ? ['Stagiaire', 'Autorisations', 'Inscription', 'Évaluation pratique', 'Jury'] : ['Groupe entreprise'];
        for (const cg of TOKEN_CATALOG) {
            for (const t of cg.tokens) {
                if (proposes.has(t.key)) continue;
                const raison = (JUMEAUX[t.key] && proposes.has(`field:${JUMEAUX[t.key]}`) && 'jumeau')
                    || (ANCIENS_NOMS.has(t.key) && 'ancien nom')
                    || (OFFERTS_PAR_L_EDITEUR.has(t.key) && 'cadre du bloc Signatures')
                    || (FACTURE_SEULEMENT.has(t.key) && TYPES[cas].doc_type !== 'FACTURE' && 'facture seulement')
                    || (masques.includes(groupeEnPalette(t.key, cg.group)) && !groupes.has(groupeEnPalette(t.key, cg.group)) && 'groupe masqué');
                assert.ok(raison, `{${t.key}} (${cg.group}) introuvable dans la palette d'un document « ${cas} », sans raison`);
            }
        }
    }
});

test('les jetons qui manquaient sont proposés, chacun là où on le cherche', async () => {
    const { data } = await palette('stagiaire');
    const attendus = {
        'Nom financeur': 'Financeur (OPCO)', 'SIRET financeur': 'Financeur (OPCO)', 'Adresse financeur': 'Financeur (OPCO)',
        'Email financeur': 'Financeur (OPCO)', 'Téléphone financeur': 'Financeur (OPCO)', OPCO: 'Financeur (OPCO)',
        Financement: 'Prix et financement', Prix: 'Prix et financement', Acompte: 'Prix et financement',
        'Reste à payer': 'Prix et financement', 'Prix HT': 'Prix et financement', TVA: 'Prix et financement',
        'Taux TVA': 'Prix et financement', 'Prix TTC': 'Prix et financement',
        'Date signature': 'Stagiaire', 'Nom signataire': 'Stagiaire', 'France Travail': 'Stagiaire',
        // Leur champ jumeau n'est pas coché en production : sans le jeton nommé, la donnée serait introuvable.
        'Lieu naissance': 'Stagiaire', Statut: 'Stagiaire', 'Fonction représentant': 'Entreprise', Formateur: 'Session',
        'Adresse entreprise': 'Entreprise', 'Nom représentant': 'Entreprise', Code: 'Formation',
        // Les dates et les jours de la session vivaient dans « Dates et valeurs calculées ».
        Jour1: 'Session', endDate: 'Session', Semaine: 'Session', Mardi: 'Session', HorairesJours: 'Session',
        Today: 'Dates et valeurs calculées', 'Adresse organisme': 'Organisme',
    };
    for (const [cle, groupe] of Object.entries(attendus)) {
        assert.strictEqual(groupeDe(data, cle), groupe, `{${cle}} doit se trouver dans « ${groupe} »`);
    }
    /* {Taux TVA} est AUSSI un jeton de ligne d'articles (le taux de LA ligne) : proposé là, il ne
       l'était plus hors du bloc, où il vaut le taux de l'organisme. */
    assert.ok(data.find((g) => g.group === 'Ligne de facture').tokens.some((t) => t.key === 'Taux TVA'));
});

test('un champ décoché, son jeton nommé revient ; coché, un seul des deux est proposé', async () => {
    let { data } = await palette('stagiaire');
    assert.ok(jeton(data, 'Lieu naissance') && !jeton(data, 'field:learner.birth_place'));
    ({ data } = await palette('stagiaire', { 'learner.birth_place': true, 'company.representative_role': true }));
    assert.ok(!jeton(data, 'Lieu naissance') && jeton(data, 'field:learner.birth_place'), 'jamais deux puces pour une valeur');
    assert.ok(!jeton(data, 'Fonction représentant') && jeton(data, 'field:company.representative_role'));
    // Et le jeton nommé reste RECONNU : la puce d'un modèle qui l'emploie garde sa famille.
    const { connus } = await palette('stagiaire', { 'learner.birth_place': true });
    assert.ok(connus.some((g) => g.group === 'Stagiaire' && g.tokens.some((t) => t.key === 'Lieu naissance')));
});

test('les jumeaux impriment VRAIMENT la même chose — éprouvé sur un dossier, jeton par jeton', () => {
    /* Un « jumeau » cache le jeton nommé dès que son champ est coché : une fausse égalité ferait
       disparaître de la palette une valeur que rien d'autre n'imprime. {Code} (le code OU le code RS),
       {OPCO} (celui de l'entreprise OU du stagiaire) et {PrixFormation} (« 1 500 € », symbole compris)
       n'en sont pas, et ne doivent pas y figurer. */
    const lignes = {
        learner: { civility: 'M.', first_name: 'Jean', last_name: 'DUPONT', email: 'jean.dupont@email.fr', phone: '06 12 34 56 78',
            zip_code: '33000', town: 'BORDEAUX', birth_place: 'TOULOUSE', professional_status: "Demandeur d'emploi" },
        company: { name: 'Pizza Napoli SARL', siret: '123 456 789 00012', representative_civ: 'Mme', representative_role: 'Gérante',
            email: 'contact@pizzanapoli.fr', phone: '05 56 11 22 33', naf_ape: '5610C', legal_status: 'SARL' },
        organization: { ...ORG, legal_status: 'SAS' },
        training_program: { title: 'Fabriquer des pizzas', audience: 'Professionnels', prerequisites: 'Six mois de métier',
            objectives: 'Maîtriser la pâte', objective_general: 'Devenir autonome', duration_detail: '35 h sur 5 jours',
            program_detail: 'Jour 1 : la pâte', hours: 10.5, days: 2 },
        training_session: { trainer: 'Marc Leblanc' },
        enrollment: { financing: 'PARTICULIER' },
    };
    const fields = {};
    for (const [t, ligne] of Object.entries(lignes)) for (const [c, v] of Object.entries(ligne)) fields[`${t}.${c}`] = v;
    const p = lignes.training_program;
    const ctx = {
        learner: lignes.learner, company: lignes.company, org: lignes.organization, fields,
        formations: [{ ...p, trainer: lignes.training_session.trainer, financing: lignes.enrollment.financing }],
    };
    const rendu = (cle) => fillHtml(`<p><span class="doc-token" data-token="${cle}">x</span></p>`, ctx);
    // Un paragraphe vide sort avec une espace INSÉCABLE (htmlfill) : on compare au vrai rendu du vide.
    const vide = fillHtml('<p><span class="doc-token" data-token="Inexistant">x</span></p>', {});
    for (const [nomme, champ] of Object.entries(REGLES_PALETTE.JUMEAUX)) {
        assert.notStrictEqual(rendu(nomme), vide, `{${nomme}} : le dossier d'essai doit le remplir`);
        assert.strictEqual(rendu(nomme), rendu(`field:${champ}`), `{${nomme}} et le champ ${champ} doivent imprimer la même chose`);
    }
    for (const faux of ['Code', 'OPCO', 'PrixFormation']) assert.ok(!(faux in REGLES_PALETTE.JUMEAUX), `{${faux}} n'a pas de jumeau`);
});

test('plus de doublon : un libellé ne revient pas deux fois dans un groupe, et « Émetteur (identité) » n\'existe plus', async () => {
    for (const cas of Object.keys(TYPES)) {
        const { data } = await palette(cas);
        assert.ok(!data.some((g) => g.group === 'Émetteur (identité)'), 'les jetons nommés de l\'organisme ont rejoint « Organisme »');
        for (const g of data) {
            const vus = new Set();
            for (const t of g.tokens) {
                assert.ok(!vus.has(t.label), `« ${t.label} » deux fois dans « ${g.group} » (document ${cas})`);
                vus.add(t.label);
            }
        }
    }
    const { data } = await palette('facture');
    const organisme = data.find((g) => g.group === 'Organisme').tokens.map((t) => t.key);
    assert.ok(organisme.includes('field:organization.siret') && !organisme.includes('Siret organisme'));
    // Propres à la facture d'une entité émettrice : proposés sur un modèle FACTURE, et là seulement.
    assert.ok(organisme.includes('Capital organisme') && organisme.includes('RCS organisme'));
    assert.ok(!jeton((await palette('stagiaire')).data, 'Capital organisme'), 'vide hors facture : il bloquerait la génération');
});

test('LES LIBELLÉS : ni repli « Table · colonne », ni commentaire de développeur', async () => {
    for (const cas of Object.keys(TYPES)) {
        const { data } = await palette(cas);
        for (const t of data.flatMap((g) => g.tokens)) {
            assert.ok(!/^(Stagiaire|Inscription|Formation|Session|Entreprise|Organisme|Calculé) · /.test(t.label), `libellé de repli : « ${t.label} »`);
            assert.ok(!/migration \d{3}/i.test(t.label), `commentaire de colonne pris pour un libellé : « ${t.label} »`);
        }
    }
    const { data } = await palette('entreprise');
    assert.strictEqual(jeton(data, 'field:company.representative_first_name').label, 'Prénom du référent');
    assert.strictEqual(jeton(data, 'field:company.representative_civ').label, 'Civilité du référent');
    assert.strictEqual(jeton(data, 'field:training_program.prerequisites').label, 'Prérequis');
});

/* LE SCHÉMA ENTIER, pas seulement ce qui est coché aujourd'hui : schema.sql et toutes les migrations
   « aller ». Une colonne ajoutée demain aux tables du dossier sans libellé français fera rougir ce test
   — au lieu de s'afficher « Formation · Prerequisites » dans cinq modèles. */
const RACINE = path.join(__dirname, '..', '..', '..');
const ELIGIBLES = ['learner', 'enrollment', 'training_program', 'training_session', 'company', 'organization'];
const MOTS = /^(PRIMARY|KEY|UNIQUE|CONSTRAINT|INDEX|FOREIGN|FULLTEXT|SPATIAL|CHECK|PARTITION)$/i;
function colonnesDuSchema() {
    const cols = new Map();
    const ajoute = (t, c, type) => {
        if (MOTS.test(c)) return;
        const m = /^(\w+)(\([^)]*\))?/.exec(type);
        cols.set(`${t}.${c}`, { t, c, dt: m[1].toLowerCase(), ct: (m[1] + (m[2] || '')).toLowerCase(), cm: '' });
    };
    const schema = fs.readFileSync(path.join(RACINE, 'database/schema.sql'), 'utf8');
    for (const m of schema.matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\) ENGINE/g)) {
        if (!ELIGIBLES.includes(m[1])) continue;
        for (const l of m[2].split('\n')) {
            const c = /^\s+`?(\w+)`?\s+(\w+(?:\([^)]*\))?)/.exec(l);
            if (c) ajoute(m[1], c[1], c[2]);
        }
    }
    const MIG = path.join(RACINE, 'database/migrations');
    for (const f of fs.readdirSync(MIG).filter((x) => /^\d{3}_/.test(x) && !/_revert_/.test(x)).sort()) {
        const sql = fs.readFileSync(path.join(MIG, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
        for (const st of sql.split(';')) {
            const alt = /ALTER TABLE\s+(?:IF EXISTS\s+)?`?(\w+)`?/i.exec(st);
            if (!alt || !ELIGIBLES.includes(alt[1])) continue;
            for (const a of st.matchAll(/\bADD\s+(?:COLUMN\s+)?(?:IF NOT EXISTS\s+)?`?(\w+)`?\s+(\w+(?:\([^)]*\))?)/gi)) ajoute(alt[1], a[1], a[2]);
            for (const d of st.matchAll(/\bDROP\s+(?:COLUMN\s+)?(?:IF EXISTS\s+)?`?(\w+)`?/gi)) if (!MOTS.test(d[1])) cols.delete(`${alt[1]}.${d[1]}`);
            for (const mo of st.matchAll(/\bMODIFY\s+(?:COLUMN\s+)?(?:IF EXISTS\s+)?`?(\w+)`?\s+(\w+(?:\([^)]*\))?)/gi)) ajoute(alt[1], mo[1], mo[2]);
        }
    }
    return [...cols.values()];
}

test('chaque colonne du dossier a un libellé français — ou n\'est pas un champ', async () => {
    const colonnes = colonnesDuSchema();
    assert.ok(colonnes.length > 150, 'le schéma et les migrations doivent avoir été lus');
    const champs = await introspectFields({ query: async () => [colonnes] });
    const TABLE = { learner: 'Stagiaire', enrollment: 'Inscription', training_program: 'Formation',
        training_session: 'Session', company: 'Entreprise', organization: 'Organisme' };
    const sansLibelle = champs.filter((f) => f.label.startsWith(`${TABLE[f.table]} · `)).map((f) => `${f.table}.${f.column}`);
    assert.deepStrictEqual(sansLibelle, [], 'ajoutez leur libellé à FR_LABELS (lib/conditions.js), ou écartez la colonne');
    // Le schéma lu est bien celui de production : tout champ proposé là-bas est lu ici.
    const lus = new Set(champs.map((f) => `${f.table}.${f.column}`));
    for (const cle of ['company.representative_first_name', 'training_program.prerequisites', 'learner.a_recontacter']) {
        assert.ok(lus.has(cle), `${cle} doit être lu depuis les migrations`);
    }
});

test('les colonnes de RÉGLAGE ne sont pas des données du dossier — ni le logo, image rangée en texte', async () => {
    const champs = await introspectFields({ query: async () => [schemaDeProduction().colonnes] });
    const cles = new Set(champs.map((f) => `${f.table}.${f.column}`));
    for (const cle of ['organization.logo_image', 'organization.archive_tree', 'organization.emargement_config',
        'organization.partner_fields', 'organization.mail_reset', 'training_program.company_steps',
        'training_program.needs_emargement', 'learner.avatar', 'learner.cadre', 'learner.cadres_exclusifs']) {
        assert.ok(!cles.has(cle), `${cle} ne doit pas s'offrir comme champ`);
    }
    // Aucune condition de production ne les lit (vérifié par l'API) : celles qui existent restent lisibles.
    for (const cle of ['training_program.rs_code', 'enrollment.financing', 'training_program.hygiene', 'learner.opco']) {
        assert.ok(cles.has(cle), `${cle} est lu par une condition enregistrée`);
    }
});

test('LES EXEMPLES : l\'organisme par ses vraies valeurs, une identité d\'exemple cohérente, jamais « Exemple »', async () => {
    const { data } = await palette('facture');
    assert.strictEqual(jeton(data, 'field:organization.siret').sample, ORG.siret);
    assert.strictEqual(jeton(data, 'field:organization.address').sample, ORG.address);
    assert.strictEqual(jeton(data, 'Adresse organisme').sample, `${ORG.address}, ${ORG.zip_code} ${ORG.town}`);
    assert.strictEqual(jeton(data, 'field:company.legal_status').sample, 'SARL', 'pas « Demandeur d\'emploi » pour une société');
    assert.strictEqual(jeton(data, 'field:company.name').sample, 'Pizza Napoli SARL');
    assert.strictEqual(jeton(data, 'field:company.representative_name').sample, 'MARTIN', 'le référent n\'est pas la société');
    assert.strictEqual(jeton(data, 'field:company.email').sample, 'contact@pizzanapoli.fr', 'ni l\'e-mail du stagiaire');
    assert.strictEqual(jeton(data, 'field:virtual.evaluation_percent').sample, '82');
    assert.notStrictEqual(jeton(data, 'field:training_program.program_detail').sample, jeton(data, 'field:training_program.title').sample,
        'le déroulé n\'est pas l\'intitulé');
    // Le prix, écrit comme le document l'imprimera.
    assert.strictEqual(jeton(data, 'field:training_program.price').sample, (1500).toLocaleString('fr-FR'));
    // {Prix HT} + {TVA} = {Prix TTC}, et un taux qui va avec.
    assert.deepStrictEqual(['Prix HT', 'TVA', 'Taux TVA', 'Prix TTC'].map((k) => jeton(data, k).sample), ['1 500 €', '300 €', '20 %', '1 800 €']);
    const exemples = data.flatMap((g) => g.tokens).filter((t) => t.sample === 'Exemple').map((t) => t.key);
    assert.deepStrictEqual(exemples, []);
    // Le lieu de naissance est un LIEU (le motif « birth » lui donnait une date).
    const { data: d2 } = await palette('stagiaire', { 'learner.birth_place': true });
    assert.strictEqual(jeton(d2, 'field:learner.birth_place').sample, 'TOULOUSE');
    // Un jeton personnalisé qui cite {Jour1} — rangé dans la palette APRÈS lui — montre ce qu'il produira.
    assert.strictEqual(jeton(d2, 'custom:Periode').sample, "Du 02/06/2025 jusqu'au 06/06/2025");
});

test('UN NOMBRE DE CHAMP S\'IMPRIME À LA FRANÇAISE — un prix, pas une année', () => {
    /* L'attendu est CONSTRUIT : `toLocaleString('fr-FR')` sépare les milliers par une espace fine
       insécable (U+202F), invisible à la relecture — la recopier à la main ferait échouer le test sur
       deux chaînes identiques à l'œil. */
    const rendu = (cle, v) => fillHtml(`<p><span data-token="field:${cle}">x</span></p>`, { fields: { [cle]: v } });
    assert.strictEqual(rendu('training_program.price', 1750), `<p>${(1750).toLocaleString('fr-FR')}</p>`, 'et non « 1750 »');
    assert.strictEqual(rendu('enrollment.acompte', 525.5), '<p>525,50</p>', 'des centimes : deux décimales');
    assert.strictEqual(rendu('enrollment.price', '1750.00'), `<p>${(1750).toLocaleString('fr-FR')}</p>`, 'un DECIMAL arrive en texte');
    assert.strictEqual(rendu('training_session.year', 2025), '<p>2025</p>', 'une année ne prend pas de séparateur');
    assert.strictEqual(rendu('virtual.evaluation_percent', 82.5), '<p>82,5</p>');
    assert.strictEqual(rendu('learner.zip_code', '65300'), '<p>65300</p>', 'un code postal n\'est pas un nombre');
    // Un jeton personnalisé calcule toujours sur la valeur mise en forme — l'acompte des devis.
    const ctx = { fields: { 'training_program.price': 1750 }, customTokens: [JETONS_PERSO[1]] };
    assert.strictEqual(fillHtml('<p><span data-token="custom:Acompte">x</span></p>', ctx), '<p>525</p>');
});

test('{Formateur} SE REMPLIT — la requête du document ne lisait pas la colonne', () => {
    const DOC = fs.readFileSync(path.join(__dirname, '..', 'controllers/document.controller.js'), 'utf8');
    const lectures = DOC.match(/s\.year, s\.week, s\.trainer,/g) || [];
    assert.strictEqual(lectures.length, 2, 'les deux lectures : par les inscriptions, et par la session (document de session)');
    assert.strictEqual(resolveTokens({ formations: [{ trainer: 'Marc Leblanc' }] }).Formateur, 'Marc Leblanc');
});

test('{Heures} et {Jours} écrivent la virgule décimale', () => {
    const v = resolveTokens({ formations: [{ hours: 10.5, days: 1.5 }] });
    assert.strictEqual(v.Heures, '10,5');
    assert.strictEqual(v.Jours, '1,5');
    assert.strictEqual(resolveTokens({ formations: [{ hours: 35 }] }).Heures, '35');
});

test('L\'ÉDITEUR montre le libellé ACTUEL d\'une puce figée sous un libellé qui ne dit plus vrai — et garde les autres', async () => {
    const couleurs = await import('../../app/ui/lib/categoryColors.js');
    for (const cas of Object.keys(TYPES)) {
        const cat = await palette(cas);
        couleurs.registerTokenGroups([...cat.data, ...cat.connus]);
        couleurs.registerAnciensLibelles(cat.anciens);
        /* Les libellés figés relevés dans les modèles de PRODUCTION le 2026-09-26. */
        const figes = {
            stagiaire: [['field:training_program.prerequisites', 'Formation · Prerequisites', 'Prérequis'],
                ['field:organization.legal_name', 'Organisme · Legal name', "Raison sociale de l'organisme"],
                ['field:organization.iban', 'Organisme · Iban', 'IBAN'],
                ['Mardi', 'Date — Mardi (jour 2)', 'Jour 2 de la session'],
                ['Données partenaires', 'Partenaires : informations transmises', 'Partenaires : ce que la case autorise']],
            entreprise: [['field:company.representative_civ', 'Entreprise · Representative civ', 'Civilité du référent'],
                ['field:company.representative_first_name', COMMENTAIRES['company.representative_first_name'], 'Prénom du référent'],
                ['field:company.representative_name', 'Entreprise · Representative name', 'Nom du référent']],
            facture: [['Adresse organisme', 'Adresse', 'Adresse complète']],
        }[cas];
        for (const [cle, fige, actuel] of figes) assert.strictEqual(couleurs.libelleAffiche(cle, fige), actuel, `${cle} : « ${fige} »`);
    }
    // Un libellé COURT choisi pour un tableau d'articles reste le sien.
    for (const [cle, court] of [['Quantité', 'Qté'], ['Prix unitaire HT', 'PU HT'], ['Adresse acheteur', 'Adr. acheteur'], ['Taux TVA', 'Taux']]) {
        assert.strictEqual(couleurs.libelleAffiche(cle, court), court);
    }
    const VUE = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'TokenView.jsx'), 'utf8');
    assert.match(VUE, /\{libelleAffiche\(token, label\)\}/, 'la puce affiche le libellé actuel');
    const EDITEUR = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'TemplateEditor.jsx'), 'utf8');
    assert.match(EDITEUR, /registerAnciensLibelles\(cat\.anciens \|\| \{\}\);/);
});

test('UNE PUCE QUI NE DÉSIGNE PLUS RIEN SE VOIT — l\'acompte des devis, de la convention et du contrat', async () => {
    const couleurs = await import('../../app/ui/lib/categoryColors.js');
    const cat = await palette('stagiaire');
    couleurs.registerTokenGroups([...cat.data, ...cat.connus]);
    const puce = (cle, libelle) => `<span class="doc-token" contenteditable="false" data-token="${cle}" data-label="${libelle}">${libelle}</span>`;
    const html = `<p>Joindre votre règlement de ${puce('custom:Acomtpe', 'Acompte de la formation (30%)')} €</p>`
        + `<p>${puce('custom:Acompte', 'Acompte de la formation (30%)')} ${puce('Date', 'Date du jour')} ${puce('sig:representant', "Cachet de l'entreprise")}`
        + ` ${puce('Signature stagiaire', 'Signature du stagiaire')} ${puce('Siret organisme', 'SIRET')} ${puce('Naissance', 'Naissance')}</p>`;
    assert.deepStrictEqual(couleurs.jetonsInconnus(html), [{ cle: 'custom:Acomtpe', libelle: 'Acompte de la formation (30%)' }]);
    // Palette pas encore chargée : on n'accuse rien.
    couleurs.registerTokenGroups([]);
    assert.deepStrictEqual(couleurs.jetonsInconnus(html), []);
    const EDITEUR = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'pages', 'TemplateEditor.jsx'), 'utf8');
    assert.match(EDITEUR, /const inconnus = catalog\.length \? jetonsInconnus\(/);
    assert.match(EDITEUR, /\{inconnus\.length > 0 && \(/, 'l\'éditeur les nomme au-dessus du modèle');
    const VUE = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'lib', 'TokenView.jsx'), 'utf8');
    assert.match(VUE, /className=\{"doc-token" \+ \(inconnu \? " inconnu" : ""\)\}/, 'et la puce se barre');
    const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'ui', 'styles', 'app.css'), 'utf8');
    assert.match(CSS, /\.doc-token\.inconnu\{[^}]*border-style:dashed/);
});
