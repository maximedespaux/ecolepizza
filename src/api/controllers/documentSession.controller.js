/**
 * DOCUMENTS DE SESSION SIGNÉS PAR UN INTERVENANT EXTERNE.
 *
 * LE BESOIN, dit par l'organisme : « un contrat d'hygiène, signé par l'organisme et une
 * personne externe précise ; c'est un document de LA SESSION, pas de chaque stagiaire ». Et le
 * geste voulu : « un bouton Envoyer le document, qui ne propose que les modèles dont l'option
 * Intervenant externe est cochée, puis afficher ce qui est envoyé et ce qui est signé ».
 *
 * TROIS CHOIX QUI TIENNENT TOUT LE FICHIER :
 *
 *   · L'ÉLIGIBILITÉ SE LIT SUR LES SIGNATAIRES, pas sur un drapeau de plus. Un modèle dont la
 *     case « Externe » est cochée est un document qu'un intervenant peut signer. Ajouter une
 *     seconde case aurait créé deux vérités sur la même question, et l'occasion qu'elles se
 *     contredisent ;
 *
 *   · LE SIGNATAIRE EST UN INTERVENANT DE LA SESSION, choisi dans la liste de ceux qui y sont
 *     affectés — pas une adresse saisie à la main. Il a un compte, un espace, et une signature
 *     déjà enregistrée : signer devient un clic, et aucun jeton ne circule par courriel ;
 *
 *   · L'ORGANISME SIGNE APRÈS, TOUT SEUL. `applySlotSignature` appose déjà sa signature visible
 *     quand une partie signe — « l'organisme signe en DERNIER » — puis re-scelle le PDF. Il n'y
 *     a rien à écrire ici pour ça, et surtout rien à dupliquer.
 */
const crypto = require('crypto');
const db = require('../config/database.js');
const { logAudit } = require('../lib/audit.js');
const { loadOrgSteps, getTemplateContent } = require('./template.controller.js');
const { stepSigners, CASE_STAGIAIRE } = require('../lib/documents.js');

/**
 * LE CRÉNEAU DE SIGNATURE SE LIT DANS LE MODÈLE, il ne s'impose pas.
 *
 * DÉFAUT SIGNALÉ, et il rendait la fonctionnalité inutile : le modèle « Contrat Hygiène » place
 * une case `{sig:intervenant}` — c'est l'école qui a choisi ce nom dans l'éditeur. Le code, lui,
 * écrivait un créneau nommé « externe ». La signature de l'intervenant atterrissait donc dans un
 * créneau que le document n'affiche nulle part : il signait, et la case restait vide.
 *
 * ON PART DONC DU MODÈLE. Le premier `sig:<créneau>` qu'il contient est celui qu'on remplira.
 * Le repli « externe » ne sert qu'aux modèles qui n'en déclarent aucun — ils n'afficheront pas
 * la signature, mais le document restera signable et scellé.
 */
const SLOT_DEFAUT = 'externe';

/* LE CADRE DE L'INTERVENANT — « Signature de l'intervenant » dans la palette (clé FIXE
   `sig:intervenant`, cf. TemplateEditor). Il passe AVANT « le premier cadre du modèle » : un
   modèle qui place « Stagiaire 1 » plus haut envoyait sinon la signature de l'intervenant dans le
   cadre du stagiaire. Et le lien de signature « externe » le vise aussi (createSignLink) : un seul
   cadre pour le signataire externe, quel que soit le chemin par lequel il signe. */
const CRENEAU_INTERVENANT = 'intervenant';

/** Les cadres de signature nommés du modèle (`sig:<créneau>`), dans l'ordre du document. */
async function creneauxDuModele(orgId, slug) {
    try {
        const c = await getTemplateContent(orgId, slug);
        const corps = `${(c && c.html) || ''}${(c && c.header) || ''}${(c && c.footer) || ''}`;
        return [...corps.matchAll(/data-token="sig:([^"]+)"|\{\s*sig:([^}\s]+)\s*\}/g)]
            .map((m) => String(m[1] || m[2]).trim());
    } catch { return []; }
}

/**
 * LES CADRES D'UN MODÈLE QU'ON ATTRIBUE À UNE PERSONNE DE LA SESSION — formateur, jury,
 * intervenant —, avec le libellé que l'école leur a donné dans l'éditeur (« Jury 1 »,
 * « Président du jury »…). Rendus dans l'ordre du document, sans doublon.
 *
 * DEUX SORTES DE CADRES N'Y FIGURENT PAS, parce que personne de la session ne les signe :
 * ceux du STAGIAIRE (il signe lui-même, depuis son espace — cf. CASE_STAGIAIRE) et celui du
 * représentant d'une ENTREPRISE (`representant`, rempli depuis l'espace entreprise).
 */
