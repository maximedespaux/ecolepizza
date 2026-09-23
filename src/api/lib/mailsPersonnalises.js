/**
 * LES E-MAILS QUE L'ÉCOLE PEUT RÉÉCRIRE — le catalogue, les jetons, et le rendu (2026-09-23).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * CE QUI EST MODIFIABLE, ET POURQUOI PAS LE RESTE.
 *
 * Un e-mail transactionnel est fait de DEUX choses : de la PROSE (« Bonjour X, un espace a été
 * créé pour vous ») et une CHARPENTE (l'encadré des identifiants, le bouton, la coquille). La
 * prose appartient à l'école — c'est sa voix. La charpente, non : une école qui réécrirait tout
 * pourrait envoyer une alerte de sécurité sans son bouton « ce n'était pas moi », ou des
 * identifiants sans mot de passe, et personne ne s'en apercevrait avant la plainte.
 *
 * On enregistre donc QUATRE zones par type : l'objet, le titre, une intro et un pied. Le reste
 * est posé par `mailTemplates.js`, toujours.
 *
 * DU TEXTE, PAS DU HTML. Ce que l'école tape est échappé au rendu, puis découpé en paragraphes.
 * Un éditeur riche aurait produit du HTML que les clients mail rendent chacun à leur façon — et
 * surtout, une balise mal fermée casse l'e-mail chez le destinataire, là où personne ne peut plus
 * la corriger. Les liens écrits en clair (https://…) deviennent cliquables, ce qui couvre le seul
 * besoin réel de mise en forme.
 *
 * LES JETONS SONT DÉCLARÉS PAR TYPE, et c'est la liste que l'écran propose. Un jeton inconnu est
 * REFUSÉ à l'enregistrement : laissé passer, il s'imprimerait tel quel — « Bonjour {Prenom}, »
 * avec les accolades — dans le courrier d'un stagiaire.
 */

/** Ce que le texte peut porter, par type. `valeurs` est rempli par `mailTemplates`. */
const MODELES_MAIL = {
    credentials: {
        libelle: 'Compte créé — identifiants de connexion',
        jetons: ['Prénom', 'Identifiant', 'Organisme'],
        objet: 'Vos identifiants de connexion — {Organisme}',
        titre: 'Votre accès à l’espace de formation',
        intro: 'Bonjour {Prénom},\n\nUn espace personnel a été créé pour vous. Vous pouvez dès à présent '
            + 'vous connecter pour consulter vos documents, signer vos émargements et suivre votre formation.',
        pied: 'Par sécurité, pensez à changer ce mot de passe après votre première connexion.',
        charpente: 'Les identifiants et le bouton « Me connecter » s’ajoutent entre l’intro et le pied.',
    },
    reset: {
        libelle: 'Réinitialisation du mot de passe',
        jetons: ['Prénom', 'Organisme'],
        objet: 'Nouveau mot de passe — {Organisme}',
        titre: 'Votre mot de passe a été réinitialisé',
        intro: 'Bonjour {Prénom},\n\nUn nouveau mot de passe vient d’être défini pour votre espace. '
            + 'Voici vos identifiants :',
        pied: 'Si vous n’êtes pas à l’origine de cette demande, contactez votre organisme de formation.',
        charpente: 'Le nouveau mot de passe et le bouton « Me connecter » s’ajoutent entre l’intro et le pied.',
    },
    forgot: {
        libelle: 'Lien « mot de passe oublié »',
        jetons: ['Prénom', 'Organisme'],
        objet: 'Réinitialisation de mot de passe — {Organisme}',
        titre: 'Réinitialisation de votre mot de passe',
        intro: 'Bonjour {Prénom},\n\nVous avez demandé à réinitialiser votre mot de passe. Cliquez sur le '
            + 'bouton ci-dessous pour en choisir un nouveau. Ce lien est valable une heure et ne sert qu’une fois.',
        pied: 'Vous n’êtes pas à l’origine de cette demande ? Ignorez cet e-mail : votre mot de passe '
            + 'actuel reste valable, rien n’a changé.',
        charpente: 'Le bouton qui ouvre le lien s’ajoute entre l’intro et le pied.',
    },
    security: {
        libelle: 'Alerte de sécurité (changement d’e-mail / mot de passe)',
        jetons: ['Prénom', 'Quoi', 'Organisme'],
        objet: 'Sécurité : {Quoi} modifié — {Organisme}',
        titre: 'Votre {Quoi} a été modifié',
        intro: 'Bonjour {Prénom},\n\nVotre {Quoi} vient d’être modifié.',
        pied: 'Ce lien est valable 24 heures. Pensez ensuite à changer votre mot de passe.',
        /* CE TYPE GARDE SA PARTIE NON MODIFIABLE, et c'est le seul dont la charpente porte des
           MOTS : « Si c'est bien vous… », « Si ce n'est PAS vous… », et le bouton d'annulation.
           C'est le garde-fou d'une prise de compte ; il ne se réécrit pas. */
        charpente: 'Les deux phrases « Si c’est bien vous » / « Si ce n’est PAS vous » et le bouton '
            + 'd’annulation ne sont pas modifiables : ils sont le garde-fou d’une prise de compte.',
    },
    notifications: {
        libelle: 'Notifications par e-mail',
        jetons: ['Prénom', 'Titre', 'Message', 'Organisme'],
        objet: '{Titre} — {Organisme}',
        titre: '{Titre}',
        intro: 'Bonjour {Prénom},\n\n{Message}',
        pied: '',
        charpente: 'Le bouton « Voir dans mon espace » s’ajoute sous l’intro.',
    },
};

