/**
 * LA GRILLE DU SUIVI QUALIOPI (demandée le 2026-09-24) — une table par formation : une ligne par
 * dossier, une colonne par document du parcours, une pastille par case.
 *
 * POURQUOI UNE GRILLE. La page dépliait, pour chaque dossier, une feuille de route VERTICALE de
 * seize à dix-huit étapes — une étape par ligne, 1 150 px par dossier. Mesuré en production le
 * 2026-09-24 : les sept dossiers en cours, ouverts, faisaient 11 445 px, quatorze écrans. Et avant
 * le premier dossier, le bandeau « Ce qui manque » alignait 32 cartes (chaque document × chaque
 * formation). La grille dit les deux à la fois, sans rien à déplier : une LIGNE se lit « où en est
 * ce dossier », une COLONNE « qui n'a pas encore ce document » — c'est ainsi qu'un contrôleur lit
 * un suivi. Le compte de chaque colonne remplace les 32 cartes, et filtre comme elles le faisaient.
 *
 * Du JavaScript pur, sans JSX, pour la raison écrite en tête de `etapes.js` : les tests de
 * `src/api/test` l'importent et l'ÉPROUVENT. L'état d'une case vient de `stepState`, la seule règle
 * d'état de l'application ; le compte d'une colonne, de `manquesParFormation`, celle du bandeau
 * qu'elle remplace — une grille qui recompterait à sa façon finirait par contredire la fiche.
 */
import { stepState } from "./etapes.js";

/** La formation d'un dossier, en clé : même forme que `manquesParFormation` (etapes.js). */
export const codeDe = (d) => (d && d.program_code) || "";

/**
 * Les colonnes d'une formation : l'UNION des étapes de ses dossiers, dans l'ordre du parcours.
 *
 * UNE UNION, ET NON LE PARCOURS D'UN SEUL DOSSIER. Deux dossiers d'une même formation n'ont pas
 * toujours les mêmes étapes — relevé en production sur NIV1H : le particulier signe un devis
 * particulier et un contrat, l'entreprise un devis professionnel et une convention, et le
 * certificat et l'attestation n'y viennent pas dans le même ordre. Prendre le parcours d'un seul
 * aurait fait disparaître les documents des autres, c'est-à-dire exactement ce qu'on vient chercher.
 *
 * L'ORDRE. Le dossier le plus long sert de gabarit ; l'étape d'un autre qu'il ne connaît pas vient
 * se placer juste après celle qui la précède dans ce dossier-là. Une étape déjà placée ne bouge
 * jamais : deux dossiers en désaccord sur l'ordre gardent celui du premier.
 *
 * ET CET ORDRE NE DÉPEND PAS DE CELUI DES DOSSIERS. Le serveur les trie par avancement, qui change
 * chaque jour : à longueur égale, le gabarit se départage sur ses étapes elles-mêmes, sans quoi une
 * colonne changerait de place d'un jour à l'autre et la grille serait à réapprendre à chaque visite.
 *
 * @param {Array} dossiers lignes de `/api/suivi`, d'une même formation
 * @returns {Array<{type:string, label:string}>}
 */
export function colonnesDeFormation(dossiers) {
    const cols = [];
    const forme = (d) => (d.documents || []).map((x) => x.type).join("|");
    const gabarits = [...(dossiers || [])].sort((a, b) =>
        (b.documents?.length || 0) - (a.documents?.length || 0) || (forme(a) < forme(b) ? -1 : forme(a) > forme(b) ? 1 : 0));
    for (const d of gabarits) {
        let pos = 0;
        for (const doc of d.documents || []) {
            const i = cols.findIndex((c) => c.type === doc.type);
            if (i >= 0) { pos = Math.max(pos, i + 1); continue; }
            cols.splice(pos, 0, { type: doc.type, label: doc.label });
            pos += 1;
        }
    }
    return cols;
}

/**
 * L'état d'une case : celui de l'étape, par la règle unique (`stepState`), ou « absent » quand le
 * dossier n'a pas cette étape — un devis particulier sur la ligne d'une entreprise.
 *
 * « ABSENT » N'EST PAS « SANS OBJET ». Sans objet (une remise que l'école a écartée, migration 161)
 * est une DÉCISION prise sur ce dossier, qui mérite son tiret ; absent veut dire que le parcours de
 * ce dossier ne comporte pas le document. Les confondre ferait lire une décision là où il n'y en a
 * pas eu.
 */
export function etatCase(d, type) {
    const doc = (d?.documents || []).find((x) => x.type === type);
    return doc ? { etat: stepState(doc), doc } : { etat: "absent", doc: null };
}

/**
 * Les tableaux du suivi : un par formation, dans l'ordre où arrivent leurs dossiers (le serveur met
 * les moins avancés devant — la première table est donc celle où il y a le plus à faire).
 *
 * @param affiches      ce que la liste montre : `sansLesComplets(grouperParEntreprise(…))`
 * @param pourColonnes  les dossiers dont on tire les colonnes : TOUS, hors complets masqués, et
 *                      SANS le filtre d'une colonne — filtrer une colonne ne doit pas en faire
 *                      disparaître d'autres sous les yeux de celui qui vient de cliquer.
 * @param manques       `manquesParFormation(tous les dossiers)` : le compte de chaque colonne. Pris
 *                      sur TOUS les dossiers, pour qu'un filtre ne fasse pas mentir les autres.
 * @returns [{ code, titre, colonnes: [{ type, label, manque }], lignes, nb }] — `manque` : l'entrée
 *          de `manquesParFormation` (ou null quand rien ne manque), celle qu'attend `dossiersDuManque`.
 *          Une ligne : { genre: "dossier", d, membre } ou { genre: "entreprise", company_id,
 *          company_name, n, complets }.
 */
export function tableauxDuSuivi(affiches, pourColonnes, manques) {
    const tables = new Map();
    const table = (code, d) => {
        if (!tables.has(code)) tables.set(code, { code, titre: (d && d.program_title) || "", lignes: [], nb: 0 });
        return tables.get(code);
    };
    for (const g of affiches || []) {
        if (g.type === "solo") {
            const T = table(codeDe(g.d), g.d);
            T.lignes.push({ genre: "dossier", d: g.d, membre: false });
            T.nb += 1;
            continue;
        }
        /* UNE ENTREPRISE PEUT ENVOYER DES STAGIAIRES DANS DEUX FORMATIONS : elle a alors un bloc dans
           chaque table, avec ses seuls stagiaires de CETTE formation — et c'est parmi eux qu'on
           compte ses complets, pas dans tout le groupe. */
        const vusParCode = new Map();
        for (const m of g.membresVus || g.members || []) {
            if (!vusParCode.has(codeDe(m))) vusParCode.set(codeDe(m), []);
            vusParCode.get(codeDe(m)).push(m);
        }
        for (const [code, vus] of vusParCode) {
            const tous = (g.members || []).filter((m) => codeDe(m) === code);
            const T = table(code, vus[0]);
            T.lignes.push({ genre: "entreprise", company_id: g.company_id, company_name: g.company_name,
                n: tous.length, complets: tous.length - vus.length });
            for (const m of vus) T.lignes.push({ genre: "dossier", d: m, membre: true });
            T.nb += vus.length;
        }
    }
    const parCle = new Map((manques || []).map((m) => [m.cle, m]));
    for (const T of tables.values()) {
        const source = (pourColonnes || []).filter((d) => codeDe(d) === T.code);
        T.colonnes = colonnesDeFormation(source).map((c) => ({ ...c, manque: parCle.get(`${c.type}|${T.code}`) || null }));
    }
    return [...tables.values()];
}
