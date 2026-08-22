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

const MARQUE = 'École Pizza';       // en-tête ; surchargée par l'organisme quand on le connaît
const ENCRE = '#c0392b';            // le rouge « ember » de l'application

/** Coquille commune : en-tête sobre, carte centrée, pied discret. `contenu` = HTML du corps. */
function coquille(titre, contenu, { orgName } = {}) {
    const marque = orgName || MARQUE;
    return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:28px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8ee">
        <tr><td style="background:${ENCRE};padding:20px 28px">
          <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.3px">${esc(marque)}</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 14px;font-size:20px;color:#1f2430">${esc(titre)}</h1>
          ${contenu}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #eef0f4;color:#8a90a0;font-size:12px;line-height:1.5">
          Message automatique — merci de ne pas y répondre.<br>
          ${esc(marque)}, votre organisme de formation.
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

/* ─── 1. Identifiants à la création du compte ─────────────────────────────────────────────── */
function credentialsEmail({ firstName, email, password, loginUrl, orgName }) {
    const titre = 'Votre accès à l’espace de formation';
    const contenu = `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Bonjour ${esc(firstName || '')},</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">
        Un espace personnel a été créé pour vous. Vous pouvez dès à présent vous connecter pour
        consulter vos documents, signer vos émargements et suivre votre formation.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f7f8fb;border:1px solid #e6e8ee;border-radius:10px;margin:6px 0 16px">
        <tr><td style="padding:14px 18px;font-size:14px;line-height:1.9">
          <span style="color:#8a90a0">Identifiant&nbsp;:</span> <b>${esc(email)}</b><br>
          <span style="color:#8a90a0">Mot de passe&nbsp;:</span> <b style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(password)}</b>
        </td></tr>
      </table>
      ${bouton(loginUrl, 'Me connecter')}
      <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#8a90a0">
        Par sécurité, pensez à changer ce mot de passe après votre première connexion.
      </p>`;
    return { subject: `Vos identifiants de connexion — ${orgName || MARQUE}`, html: coquille(titre, contenu, { orgName }) };
}

/* ─── 2. Réinitialisation du mot de passe ─────────────────────────────────────────────────── */
function resetEmail({ firstName, password, loginUrl, orgName }) {
    const titre = 'Votre mot de passe a été réinitialisé';
    const contenu = `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Bonjour ${esc(firstName || '')},</p>
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">
        Un nouveau mot de passe vient d’être défini pour votre espace. Voici vos identifiants&nbsp;:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f7f8fb;border:1px solid #e6e8ee;border-radius:10px;margin:6px 0 16px">
        <tr><td style="padding:14px 18px;font-size:14px;line-height:1.9">
          <span style="color:#8a90a0">Nouveau mot de passe&nbsp;:</span> <b style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace">${esc(password)}</b>
        </td></tr>
      </table>
      ${bouton(loginUrl, 'Me connecter')}
      <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#8a90a0">
        Si vous n’êtes pas à l’origine de cette demande, contactez votre organisme de formation.
      </p>`;
    return { subject: `Nouveau mot de passe — ${orgName || MARQUE}`, html: coquille(titre, contenu, { orgName }) };
}

/* ─── 3. Miroir d'une notification de l'application ───────────────────────────────────────── */
function notificationEmail({ firstName, title, body, link, orgName }) {
    const contenu = `
      <p style="margin:0 0 14px;font-size:15px;line-height:1.6">Bonjour ${esc(firstName || '')},</p>
      ${body ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${esc(body)}</p>` : ''}
      ${link ? bouton(link, 'Voir dans mon espace') : bouton((process.env.APP_URL || 'https://impastio.com').replace(/\/+$/, ''), 'Ouvrir mon espace')}`;
    return { subject: `${title} — ${orgName || MARQUE}`, html: coquille(title, contenu, { orgName }) };
}

module.exports = { credentialsEmail, resetEmail, notificationEmail };
