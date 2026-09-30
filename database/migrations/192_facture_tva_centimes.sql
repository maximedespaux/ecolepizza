/*
  192_facture_tva_centimes.sql

  LA TVA D'UNE NOUVELLE FACTURE SE COMPTE EN CENTIMES ENTIERS, ET UNE FACTURE DÉJÀ ÉMISE GARDE SON
  CALCUL (décidé par l'école le 2026-09-30).

  POURQUOI. `ventilerTva` (src/api/lib/facturx.js), qui fait la TVA et le TTC du PDF et du XML
  Factur-X, additionnait les HT d'un même taux EN FLOTTANT, puis arrondissait. Quand la TVA exacte
  tombe sur un demi-centime, cette somme passe parfois juste en dessous, et l'arrondi part vers le
  bas : quatre lignes à 10 % — 122,60 + 159,45 + 5,88 + 141,42 = 429,35 € HT, TVA exacte 42,935 € —
  donnaient 42,93 € de TVA et 472,28 € TTC, au lieu de 42,94 € et 472,29 €. Toujours un centime DE
  MOINS, jamais sur une ligne seule, jamais à 20 % (la TVA n'y tombe jamais sur un demi-centime) :
  des factures de la caisse et de la boutique, à 2,1, 5,5 ou 10 %. Et les écrans qui annoncent la
  facture en recopient le calcul (lib/ttc.js) : on encaissait ce centime de moins.

  POURQUOI UNE COLONNE, ET PAS LA CORRECTION SEULE. Rien n'est figé à l'émission : la base ne garde
  que des HT (invoice.amount_net, invoice_line), et le PDF comme le XML se RECALCULENT à chaque
  téléchargement. Corriger le calcul pour toutes les factures aurait changé d'un centime le total
  réimprimé de factures déjà remises au client — un duplicata qui ne dit plus ce que dit l'original.
  Même règle que la 108 pour le taux : seules les nouvelles factures changent.

  CE QUE VAUT LA COLONNE :
    · 0 — toutes les factures EXISTANTES, et toutes celles qu'écrirait encore un ancien code :
      l'ancien calcul, à l'identique, pour toujours ;
    · 1 — écrit par le code à la création de chaque facture (caisse, /factures, demande boutique),
      dès que la colonne existe : les HT en centimes entiers, la TVA exacte en entiers, arrondie une
      fois par taux, le demi-centime vers le haut.
  Les écrans qui annoncent une facture suivent le même calcul : le serveur leur dit lequel
  (`tva_centimes` — réglages de la caisse, « Mes demandes », liste des demandes).

  LE 1 EST ÉCRIT PAR LE CODE, JAMAIS DONNÉ PAR DÉFAUT : ainsi l'ordre entre le déploiement et la
  migration ne compte pas. Jouée avant le code, les factures que l'ancien code crée entre-temps
  restent à 0, et il les imprime à l'ancienne ; jouée après, celles créées entre-temps reçoivent 0
  à l'ajout de la colonne. Aucune facture ne change de total, dans aucun ordre.

  LE CODE MARCHE AVANT ET APRÈS. Sans la colonne, toutes les factures gardent l'ancien calcul, les
  vérifications de règlement (demande boutique, /factures) aussi : rien ne change.

  Vérification par l'API, sans SQL : créer une facture APRÈS l'avoir jouée, puis GET /api/factures
  (la liste fait un `SELECT i.*`) — la nouvelle ligne porte `tva_centimes: 1`, les anciennes 0. Sans
  la migration, la clé n'existe pas. Ou une requête, qui doit rendre 1 :
  SELECT COUNT(*) FROM information_schema.COLUMNS WHERE table_schema='impastio'
     AND table_name='invoice' AND column_name='tva_centimes';
*/

ALTER TABLE invoice
    ADD COLUMN IF NOT EXISTS tva_centimes tinyint(1) NOT NULL DEFAULT 0
    COMMENT 'TVA en centimes entiers (1 = facture creee depuis la 192). 0 = ancien calcul, garde tel quel.';
