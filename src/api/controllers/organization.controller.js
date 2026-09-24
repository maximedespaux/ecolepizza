const db = require('../config/database.js');
const { enCapitales } = require('../lib/saisie.js');
const consentements = require('../lib/consentements.js');
const { logAudit } = require('../lib/audit.js');
const { encrypt, decrypt } = require('../lib/crypto.js');
const { mergeEmargConfig } = require('../lib/emargement.js');
const { estSignatureValide } = require('../lib/signatures.js');

/**
 * GET /api/organisation — l'organisme de l'utilisateur connecté.
 */
/**
 * GET /api/organisation/champs-partenaires — le catalogue, la sélection, et LA PHRASE OBTENUE.
 *
 * L'APERÇU DE LA PHRASE EST L'ESSENTIEL DE CETTE ROUTE, pas un ornement. Cocher « Téléphone »
 * n'a l'air de rien ; lire « J'accepte que l'école communique mon nom, mon téléphone… » fait
 * comprendre qu'on décide le texte que des dizaines de personnes vont lire et signer. Sans cet
 * aperçu, l'écran serait une liste de cases dont on ne mesure pas la portée — et la formulation
 * n'apparaîtrait qu'au stagiaire, trop tard pour la corriger.
 *
 * Elle est calculée PAR LE SERVEUR, avec la même fonction que celle qui produit le texte réel.
 * La recomposer côté écran donnerait une seconde rédaction à maintenir, donc une occasion de
 * montrer à l'école une phrase que le stagiaire ne verra jamais.
 */