async function casesDuModele(orgId, slug) {
    let corps = '';
    try {
        const c = await getTemplateContent(orgId, slug);
        corps = `${(c && c.html) || ''}${(c && c.header) || ''}${(c && c.footer) || ''}`;
    } catch { return []; }
    const cases = [];
    const vus = new Set();
    for (const m of corps.matchAll(/<span\b[^>]*\bdata-token="sig:([^"]+)"[^>]*>|\{\s*sig:([^}\s]+)\s*\}/g)) {
        const slot = String(m[1] || m[2]).trim();
        const lib = m[1] ? (/\bdata-label="([^"]*)"/.exec(m[0]) || [])[1] : '';
        const label = String(lib || slot).replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
        if (!slot || vus.has(slot) || slot === 'representant' || CASE_STAGIAIRE.test(`${slot} ${label}`)) continue;
        vus.add(slot);
        cases.push({ slot, label });
    }
    return cases;
}

/**
 * LES PERSONNES QU'ON PEUT CHOISIR : les FORMATEURS et les INTERVENANTS affectés à CETTE
 * session — le jury en fait partie (il évalue depuis l'espace intervenant). Personne d'autre :
 * signer un document de la session n'est pas un droit de l'organisme entier.
 */
async function personnesDeLaSession(conn, orgId, sessionId) {
    let formateurs = [];
    let intervenants = [];
    try {
        [formateurs] = await conn.query(
            `SELECT u.id, CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) AS nom
               FROM session_trainer st JOIN user u ON u.id = st.user_id
              WHERE st.session_id = ? AND u.organization_id = ?
              ORDER BY u.last_name, u.first_name`, [sessionId, orgId]);
    } catch (e) { if (!noSchema(e)) throw e; }
    try {
        [intervenants] = await conn.query(
            `SELECT u.id, CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) AS nom,
                    si.specialty
               FROM session_intervenant si JOIN user u ON u.id = si.user_id
              WHERE si.session_id = ? AND si.organization_id = ?
              ORDER BY u.last_name, u.first_name`, [sessionId, orgId]);
    } catch (e) { if (!noSchema(e)) throw e; }
    const net = (p) => ({ ...p, nom: String(p.nom || '').trim() });
    return { formateurs: formateurs.map(net), intervenants: intervenants.map(net) };
}

async function creneauDuModele(orgId, slug) {
    const creneaux = await creneauxDuModele(orgId, slug);
    if (creneaux.includes(CRENEAU_INTERVENANT)) return CRENEAU_INTERVENANT;
    return creneaux[0] || SLOT_DEFAUT;
}

const noSchema = (e) => e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE'
    || e.code === 'WARN_DATA_TRUNCATED' || e.code === 'ER_DATA_TRUNCATED');

/** Les modèles qu'un intervenant peut signer : ceux dont « Externe » est coché. */
async function modelesExternes(orgId) {
    const steps = await loadOrgSteps(orgId);
    return steps
        .filter((s) => s.active && !s.deleted && stepSigners(s).includes('EXTERNAL'))
        .map((s) => ({ slug: s.slug, label: s.label, doc_type: s.doc_type, signers: stepSigners(s) }));
}

/**
 * GET /api/sessions/:id/documents-externes
 * Ce qu'on peut envoyer, à qui, et ce qui est déjà parti.
 */
