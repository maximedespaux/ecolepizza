/**
 * CE QUE L'APPLICATION DÉPOSE SUR L'APPAREIL — l'inventaire déclaré, et la source unique de la
 * page « Confidentialité ».
 *
 * POURQUOI UN INVENTAIRE DÉCLARÉ PLUTÔT QU'UNE PAGE ÉCRITE À LA MAIN. Une page d'information
 * recopiée une fois devient fausse au premier `localStorage.setItem` ajouté ailleurs — et une
 * information fausse est pire qu'absente, puisqu'elle engage l'organisme. Ici la page se rend
 * DEPUIS cette liste, et un test (`test/traceurs.test.js`) refuse toute clé utilisée dans le code
 * qui ne serait pas déclarée ici. On ne peut donc plus en ajouter une en silence.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * AUCUN BANDEAU DE CONSENTEMENT N'EST NÉCESSAIRE AUJOURD'HUI, et c'est un constat, pas un confort.
 *
 * L'article 82 de la loi Informatique et Libertés soumet au consentement toute lecture ou
 * écriture sur le terminal, SAUF ce qui est « strictement nécessaire à la fourniture d'un service
 * de communication en ligne à la demande de l'utilisateur ». La CNIL cite explicitement le cookie
 * d'AUTHENTIFICATION comme exemple d'exemption, et range dans la même catégorie les préférences
 * exprimées par l'utilisateur (langue, thème, panier).
 *
 * Tout ce qui figure ci-dessous relève de cette exemption : rien n'est déposé à des fins
 * publicitaires, rien ne suit l'utilisateur d'un site à l'autre, et AUCUN TIERS n'est chargé —
 * pas de Google Analytics, pas de Tag Manager, pas de Matomo, pas de pixel. Vérifié par balayage
 * du code, pas supposé.
 *
 * Poser un bandeau ici serait donc à la fois inutile et NUISIBLE : il demanderait un consentement
 * qui n'a pas lieu d'être, et il entraînerait l'utilisateur à cliquer « accepter » sans lire —
 * exactement ce que le consentement est censé empêcher.
 *
 * CE QUI RESTE OBLIGATOIRE SANS BANDEAU : l'INFORMATION. L'exemption dispense du consentement,
 * jamais de dire ce qu'on dépose, pourquoi et pour combien de temps (art. 13 du RGPD). C'est
 * l'objet de la page qui lit ce fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ET LE JOUR OÙ L'ON MESURE L'AUDIENCE (temps de session, clics, durée), L'ORDRE COMPTERA.
 *
 * La CNIL exempte aussi la mesure d'audience, mais sous conditions STRICTES et cumulatives :
 * finalité limitée à la mesure pour le seul compte de l'éditeur, pas de recoupement avec d'autres
 * traitements, pas de suivi de la navigation entre sites, pas de transmission à des tiers, durée
 * de vie du traceur ≤ 13 mois et données ≤ 25 mois.
 *
 * Une seule de ces conditions non tenue — un outil tiers, un identifiant croisé avec le compte
 * stagiaire — et c'est TOUT le site qui bascule dans l'obligation de bandeau, y compris pour les
 * cookies exemptés ci-dessous. La mesure d'audience doit donc être conçue dans ces bornes dès le
 * départ, pas ajoutée puis rattrapée.
 */

/** Ce que la page affiche pour chaque nature de dépôt. */
export const NATURES = {
  cookie: { titre: 'Cookie', ou: 'déposé par le serveur' },
  local: { titre: 'Stockage local', ou: 'reste sur l\'appareil jusqu\'à effacement' },
  session: { titre: 'Stockage de session', ou: 'effacé à la fermeture de l\'onglet' },
};

/**
 * L'INVENTAIRE. `cle` accepte un `<uid>` : la clé est propre à chaque compte connecté sur
 * l'appareil, ce qui évite qu'un stagiaire hérite de l'avatar d'un autre sur un poste partagé.
 */
