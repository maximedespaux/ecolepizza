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
const { stepSigners } = require('../lib/documents.js');

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

async function creneauDuModele(orgId, slug) {
    try {
        const c = await getTemplateContent(orgId, slug);
        const corps = `${(c && c.html) || ''}${(c && c.header) || ''}${(c && c.footer) || ''}`;
        const m = /data-token="sig:([^"]+)"|\{\s*sig:([^}\s]+)\s*\}/.exec(corps);
        const trouve = m && (m[1] || m[2]);
        return trouve ? String(trouve).trim() : SLOT_DEFAUT;
    } catch { return SLOT_DEFAUT; }
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

        /* LES INTERVENANTS DE CETTE SESSION, et eux seuls : « externe » ne veut pas dire
           « n'importe qui ». On n'envoie qu'à quelqu'un que l'école a affecté à la session. */
        let intervenants = [];
        try {
            [intervenants] = await conn.query(
                `SELECT u.id, CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) AS nom,
                        si.specialty
                   FROM session_intervenant si JOIN user u ON u.id = si.user_id
                  WHERE si.session_id = ? AND si.organization_id = ?
                  ORDER BY u.last_name, u.first_name`, [req.params.id, orgId]);
        } catch (e) { if (!noSchema(e)) throw e; }

        let envoyes = [];
        try {
            [envoyes] = await conn.query(
                `SELECT d.id, d.title, d.template_slug, d.status,
                        DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i') AS envoye_le,
                        DATE_FORMAT(ds.signed_at, '%Y-%m-%d %H:%i') AS signe_le,
                        ds.signer_name, ds.user_id AS signataire_id,
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

        res.json({ data: { modeles: await modelesExternes(orgId), intervenants: intervenants.map(
            (i) => ({ ...i, nom: String(i.nom || '').trim() })), envoyes } });
    } catch (err) {
        console.error('Erreur documents de session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * POST /api/sessions/:id/documents-externes — { template_slug, user_id }
 * Produit le document de session et ATTRIBUE sa case de signature à l'intervenant.
 */
const envoyerDocumentSession = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const slug = String((req.body || {}).template_slug || '').trim();
        const userId = String((req.body || {}).user_id || '').trim();
        if (!slug || !userId) return res.status(422).json({ error: 'Modèle et intervenant requis.' });

        const [[sess]] = await conn.query(
            'SELECT id FROM training_session WHERE id = ? AND organization_id = ?', [req.params.id, orgId]);
        if (!sess) return res.status(404).json({ message: 'Session introuvable.' });

        /* LE MODÈLE DOIT PORTER « EXTERNE ». Sans ce contrôle, n'importe quel modèle partirait
           par cette porte — y compris un document de stagiaire, qui se retrouverait sans
           stagiaire et ne s'afficherait nulle part. */
        const modele = (await modelesExternes(orgId)).find((m) => m.slug === slug);
        if (!modele) return res.status(422).json({ error: "Ce modèle n'est pas signable par un intervenant externe." });

        /* ET L'INTERVENANT DOIT ÊTRE AFFECTÉ À CETTE SESSION. Le contrôle porte sur la session,
           pas seulement sur l'organisme : « externe » ne veut pas dire « n'importe qui ». */
        let affecte = null;
        try {
            const [[r]] = await conn.query(
                `SELECT u.id, CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) AS nom
                   FROM session_intervenant si JOIN user u ON u.id = si.user_id
                  WHERE si.session_id = ? AND si.organization_id = ? AND si.user_id = ?`,
                [req.params.id, orgId, userId]);
            affecte = r || null;
        } catch (e) { if (!noSchema(e)) throw e; }
        if (!affecte) return res.status(422).json({ error: "Cet intervenant n'est pas affecté à cette session." });

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
        /* LA CASE EST CRÉÉE VIDE, ATTRIBUÉE. `signed_at` NULL = « en attente » : c'est cette
           ligne que l'espace de l'intervenant lit, et c'est elle que `applySlotSignature`
           remplira le jour où il signera. */
        await conn.query(
            `INSERT INTO document_signature (id, organization_id, document_id, slot, label, user_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [crypto.randomUUID(), orgId, docId, await creneauDuModele(orgId, slug), 'Intervenant externe', userId]);

        logAudit(req, 'document.session_externe', 'GeneratedDocument', docId);
        res.status(201).json({ data: { id: docId }, message: `Document envoyé à ${String(affecte.nom || '').trim()}.` });
    } catch (err) {
        console.error('Erreur envoi document de session :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { listerDocumentsSession, envoyerDocumentSession, modelesExternes, creneauDuModele, SLOT_DEFAUT };