/** Les jetons d'un envoi à un groupe : ce que l'école peut écrire dans son message. */
const JETONS_GROUPE = ['Prénom', 'Nom', 'Organisme'];

const CLES_MAIL = Object.keys(MODELES_MAIL);
const MAX_OBJET = 200;
const MAX_ZONE = 2000;

/** Échappement HTML — le même que `mailTemplates`, gardé ici pour que ce module soit autonome. */
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Les jetons d'un texte, tels qu'ils y sont écrits. */
function jetonsDe(texte) {
    return (String(texte == null ? '' : texte).match(/\{[^{}]+\}/g) || []).map((j) => j.slice(1, -1).trim());
}

/**
 * Remplace les jetons par leurs valeurs. Un jeton sans valeur sort VIDE plutôt qu'en accolades :
 * à ce stade le courrier est déjà parti, et « Bonjour {Prénom}, » est pire qu'un blanc.
 */
function rendre(texte, valeurs = {}) {
    return String(texte == null ? '' : texte).replace(/\{([^{}]+)\}/g, (_, cle) => {
        const v = valeurs[String(cle).trim()];
        return v == null ? '' : String(v);
    });
}

/**
 * Le texte de l'école en HTML d'e-mail : paragraphes, retours à la ligne, liens cliquables.
 *
 * L'ORDRE COMPTE : on échappe D'ABORD, on reconnaît les liens ENSUITE. L'inverse laisserait une
 * balise `<a>` se faire échapper, et le lien s'afficherait en clair avec ses chevrons.
 */
function texteEnHtml(texte, style = 'margin:0 0 14px;font-size:15px;line-height:1.6') {
    const blocs = String(texte == null ? '' : texte).replace(/\r\n?/g, '\n').split(/\n{2,}/)
        .map((b) => b.trim()).filter(Boolean);
    return blocs.map((b) => {
        const html = esc(b)
            .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#c0392b">$1</a>')
            .replace(/\n/g, '<br>');
        return `<p style="${style}">${html}</p>`;
    }).join('');
}

/**
 * Ce que l'école envoie pour UN type → `{ valeurs }` ou `{ erreur }`.
 *
 * L'OBJET ET LE TITRE SONT OBLIGATOIRES : un e-mail sans objet part en indésirable, et un e-mail
 * sans titre laisse une carte vide en haut du message. L'intro et le pied peuvent être vides —
 * une école qui veut un e-mail sec doit pouvoir le faire.
 */
function lireModeleMail(cle, b = {}) {
    if (!MODELES_MAIL[cle]) return { erreur: `Type d’e-mail inconnu : ${cle || '(vide)'}.` };
    const zone = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
    const valeurs = {
        objet: zone(b.objet, MAX_OBJET),
        titre: zone(b.titre, MAX_OBJET),
        intro: zone(b.intro, MAX_ZONE),
        pied: zone(b.pied, MAX_ZONE),
    };
    if (!valeurs.objet) return { erreur: 'L’objet est obligatoire : un e-mail sans objet part en indésirable.' };
    if (!valeurs.titre) return { erreur: 'Le titre est obligatoire : c’est la première ligne que lit le destinataire.' };
    /* UN JETON INCONNU EST REFUSÉ ICI, pas ignoré au rendu : « Bonjour {Prenom}, » avec ses
       accolades arriverait tel quel chez un stagiaire, et personne ne pourrait plus le rattraper. */
    const connus = new Set(MODELES_MAIL[cle].jetons);
    for (const champ of ['objet', 'titre', 'intro', 'pied']) {
        const inconnu = jetonsDe(valeurs[champ]).find((j) => !connus.has(j));
        if (inconnu) {
            return { erreur: `Le jeton {${inconnu}} n’existe pas pour cet e-mail. Disponibles : ${[...connus].map((j) => `{${j}}`).join(', ')}.` };
        }
    }
    return { valeurs };
}

/** Ce qu'un envoi à un groupe doit porter → `{ valeurs }` ou `{ erreur }`. */
function lireEnvoiGroupe(b = {}) {
    const objet = String(b.objet == null ? '' : b.objet).replace(/\s+/g, ' ').trim().slice(0, MAX_OBJET);
    const corps = String(b.corps == null ? '' : b.corps).replace(/\r\n?/g, '\n').trim().slice(0, MAX_ZONE * 2);
    if (!objet) return { erreur: 'L’objet est obligatoire.' };
    if (!corps) return { erreur: 'Écrivez le message avant de l’envoyer.' };
    const connus = new Set(JETONS_GROUPE);
    const inconnu = [...jetonsDe(objet), ...jetonsDe(corps)].find((j) => !connus.has(j));
    if (inconnu) {
        return { erreur: `Le jeton {${inconnu}} n’existe pas. Disponibles : ${JETONS_GROUPE.map((j) => `{${j}}`).join(', ')}.` };
    }
    return { valeurs: { objet, corps } };
}

module.exports = {
    MODELES_MAIL, CLES_MAIL, JETONS_GROUPE, MAX_OBJET, MAX_ZONE,
    esc, jetonsDe, rendre, texteEnHtml, lireModeleMail, lireEnvoiGroupe,
};
