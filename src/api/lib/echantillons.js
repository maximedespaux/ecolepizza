/**
 * Identités FICTIVES pour l'aperçu des modèles.
 *
 * POURQUOI CE FICHIER EXISTE. Les échantillons étaient écrits en dur, jeton par jeton, et deux
 * d'entre eux portaient le nom RÉEL de l'utilisateur (« Guillaume DESPAUX » sur `Acheteur`,
 * « M. Guillaume Despaux — formateur » sur `Jury formateur`). Sur un aperçu de facture, on ne
 * distinguait plus l'exemple de la vraie donnée — la question « est-ce que ça sort de ma base ? »
 * ne devrait jamais se poser devant un aperçu.
 *
 * Le second défaut était plus insidieux : les échantillons étaient INCOHÉRENTS entre eux. Une
 * même facture d'aperçu montrait l'acheteur « Guillaume DESPAUX », l'e-mail
 * « jean.dupont@email.fr » et l'adresse « 12 rue des Fours » — trois personnes différentes dans
 * un seul document. On ne pouvait pas relire l'aperçu comme on relit une vraie facture.
 *
 * On tire donc UNE identité par aperçu, et tous les jetons qui parlent de la même personne en
 * découlent. Les noms sont volontairement quelconques et sans lien avec l'école.
 */

const PERSONNES = [
    {
        civilite: 'Mme', prenom: 'Camille', nom: 'BERGER',
        adresse: '14 rue des Lilas', cp: '31000', ville: 'Toulouse',
        tel: '06 11 22 33 44', email: 'camille.berger@exemple.fr',
        naissance: '12/03/1988', lieuNaissance: 'Albi',
    },
    {
        civilite: 'M.', prenom: 'Farid', nom: 'BENALI',
        adresse: '3 impasse du Moulin', cp: '33000', ville: 'Bordeaux',
        tel: '07 55 66 77 88', email: 'farid.benali@exemple.fr',
        naissance: '27/09/1992', lieuNaissance: 'Pau',
    },
    {
        civilite: 'Mme', prenom: 'Sophie', nom: 'MARCHAND',
        adresse: '8 avenue de la Gare', cp: '65000', ville: 'Tarbes',
        tel: '06 44 33 22 11', email: 'sophie.marchand@exemple.fr',
        naissance: '05/01/1979', lieuNaissance: 'Auch',
    },
    {
        civilite: 'M.', prenom: 'Thomas', nom: 'LEROY',
        adresse: '22 chemin des Vignes', cp: '64000', ville: 'Pau',
        tel: '07 12 98 76 54', email: 'thomas.leroy@exemple.fr',
        naissance: '18/06/1995', lieuNaissance: 'Bayonne',
    },
    {
        civilite: 'Mme', prenom: 'Aïcha', nom: 'NDIAYE',
        adresse: '5 place du Marché', cp: '32000', ville: 'Auch',
        tel: '06 78 90 12 34', email: 'aicha.ndiaye@exemple.fr',
        naissance: '30/11/1985', lieuNaissance: 'Toulouse',
    },
];

const ENTREPRISES = [
    { nom: 'Pizza Napoli SARL', statut: 'SARL', siret: '842 013 567 00021', naf: '5610C', tel: '05 61 22 33 44', email: 'contact@pizzanapoli.exemple', adresse: '5 avenue de la Gare', cp: '31000', ville: 'Toulouse' },
    { nom: 'Le Four à Bois SAS', statut: 'SAS', siret: '793 456 128 00034', naf: '5610C', tel: '05 59 88 77 66', email: 'gerance@fourabois.exemple', adresse: '17 route de la Plage', cp: '64000', ville: 'Pau' },
    { nom: 'Trattoria du Coteau', statut: 'EURL', siret: '651 209 874 00017', naf: '5610A', tel: '05 62 11 44 55', email: 'bonjour@trattoria.exemple', adresse: '2 rue Basse', cp: '65000', ville: 'Tarbes' },
];

/** Entier pseudo-aléatoire dans [0, n[. */
const au_hasard = (liste) => liste[Math.floor(Math.random() * liste.length)];

/**
 * Une identité complète et cohérente, tirée au hasard.
 * `graine` (facultatif) rend le tirage STABLE pour une même valeur — utile quand on compare deux
 * aperçus successifs et qu'on ne veut pas que la mise en page bouge parce que le nom a changé.
 */
function identiteExemple(graine) {
    if (graine == null) return { personne: au_hasard(PERSONNES), entreprise: au_hasard(ENTREPRISES) };
    let h = 0;
    for (const c of String(graine)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return { personne: PERSONNES[h % PERSONNES.length], entreprise: ENTREPRISES[h % ENTREPRISES.length] };
}

module.exports = { identiteExemple, PERSONNES, ENTREPRISES };
