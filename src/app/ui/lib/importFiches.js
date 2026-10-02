/**
 * L'IMPORT CSV — LES COLONNES, LEUR NOM DANS LE MODÈLE, ET LES AUTRES NOMS QU'ON LEUR DONNE (2026-09-22).
 *
 * Du JavaScript pur, sans JSX : les tests de `src/api/test` l'importent. Le SERVEUR décide de tout
 * le reste (src/api/lib/importFiches.js) — ce qui est requis, ce qui est déjà là, ce qui est illisible.
 * Un test vérifie que les deux côtés connaissent les mêmes champs.
 *
 * `l` : le titre de la colonne dans le MODÈLE téléchargeable ; les formats attendus y sont dits entre
 * parenthèses, et les parenthèses sont ignorées à la lecture. `syn` : les autres titres reconnus —
 * une liste tapée à la main dit « Mail », « Tél », « CP » ; on ne lui demande pas de renommer ses
 * colonnes. Ce qui n'est reconnu par rien se choisit à l'écran, ou s'ignore.
 */
import { cleEntete, ecrireCsv } from "./csv.js";

export const CHAMPS_IMPORT = {
  stagiaires: [
    { k: "civility", l: "Civilité (M. ou Mme)", syn: ["civ", "titre"] },
    { k: "last_name", l: "Nom", syn: ["nom de famille", "last name", "surname"], requis: true },
    { k: "first_name", l: "Prénom", syn: ["prenoms", "first name", "firstname"], requis: true },
    { k: "email", l: "E-mail", syn: ["email", "mail", "courriel", "adresse mail", "adresse e mail", "adresse email"] },
    { k: "phone", l: "Téléphone (ex. 0612345678)", syn: ["tel", "telephone portable", "portable", "mobile"] },
    { k: "birthday", l: "Date de naissance (JJ/MM/AAAA)", syn: ["naissance", "ne le", "nee le", "ne e le"] },
    { k: "birth_place", l: "Lieu de naissance", syn: ["ville de naissance", "ne a", "nee a"] },
    { k: "address", l: "Adresse", syn: ["rue", "adresse postale"] },
    { k: "zip_code", l: "Code postal", syn: ["cp"] },
    { k: "town", l: "Ville", syn: ["commune", "localite"] },
    { k: "professional_status", l: "Situation (En activité, Demandeur d'emploi…)", syn: ["situation professionnelle", "statut", "statut professionnel", "etes vous"] },
    { k: "entreprise_siret", l: "SIRET de l'entreprise", syn: ["siret entreprise", "siret"] },
    { k: "entreprise_nom", l: "Entreprise", syn: ["nom de l entreprise", "societe", "employeur", "raison sociale"] },
  ],
  entreprises: [
    { k: "name", l: "Nom de l'entreprise", syn: ["nom", "entreprise", "raison sociale", "societe", "denomination"], requis: true },
    { k: "siret", l: "SIRET", syn: ["n siret", "numero siret"] },
    { k: "vat_number", l: "N° TVA intracommunautaire", syn: ["tva", "n tva", "numero tva", "tva intracommunautaire"] },
    { k: "naf_ape", l: "Code NAF", syn: ["naf", "ape", "code ape", "code naf ape"] },
    { k: "legal_status", l: "Forme juridique (SARL, SAS…)", syn: ["forme", "statut juridique"] },
    { k: "date_creation", l: "Date de création (JJ/MM/AAAA)", syn: ["creation", "date d immatriculation"] },
    { k: "address", l: "Adresse", syn: ["rue", "adresse postale"] },
    { k: "zip_code", l: "Code postal", syn: ["cp"] },
    { k: "town", l: "Ville", syn: ["commune", "localite"] },
    { k: "email", l: "E-mail", syn: ["email", "mail", "courriel"] },
    { k: "phone", l: "Téléphone (ex. 0612345678)", syn: ["tel", "standard"] },
    { k: "opco", l: "OPCO", syn: ["financeur"] },
    { k: "representative_civ", l: "Civilité du référent (M. ou Mme)", syn: ["civilite referent"] },
    { k: "representative_name", l: "Nom du référent", syn: ["referent", "nom referent", "representant", "nom du representant", "contact"] },
    { k: "representative_first_name", l: "Prénom du référent", syn: ["prenom referent", "prenom du representant"] },
    { k: "representative_role", l: "Fonction du référent", syn: ["fonction", "fonction referent", "poste"] },
  ],
};