export const TRACEURS = [
  {
    cle: 'auth_token', nature: 'cookie', exempte: true,
    role: 'Vous maintenir connecté',
    detail: 'Contient votre identifiant de session, signé. Il est « httpOnly » : aucun script de '
      + 'la page ne peut le lire, ce qui le protège du vol par script injecté.',
    duree: '1 heure — ou 7 jours si vous cochez « rester connecté »',
  },
  {
    cle: 'impasto_theme', nature: 'local', exempte: true,
    role: 'Retenir le thème clair ou sombre que vous avez choisi',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'impasto.panier.v1', nature: 'local', exempte: true,
    role: 'Garder votre panier de boutique entre deux visites',
    detail: 'Sans lui, fermer l\'onglet viderait le panier.',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'impasto.wishlist', nature: 'local', exempte: true,
    role: 'Garder les fiches que vous avez mises de côté',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'impasto.avatar.<votre compte>', nature: 'local', exempte: true,
    role: 'Afficher tout de suite l\'avatar que vous avez choisi',
    detail: 'Le choix est aussi enregistré sur nos serveurs ; cette copie évite un aller-retour '
      + 'au chargement.',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'impasto.cadre.<votre compte>', nature: 'local', exempte: true,
    role: 'Afficher tout de suite le cadre que vous portez',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'pizzaquest.v1', nature: 'local', exempte: true,
    role: 'Votre progression dans Pizza Quest',
    detail: 'Elle est également enregistrée sur nos serveurs, pour vous suivre d\'un appareil à '
      + 'l\'autre. La copie locale permet de jouer sans attendre.',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'impasto.quest.fetes', nature: 'local', exempte: true,
    role: 'Se souvenir des félicitations déjà affichées, pour ne pas les rejouer',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'impasto.guideSeen.v1', nature: 'local', exempte: true,
    role: 'Ne pas vous remontrer le guide de premier lancement',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'impasto.notifMuted', nature: 'local', exempte: true,
    role: 'Retenir que vous avez coupé le son des notifications',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'impasto.consent.relances', nature: 'local', exempte: true,
    role: 'Compter combien de fois la demande de consentement a été présentée sans réponse',
    detail: 'Elle sert à ARRÊTER de vous la reposer. Fermer la fenêtre sans répondre n\'est pas un '
      + 'refus, donc la question revient — mais pas indéfiniment : après trois fois, elle ne '
      + 'réapparaît plus et reste accessible depuis votre profil.',
    duree: 'Jusqu\'à effacement',
  },
  {
    cle: 'impasto.moneyMasked', nature: 'session', exempte: true,
    role: 'Retenir, le temps de votre session, que vous avez affiché les montants',
    detail: 'Les montants sont masqués par défaut. Ce réglage vit en mémoire de session : à la '
      + 'session suivante, ils sont de nouveau masqués.',
    duree: 'Jusqu\'à la fermeture de l\'onglet',
  },
  {
    cle: 'impasto.revealConfirmSkip', nature: 'session', exempte: true,
    role: 'Retenir que vous avez coché « ne plus demander » avant d\'afficher les montants',
    duree: 'Jusqu\'à la fermeture de l\'onglet',
  },
];

/**
 * CE QUI SORT DU SERVEUR VERS UN TIERS — et qui n'a rien à voir avec les traceurs ci-dessus.
 *
 * DEUX QUESTIONS DIFFÉRENTES, souvent confondues. Les traceurs concernent ce qu'on ÉCRIT SUR
 * L'APPAREIL de l'utilisateur (régime du consentement, art. 82). Ici il s'agit de données qui
 * QUITTENT NOS SERVEURS vers un tiers : régime du RGPD, obligation d'INFORMER des destinataires
 * (art. 13), et base légale à justifier. On peut très bien n'avoir aucun traceur tiers ET
 * transmettre des données — c'était exactement le cas ici, et la première version de cette page
 * n'en disait rien.
 *
 * DEUX PÉRIMÈTRES, ET LA PAGE DOIT LES SÉPARER. Ce que l'APPLICATION envoie d'elle-même est
 * relevé par balayage du code : il n'y a qu'un appel sortant. Mais l'ORGANISME transmet aussi des
 * informations par d'autres canaux — courriel, téléphone — et cela n'apparaît nulle part dans le
 * code. Une page qui dirait « nous ne transmettons qu'à un destinataire » serait donc fausse pour
 * le lecteur, qui comprend « l'école », pas « le programme ». Les deux sont déclarés ici.
 */
export const TRANSMISSIONS = [
  {
    destinataire: 'Base Adresse Nationale (api-adresse.data.gouv.fr)',
    qui: "Service public de l'État français, sans clé ni compte",
    donnees: 'Le code postal et la commune du stagiaire — ou l\'adresse de son entreprise '
      + "lorsque la formation est financée par elle. Ni nom, ni prénom, ni e-mail.",
    pourquoi: 'Convertir une adresse en coordonnées, pour placer les stagiaires sur la carte de '
      + "l'organisme.",
    quand: "Uniquement lorsque l'organisme lance le géocodage depuis la carte des stagiaires.",
    canal: 'application',
  },
  {
    destinataire: 'Partenaires de l\'organisme',
    qui: 'Fournisseurs et partenaires référencés par l\'école',
    donnees: 'Nom, prénom, adresse e-mail, téléphone, formation suivie et dates de session.',
    pourquoi: 'Leur permettre de vous proposer leurs offres et de vous contacter directement.',
    quand: 'Session par session — et UNIQUEMENT si vous y avez consenti.',
    canal: 'organisme',
    /* CE QUI DISTINGUE CETTE LIGNE DE TOUTES LES AUTRES : elle repose sur le consentement, pas
       sur la nécessité du service. Elle ne s'applique donc qu'aux personnes qui ont dit oui, et
       chacune peut revenir sur sa réponse à tout moment. La page doit le dire, sinon un lecteur
       comprend que ses coordonnées partent de toute façon. */
    surConsentement: true,
  },
];

/** Vrai tant qu'aucun dépôt ne sort de l'exemption — donc tant qu'aucun bandeau n'est requis. */
export const TOUT_EXEMPTE = TRACEURS.every((t) => t.exempte);