const getPartnerFields = async (req, res) => {
    try {
        const conn = db.promise();
        const choisis = await consentements.champsOrganisme(conn, req.user.organization_id);
        res.json({
            data: {
                groupes: consentements.GROUPES,
                catalogue: Object.entries(consentements.CHAMPS_TRANSMISSIBLES)
                    .map(([cle, v]) => ({ cle, libelle: v.libelle, groupe: v.g })),
                choisis,
                apercu: consentements.formulationPour(choisis),
                defaut: consentements.FINALITES.partenaires.champsParDefaut,
            },
        });
    } catch (err) {
        console.error('Erreur champs partenaires :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const getOrganization = (req, res) => {
    db.query(
        'SELECT * FROM organization WHERE id = ?',
        [req.user.organization_id],
        (err, results) => {
            if (err) {
                console.error('Erreur récupération organisme :', err);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
            if (results.length === 0) return res.status(404).json({ message: 'Organisme introuvable' });
            const org = results[0];
            // Champs chiffrés au repos : on déchiffre l'image de signature ;
            // le certificat de scellement (chiffré) n'est jamais renvoyé au client.
            org.signature_image = decrypt(org.signature_image);
            delete org.sign_cert;
            // Config d'émargement toujours renvoyée normalisée (défauts si vide / colonne absente).
            org.emargement_config = mergeEmargConfig(org.emargement_config);
            res.json({ data: org });
        }
    );
};

/**
 * PATCH /api/organisation — met à jour l'organisme (admin / secrétariat).
 */
const updateOrganization = async (req, res) => {
    const allowed = ['legal_name', 'short_name', 'legal_status', 'code', 'manager', 'siret', 'vat_number', 'nda', 'naf_ape',
        'address', 'zip_code', 'town', 'phone', 'email', 'iban', 'bic', 'bank_name', 'signature_image',
        'logo_image', 'emargement_config', 'qualiopi', 'vat_rate', 'partner_fields',
        // Réglages « Mailing » (migration 138) : un interrupteur 0/1 par type d'e-mail.
        'mail_credentials', 'mail_reset', 'mail_forgot', 'mail_security', 'mail_notifications',
    ];
    // Colonnes récentes potentiellement absentes (migration non jouée) : on réessaie sans elles.
    const OPTIONAL = new Set(['vat_rate', 'partner_fields', 'legal_status',
        'mail_credentials', 'mail_reset', 'mail_forgot', 'mail_security', 'mail_notifications']);

    /* LES DEUX IMAGES DE L'ORGANISME SONT DES DATA-URL RÉINJECTÉS DANS DU HTML : la signature par
       le jeton RAW `signatureBox` (lib/tokens.js), le logo par la feuille d'émargement. C'était
       le SEUL chemin « signature » qui ne passait pas par `estSignatureValide` — le représentant
       et le signataire public, eux, l'ont depuis SECURITY_AUDIT #2. Sans lui, un data-URL du
       genre `data:image/png;base64,AA"><img src=x onerror=…>` passait tel quel et s'exécutait à
       l'aperçu d'un document, dans la session de l'administrateur qui le relit.
       ⚠️ `nosniff` ne protège de rien ici : le type est DÉCLARÉ, pas deviné. Seul le motif ANCRÉ
       de `estSignatureValide` ferme la porte, en interdisant tout caractère hors base64 — donc
       ni guillemet ni chevron. */
    /* ⚠️ ON NE VALIDE QUE CE QUI CHANGE, et cette nuance n'est pas du zèle. L'écran Réglages
       renvoie le FORMULAIRE ENTIER à chaque enregistrement, signature comprise, telle qu'il l'a
       reçue du serveur. Une image déposée AVANT cette garde — dans un format qu'elle n'accepte
       pas — aurait donc fait échouer toute modification de l'adresse ou du SIRET, avec un message
       parlant de signature. Le but est d'empêcher d'ENTRER une charge utile, pas de bloquer une
       école sur ce qu'elle a déjà. */
    const aImage = ['signature_image', 'logo_image'].some((f) => req.body[f]);
    /* La lecture n'a lieu QUE si une image est envoyée : un enregistrement ordinaire — adresse,
       SIRET, interrupteurs de mailing — ne paie pas une requête de plus. Et elle est GARDÉE :
       si elle échoue, `inchange` reste vide et la validation s'applique à tout, ce qui est le
       repli sûr (on refuse une image douteuse plutôt que de la laisser entrer). */
    let inchange = {};
    if (aImage) {
        try {
            const [lignes] = await db.promise().query(
                'SELECT signature_image, logo_image FROM organization WHERE id = ?', [req.user.organization_id]);
            const actuel = Array.isArray(lignes) ? lignes[0] : null;
            if (actuel) inchange = { signature_image: decrypt(actuel.signature_image), logo_image: actuel.logo_image };
        } catch (e) { console.error('[organisation] lecture des images :', e.message); }
    }

    for (const f of ['signature_image', 'logo_image']) {
        const v = req.body[f];
        if (v === undefined || v === null || v === '') continue; // vider reste permis
        if (v === inchange[f]) continue;                         // déjà en base : on n'y touche pas
        if (!estSignatureValide(v)) {
            return res.status(422).json({
                message: f === 'logo_image'
                    ? 'Logo refusé : il doit être une image PNG, JPEG, GIF ou WebP de moins de 2 Mo.'
                    : 'Signature refusée : elle doit être une image PNG, JPEG, GIF ou WebP de moins de 2 Mo.',
            });
        }
    }

    const cols = [];
    const valOf = {};
    for (const f of allowed) {
        if (req.body[f] === undefined) continue;
        let v = req.body[f];
        if (f === 'qualiopi') v = v ? 1 : 0;
        else if (f.startsWith('mail_')) v = v ? 1 : 0;
        else if (f === 'vat_rate') v = Math.max(0, Math.min(100, Number(v) || 0));
        else if (f === 'code') v = String(v).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24) || null;
        /* EN CAPITALES, comme la ville des stagiaires et des entreprises (lib/saisie.js) — et la forme
           juridique, choisie dans une liste en capitales (SAS, SARL…) : l'écran la propose ainsi, le
           serveur la tient ainsi, quel que soit le chemin. Vide = non renseignée. */
        else if (f === 'town') v = enCapitales(v);
        else if (f === 'legal_status') v = (v == null ? '' : enCapitales(v)).slice(0, 40) || null;
        else if (f === 'signature_image') v = encrypt(v || null);
        else if (f === 'emargement_config') v = JSON.stringify(mergeEmargConfig(v));
        cols.push(f); valOf[f] = v;
    }
    if (cols.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });

    const run = async (fields) => {
        const values = fields.map((f) => valOf[f]);
        values.push(req.user.organization_id);
        await db.promise().query(`UPDATE organization SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, values);
    };
    let ignores = [];
    try {
        try { await run(cols); }
        catch (e) {
            if (e && e.code === 'ER_BAD_FIELD_ERROR' && cols.some((f) => OPTIONAL.has(f))) {
                ignores = cols.filter((f) => OPTIONAL.has(f));
                await run(cols.filter((f) => !OPTIONAL.has(f))); // réessaie sans les colonnes optionnelles
            } else { throw e; }
        }
        logAudit(req, 'organization.update', 'Organization', req.user.organization_id);
        /* ON DIT CE QU'ON A LAISSÉ TOMBER. Le repli existait déjà, mais il répondait « Organisme
           mis à jour » après avoir silencieusement écarté une colonne absente : sur un formulaire
           à quinze champs dont un facultatif, ça passait ; sur un écran qui n'enregistre QUE ce
           champ-là, l'utilisateur lisait « enregistré » alors que rien n'avait changé. Un succès
           qui ment est pire qu'une erreur. */
        res.status(200).json({
            success: true,
            message: 'Organisme mis à jour',
            ignores: ignores.length ? ignores : undefined,
        });
    } catch (err) {
        if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Ce code organisme est déjà utilisé.' });
        console.error('Erreur mise à jour organisme :', err);
        res.status(400).json({ message: 'Erreur mise à jour' });
    }
};

const crypto = require('crypto');

/** GET /api/organisation/locations — lieux de formation de l'organisme. */
const getLocations = async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            'SELECT id, name, address, zip_code, town, sort_order FROM training_location WHERE organization_id = ? ORDER BY sort_order, name',
            [req.user.organization_id]
        );
        res.json({ data: rows });
    } catch (e) {
        if (e && e.code === 'ER_NO_SUCH_TABLE') return res.json({ data: [] });
        console.error('Erreur lecture lieux :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** PUT /api/organisation/locations — remplace la liste { locations: [{ id?, name, address, zip_code, town }] }. */
const saveLocations = async (req, res) => {
    try {
        const conn = db.promise();
        const orgId = req.user.organization_id;
        const list = Array.isArray(req.body && req.body.locations) ? req.body.locations : [];
        const clean = list
            .map((l, i) => ({
                id: l && l.id ? String(l.id) : null,
                name: String((l && l.name) || '').trim().slice(0, 160),
                address: String((l && l.address) || '').trim().slice(0, 255) || null,
                zip_code: String((l && l.zip_code) || '').trim().slice(0, 10) || null,
                town: String((l && l.town) || '').trim().slice(0, 120) || null,
                sort_order: i * 10,
            }))
            .filter((l) => l.name);
        try {
            // Upsert par id : on GARDE les identifiants existants (sessions liées via location_id).
            const [existing] = await conn.query('SELECT id FROM training_location WHERE organization_id = ?', [orgId]);
            const existingIds = new Set(existing.map((r) => r.id));
            const keep = new Set();
            for (const l of clean) {
                if (l.id && existingIds.has(l.id)) {
                    await conn.query('UPDATE training_location SET name=?, address=?, zip_code=?, town=?, sort_order=? WHERE id=? AND organization_id=?',
                        [l.name, l.address, l.zip_code, l.town, l.sort_order, l.id, orgId]);
                    keep.add(l.id);
                } else {
                    const id = crypto.randomUUID();
                    await conn.query('INSERT INTO training_location (id, organization_id, name, address, zip_code, town, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [id, orgId, l.name, l.address, l.zip_code, l.town, l.sort_order]);
                    keep.add(id);
                }
            }
            for (const id of existingIds) if (!keep.has(id)) await conn.query('DELETE FROM training_location WHERE id=? AND organization_id=?', [id, orgId]);
        } catch (e) {
            if (e && e.code === 'ER_NO_SUCH_TABLE') return res.status(501).json({ message: 'Migration des lieux (067) non appliquée.' });
            throw e;
        }
        logAudit(req, 'organization.locations', 'Organization', orgId);
        res.json({ success: true, message: 'Lieux enregistrés.' });
    } catch (e) {
        console.error('Erreur enregistrement lieux :', e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/**
 * GET /api/organisation/coordonnees — PUBLIC, sans authentification.
 *
 * La page « Confidentialité » se lit AVANT de créer un compte, et le RGPD (art. 13) impose d'y
 * nommer le RESPONSABLE DE TRAITEMENT et un contact pour l'exercice des droits. Ces informations
 * sont publiques par nature — elles figurent déjà sur chaque facture et sur l'écran de connexion.
 *
 * ⚠ LISTE BLANCHE EXPLICITE, JAMAIS `SELECT *`. La table `organization` porte aussi la signature
 * chiffrée, le certificat de scellement, les interrupteurs d'envoi… Un `SELECT *` exposerait tout
 * cela sur un endpoint ouvert au premier ajout de colonne. On ne sort donc que ce petit lot de
 * champs de contact, et rien d'autre.
 *
 * L'organisme « principal » est le premier créé (même convention que lib/orgContext) : le déploiement
 * est mono-organisme (École Pizza). Le jour où il ne le serait plus, une page publique sans contexte
 * d'organisme devrait choisir lequel afficher — ce n'est pas le cas aujourd'hui.
 */
const getOrgCoordonnees = async (req, res) => {
    try {
        const [[o]] = await db.promise().query(
            `SELECT legal_name, short_name, manager, email, phone, address, zip_code, town
               FROM organization ORDER BY created_at LIMIT 1`);
        res.json({ data: o || null });
    } catch (err) {
        // La page a un repli honnête (« à compléter ») : une erreur ne casse pas son affichage.
        console.error('Erreur coordonnées publiques organisme :', err);
        res.json({ data: null });
    }
};

module.exports = {
    getPartnerFields, getOrganization, updateOrganization, getLocations, saveLocations, getOrgCoordonnees };
