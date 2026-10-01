/**
 * LA SIGNATURE DES E-MAILS (migration 197) — une seule source pour le HTML ET les pièces jointes.
 *
 * Elle paraît au bas de CHAQUE e-mail (cf. coquille, mailTemplates.js), composée par l'école : son
 * logo, un sous-titre, ses coordonnées, ses réseaux, ses labels qualité (Qualiopi / ICPF / cofrac),
 * et une mention. Le texte vient de la config ; le nom, le téléphone, l'e-mail et l'adresse viennent
 * de l'organisme (orgContext), pour ne pas tenir deux fois les mêmes coordonnées.
 *
 * LES IMAGES VOYAGENT EN PIÈCE JOINTE (cid:), jamais en image distante : un client mail bloque les
 * images distantes et elles pistent qui ouvre. Le HTML (signatureHtml) et les pièces (signatureAttachments)
 * dérivent TOUS DEUX de `imagesDe(config)` : leurs `cid` s'accordent donc par construction — un cid
 * dans le HTML qui n'aurait pas sa pièce sortirait en icône cassée.
 *
 * POURQUOI DU PNG. Les images sont attendues en PNG (ou JPEG/GIF) : Outlook n'affiche pas le WebP.
 * L'écran les convertit en PNG (reduireEnPngDataUrl) ; ici on REFUSE le reste à l'enregistrement.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* PLAFONDS SERRÉS, et pour une raison qui ne se devine pas : la signature (logo + badges) est
   enregistrée en UN corps JSON, lui-même plafonné à 2 Mo par express.json (server.js). Cinq images
   à 200 Ko décodés font ~1,35 Mo en base64 : sous la barre, avec de la marge pour le texte. Un logo
   ou un badge réel pèse quelques dizaines de Ko — ces plafonds ne sont qu'un garde-fou. */
const MAX_BADGES = 4;
const MAX_RESEAUX = 6;
const MAX_OCTETS_IMAGE = 200 * 1024;         // par image, octets décodés
const FORMATS_MAIL = /^data:(image\/(?:png|jpeg|gif));base64,([A-Za-z0-9+/=]+)$/; // PAS de webp : Outlook ne le lit pas

/** La config lue depuis la base (chaîne JSON) ou déjà objet. `null` si vide, illisible, ou désactivée. */
function parseConfig(raw) {
    if (!raw) return null;
    let c;
    try { c = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return null; }
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    if (c.actif === false) return null;
    return c;
}

/** Les images de la signature, avec leur cid stable — logo d'abord, puis les badges dans l'ordre. */
function imagesDe(c) {
    const out = [];
    if (c && c.logo) out.push({ cid: 'sig-logo', data: c.logo, alt: 'Logo' });
    const badges = c && Array.isArray(c.badges) ? c.badges : [];
    badges.forEach((b, i) => {
        const data = typeof b === 'string' ? b : (b && b.data);
        if (data) out.push({ cid: `sig-badge-${i}`, data, alt: (b && b.alt) || 'Label qualité' });
    });
    return out;
}

/** Une data URL → pièce jointe nodemailer en ligne, ou `null` si la data URL n'est pas une image mail. */
function dataUrlEnPiece(data, cid) {
    const m = FORMATS_MAIL.exec(String(data || ''));
    if (!m) return null;
    const ext = m[1].split('/')[1];
    return { cid, filename: `${cid}.${ext}`, content: Buffer.from(m[2], 'base64'), contentType: m[1], contentDisposition: 'inline' };
}

/** Les pièces jointes des images de la signature — jointes à CHAQUE e-mail par mailer.js. */
function signatureAttachments(c) {
    if (!c) return [];
    return imagesDe(c).map((im) => dataUrlEnPiece(im.data, im.cid)).filter(Boolean);
}

/**
 * VALIDATION À L'ENREGISTREMENT. Renvoie { erreur } ou { valeur } (la config nettoyée à stocker).
 * On refuse ce qui casserait un e-mail : une image non-PNG/JPEG/GIF, trop lourde, trop nombreuse,
 * ou un lien de réseau qui n'est pas http(s) (un lien relatif ou « javascript: » n'a rien à faire
 * dans un courrier). Les champs texte sont bornés : une signature n'est pas un article.
 */
