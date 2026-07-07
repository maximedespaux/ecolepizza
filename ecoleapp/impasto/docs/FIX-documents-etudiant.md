# Correction — page "Mes documents" (espace ÉTUDIANT)

Contexte : la page affiche les documents en double, dans un ordre illogique
(1, 10, 2, 3…), sans regroupement, et sans condition d'accès. À corriger comme
suit. Garde la logique des rôles (l'étudiant ne voit que SES documents).

## 1. Supprimer les doublons
Chaque type de document ne doit apparaître qu'UNE fois par formation. La liste
est actuellement rendue deux fois : corrige la requête / le map.

## 2. Regrouper par FORMATION (dossiers)
Un étudiant peut suivre PLUSIEURS formations : il doit s'y retrouver.
- Un **dossier (accordéon/carte) par Enrollment** : titre = formation + dates de
  session (ex. « Niveau I — Pizza Classique · 14→18 sept 2026 »).
- Plusieurs inscriptions = plusieurs dossiers, du plus récent au plus ancien ;
  le plus récent ouvert par défaut.

## 3. Ordre FIXE dans chaque dossier (2 sections) — NE PAS trier par texte
**Inscription :** 1 Programme · 2 Fiche d'expression · 3 Test de positionnement ·
4 Devis · 5 Contrat/Convention · 6 Droit à l'image · 7 Convocation (RS7404) ou
Invitation · 8 Règlement intérieur · 9 CGV.
**Fin de formation :** 10 Feuille d'émargement · 11 Évaluation · 12 Attestation
de fin · 13 Facture · 14 Certificat de réalisation (**seulement si obtenu**).

Utilise un tableau d'ordre et trie sur `ORDRE.indexOf(type)` :
`const ORDRE = ["PROGRAMME","FICHE_EXPRESSION","POSITIONNEMENT","DEVIS","CONTRAT",
"DROIT_IMAGE","CONVOCATION","REGLEMENT","CGV","EMARGEMENT","EVALUATION",
"ATTESTATION","FACTURE","CERTIFICAT"];`

## 4. Le DEVIS : signature obligatoire + acompte
- Le **devis DOIT être signé** par le stagiaire : **obligatoire et bloquant**.
  Tant qu'il n'est pas signé → badge rouge « À signer » + bouton « Signer » en
  avant. Le parcours ne progresse pas tant que le devis n'est pas signé.
- L'**acompte doit être reçu**, confirmé par le **SECRÉTARIAT** (état
  « en attente » orange / « reçu » vert). L'étudiant ne confirme pas l'acompte.
- La signature des AUTRES documents (droit à l'image) reste **facultative**.
- Signature simple + dossier de preuve déjà prévue (hash, horodatage, IP,
  journal) — pas de signature qualifiée.

## 5. CONDITION D'ACCÈS (important) — accès conditionné à la signature
Règle métier : **si le dossier n'est pas complet, le stagiaire n'a PAS accès à
ses documents**. La signature est la condition pour les débloquer.

Définis, pour chaque Enrollment (dossier), un état de complétude :
- **`dossierComplet` = (devis signé) ET (acompte reçu).**

Comportement dans l'espace étudiant :
- **Dossier NON complet** → les documents sont **verrouillés** (grisés + cadenas)
  et NON téléchargeables. Le dossier affiche un encart clair :
  « Signez votre devis pour accéder à vos documents » + le(s) document(s) que
  l'étudiant DOIT signer restent **accessibles** (devis, droit à l'image) pour
  qu'il puisse débloquer. Si le devis est signé mais l'acompte pas encore reçu,
  afficher « En attente de validation de l'acompte par le secrétariat ».
- **Dossier complet** → **tous** les documents du dossier deviennent disponibles
  et téléchargeables.
- Le **certificat** reste soumis à sa propre condition (affiché seulement s'il
  est obtenu), en plus de la complétude du dossier.

Côté sécurité : la route de téléchargement d'un document doit **vérifier côté
serveur** que le dossier est complet (et que le document appartient bien à
l'étudiant connecté) avant de servir le fichier — pas seulement masquer le bouton.

## 6. Affichage
- Chaque ligne : nom + badge d'état + action. États : « À signer » (rouge),
  « Signé » (vert), « Verrouillé » (cadenas, dossier incomplet), « À télécharger »
  / « Disponible » (dossier complet).
- Téléchargement = le vrai fichier (docx/pdf) du `GeneratedDocument`.
- En français, classes CSS du projet, pas d'emojis bruts (style d'icônes existant).

## 7. Vérification
Après correction : `npm run typecheck` + `npm run build`. Montre :
(a) un étudiant avec 2 formations (2 dossiers, ordre correct, pas de doublon),
(b) un dossier NON complet → documents verrouillés + devis à signer accessible,
(c) après signature du devis + acompte marqué reçu → documents débloqués.
