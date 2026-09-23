/**
 * GABARITS DES E-MAILS TRANSACTIONNELS.
 *
 * STYLES EN LIGNE, TABLEAUX. Les clients mail (Gmail, Outlook) ignorent les feuilles de style
 * externes et une partie du CSS moderne — d'où les styles posés sur chaque balise et la mise en
 * page en `<table>`, comme au premier jour du web. Ce n'est pas de la négligence, c'est la seule
 * chose qui s'affiche pareil partout.
 *
 * AUCUNE IMAGE DISTANTE. Un logo chargé depuis un serveur est bloqué par défaut par la plupart
 * des clients (« afficher les images ? ») et sert de mouchard — on s'en passe, un en-tête texte
 * suffit. Cohérent, d'ailleurs, avec la promesse « aucun traceur » du reste de l'application.
 *
 * Chaque fonction renvoie `{ subject, html }`. Le texte de repli est dérivé du HTML par `mailer`.
 */

const { LOGO_CID } = require('./mailer.js');
const { orgInfo, modeleMail } = require('./orgContext.js');
const { MODELES_MAIL, rendre, texteEnHtml } = require('./mailsPersonnalises.js');

const MARQUE = 'École Pizza';       // repli texte ; surchargée par l'organisme quand on le connaît
const ENCRE = '#c0392b';            // le rouge « ember » de l'application

/** Coquille commune : en-tête sobre, carte centrée, pied discret. `contenu` = HTML du corps. */
function coquille(titre, contenu, { orgName } = {}) {
    /* Coordonnées tirées de l'organisme en base (cf. orgContext) : le pied de page se remplit
       tout seul — nom, dirigeant, e-mail, téléphone, adresse. Repli sur les valeurs par défaut si
       rien n'est encore chargé (tests, ou tout premier envoi après un démarrage). */
    const o = orgInfo();
    const marque = orgName || o.short_name || o.legal_name || MARQUE;
    const lignesContact = [
        `<b style="color:#3b3f44">${esc(marque)}</b>${o.manager ? ' &nbsp;|&nbsp; ' + esc(o.manager) : ''}`,
        o.email ? `Mail&nbsp;: ${esc(o.email)}` : '',
        o.phone ? `Tél.&nbsp;: ${esc(o.phone)}` : '',
        (o.zip_code || o.town) ? esc([o.zip_code, o.town].filter(Boolean).join(' - ')) : '',
        o.address ? esc(o.address) : '',
    ].filter(Boolean).join('<br>');
    return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8ee">
        <tr><td style="background:#ffffff;padding:24px 28px 18px;text-align:center;border-bottom:3px solid ${ENCRE}">
          <img src="cid:${LOGO_CID}" alt="${esc(marque)}" width="210" style="width:210px;max-width:72%;height:auto;border:0;display:inline-block">
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 14px;font-size:20px;color:#1f2430">${esc(titre)}</h1>
          ${contenu}
        </td></tr>
        <tr><td style="padding:22px 28px 16px;border-top:1px solid #eef0f4;background:#f9fafb;text-align:center;color:#5e5e68;font-size:13px;line-height:1.75">
          ${lignesContact}
        </td></tr>
        <tr><td style="padding:0 28px 20px;background:#f9fafb;text-align:center;color:#a8adba;font-size:11px;line-height:1.5">
          Message automatique — merci de ne pas y répondre.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Bouton d'action (lien stylé en bouton pour les clients qui le permettent). */
function bouton(url, libelle) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px"><tr>
      <td style="border-radius:9px;background:${ENCRE}">
        <a href="${esc(url)}" style="display:inline-block;padding:12px 22px;color:#fff;font-weight:600;font-size:15px;text-decoration:none;border-radius:9px">${esc(libelle)}</a>
      </td></tr></table>`;
}

/** Échappement HTML : un nom ou un titre peut contenir &, <, " — sinon on casse la mise en page. */
function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * LES QUATRE ZONES D'UN E-MAIL, écrites par l'école ou livrées avec l'application (migration 178).
 *
 * Le texte de l'école GAGNE quand il existe, et le défaut sert sinon — il n'y a donc jamais d'état
 * « e-mail vide » : ne pas avoir écrit est le cas normal, pas une configuration manquante.
 * Les jetons sont remplacés ici, une fois, pour les quatre zones : un jeton oublié dans le titre
 * s'imprimerait en accolades dans la première ligne que lit le destinataire.
 */
function zones(cle, valeurs) {
    const defaut = MODELES_MAIL[cle] || {};
    const ecrit = modeleMail(cle) || {};
    const pris = (champ) => {
        const v = ecrit[champ];
        return v === undefined || v === null || v === '' ? (defaut[champ] || '') : v;
    };
    /* `intro` et `pied` peuvent être VIDES VOLONTAIREMENT quand l'école a enregistré ce type :
       on ne retombe alors pas sur le défaut, sinon un pied supprimé réapparaîtrait à l'envoi. */
    const zoneEcrite = (champ) => (modeleMail(cle) ? (ecrit[champ] || '') : (defaut[champ] || ''));
    return {
        objet: rendre(pris('objet'), valeurs),
        titre: rendre(pris('titre'), valeurs),
        intro: texteEnHtml(rendre(zoneEcrite('intro'), valeurs)),
        pied: texteEnHtml(rendre(zoneEcrite('pied'), valeurs), 'margin:14px 0 0;font-size:13px;line-height:1.6;color:#8a90a0'),
    };
}

/** L'encadré gris des identifiants — charpente, jamais modifiable. */
function encadre(lignes) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f7f8fb;border:1px solid #e6e8ee;border-radius:10px;margin:6px 0 16px">
        <tr><td style="padding:14px 18px;font-size:14px;line-height:1.9">${lignes.join('<br>')}</td></tr>
      </table>`;
}
const ligneEncadre = (etiquette, valeur, mono) => `<span style="color:#8a90a0">${esc(etiquette)}&nbsp;:</span> `
    + `<b${mono ? ' style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace"' : ''}>${esc(valeur)}</b>`;