function validerConfig(entree) {
    if (!entree || typeof entree !== 'object' || Array.isArray(entree)) return { erreur: 'Signature illisible.' };
    const txt = (v, max) => String(v ?? '').trim().slice(0, max);
    const lien = (v, nom) => {
        const s = String(v ?? '').trim();
        if (!s) return '';
        if (!/^https?:\/\//i.test(s)) throw new Error(`Le lien ${nom} doit commencer par http:// ou https://.`);
        return s.slice(0, 300);
    };
    const image = (data, quoi) => {
        const s = String(data ?? '').trim();
        if (!s) return '';
        const m = FORMATS_MAIL.exec(s);
        if (!m) throw new Error(`${quoi} doit être une image PNG, JPEG ou GIF (le WebP ne s'affiche pas dans tous les clients mail).`);
        if (Buffer.from(m[2], 'base64').length > MAX_OCTETS_IMAGE) throw new Error(`${quoi} dépasse 200 Ko — choisissez une image plus légère.`);
        return s;
    };
    try {
        const badgesEntree = Array.isArray(entree.badges) ? entree.badges.slice(0, MAX_BADGES) : [];
        const badges = [];
        for (const b of badgesEntree) {
            const data = image(typeof b === 'string' ? b : (b && b.data), 'Un badge');
            if (data) badges.push({ data, alt: txt(b && b.alt, 80) || 'Label qualité' });
        }
        /* LES RÉSEAUX SONT UNE LISTE qu'on ajoute et retire (plus de champs figés Facebook/Instagram/
           YouTube) : chacun porte un nom et un lien http(s). Un réseau sans nom OU sans lien est écarté
           — un lien sans libellé ne se cliquerait pas, un libellé sans lien ne mènerait nulle part. */
        const reseauxEntree = Array.isArray(entree.reseaux) ? entree.reseaux.slice(0, MAX_RESEAUX) : [];
        const reseaux = [];
        for (const r of reseauxEntree) {
            const nom = txt(r && r.nom, 40);
            const url = lien(r && r.url, nom || 'du réseau');
            if (nom && url) reseaux.push({ nom, url });
        }
        return { valeur: {
            actif: entree.actif !== false,
            sous_titre: txt(entree.sous_titre, 80),
            site: txt(entree.site, 120),
            reseaux,
            certif_mention: txt(entree.certif_mention, 400),
            logo: image(entree.logo, 'Le logo'),
            badges,
        } };
    } catch (e) {
        return { erreur: e.message };
    }
}

/**
 * LE BLOC HTML de la signature, ou `null` si pas de config. `pourApercu` porte les images en `data:`
 * (un navigateur ne sait rien de `cid:`) ; l'e-mail réel, lui, les porte en `cid:` (pièces jointes).
 * `org` = orgInfo() : le nom, le téléphone, l'e-mail et l'adresse en viennent.
 */
function signatureHtml(c, org = {}, { pourApercu = false } = {}) {
    if (!c) return null;
    const marque = org.short_name || org.legal_name || 'École Pizza';
    const images = imagesDe(c);
    const logo = images.find((im) => im.cid === 'sig-logo');
    const badges = images.filter((im) => im.cid !== 'sig-logo');
    const src = (im) => (pourApercu ? im.data : `cid:${im.cid}`);

    const contact = [
        org.phone ? `Tél.&nbsp;: ${esc(org.phone)}` : '',
        org.email ? `${esc(org.email)}` : '',
        c.site ? `${esc(c.site)}` : '',
    ].filter(Boolean).join('&nbsp;&nbsp;·&nbsp;&nbsp;');
    const adresse = [org.address, [org.zip_code, org.town].filter(Boolean).join(' - ')].filter(Boolean).map(esc).join('&nbsp;·&nbsp;');
    const reseaux = (Array.isArray(c.reseaux) ? c.reseaux : [])
        .filter((r) => r && r.nom && r.url)
        .map((r) => `<a href="${esc(r.url)}" style="color:#c0392b;text-decoration:none">${esc(r.nom)}</a>`)
        .join('&nbsp;&nbsp;·&nbsp;&nbsp;');

    const logoCell = logo
        ? `<td width="150" valign="top" style="padding:0 16px 0 0"><img src="${src(logo)}" alt="${esc(marque)}" width="140" style="width:140px;max-width:140px;height:auto;border:0;display:block"></td>`
        : '';
    const badgesRow = badges.length
        ? `<tr><td colspan="2" style="padding:14px 0 0">${badges.map((b) => `<img src="${src(b)}" alt="${esc(b.alt)}" height="46" style="height:46px;width:auto;border:0;display:inline-block;margin:0 14px 0 0;vertical-align:middle">`).join('')}</td></tr>`
        : '';
    const mentionRow = c.certif_mention
        ? `<tr><td colspan="2" style="padding:8px 0 0;color:#8a90a0;font-size:11px;line-height:1.5">${esc(c.certif_mention)}</td></tr>`
        : '';

    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#5e5e68;font-size:13px;line-height:1.7;text-align:left">
      <tr>
        ${logoCell}
        <td valign="top">
          <div style="font-size:16px;font-weight:700;color:#2b2f6b">${esc(marque)}</div>
          ${c.sous_titre ? `<div style="color:#c0392b;font-weight:600;margin:0 0 6px">${esc(c.sous_titre)}</div>` : ''}
          ${contact ? `<div>${contact}</div>` : ''}
          ${reseaux ? `<div style="margin-top:4px">${reseaux}</div>` : ''}
        </td>
      </tr>
      ${adresse ? `<tr><td colspan="2" style="padding:12px 0 0"><span style="display:inline-block;padding:6px 14px;background:#2b2f6b;color:#fff;border-radius:7px;font-size:12px">${adresse}</span></td></tr>` : ''}
      ${badgesRow}
      ${mentionRow}
    </table>`;
}

module.exports = { parseConfig, validerConfig, signatureHtml, signatureAttachments, imagesDe, MAX_BADGES, MAX_OCTETS_IMAGE };