/**
 * La colonne de chaque en-tête du fichier : `k` du champ reconnu, ou "" (ignorée). Un champ ne se prend
 * qu'une fois — la première colonne qui le porte l'emporte, une seconde « E-mail » ne l'écrase pas.
 */
export function associerColonnes(entetes, champs) {
  const pris = new Set();
  return entetes.map((h) => {
    const c = cleEntete(h);
    const f = c && champs.find((x) => !pris.has(x.k) && [x.l, ...(x.syn || [])].some((s) => cleEntete(s) === c));
    if (!f) return "";
    pris.add(f.k);
    return f.k;
  });
}

/** Le MODÈLE à télécharger : la seule ligne d'en-tête, au format qu'Excel ouvre tel quel. */
export const modeleCsv = (type) => ecrireCsv([CHAMPS_IMPORT[type].map((c) => c.l)]);
export const nomModele = (type) => `modele-import-${type}.csv`;

/** Les lignes à envoyer : { _ligne, champ: valeur }, cellules vides et colonnes ignorées retirées. */
export function lignesPourServeur(lignes, colonnes) {
  return lignes.map(({ numero, cellules }) => {
    const o = { _ligne: numero };
    colonnes.forEach((k, i) => {
      const v = String(cellules[i] ?? "").trim();
      if (k && v) o[k] = v;
    });
    return o;
  });
}

/**
 * La PHRASE DE RÉSUMÉ de l'aperçu d'import, en clair, avant les pastilles : « 12 nouvelles fiches
 * seront créées · 3 déjà présentes seront ignorées · 1 refusée ». Avant l'import (essai), au FUTUR ;
 * après, au PASSÉ. On dit toujours les nouvelles (même « aucune »), et les déjà présentes / refusées
 * quand il y en a. Les « avertissements » n'y entrent pas : ils portent sur des CHAMPS laissés de
 * côté, pas sur des fiches. Les fiches sont féminines → tout s'accorde au féminin.
 * @param bilan  { a_creer, crees, doublons, erreurs } renvoyé par le serveur
 * @param fait   true une fois l'import réellement fait (passé), false pour l'essai (futur)
 */
export function resumeImport(bilan, { fait = false } = {}) {
  if (!bilan) return "";
  const s = (n) => (n > 1 ? "s" : "");           // pluriel
  const ser = (n) => (n > 1 ? "seront" : "sera"); // conjugaison du futur
  const parts = [];
  if (fait) {
    parts.push(bilan.crees ? `${bilan.crees} nouvelle${s(bilan.crees)} fiche${s(bilan.crees)} créée${s(bilan.crees)}` : "aucune fiche créée");
    if (bilan.doublons) parts.push(`${bilan.doublons} déjà présente${s(bilan.doublons)} ignorée${s(bilan.doublons)}`);
  } else {
    parts.push(bilan.a_creer
      ? `${bilan.a_creer} nouvelle${s(bilan.a_creer)} fiche${s(bilan.a_creer)} ${ser(bilan.a_creer)} créée${s(bilan.a_creer)}`
      : "aucune nouvelle fiche à créer");
    if (bilan.doublons) parts.push(`${bilan.doublons} déjà présente${s(bilan.doublons)} ${ser(bilan.doublons)} ignorée${s(bilan.doublons)}`);
  }
  if (bilan.erreurs) parts.push(`${bilan.erreurs} refusée${s(bilan.erreurs)}`);
  return parts.join(" · ");
}