const listerDocumentsSession = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const [[sess]] = await conn.query(
            'SELECT id FROM training_session WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!sess) return res.status(404).json({ message: 'Session introuvable.' });

        /* LES PERSONNES DE CETTE SESSION, et elles seules : formateurs et intervenants (dont le
           jury). « Externe » ne veut pas dire « n'importe qui » : on n'envoie qu'à quelqu'un que
           l'école a affecté à la session. */
        const { formateurs, intervenants } = await personnesDeLaSession(conn, orgId, req.params.id);

        let lignes = [];
        try {
            [lignes] = await conn.query(
                `SELECT d.id, d.title, d.template_slug, d.status,
                        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i') AS envoye_le,
                        DATE_FORMAT(ds.signed_at, '%Y-%m-%d %H:%i') AS signe_le,
                        ds.slot, ds.label, ds.signer_name, ds.user_id AS signataire_id,
                        CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) AS signataire,
                        DATE_FORMAT(d.org_signed_at, '%Y-%m-%d %H:%i') AS org_signe_le
                   FROM generated_document d
                   /* LA CASE ATTRIBUÉE, quel que soit son NOM : il vient du modèle et peut
                      changer d'un document à l'autre. Chercher un créneau nommé en dur
                      remontrait « en attente » sur un document pourtant signé. */
                   LEFT JOIN document_signature ds ON ds.document_id = d.id AND ds.user_id IS NOT NULL
                   LEFT JOIN user u ON u.id = ds.user_id
                  WHERE d.organization_id = ? AND d.session_id = ? AND d.scope = 'SESSION'
                  ORDER BY d.created_at DESC`, [orgId, req.params.id]);
        } catch (e) { if (!noSchema(e)) throw e; } // migration 157 non jouée : aucun envoi

        /* UN DOCUMENT, PLUSIEURS CADRES : la requête rend une ligne par cadre attribué, on les
           regroupe. Le document n'est « signé » que lorsque TOUS ses cadres le sont — c'est aussi
           la règle d'applySlotSignature, qui ne le passe à SIGNÉ qu'à ce moment-là. */
        const parDoc = new Map();
        for (const l of lignes) {
            const d = parDoc.get(l.id) || { id: l.id, title: l.title, template_slug: l.template_slug, status: l.status,
                envoye_le: l.envoye_le, org_signe_le: l.org_signe_le, cases: [] };
            if (l.signataire_id) {
                d.cases.push({ slot: l.slot, label: l.label || l.slot, signataire: String(l.signataire || '').trim(),
                    signataire_id: l.signataire_id, signe_le: l.signe_le });
            }
            parDoc.set(l.id, d);
        }
        const envoyes = [...parDoc.values()].map((d) => ({
            ...d,
            signe_le: d.cases.length && d.cases.every((c) => c.signe_le)
                ? d.cases.map((c) => c.signe_le).sort().pop() : null,
        }));

        const modeles = [];
        for (const m of await modelesExternes(orgId)) modeles.push({ ...m, cases: await casesDuModele(orgId, m.slug) });
        res.json({ data: { modeles, formateurs, intervenants, envoyes } });
    } catch (err) {
        console.error('Erreur documents de session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/sessions/:id/documents-externes — { template_slug, attributions: [{ slot, user_id }] }
 * Produit le document de session et ATTRIBUE chacun de ses cadres à une personne de la session :
 * « Formateur » à un formateur, « Jury 1 », « Président du jury »… à un membre du jury.
 *
 * L'ANCIENNE FORME { template_slug, user_id } reste acceptée : un seul intervenant, le cadre
 * que le modèle lui destine (creneauDuModele). C'est celle qu'envoyait l'écran jusqu'ici.
 */
const envoyerDocumentSession = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const b = req.body || {};
        const slug = String(b.template_slug || '').trim();
        let attributions = Array.isArray(b.attributions)
            ? b.attributions.map((a) => ({ slot: String((a && a.slot) || '').trim(), userId: String((a && a.user_id) || '').trim() }))
                .filter((a) => a.slot && a.userId)
            : null;
        const ancienneForme = !attributions && !!String(b.user_id || '').trim();
        if (ancienneForme) attributions = [{ slot: await creneauDuModele(orgId, slug), userId: String(b.user_id).trim() }];
        if (!slug || !attributions || !attributions.length) return res.status(422).json({ error: 'Modèle et signataire requis.' });
        if (new Set(attributions.map((a) => a.slot)).size !== attributions.length) {
            return res.status(422).json({ error: 'Un même cadre ne peut être attribué deux fois.' });
        }

        const [[sess]] = await conn.query(
            'SELECT id FROM training_session WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!sess) return res.status(404).json({ message: 'Session introuvable.' });

        /* LE MODÈLE DOIT PORTER « EXTERNE ». Sans ce contrôle, n'importe quel modèle partirait
           par cette porte — y compris un document de stagiaire, qui se retrouverait sans
           stagiaire et ne s'afficherait nulle part. */
        const modele = (await modelesExternes(orgId)).find((m) => m.slug === slug);
        if (!modele) return res.status(422).json({ error: "Ce modèle n'est pas signable par un intervenant externe." });

        /* CHAQUE CADRE DOIT EXISTER DANS LE MODÈLE : un créneau inventé recevrait une signature
           que le document n'afficherait nulle part. (L'ancienne forme garde son créneau calculé.) */
        const cases = await casesDuModele(orgId, slug);
        const libelle = new Map(cases.map((c) => [c.slot, c.label]));
        if (!ancienneForme) {
            const inconnu = attributions.find((a) => !libelle.has(a.slot));
            if (inconnu) return res.status(422).json({ error: `Le modèle n'a pas de cadre « ${inconnu.slot} ».` });
        }

        /* ET CHAQUE PERSONNE DOIT ÊTRE AFFECTÉE À CETTE SESSION — formateur ou intervenant. Le
           contrôle porte sur la session, pas seulement sur l'organisme : « externe » ne veut pas
           dire « n'importe qui ». */
        const { formateurs, intervenants } = await personnesDeLaSession(conn, orgId, req.params.id);
        const nomDe = new Map([...formateurs, ...intervenants].map((p) => [p.id, p.nom]));
        if (attributions.some((a) => !nomDe.has(a.userId))) {
            return res.status(422).json({ error: "Cette personne n'est pas affectée à cette session." });
        }

        const docId = crypto.randomUUID();
        try {
            await conn.query(
                `INSERT INTO generated_document (id, organization_id, learner_id, type, template_slug, title, status, scope, session_id)
                 VALUES (?, ?, NULL, ?, ?, ?, 'ENVOYE', 'SESSION', ?)`,
                [docId, orgId, modele.doc_type || 'AUTRE', slug, modele.label, req.params.id]);
        } catch (e) {
            if (noSchema(e)) return res.status(422).json({ error: 'Documents de session non initialisés (migration 157).' });
            throw e;
        }
        /* LES CASES SONT CRÉÉES VIDES, ATTRIBUÉES — une par cadre. `signed_at` NULL = « en
           attente » : c'est cette ligne que l'espace de la personne lit, et c'est elle
           qu'`applySlotSignature` remplira le jour où elle signera. */
        for (const a of attributions) {
            await conn.query(
                `INSERT INTO document_signature (id, organization_id, document_id, slot, label, user_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [crypto.randomUUID(), orgId, docId, a.slot, libelle.get(a.slot) || 'Intervenant externe', a.userId]);
        }

        logAudit(req, 'document.session_externe', 'GeneratedDocument', docId);
        const noms = [...new Set(attributions.map((a) => nomDe.get(a.userId) || ''))].filter(Boolean);
        res.status(201).json({ data: { id: docId }, message: noms.length ? `Document envoyé à ${noms.join(', ')}.` : 'Document envoyé.' });
    } catch (err) {
        console.error('Erreur envoi document de session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/sessions/:id/mes-cases — les cadres qu'on M'a attribués sur les documents de cette
 * session, signés ou non. C'est la liste qu'un FORMATEUR voit sur la page de la session, là où il
 * signe déjà ses émargements ; l'intervenant, lui, a la sienne dans son espace.
 */
const mesCasesDeSession = async (req, res) => {
    try {
        const conn = db.promise();
        let lignes = [];
        try {
            [lignes] = await conn.query(
                `SELECT d.id, d.title, d.status, ds.slot, ds.label,
                        DATE_FORMAT(ds.signed_at, '%Y-%m-%d %H:%i') AS signe_le
                   FROM document_signature ds JOIN generated_document d ON d.id = ds.document_id
                  WHERE ds.user_id = ? AND ds.organization_id = ? AND d.session_id = ? AND d.scope = 'SESSION'
                  ORDER BY d.created_at DESC`,
                [req.user.id, req.user.organization_id, req.params.id]);
        } catch (e) { if (!noSchema(e)) throw e; }
        const parDoc = new Map();
        for (const l of lignes) {
            const d = parDoc.get(l.id) || { id: l.id, title: l.title, status: l.status, cases: [] };
            d.cases.push({ slot: l.slot, label: l.label || l.slot, signe_le: l.signe_le });
            parDoc.set(l.id, d);
        }
        res.json({ data: [...parDoc.values()].map((d) => ({ ...d, a_signer: d.cases.some((c) => !c.signe_le) })) });
    } catch (err) {
        console.error('Erreur cadres à signer :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { mesCasesDeSession, casesDuModele, personnesDeLaSession, listerDocumentsSession, envoyerDocumentSession, modelesExternes, creneauDuModele, creneauxDuModele, CRENEAU_INTERVENANT, SLOT_DEFAUT };
