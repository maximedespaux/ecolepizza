Tu es un développeur full-stack senior. Ce dépôt est "Impasto", un ERP de
formation (Next.js 15, React 19, Prisma, PostgreSQL, TypeScript). Je ne suis
pas développeur : explique simplement, en français, et pose-moi des questions
si tu as un doute. Ne supprime jamais de code sans m'expliquer avant.

AVANT TOUTE CHOSE : lis `docs/BRIEF.md` en entier (contexte, décisions, état du
projet). Lis aussi les données déjà prêtes que tu réutiliseras :
- src/lib/ecole-pizza/catalogue.ts (formations)
- src/lib/ecole-pizza/catalogue-produits.ts (produits partenaires + fournisseurs)
- src/lib/ecole-pizza/catalogue-ressources.ts (ressources par formation)
- src/lib/ecole-pizza/quiz-parcours.ts (questions du parcours, 1er jet)

============================================================================
LOGIQUE DES RÔLES — à respecter dans TOUTE l'application (ne pas mélanger) :
- SECRETARIAT (admin) : voit tout. Pilotage, inscriptions, documents, compta,
  automatisations, statistiques, réglages.
- FORMATEUR (co-admin) : ses stagiaires, sessions, émargement, approvisionnement,
  évaluations, suivi 6 mois. Accès lecture aux dossiers, pas à la compta ni aux
  réglages de l'organisme.
- ETUDIANT : son inscription, son parcours, ses documents, ses ressources, ses
  outils, son certificat. Ne voit que SES données.
Chaque page vérifie le rôle. Le menu (AppShell) s'adapte au rôle connecté.
============================================================================

MÉTHODE DE TRAVAIL (impérative) :
- Construis les modules UN PAR UN, dans l'ordre de priorité (P0 puis P1…).
- Après CHAQUE module : `npm run typecheck` + `npm run build` doivent passer,
  puis montre-moi le résultat et ATTENDS mon feu vert avant le suivant.
