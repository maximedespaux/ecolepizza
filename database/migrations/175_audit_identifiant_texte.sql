/* 175_audit_identifiant_texte.sql
   LE JOURNAL D'AUDIT PERDAIT EN SILENCE TOUT CE QUI NE SE DÉSIGNE PAS PAR UN UUID (relevé le 2026-09-22).

   LE DÉFAUT. audit_log.entity_id est de type uuid. Or deux sortes d'actions désignent leur objet
   autrement : un MODÈLE DE DOCUMENT par son slug (« grille-jury », « droit-image »), un RÔLE
   SYSTÈME par son nom (« FORMATEUR »). En mode strict, MariaDB refuse alors la ligne ENTIÈRE
   (« Incorrect uuid value »), et l'écriture du journal, non bloquante par construction, n'en
   laissait qu'une ligne dans la console. Constaté en production par GET /api/audit : AUCUNE ligne
   « template.save », alors que les modèles s'enregistrent chaque semaine. Le même jour, une
   vérification (« le modèle a-t-il été enregistré ? ») s'est fiée à ce journal vide.

   LES APPELS CONCERNÉS, sur les 139 appels de logAudit que compte l'API :
   · DocumentTemplate, par slug : template.save (deux points d'appel), template.upload,
     template.delete, template.reset, template.duplicate
   · AccessProfile, par nom de rôle : accessprofile.system
   Tous les autres écrivent un UUID, ou rien.

   POURQUOI varchar(64). Le plus long identifiant écrit est un slug de modèle, que
   document_template.slug borne à 60 caractères. Un UUID en fait 36, un nom de rôle 15 au plus.
   64 couvre les trois, avec une marge, sans inviter à y ranger autre chose qu'un identifiant.

   AUCUNE JOINTURE NE PORTE SUR CETTE COLONNE, et aucun index. Ses deux lecteurs la renvoient
   telle quelle : le journal (GET /api/audit), et la cloche, qui n'en tire un lien que pour un
   stagiaire, une entreprise ou une session (DETAIL_PAR_ENTITE, lib/activite.js), trois entités
   toujours identifiées par un UUID. Les UUID déjà écrits sont convertis en leur forme texte, celle
   que l'API renvoie déjà : aucun lecteur ne voit la différence. La conversion recopie la table,
   quelques milliers de lignes, et ne dure qu'un instant.

   LE CODE MARCHE AVANT ET APRÈS. Avant, quand la colonne refuse un identifiant, la ligne est
   réécrite SANS lui (qui, quoi et quand restent tracés), et la console le dit une seule fois.
   Après, l'identifiant est gardé.

   Rejouable sans risque : redéfinir une colonne à l'identique ne change rien. AUCUN POINT-VIRGULE
   dans les commentaires ni les chaînes : le client SQL de l'organisme découpe sur ce caractère
   (cf. la 146). */

ALTER TABLE audit_log
    MODIFY COLUMN entity_id varchar(64) DEFAULT NULL;