/* ─── 1. Identifiants à la création du compte ─────────────────────────────────────────────── */
function credentialsEmail({ firstName, email, password, loginUrl, orgName }) {
    const z = zones('credentials', { 'Prénom': firstName || '', Identifiant: email || '', Organisme: orgName || MARQUE });
    const contenu = `${z.intro}
      ${encadre([ligneEncadre('Identifiant', email), ligneEncadre('Mot de passe', password, true)])}
      ${bouton(loginUrl, 'Me connecter')}
      ${z.pied}`;
    return { subject: z.objet, html: coquille(z.titre, contenu, { orgName }) };
}

/* ─── 2. Réinitialisation du mot de passe ─────────────────────────────────────────────────── */
function resetEmail({ firstName, password, loginUrl, orgName }) {
    const z = zones('reset', { 'Prénom': firstName || '', Organisme: orgName || MARQUE });
    const contenu = `${z.intro}
      ${encadre([ligneEncadre('Nouveau mot de passe', password, true)])}
      ${bouton(loginUrl, 'Me connecter')}
      ${z.pied}`;
    return { subject: z.objet, html: coquille(z.titre, contenu, { orgName }) };
}

/* ─── 3. Miroir d'une notification de l'application ───────────────────────────────────────── */
function notificationEmail({ firstName, title, body, link, orgName }) {
    const z = zones('notifications', {
        'Prénom': firstName || '', Titre: title || '', Message: body || '', Organisme: orgName || MARQUE,
    });
    const contenu = `${z.intro}
      ${link ? bouton(link, 'Voir dans mon espace') : bouton((process.env.APP_URL || 'https://impastio.com').replace(/\/+$/, ''), 'Ouvrir mon espace')}
      ${z.pied}`;
    return { subject: z.objet, html: coquille(z.titre, contenu, { orgName }) };
}

/* ─── Lien de réinitialisation (demande « mot de passe oublié ») ─────────────────────────── */
function resetLinkEmail({ firstName, resetUrl, orgName }) {
    const z = zones('forgot', { 'Prénom': firstName || '', Organisme: orgName || MARQUE });
    const contenu = `${z.intro}
      ${bouton(resetUrl, 'Choisir un nouveau mot de passe')}
      ${z.pied}`;
    return { subject: z.objet, html: coquille(z.titre, contenu, { orgName }) };
}