- Toute nouvelle table = migration Prisma + seed d'exemples + entrée de menu
  dans AppShell (selon le rôle). Réutilise le style du projet (classes CSS et
  patterns du BRIEF, UI en français, PAS d'emojis bruts). Alias `@/*` -> `src/*`.
- Sois transparent : dis clairement ce qui est réel vs simulé (ex. un envoi
  d'e-mail réel nécessite Brevo + un planificateur ; une signature qualifiée
  eIDAS est hors périmètre — on reste en signature simple + dossier de preuve).

----------------------------------------------------------------------------
ÉTAPE 0 — Mise en route (fais-la, puis arrête-toi)
1. Node 20+. `npm install`.
2. PostgreSQL via `docker-compose.yml` si présent, sinon guide-moi. Crée `.env`
   (copie de `.env.example`) avec `DATABASE_URL`.
3. `npx prisma generate`, `npx prisma migrate dev`, puis le seed.
4. `npm run dev` -> donne-moi l'URL locale.
5. `npm run typecheck` + `npm run build`. Corrige les erreurs (y compris la page
   /calendrier récemment ajoutée) et explique chaque correction en une phrase.
=> Montre que l'app démarre et que /calendrier marche AVANT de continuer.

==================== MODULES SECRÉTARIAT (admin) ====================

[P0] MODULE A — Comptabilité / GESTION (pas de compta légale)
- Page `/comptabilite` + menu. Modèles : `Expense` (date, categorie enum
  ExpenseCategory = MATIERES_PREMIERES|SALAIRES|LOYER|MARKETING|ENERGIE|DIVERS,
  libelle, montantHT, fournisseurId?) et `RevenueExtra` (ventes matériel /
  commissions). Migration + seed.
- CA calculé automatiquement : somme des `prix` des Enrollments + `RevenueExtra`,
  par année sélectionnable. Chaque poste = total, % du CA, vs cible (défauts dans
  le BRIEF, éditables), code couleur vert/orange/rouge + conseil. Marge +
  dividendes estimés (objectif 10 %). Graphiques simples.
- Vue annuelle + saisie des dépenses. Relie les achats de l'Approvisionnement
  (module F) aux dépenses "MATIERES_PREMIERES".

[P1] MODULE B — Statistiques & bilan annuel
- Page `/statistiques` : CA par mois, taux de remplissage des sessions, nombre de
  stagiaires par formation, satisfaction moyenne (module I), taux d'insertion à
  6 mois (module H). Export CSV. Sert de "bilan" pour partenaires/financeurs.

[P2] MODULE C — Pilote automatique de relances (automatisations serveur)
- Page `/automatisations` : règles activables (relance signature J+2 / J+5 /
  alerte "à appeler" J+8, relance acompte, convocation J-30, rappel J-3,
  questionnaire à chaud en fin de semaine, documents de fin, suivi 6 mois),
  + journal (boîte d'envoi). Envois réels via Brevo + planificateur (Vercel Cron
  en prod, manuel en local). Modèles `AutomationRule`, `OutboxEmail`. Dis-moi ce
  qui est réellement planifié vs à déclencher à la main en local.

[P1] MODULE D — Conformité Qualiopi + alertes intelligentes
- Score Qualiopi calculé par dossier (pas déclaré) : d'après documents générés/
  signés, acompte, émargement, évaluation. Vert/orange/rouge.
- Centre d'alertes (page + cloche) : session bientôt pleine, dossier bloqué en
  signature à J+8, financement non validé à J-15, acompte non reçu, document
  Qualiopi manquant. Modèle `Notification` (destinée à un rôle).

==================== MODULES FORMATEUR (co-admin) ====================

[P1] MODULE F — Approvisionnement (reprend `catalogue-produits.ts`)
- Page `/approvisionnement`. Modèles `Supplier`, `Product` (avec `parStagiaire`,
  `stock`, `stockMin`, `prixHT?`, `partenaire`, `forms[]`), `StockMovement`.
  Seed depuis `catalogue-produits.ts`.
- Stock réel + ruptures (alerte sous le seuil). Priorité partenaires ; quand un
  produit générique est choisi, afficher "un partenaire équivaut : X".
- 2 PDF : bon de commande groupé par fournisseur (JAMAIS le nombre de stagiaires
  dessus) ; récapitulatif annuel qui comptabilise les stagiaires (X marchandise ×
  stagiaires) + listing annuel avec droit à l'image.

[P1] MODULE G — Émargement électronique
- Feuilles de présence par demi-journée, liées à une TrainingSession, signature
  tactile horodatée (stagiaire + formateur), export PDF. Modèles `AttendanceSheet`
  + `AttendanceSignature`.

[P2] MODULE H — Suivi 6 mois & débouchés
- Le pilote (module C) signale les stagiaires à recontacter à +6 mois. Le
  formateur enregistre : situation, opportunité (vente matériel / formation sup /
  mise en relation / emploi), notes. Alimente les stats d'insertion (module B).
  Modèle `FollowUp`.

==================== MODULES ÉTUDIANT ====================

[P0] MODULE I — Inscription en ligne (Fiche d'expression du stagiaire)
- Formulaire multi-étapes rempli par l'ÉTUDIANT ou le SECRÉTARIAT (au téléphone).
  Financement intelligent selon le statut (Salarié->OPCO/AKTO, Demandeur
  d'emploi->France Travail/CPF, Chef d'entreprise->AGEFICE, Profession libérale->
  FIF PL, Artisan->FAFCEA, Particulier->CPF/autofinancement). Crée le Learner +
  Enrollment au statut "à confirmer" ; le SECRÉTARIAT confirme (-> notification).

[P0] MODULE J — Mes documents (deux temps)
- Section Inscription (devis, convention/contrat, programme, règlement, CGV,
  droit à l'image) et Fin (attestation de fin, facture, et certificat SEULEMENT
  s'il est obtenu). Source : `GeneratedDocument` liés à l'Enrollment.

[P1] MODULE K — Signature électronique (simple + dossier de preuve)
- L'étudiant signe ses documents (devis/convention) en les dessinant. Génère un
  dossier de preuve : hash SHA-256 du document, horodatage, IP, journal ;
  verrouille le document ; notifie le secrétariat. (Niveau simple/SES — pas de
  qualifié.) Modèles `SignatureRequest` + `SignatureEvidence`.

[P1] MODULE L — Ressources pédagogiques (progression)
- Lit `catalogue-ressources.ts` : pour la formation du stagiaire, modules +
  leçons cochables avec progression. Modèle `LessonProgress`.

[P0] MODULE M — Parcours pizzaïolo façon Duolingo (module complet)
- Page "Mon parcours" : carte d'étapes qui se débloquent l'une après l'autre.
  Données : `quiz-parcours.ts` (parcours -> étapes -> questions, seuil 70 %).
  Chaque étape = mini-leçon + quiz ; réussir valide, débloque la suivante,
  rapporte l'XP. Modèles `QuizAttempt`, `LearnerProgress` (xp, badges[]). UI
  ludique mais sobre (progression, XP, badges, états verrouillé/en cours/réussi).
  Les questions `aVerifier: true` restent éditables dans le fichier.

[P2] MODULE N — Outils ludiques du pizzaïolo
- Calculateur d'empâtement : curseurs (pâtons, poids, hydratation, sel, levure,
  huile, T° ambiante/farine), recette recalculée en direct en % boulangers,
  presets Classique/Napolitaine/Teglia, "X pâtons par sac de 25 kg". Pourra tirer
  les prix de la mercuriale plus tard.

==================== ORDRE CONSEILLÉ ====================
Étape 0 -> puis les P0 (I, J, M, A) -> puis les P1 (L, F, G, D, B, K) -> puis les
P2 (C, H, N). Mais demande-moi confirmation de l'ordre après l'Étape 0 : je
choisis peut-être de commencer par un module précis.

Commence maintenant par l'ÉTAPE 0, et arrête-toi dès qu'un truc bloque pour me
demander.
