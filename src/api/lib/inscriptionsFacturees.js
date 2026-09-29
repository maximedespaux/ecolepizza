/**
 * UN STAGIAIRE FACTURÉ — la règle que partagent la Comptabilité et la Facturation.
 *
 * Décidée par l'école le 2026-09-29 : un stagiaire compte en « Inscriptions » le mois où commence
 * sa session, dès qu'une FACTURE ou un ACOMPTE ÉMIS le désigne, au prix de son dossier, sinon au
 * tarif de la formation (cf. `computePeriode`, comptabilite.controller.js). Le 2026-09-30, la
 * Facturation s'est mise à choisir les stagiaires PAR SESSION (`sessionsAFacturer`,
 * invoice.controller.js) : elle doit dire « déjà facturé » exactement quand la Comptabilité le
 * compte — d'où ce fichier, plutôt que deux copies qui divergeraient en silence.
 *
 * Les fragments SQL supposent les alias de leurs requêtes : `e` pour le dossier (`enrollment`),
 * `s` pour la session (`training_session`).
 */

/* LE JOUR OÙ LE STAGIAIRE VIENT : le premier de sa session. Une session sans date de début (import
   ancien — l'application l'exige depuis) se date au lundi de sa semaine ISO, la semaine 1 étant
   celle du 4 janvier. MAKEDATE et WEEKDAY seulement (0 = lundi) : toute version de MariaDB les a. */
const DATE_SESSION = 'COALESCE(s.start_date, DATE_ADD(MAKEDATE(s.year, 4), INTERVAL ((s.week - 1) * 7 - WEEKDAY(MAKEDATE(s.year, 4))) DAY))';

/* Les numéros des factures et acomptes d'un STATUT donné qui désignent le dossier : sur la facture
   même, ou sur l'une de ses lignes (une facture d'entreprise en porte une par stagiaire). */
const numerosDesFactures = (statuts) => `(SELECT GROUP_CONCAT(DISTINCT i.number ORDER BY i.number SEPARATOR ', ')
       FROM invoice i
      WHERE i.organization_id = e.organization_id
        AND i.type IN ('FACTURE', 'ACOMPTE') AND i.status IN (${statuts})
        AND (i.enrollment_id = e.id OR i.id IN (SELECT il.invoice_id FROM invoice_line il WHERE il.enrollment_id = e.id)))`;

/* CE QUI FAIT COMPTER UN DOSSIER : une facture ou un acompte ÉMIS. Un brouillon n'est pas encore
   une facture, un devis n'en est pas une, une facture annulée non plus. */
const FACTURES_DU_DOSSIER = numerosDesFactures("'EMISE', 'PAYEE', 'IMPAYEE'");
/* Les BROUILLONS, pour prévenir seulement : un stagiaire déjà sur un brouillon le sera deux fois si
   on le coche encore, et le brouillon émis le fera compter. */
const BROUILLONS_DU_DOSSIER = numerosDesFactures("'BROUILLON'");

/**
 * Le montant d'un dossier : son prix s'il en a un, sinon le tarif de la formation — la règle des
 * documents (`enroll_price || price`, lib/tokens.js). Un prix de dossier à 0 retombe sur le tarif,
 * comme là-bas.
 */
function montantDuDossier(prixDossier, tarif) {
    const prix = Number(prixDossier) || 0;
    return prix > 0 ? { montant: prix, source: 'dossier' } : { montant: Number(tarif) || 0, source: 'formation' };
}

module.exports = { DATE_SESSION, FACTURES_DU_DOSSIER, BROUILLONS_DU_DOSSIER, montantDuDossier };