/* ─── Alerte de sécurité : un identifiant (mot de passe ou e-mail) vient d'être modifié ──────── */
function securityAlertEmail({ firstName, kind, detail, cancelUrl, orgName }) {
    const quoi = kind === 'email' ? 'adresse e-mail de connexion' : 'mot de passe';
    const z = zones('security', { 'Prénom': firstName || '', Quoi: quoi, Organisme: orgName || MARQUE });
    /* CES TROIS BLOCS NE SE RÉÉCRIVENT PAS. Ils sont le garde-fou d'une prise de compte : une
       alerte sans son « ce n'était pas moi » n'alerte plus personne, et l'école ne s'en
       apercevrait qu'à la plainte. Le reste du texte, lui, lui appartient. */
    const garde = `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6">
        <b>Si c'est bien vous</b>, aucune action n'est nécessaire.
      </p>
      <p style="margin:0 0 6px;font-size:15px;line-height:1.6"><b>Si ce n'est PAS vous</b>, annulez
        immédiatement : nous rétablirons l'ancienne valeur et déconnecterons toutes les sessions.</p>
      ${bouton(cancelUrl, "Ce n'était pas moi — annuler")}`;
    const contenu = `${z.intro}
      ${detail ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${esc(detail)}</p>` : ''}
      ${garde}
      ${z.pied}`;
    return { subject: z.objet, html: coquille(z.titre, contenu, { orgName }) };
}

/* ─── Compte représentant d'entreprise : accès pour signer les documents de l'entreprise ─────── */
function representativeEmail({ firstName, email, password, companyName, loginUrl, orgName }) {
    const soc = companyName ? ` de ${esc(companyName)}` : '';
    const titre = 'Documents de votre entreprise à signer';
    /* Deux cas : soit un mot de passe vient d'être généré (nouveau compte représentant) et on le
       communique ; soit l'accès a été RATTACHÉ à un compte existant (le référent est déjà
       stagiaire) — pas de mot de passe, on renvoie vers la connexion habituelle. */
    const bloc = password
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f7f8fb;border:1px solid #e6e8ee;border-radius:10px;margin:6px 0 16px">
             <tr><td style="padding:14px 18px;font-size:14px;line-height:1.9">
               <span style="color:#8a90a0">Identifiant&nbsp;:</span> <b>${esc(email)}</b><br>
               <span style="color:#8a90a0">Mot de passe&nbsp;:</span> <b style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(password)}</b>
             </td></tr>
           </table>`
        : `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Connectez-vous avec vos identifiants habituels&nbsp;: l'onglet <b>Entreprise</b> vous donne accès aux documents à signer.</p>`;
    const contenu = `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Bonjour ${esc(firstName || '')},</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">
        Un accès vous a été ouvert pour signer en ligne les documents${soc} (convention de formation, etc.).
        ${password ? 'Voici vos identifiants de connexion&nbsp;:' : ''}
      </p>
      ${bloc}
      ${bouton(loginUrl, 'Voir les documents à signer')}
      <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#8a90a0">
        Une fois connecté, ouvrez l'onglet <b>Entreprise</b> pour consulter et signer chaque document.${password ? ' Par sécurité, pensez à changer ce mot de passe après votre première connexion.' : ''}
      </p>`;
    return { subject: `Documents à signer — ${orgName || MARQUE}`, html: coquille(titre, contenu, { orgName }) };
}

/* ─── Message écrit par l'école à un groupe de stagiaires (migration 178) ─────────────────── */
/**
 * LA MÊME COQUILLE QUE LES AUTRES, et c'est voulu : le stagiaire reconnaît l'e-mail de son école,
 * avec son logo et son pied de page. Ce qui change, c'est que le texte vient d'elle.
 *
 * AUCUN BOUTON AJOUTÉ D'OFFICE. Un « Ouvrir mon espace » au bas d'un message qui n'y renvoie pas
 * transformerait chaque annonce en invitation à se connecter. Les liens écrits dans le texte, eux,
 * deviennent cliquables (cf. `texteEnHtml`).
 */
function messageGroupeEmail({ objet, corps, orgName }) {
    return { subject: objet, html: coquille(objet, texteEnHtml(corps), { orgName }) };
}

module.exports = { credentialsEmail, resetEmail, resetLinkEmail, notificationEmail, securityAlertEmail, representativeEmail, messageGroupeEmail };
