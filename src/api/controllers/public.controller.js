// Endpoints PUBLICS (sans authentification) : signature d'un document via un lien
// partageable (le représentant d'une entreprise signe sans compte).
const db = require('../config/database.js');
const { renderDocumentHtml, applySlotSignature, applyLearnerSignature, clientIp, consentementsManquants, questionsEnClair } = require('./document.controller.js');
const { estSignatureValide } = require('../lib/signatures.js');

/* Le document attend une réponse que seul le stagiaire peut donner, depuis son espace. */
const messageAttente = (manquants) => (manquants.length > 1
    ? `Ce document imprime les réponses du stagiaire à ${questionsEnClair(manquants)}, qu'il n'a pas encore données. `
    : `Ce document imprime la réponse du stagiaire à ${questionsEnClair(manquants)}, qu'il n'a pas encore donnée. `)
    + 'Il répond depuis son espace\u00a0: le document pourra ensuite être signé.';

async function loadLink(conn, token) {
    /* L'EXPIRATION EST TRANCHÉE PAR LA BASE, pas par une Date reconstruite en JS. Le pilote
       construit un objet Date dans le fuseau du PROCESSUS, alors que MariaDB a rendu la valeur
       dans celui de la SESSION : sur le VPS (processus en UTC, session en Europe/Paris) un lien
       survivait DEUX HEURES à son échéance. Le même écart avait rendu « Session expirée » tout
       jeton fraîchement émis, côté authentification. Comparer deux instants dans la base
       supprime l'interprétation — et le changement d'heure avec. */
    const [[link]] = await conn.query(
        `SELECT *, (expires_at IS NOT NULL AND expires_at < NOW()) AS expire
           FROM document_sign_link WHERE token = ?`, [token]);
    return link || null;
}

/**
 * LE CACHET ENREGISTRÉ DE L'ENTREPRISE DU DOCUMENT (nom + image), pour signer en un clic.
 *
 * Deux origines, exactement comme `companySignsDoc` / `docSignedByCompany` : un document de GROUPE
 * porte `company_id` ; une CONVENTION de stagiaire tient son entreprise du DOSSIER
 * (`enrollment.company_id` via `document_formation`), jamais de la fiche du stagiaire — celle-ci
 * garde à vie le premier employeur, or une personne peut s'inscrire seule ensuite. `company.stamp`
 * est l'image rangée en texte (migration 085) ; absente, on rend `null` sans casser.
 */
async function cachetDuDocument(conn, doc) {
    try {
        let rows = [];
        if (doc.company_id) {
            [rows] = await conn.query('SELECT name, stamp FROM company WHERE id = ?', [doc.company_id]);
        } else if (doc.learner_id) {
            [rows] = await conn.query(
                `SELECT c.name, c.stamp FROM document_formation df
                 JOIN enrollment e ON e.id = df.enrollment_id
                 JOIN company c ON c.id = e.company_id
                 WHERE df.document_id = ? LIMIT 1`, [doc.id]);
        }
        return rows[0] || null;
    } catch (e) {
        if (e && (e.code === 'ER_BAD_FIELD_ERROR' || e.code === 'ER_NO_SUCH_TABLE')) return null; // colonne stamp / table absente
        throw e;
    }
}

