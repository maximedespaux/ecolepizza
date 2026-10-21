/*
  LE TITRE D'UN DOCUMENT DE GROUPE NE PORTE PLUS L'OPCO (demandé le 2026-10-21).

  Un document généré PAR OPCO portait l'OPCO en suffixe de son titre
  (« Convention de formation — FAFCEA », « OP programme de formation — FAFCEA »). L'école l'a jugé
  redondant dans l'espace du stagiaire / du représentant : le bloc {OPCO} du document et la carte
  « Documents remis » le disent déjà. Le CODE ne l'ajoute plus aux NOUVEAUX documents
  (company.controller.js) ; cette migration retire le suffixe des documents DÉJÀ en base.

  POURQUOI C'EST EXACT ET SÛR : l'OPCO est stocké À PART, dans la colonne `generated_document.opco`
  (migration 089). On sait donc EXACTEMENT ce qui avait été ajouté — « espace, tiret cadratin,
  espace, OPCO » — et on ne retire que ce suffixe-là, et seulement quand le titre se termine bien
  par lui. CHAR_LENGTH compte des CARACTÈRES (le tiret cadratin « — » en est un seul), pas des
  octets : on coupe au bon endroit.

  Cette migration NE TOUCHE PAS la colonne `opco` : le regroupement par OPCO et le jeton {OPCO}
  continuent de s'appuyer dessus. Elle ne change que le TITRE affiché.

  Migration de DONNÉES : invisible à tout contrôle de schéma. Elle se vérifie sur le contenu — plus
  aucun titre de document de groupe ne se termine par « — <son OPCO> » :
    SELECT COUNT(*) FROM generated_document
     WHERE scope = 'COMPANY' AND opco IS NOT NULL AND opco <> ''
       AND RIGHT(title, CHAR_LENGTH(CONCAT(' — ', opco))) = CONCAT(' — ', opco);  -- doit rendre 0

  ⚠️ CONSÉQUENCE ASSUMÉE : une entreprise dont les stagiaires relèvent de PLUSIEURS OPCO aura
  désormais deux documents de même titre (le bloc « par stagiaire » et la carte « Documents remis »
  les distinguent).
*/

UPDATE generated_document
   SET title = LEFT(title, CHAR_LENGTH(title) - CHAR_LENGTH(CONCAT(' — ', opco)))
 WHERE scope = 'COMPANY'
   AND opco IS NOT NULL AND opco <> ''
   AND RIGHT(title, CHAR_LENGTH(CONCAT(' — ', opco))) = CONCAT(' — ', opco);
