/*
  CONDITIONS SUR LES PIÈCES À FOURNIR ET LES DOCUMENTS REMIS (demandé le 2026-10-19).

  POURQUOI. Un DOCUMENT porte déjà sa condition d'application au niveau du TYPE
  (document_template.applies_when) : « cette convention ne s'applique qu'aux dossiers
  professionnels ». On veut la même chose pour les deux AUTRES natures d'étape réglées dans
  Modèles → Documents : les PIÈCES à fournir (piece_type) et les DOCUMENTS REMIS (remise_type),
  pour qu'elles n'apparaissent dans le parcours d'un dossier QUE si la condition est vraie —
  exactement comme un document. Jusqu'ici, seule une condition PAR FORMATION
  (program_step.applies_when, migration 140) existait, et l'écran ne la proposait que pour les
  pièces (en choix « OU »), jamais pour les remises.

  CE QUE C'EST. Une colonne JSON `applies_when` sur chacune des deux tables, de la MÊME FORME que
  celle d'un document : { "conditions": ["slug", ...] } — des conditions personnalisées de
  l'organisme (document_condition) qui doivent TOUTES être vraies. Elle se CUMULE avec la
  condition par formation (union) : le parcours lit les deux (cf. `cond_type` dans formationSteps
  et le `passes()` de resoudreVariantes).

  AVANT / APRÈS. Le code tourne sans la colonne (sonde `colonneExiste` + repli ; poser une
  condition sans la colonne répond 503 « Migration 209 non jouée »). Sans condition posée, rien
  ne change : une pièce / remise active reste proposée comme avant.
*/
ALTER TABLE piece_type  ADD COLUMN IF NOT EXISTS applies_when longtext DEFAULT NULL AFTER active;
ALTER TABLE remise_type ADD COLUMN IF NOT EXISTS applies_when longtext DEFAULT NULL AFTER active;
