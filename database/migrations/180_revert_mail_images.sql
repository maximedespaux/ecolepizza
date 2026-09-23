/* 180_revert_mail_images.sql
   Retour arrière de la 180 : la bibliothèque d'images du mailing disparaît.

   ⚠️ CE QUI SE PERD : les images elles-mêmes. Les messages déjà ENVOYÉS ne changent pas — leurs
   images sont parties avec eux, en pièce jointe. Mais un message programmé ou un texte
   d'e-mail qui porte encore un marqueur `![…](image:…)` le rendra VIDE : l'image n'existe plus,
   et le marqueur s'efface au rendu plutôt que de s'imprimer.

   Sans risque si la 180 n'a jamais été jouée. */
DROP TABLE IF EXISTS mail_image;