/** GET /api/public/sign/:token — infos + aperçu du document à signer. */
const getSignPage = async (req, res) => {
    try {
        const conn = db.promise();
        const link = await loadLink(conn, req.params.token);
        if (!link) return res.status(404).json({ message: 'Lien invalide.' });
        if (link.expire) return res.status(410).json({ message: 'Ce lien a expiré.' });
        const [[doc]] = await conn.query('SELECT * FROM generated_document WHERE id = ?', [link.document_id]);
        if (!doc) return res.status(404).json({ message: 'Document introuvable.' });
        let company = null;
        if (doc.company_id) { const [[c]] = await conn.query('SELECT name FROM company WHERE id = ?', [doc.company_id]); company = c ? c.name : null; }
        /* SIGNER AVEC LE CACHET ENREGISTRÉ, EN UN CLIC. Réservé au cadre du représentant. On ne
           renvoie PAS l'image — seulement sa disponibilité : le serveur la relit lui-même à la
           signature (rien de la donnée de l'entreprise ne transite par cette page publique). Au
           passage, pour une convention (sans `company_id`), le nom d'entreprise du DOSSIER renseigne
           l'en-tête, que `doc.company_id` seul laissait vide. */
        let cachetDisponible = false;
        if (link.slot === 'representant') {
            const cachet = await cachetDuDocument(conn, doc);
            if (cachet) {
                if (!company) company = cachet.name || null;
                cachetDisponible = !!(cachet.stamp && estSignatureValide(cachet.stamp));
            }
        }
        let html = null;
        try { html = await renderDocumentHtml(conn, doc.organization_id, doc); } catch (e) { console.error('Aperçu lien signature :', e.message); }
        const already = doc.status === 'SIGNE' || !!link.used_at;
        /* LE REPRÉSENTANT NE RÉPOND PAS À LA PLACE DU STAGIAIRE. Une autorisation de photos ou de
           transmission est personnelle : si le document imprime une réponse que le stagiaire n'a
           pas encore donnée, on le dit AVANT que quelqu'un trace sa signature pour rien. */
        let bloque = null;
        if (!already && link.slot === 'stagiaire' && doc.learner_id) {
            const manquants = await consentementsManquants(conn, doc.organization_id, doc);
            if (manquants.length) bloque = messageAttente(manquants);
        }
        res.json({ data: { title: doc.title, company, label: link.label || 'Signature', signed: already, signer_name: doc.signer_name || null, bloque, cachet_disponible: cachetDisponible, html: html || '<p>Aperçu indisponible.</p>' } });
    } catch (err) {
        console.error('Erreur lien de signature :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

/** POST /api/public/sign/:token — enregistre la signature du signataire externe. */
const submitSign = async (req, res) => {
    try {
        const conn = db.promise();
        const link = await loadLink(conn, req.params.token);
        if (!link) return res.status(404).json({ message: 'Lien invalide.' });
        if (link.expire) return res.status(410).json({ message: 'Ce lien a expiré.' });
        if (link.used_at) return res.status(409).json({ message: 'Ce document a déjà été signé.' });
        const [[doc]] = await conn.query('SELECT * FROM generated_document WHERE id = ?', [link.document_id]);
        if (!doc) return res.status(404).json({ message: 'Document introuvable.' });
        if (doc.status === 'SIGNE') return res.status(409).json({ message: 'Ce document a déjà été signé.' });
        let signer_name = String((req.body || {}).signer_name || '').trim();
        let signature_data = (req.body || {}).signature_data;
        /* SIGNER AVEC LE CACHET ENREGISTRÉ (un clic) — le même geste que « signer avec mon cachet »
           de l'espace représentant, mais par le lien : la convention envoyée à l'employeur reçoit
           son cachet sans qu'il redessine. RÉSERVÉ au cadre du REPRÉSENTANT ; le cachet est celui de
           l'entreprise DU DOCUMENT (sa fiche, ou celle du dossier pour une convention). À défaut de
           nom saisi, celui de l'entreprise. */
        if ((req.body || {}).use_saved) {
            if (link.slot !== 'representant') return res.status(422).json({ message: "Le cachet ne s'applique qu'à la signature de l'entreprise." });
            const cachet = await cachetDuDocument(conn, doc);
            if (!cachet || !cachet.stamp) return res.status(422).json({ message: 'Aucun cachet enregistré pour cette entreprise.' });
            signature_data = cachet.stamp;
            if (!signer_name) signer_name = cachet.name || 'Représentant';
        }
        if (!signer_name || !signature_data) return res.status(422).json({ message: 'Nom et signature requis.' });
        // Hygiène d'entrée STRICTE (motif ANCRÉ) : image data-URL base64 uniquement. Sans ancrage,
        // `…,AA"><img src=x onerror=…>` passait ce filtre → XSS stocké (cf. lib/signatures.js #2). Vaut
        // aussi pour le cachet relu en base (défense en profondeur — il fut validé à l'écriture).
        if (!estSignatureValide(signature_data)) {
            return res.status(422).json({ message: 'Signature invalide.' });
        }
        // Lien « stagiaire » sur un document de stagiaire : le représentant de l'entreprise
        // signe À LA PLACE du stagiaire → la signature remplit la case {Signature stagiaire}
        // et le document devient le document signé du stagiaire (visible dans son espace).
        if (link.slot === 'stagiaire' && doc.learner_id) {
            // Même règle que la signature du stagiaire lui-même : pas de réponse imprimée en blanc.
            const manquants = await consentementsManquants(conn, doc.organization_id, doc);
            if (manquants.length) return res.status(422).json({ message: messageAttente(manquants) });
            await applyLearnerSignature(conn, doc.organization_id, doc, {
                signerName: signer_name, signatureData: signature_data,
                ip: clientIp(req), userAgent: req.headers['user-agent'] || '',
            });
        } else {
            await applySlotSignature(conn, doc.organization_id, doc, {
                slot: link.slot, label: link.label, signerName: signer_name, signatureData: signature_data,
                ip: clientIp(req), userAgent: req.headers['user-agent'] || '',
            });
        }
        await conn.query('UPDATE document_sign_link SET used_at = NOW() WHERE token = ?', [req.params.token]);
        res.json({ success: true, message: 'Document signé. Merci !' });
    } catch (err) {
        console.error('Erreur signature publique :', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { getSignPage, submitSign };
