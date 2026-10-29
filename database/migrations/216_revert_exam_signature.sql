/*
 * REVERT de la 216 — retire la table des signatures du procès-verbal.
 *
 * ⚠️ Les signatures manuscrites déjà recueillies (membres et candidats) sont PERDUES : elles ne
 * vivent que dans cette table. Les PV déjà téléchargés en PDF, eux, gardent les images qu'ils
 * portaient (le PDF est un instantané). La commission (décisions, composition, jury) n'est pas
 * touchée. Après le revert, signer le PV répond de nouveau « migration 216 non jouée ».
 */
DROP TABLE IF EXISTS exam_signature;
