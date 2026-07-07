-- ============================================================================
--  Contenu pédagogique réel des formations (fourni par l'organisme).
--  Renseigne titre, durée, horaires, public, objectifs et déroulé par CODE.
--  Prérequis : migration 008 (colonnes objective_general/duration_detail/…).
--    mysql -u root -p gds_doc_gestionary < database/dev_formations_content.sql
-- ============================================================================

SET @org_id = (SELECT id FROM organization ORDER BY created_at LIMIT 1);

-- NIV1 — Pizzaïolo Niveau I - Pizza Classique
UPDATE training_program SET
  title = 'Pizzaïolo Niveau I - Pizza Classique',
  days = 5, hours = 35, price = 1480.00,
  audience = 'Tout public 16 ans minimum',
  objective_general = 'Réaliser des pizzas classiques de l''élaboration de l''empâtement direct jusqu''à la sortie du four',
  objectives = '- Connaître les composants du blé, le type et la force de la farine
- Citer les ingrédients de la pâte à pizza avec le poids par unité de calcul
- Donner le taux d''hydratation en fonction du W de la farine
- Énumérer les différentes levures et comprendre leurs actions
- Indiquer les différentes matières grasses et expliquer leurs rôles
- Expliquer le rôle du sel en panification
- Calculer la température de base pour l''eau de coulage
- Fabriquer un empâtement direct - Pointer, diviser, peser, bouler et bloquer
- Contrôler l''étiquetage avec DLC - DLUO
- Élaborer la sauce tomate
- Réaliser la mise en place des matières 1ères (tranchage et cuisson)
- Étaler les pâtons à la main
- Réaliser des pizzas classiques, des calzones en effectuant le chiquetage
- Élaborer une pizza traiteur par le formateur
- Effectuer le travail de pelles pour enfourner et défourner en gérant les cuissons des pizzas
- Décrire les différents matériels utilisés en pizzeria
- Gérer l''organisation en pizzeria
- Fabriquer des calzones, réaliser le chiquetage
- Nettoyer et ranger le poste de travail et le matériel',
  duration_detail = 'Lundi 8h45-12h00 & 13h00 à 17h15
Mardi – Mercredi – Jeudi 8h00-12h00 & 13h00-16h30
Vendredi 8h00-12h00 & 13h00-14h00',
  program_detail = 'Lundi 8H45 - 12H00 :
- Présenter chaque stagiaire avec leur parcours professionnel et leur projet
- Visiter le centre de formation
- Compte rendu des tests de positionnement
- Remise des documents pédagogiques
- Citer les composants du blé, de la farine du type et de sa force
- Nommer les 5 ingrédients de la pâte à pizza avec le poids par unité de calcul
12H00 - 13H00 : Pause repas
13H00 - 17H15 :
- Donner le taux d''hydratation en fonction du W de la farine
- Énumérer les différentes levures et comprendre leurs actions
- Indiquer les différentes matières grasses et leurs rôles
- Expliquer le rôle du sel en panification
- Calculer la température de base pour l''eau de coulage
- Fabriquer une pâte classique au pétrin pour 3 unités de calcul – Pointer, diviser, peser, bouler et bloquer
- Nettoyer son poste de travail et son matériel
Mardi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Fabriquer la pâte individuellement avec adjonctions pour 4 unités de calcul
- Pointer diviser, peser, bloquer
- Effectuer les 1ers gestes d''étalage des pâtons de la veille
- Élaborer une sauce tomate
- Contrôler l''étiquetage avec DLC - DLUO
- Nettoyer son poste de travail
12H00 - 13H00 Pause repas dégustation
13H00 - 16H30 :
- Réaliser une pâte à pizza individuellement avec leur choix d''adjonction ou substitution – Peser, diviser, bouler et Bloquer
- Étaler la pâte individuellement
- Nettoyer son poste de travail et son matériel
Mercredi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Fabriquer une pâte imposée pour 4 unités de calcul avec adjonction de pâte fermentée
- Pointer-Diviser, peser, Bouler avec tests de rapidité-Bloquer
- Effectuer le travail de pelles pour enfourner et défourner
- Nettoyer son poste de travail
- Choisir les matières 1ères utilisées pour la réalisation des pizzas et savoir les disposer avant ou après la cuisson
12H30 - 13H00 Pause repas dégustation
13H00 - 16H30 :
- Décrire les différents matériels utilisés
- Étaler, garnir de sauce tomate, cuire les fonds de pâte.
- Fabriquer des calzones en effectuant le chiquetage, enfourner et cuire
- Réaliser et cuire des fonds tomatés
- Nettoyer le poste de travail et son matériel
Jeudi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-1)
- Allumer les fours
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Trancher les charcuteries
- Nettoyer, découper les légumes
- Cuire des matières 1ères
- Stocker au froid.
- Réaliser des pizzas classiques
- Nettoyer son poste de travail et le matériel
12H30 - 13H00 Pause repas dégustation
13H00 - 16H30 :
- Analyser, commenter les différents empâtements réalisés sur le 1er et 2ème jour
- Réaliser des pizzas classiques, calzones
- Examiner et tester le stagiaire en situation réelle de fabrication de 3 pizzas de l''étalage à la cuisson (rapidité)
- Nettoyer le poste de travail et son matériel
Vendredi 8H00 - 12H00 :
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Gérer l''organisation en pizzeria – Accueil client
- Fabriquer une pizza traiteur en plaque par le formateur
- Examiner et tester le stagiaire en situation réelle de fabrication de 3 pizzas de l''étalage à la cuisson (rapidité)
12H00 - 13H00 Pause repas dégustation
13H00 - 14H00 :
- Vider tous les stocks de matières 1ères
- Mettre en bacs gastro
- Nettoyer le poste de travail, le matériel et l''espace de travail
- Évaluer la formation à chaud, évaluer les acquis par le(s) formateur(s), certificat de réalisation, remise de diplôme, photos.'
WHERE organization_id = @org_id AND code = 'NIV1';

-- NIV2 — Pizzaïolo Niveau II – Empâtements Indirects « Poolish - Biga »
UPDATE training_program SET
  title = 'Pizzaïolo Niveau II – Empâtements Indirects « Poolish - Biga »',
  days = 2, hours = 15, price = 850.00,
  audience = 'Personne ayant déjà effectué le niveau I – Pizza classique ou le niveau I Pro',
  objective_general = 'Réaliser des empâtements indirects «Poolish & Biga»',
  objectives = '- Réaliser la 1ère phase et 2ème phase des empâtements indirects «Poolish et Biga»
- Contrôler la pousse
- Diviser, peser, bouler et bloquer la pâte
- Étaler les pâtons
- Réaliser des pizzas classiques et créatives
- Évaluer les différences entre les empâtements « poolish » et « biga »',
  duration_detail = 'Lundi 8h45-12h00 & 13h00 à 17h15
Mardi 8h00-12h00 & 13h00-16h30',
  program_detail = 'Lundi 8H45 - 12H00 :
- Présenter chaque stagiaire avec leur parcours professionnel et leur projet
- Visiter le centre de formation
- Compte rendu des tests de positionnement
- Remise des documents pédagogiques
- Décrire la technique de l''empâtement indirect «Poolish»
- Élaborer la 2ème phase du Poolish (1ère phase préparée la veille par le formateur)
- Diviser, peser, bouler, bloquer
- Nettoyer son poste de travail et son matériel
12H00 - 13H00 : Pause repas
13H00 - 17H15 :
- Observer et analyser le goût, l''alvéolage, le croustillant et le moelleux des 2 empâtements réalisés en amont par le formateur (48 h de maturation).
- Décrire la technique de l''empâtement indirect «Biga»
- Élaborer la 2ème phase de la Biga (1ère phase préparée la veille par le formateur)
- Fabriquer les 2 empâtements « Poolish » et « Biga » 1ère phase
- Nettoyer son poste de travail et son matériel
Mardi 8H00 - 12H00 :
- Contrôler les acquisitions de chaque stagiaire – suivi correction (Questions/réponses)
- Terminer la 2ème phase du Poolish et de la Biga
- Diviser, peser, bouler et bloquer les pâtons
- Nettoyer son poste de travail et son matériel
12H30 - 13H00 : Pause repas
13H00 - 16H30 :
- Fabriquer de pizzas classiques et créatives
- Nettoyer le poste de travail et du matériel
- Évaluer la formation à chaud par le stagiaire, évaluer les acquis par le(s) formateur(s), certificat de réalisation, remise de diplôme, photos.'
WHERE organization_id = @org_id AND code = 'NIV2';

-- NIV1PRO — Pizzaïolo Niveau I PRO – Pizza Classique
UPDATE training_program SET
  title = 'Pizzaïolo Niveau I PRO – Pizza Classique',
  days = 2, hours = 15, price = 850.00,
  audience = 'Professionnel de la pizza non initié sur les bases théoriques de l''empâtement direct ni sur la pratique de l''étalage à la main',
  objective_general = 'Mettre en pratique le protocole de l''empâtement ainsi que l''étalage à la main',
  objectives = '- Connaître les composants du blé, le type et la force de la farine
- Citer les ingrédients de la pâte à pizza avec le poids par unité de calcul
- Donner le taux d''hydratation en fonction du W de la farine
- Énumérer les différentes levures et comprendre leurs actions
- Indiquer les différentes matières grasses et expliquer leurs rôles
- Expliquer le rôle du sel en panification
- Calculer la température de base pour l''eau de coulage
- Fabriquer l''empâtement direct - Pointer, diviser, peser, bouler et bloquer (boulage avec test de rapidité)
- Élaborer la sauce tomate
- Étaler les pâtons à la main et réaliser des pizzas classiques avec test de rapidité
- Effectuer le travail de pelle pour enfourner et défourner en gérant les cuissons',
  duration_detail = 'Lundi 8h45-12h00 & 13h00 à 17h15
Mardi 8h00-12h00 & 13h00-16h30',
  program_detail = 'Lundi 8H45 - 12H00 :
- Présenter chaque stagiaire avec leur parcours professionnel et leur projet
- Visiter le centre de formation
- Compte rendu des tests de positionnement
- Remise des documents pédagogiques
- Citer les composants du blé, de la farine du type et de sa force
- Nommer les 5 ingrédients de la pâte à pizza avec le poids par unité de calcul
12H00 - 13H00 : Pause repas
13H00 - 17H15 :
- Donner le taux d''hydratation en fonction du W de la farine
- Énumérer les différentes levures et comprendre leurs actions
- Indiquer les différentes matières grasses et leurs rôles
- Expliquer le rôle du sel en panification
- Calculer la température de base pour l''eau de coulage
- Fabriquer 2 empâtements directs au pétrin pour 3 unités de calcul – Pointer, diviser, peser, bouler et bloquer
- Nettoyer son poste de travail et son matériel
Mardi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Fabriquer un empâtement direct avec adjonction de pâte fermentée et une farine test pour 3 unités de calcul
- Pointer, diviser, peser, bouler et bloquer (boulage avec test de rapidité)
- Effectuer les 1ers gestes d''étalage des pâtons de la veille
- Élaborer une sauce tomate
- Étaler les pâtons avec test de rapidité
- Effectuer le travail de pelle pour enfourner et défourner
- Nettoyer son poste de travail et son matériel
12H30 - 13H00 : Pause repas
13H00 - 16H30 :
- Étaler, garnir de sauce tomate les fonds de pâte et cuire
- Réaliser des pizzas classiques et calzones
- Nettoyer le poste de travail, le matériel
- Évaluer la formation à chaud par le stagiaire, évaluer les acquis par le(s) formateur(s), certificat de réalisation, remise de diplôme, photos.'
WHERE organization_id = @org_id AND code = 'NIV1PRO';

-- NIV1H — Pizzaïolo Niveau I – Pizza Classique & Hygiène alimentaire adaptée à l'activité des établissements de la restauration commerciale
UPDATE training_program SET
  title = 'Pizzaïolo Niveau I – Pizza Classique & Hygiène alimentaire adaptée à l''activité des établissements de la restauration commerciale',
  days = 5, hours = 44, price = 1780.00,
  audience = 'Tout public 16 ans minimum',
  objective_general = 'Réaliser des pizzas classiques de l''élaboration de l''empâtement direct jusqu''à la sortie du four en appliquant les gestes et la réglementation d''hygiène adaptée à la restauration commerciale',
  objectives = '- Identifier les composants du blé, le type et la force de la farine
- Citer les ingrédients de la pâte à pizza avec le poids par unité de calcul
- Donner le taux d''hydratation en fonction du W de la farine
- Énumérer les différentes levures et comprendre leurs actions
- Indiquer les différentes matières grasses et expliquer leurs rôles
- Expliquer le rôle du sel en panification
- Calculer la température de base pour l''eau de coulage
- Fabriquer un empâtement direct - Pointer, diviser, peser, bouler et bloquer
- Élaborer la sauce tomate
- Réceptionner les matières 1ères avec contrôles du bon de livraison et de l''étiquetage avec DLC – DLUO
- Réaliser la mise en place des matières 1ères (tranchage et cuisson)
- Étaler les pâtons à la main
- Réaliser des pizzas classiques, des calzones en effectuant le chiquetage
- Élaborer une pizza traiteur par le formateur
- Effectuer le travail de pelles pour enfourner et défourner en gérant les cuissons des pizzas
- Décrire les différents matériels utilisés en pizzeria
- Gérer l''organisation en pizzeria
- Nettoyer et ranger le poste de travail et le matériel
Gérer un établissement de restauration commerciale en appliquant les bonnes pratiques d''hygiène.
1- Les fondamentaux de la réglementation communautaire et nationale (restauration commerciale)
2- Les bonnes pratiques d''hygiène et instructions spécifiques
3- Le plan de maîtrise sanitaire',
  duration_detail = 'Lundi 8h45-12h30 & 13h00 à 17h30
Mardi – Mercredi 8h00-12h30 & 13h00-18h15
Jeudi 8h00-12h30 & 13h00-18h00
Vendredi 8h00-12h30 & 13h00-15h15',
  program_detail = 'Lundi 8H45 - 12H30 :
- Présenter chaque stagiaire avec leur parcours professionnel et leur projet
- Visiter le centre de formation
- Compte rendu des tests de positionnement
- Remise des documents pédagogiques
- Citer les composants du blé, de la farine du type et de sa force
- Nommer les 5 ingrédients de la pâte à pizza avec le poids par unité de calcul
12H30 - 13H00 : Pause repas
13H00 - 17H30 :
- Donner le taux d''hydratation en fonction du W de la farine
- Énumérer les différentes levures et comprendre leurs actions
- Indiquer les différentes matières grasses et leurs rôles
- Expliquer le rôle du sel en panification
- Calculer la température de base pour l''eau de coulage
- Fabriquer une pâte classique au pétrin pour 3 unités de calcul – Pointer, diviser, peser, bouler et bloquer
- Nettoyer son poste de travail et son matériel
Mardi 8H00 - 12H30 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Fabriquer la pâte individuellement avec adjonctions pour 4 unités de calcul
- Pointer diviser, peser, bloquer
- Effectuer les 1ers gestes d''étalage des pâtons de la veille
- Élaborer une sauce tomate
- Contrôler l''étiquetage avec DLC - DLUO
- Nettoyer son poste de travail
12H30 - 13H00 Pause repas dégustation
13H00 - 18H15 :
- Réaliser une pâte à pizza individuellement avec leur choix d''adjonction ou substitution – Peser, diviser, bouler et Bloquer
- Étaler la pâte individuellement
- Nettoyer son poste de travail et son matériel
- Les fondamentaux de la réglementation communautaire et nationale (restauration commerciale)
Mercredi 8H00 - 12H30 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Fabriquer une pâte imposée pour 4 unités de calcul avec adjonction de pâte fermentée
- Pointer-Diviser, peser, Bouler avec tests de rapidité-Bloquer
- Effectuer le travail de pelles pour enfourner et défourner
- Nettoyer son poste de travail
- Choisir les matières 1ères utilisées pour la réalisation des pizzas et savoir les disposer avant ou après la cuisson
12H30 - 13H00 Pause repas dégustation
13H00 - 18H15 :
- Décrire les différents matériels utilisés
- Étaler, garnir de sauce tomate, cuire les fonds de pâte.
- Fabriquer des calzones en effectuant le chiquetage, enfourner et cuire
- Réaliser et cuire des fonds tomatés
- Nettoyer le poste de travail et son matériel
- Les bonnes pratiques d''hygiène et instructions spécifiques
Jeudi 8H00 - 12H30 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-1)
- Allumer les fours
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Trancher les charcuteries
- Nettoyer, découper les légumes-Cuire des matières 1ères- Stocker au froid.
- Réaliser des pizzas classiques
- Nettoyer son poste de travail et le matériel
12H30 - 13H00 : Pause repas dégustation
13H00 - 18H00 :
- Analyser, commenter les différents empâtements réalisés sur le 1er et 2ème jour
- Réaliser des pizzas classiques, calzones
- Examiner et tester le stagiaire en situation réelle de fabrication de 3 pizzas de l''étalage à la cuisson (rapidité)
- Nettoyer le poste de travail et son matériel
- Plan de maîtrise sanitaire
Vendredi 8H00 - 12H30 :
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Gérer l''organisation en pizzeria – Accueil client
- Fabriquer une pizza traiteur en plaque par le formateur
- Examiner et tester le stagiaire en situation réelle de fabrication de 3 pizzas de l''étalage à la cuisson (rapidité)
12H30 - 13H00 Pause repas dégustation
13H00 - 15H15 :
- Vider tous les stocks de matières 1ères
- Mettre en bacs gastro
- Nettoyer le poste de travail, le matériel et l''espace de travail
- Évaluer la formation à chaud, évaluer les acquis par le(s) formateur(s), certificat de réalisation, remise de diplôme, photos.'
WHERE organization_id = @org_id AND code = 'NIV1H';

-- NAPO — Spécialisation Pizza Napolitaine
UPDATE training_program SET
  title = 'Spécialisation Pizza Napolitaine',
  days = 5, hours = 35, price = 1750.00,
  audience = 'Tout public 16 ans minimum',
  objective_general = 'Réaliser des pizzas napolitaines de l''élaboration de l''empâtement jusqu''à la sortie du four',
  objectives = '- Décrire l''histoire de la pizza Napolitaine et expliquer le dépôt de la marque auprès de la Commission Européenne Spécialité Traditionnelle Garantie par l''association VERACE PIZZA NAPOLETANA –
- Nommer les ingrédients de la pâte à pizza avec le poids par unité de calcul
- Réaliser le protocole de l''empâtement en maîtrisant la température en fin de pétrissage
- Énumérer les matières 1ères utilisées et leurs dosages pour la réalisation des pizzas « Margherita » et « Marinara »
- Peser les matières 1ères pour la pâte - Fabriquer individuellement plusieurs empâtements à la main et au pétrin
- Vérifier les températures à la fin du pétrissage
- Diviser, bouler, peser, stocker en bac
- Étaler les abaisses à la main Élaborer une sauce tomate Étaler, garnir de sauce tomate, cuire les fonds de pâte
- Réaliser des pizzas napolitaines
- Gérer la température des fours
- Effectuer le travail de pelles pour enfourner et défourner',
  duration_detail = 'Lundi 8h45-12h00 & 13h00 à 17h15
Mardi – Mercredi – Jeudi 8h00-12h00 & 13h00-16h30
Vendredi 8h00-12h00 & 13h00-14h00',
  program_detail = 'Lundi 8H45 - 12H00 :
- Présenter chaque stagiaire avec leur parcours professionnel et leur projet
- Visiter le centre de formation
- Compte rendu des tests de positionnement
- Remise des documents pédagogiques
- Différencier les dénominations In Teglia et Al Pala
- Sélectionner les farines adaptées et les ingrédients de la pâte
- Expliquer le protocole des 2 empâtements (direct et indirect)
- Donner Le taux d''hydratation
- Réaliser la 2ème phase de l''empâtement direct Teglia et/ou pala sur Biga 50% (1ère phase réalisé la veille par le formateur)
- Diviser, peser, bouler et stocker à température contrôlée
12H00 - 13H00 : Pause repas
13H00 - 17H15 :
- Réaliser la 2ème phase de la Teglia et/ou pala sur Biga 100 % (1ère phase réalisé la veille par le formateur)
- Diviser, peser, bouler et stocker à température contrôlée
- Élaborer la 1ère phase de la Teglia et/ou pala sur Biga 100 %
- Réaliser l''empâtement direct pour la Teglia et/ou pala
- Diviser, peser, bouler et stocker à température contrôlée
- Nettoyer le poste de travail, le matériel et l''espace de travail
Mardi 8H00 - 12H30 :
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Terminer la 2ème phase de l''empâtement de la Teglia et/ou pala sur Biga 100 %
- Diviser, peser, bouler les 2 empâtements (Teglia, Pala) stocker à température contrôlée
- Mettre sur plaque l''empâtement direct, garnir et cuire
12H30 - 13H00 : Pause repas
13H00 - 18H15 :
- Analyser les différents empâtements (l''alvéolage de la mie, la texture et le goût)
- Déposer sur plaque et sur pelle, garnir et cuire
- Nettoyer du poste de travail, le matériel et l''espace de travail
- Évaluer la formation à chaud par le stagiaire, évaluer les acquis par le(s) formateur(s), certificat de réalisation, remise de diplôme, photos.'
WHERE organization_id = @org_id AND code = 'NAPO';

-- TEGLIA — Spécialisation « In Teglia & In Pala »
UPDATE training_program SET
  title = 'Spécialisation « In Teglia & In Pala »',
  days = 2, hours = 14, price = 850.00,
  audience = 'Tout public 16 ans minimum',
  objective_general = 'Réaliser une pizza sur plaque « Spécialité Italienne » pour être vendue à la part',
  objectives = '- Réaliser l''empâtement direct et les empâtements indirects (50% et 100% Biga) 1ère phase & 2ème phase
- Contrôler la pousse
- Diviser, peser, bouler et bloquer la pâte
- Étaler les pâtons
- Mettre sur plaque ou sur pelle, garnir et cuire les 2 empâtements
- Découper la Teglia, la Pala
- Évaluer les différences entre les différents empâtements',
  duration_detail = 'Lundi 8h45-12h00 & 13h00 à 16h45
Mardi 8h00-12h00 & 13h00-16h00',
  program_detail = 'Lundi 8H45 - 12H00 :
- Présenter chaque stagiaire avec leur parcours professionnel et leur projet
- Visiter le centre de formation
- Compte rendu des tests de positionnement
- Remise des documents pédagogiques
- Différencier les dénominations In Teglia et Al Pala
- Sélectionner les farines adaptées et les ingrédients de la pâte
- Expliquer le protocole des 2 empâtements (direct et indirect)
- Donner Le taux d''hydratation
- Réaliser la 2ème phase de l''empâtement direct Teglia et/ou pala sur Biga 50% (1ère phase réalisé la veille par le formateur)
- Diviser, peser, bouler et stocker à température controlée
12H00 - 13H00 : Pause repas
13H00 - 16H45 :
- Réaliser la 2ème phase de la Teglia et/ou pala sur Biga 100 % (1ère phase réalisé la veille par le formateur)
- Diviser, peser, bouler et stocker à température controlée
- Élaborer la 1ère phase de la Teglia et/ou pala sur Biga 100 %
- Réaliser l''empâtement direct pour la Teglia et/ou pala
- Diviser, peser, bouler et stocker à température controlée
- Nettoyer le poste de travail, le matériel et l''espace de travail
Mardi 8H00 - 12H30 :
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Terminer la 2ème phase de l''empâtement de la Teglia et/ou pala sur Biga 100 %
- Diviser, peser, bouler les 2 empâtements (Teglia, Pala) stocker à température contrôlée
- Mettre sur plaque l''empâtement direct, garnir et cuire
12H30 - 13H00 : Pause repas
13H00 - 16H00 :
- Analyser les différents empâtements (l''alvéolage de la mie, la texture et le goût)
- Nettoyer du poste de travail, le matériel et l''espace de travail
- Évaluer la formation à chaud par le stagiaire, évaluer les acquis par le(s) formateur(s), certificat de réalisation, remise de diplôme, photos.'
WHERE organization_id = @org_id AND code = 'TEGLIA';

-- EXPERT — Spécialisation "Expert"
UPDATE training_program SET
  title = 'Spécialisation "Expert"',
  days = 4, hours = 32, price = 1650.00,
  audience = 'Personne ayant déjà effectué le niveau I ou niveau I PRO',
  objective_general = 'Réaliser des empâtements indirects «Poolish - Biga – Contemporaine - In Teglia - Al Pala» et un empâtement direct « In teglia - Al Pala »',
  objectives = '- Réaliser la 1ère phase et 2ème phase des empâtements indirects «Poolish - Biga - Contemporaine»
- Fabriquer les empâtements indirects (50% et 100% Biga) pour In Teglia - Al Pala 1ère et 2ème phase
- Élaborer l''empâtement direct «In Teglia - Al Pala»
- Contrôler la pousse
- Diviser, peser, bouler et bloquer la pâte
- Étaler les pâtons
- Réaliser des pizzas classiques et créatives
- Mettre sur plaque ou sur pelle, garnir et cuire les 2 empâtements «In Teglia - Al Pala»
- Découper la Teglia, la Pala
- Évaluer les différences entre les empâtements « Poolish - Biga - Contemporaine - In Teglia - Al Pala»',
  duration_detail = 'Lundi 8h45-12h00 & 13h00 à 17h15
Mardi 8h00-12h00 & 13h00-17h30
Mercredi 8h00-12h00 & 13h00-17h30
Jeudi 8h00-12h00 & 13h00-16h30',
  program_detail = 'Lundi 8H45 - 12H00 :
- Présenter chaque stagiaire avec leur parcours professionnel et leur projet
- Visiter le centre de formation
- Compte rendu des tests de positionnement
- Remise des documents pédagogiques
- Décrire la technique de l''empâtement indirect «Poolish» Élaborer la 2ème phase du Poolish (1ère phase préparée la veille par le formateur)
- Diviser, peser, bouler, bloquer
- Nettoyer son poste de travail et son matériel
12H00 - 13H00 : Pause repas
13H00 - 17H15 :
- Décrire la technique de l''empâtement indirect Biga 1ère et 2ème phase
- Élaborer la 2ème phase de la Biga (1ère phase préparée la veille par le formateur)
- Diviser, peser, bouler et bloquer les pâtons
- Réaliser les 2 empâtements 1ère phase du Poolish & Biga
- Élaborer un empâtement pour la pizza Contemporaine sur Biga 1ère phase (réalisé par le formateur)
- Réaliser la 1ère phase de l''empâtement indirect Teglia et/ou pala sur Biga 50%
- Nettoyer le poste de travail, le matériel et l''espace de travail
Mardi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire – suivi correction (Questions/réponses)
- Terminer les empâtements du Poolish et de la Biga (2ème phase)
- Finaliser la 2ème phase de l''empâtement de la pizza Contemporaine (réalisé par le formateur)
- Diviser, peser, bouler et bloquer les pâtons
- Nettoyer son poste de travail et son matériel
12h00 - 13h00 : Pause repas dégustation
13H00 - 17H30 :
- Observer et analyser le goût, l''alvéolage, le croustillant et le moelleux des 2 empâtements Poolish et Biga réalisés en amont par le formateur (48 h de maturation).
- Élaborer la 1ère phase de l''empâtement de la pizza contemporaine sur Biga
- Différencier les dénominations entre In Teglia et Pala
- Citer les ingrédients de l''empâtement Teglia et Pala
- Expliquer le protocole des 2 empâtements (direct et indirect)
- Donner Le taux d''hydratation
- Réaliser la 2ème phase de l''empâtement indirect Teglia et/ou pala sur Biga 50% (1ère phase réalisé la veille par le formateur)
- Diviser, peser, bouler et stocker à température controlée
- Élaborer la 1ère phase de la Teglia et/ou pala sur Biga 100 %
- Nettoyer son poste de travail et son matériel
Mercredi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire – suivi correction (Questions/réponses)
- Réaliser l''empâtement direct pour la Teglia et/ou pala
- Diviser, peser, bouler et stocker à température controlée
- Réaliser la 2ème phase de la Teglia et/ou pala sur Biga 100 % (1ère phase réalisé la veille par le formateur)
- Diviser, peser, bouler et stocker à température controlée
- Nettoyer le poste de travail, le matériel et l''espace de travail
12h00 - 13h00 : Pause repas dégustation
13H00 - 17H30 :
- Observer et analyser sur le goût, l''alvéolage, le croustillant et le moelleux de l''empâtement de la pizza contemporaine
- Appliquer les 1ères gestes pour la dépose sur plaque et sur pelle (In Teglia – Al Pala)
- Cuire les Teglias – Palas (sans garniture)
- Nettoyer le poste de travail, le matériel et l''espace de travail
Jeudi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire – suivi correction (Questions/réponses)
- Fabriquer des pizzas classiques et créatives sur les empâtements Poolish - Biga – Contemporaine avec des conseils sur des techniques culinaires
- Étaler sur plaque et sur pelle les Teglias et Palas
- Réaliser les cuissons avec la garniture
- Nettoyer le poste de travail, le matériel et l''espace de travail
12h00 - 13h00 : Pause repas dégustation
13H00 - 16H30 :
- Observer et analyser les différents empâtements (l''alvéolage de la mie, la texture et le goût) de la Teglia et de la Pala
- Étaler sur plaque et sur pelle les Teglias et Palas
- Réaliser les cuissons avec la garniture
- Nettoyer le poste de travail, le matériel et l''espace de travail
- Évaluer la formation à chaud par le stagiaire, évaluer les acquis par le(s) formateur(s), certificat de réalisation, remise de diplôme, photos.'
WHERE organization_id = @org_id AND code = 'EXPERT';

-- NIV2C — Pizzaïolo Niveau II – Empâtements Indirects «Poolish - Biga - Contemporaine»
UPDATE training_program SET
  title = 'Pizzaïolo Niveau II – Empâtements Indirects «Poolish - Biga - Contemporaine»',
  days = 3, hours = 21, price = 1180.00,
  audience = 'Personne ayant déjà effectué le niveau I - Pizza classique ou le niveau I Pro ou ayant acquis les bases théoriques de l''empâtement direct, la pratique du boulage et de l''étalage à la main.',
  objective_general = 'Réaliser des empâtements indirects « Poolish - Biga - Contemporaine »',
  objectives = '- Réaliser la 1ère phase et 2ème phase des empâtements indirects « Poolish - Biga - Contemporaine »
- Contrôler la pousse
- Diviser, peser, bouler et bloquer la pâte
- Étaler les pâtons
- Réaliser des pizzas classiques et créatives
- Évaluer les différences entre les empâtements « Poolish - Biga - Contemporaine »',
  duration_detail = 'Lundi 8h45-12h00 & 13h00 à 17h15
Mardi 8h00-12h00 & 13h00-17h00
Mercredi 8h00-12h00 & 13h00-14h30',
  program_detail = 'Lundi 8H45 - 12H00 :
- Présenter chaque stagiaire avec leur parcours professionnel et leur projet
- Visiter le centre de formation - Compte rendu des tests de positionnement - Remise des documents pédagogiques
- Décrire la technique de l''empâtement indirect «Poolish»
- Élaborer la 2ème phase du Poolish (1ère phase préparée la veille par le formateur)
- Diviser, peser, bouler, bloquer
- Nettoyer son poste de travail et son matériel
12H00 - 13H00 : Pause repas
13H00 - 17H15 :
- Réaliser la 2ème phase de la Teglia et/ou pala sur Biga 100 % (1ère phase réalisé la veille par le formateur)
- Diviser, peser, bouler et stocker à température controlée
- Élaborer la 1ère phase de la Teglia et/ou pala sur Biga 100 %
- Réaliser l''empâtement direct pour la Teglia et/ou pala
- Diviser, peser, bouler et stocker à température controlée
- Nettoyer le poste de travail, le matériel et l''espace de travail
Mardi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire – suivi correction (Questions/réponses)
- Terminer les empâtements du Poolish et de la Biga (2ème phase)
- Finaliser la 2ème phase de l''empâtement de la pizza contemporaine par le formateur
- Diviser, peser, bouler et bloquer les pâtons
- Nettoyer son poste de travail et son matériel
12H00 - 13H00 : Pause repas
13H00 - 17H00 :
- Observer et analyser le goût, l''alvéolage, le croustillant et le moelleux des 2 empâtements Poolish et Biga réalisés en amont par le formateur (48 h de maturation).
- Élaborer la 1ère phase de l''empâtement de la pizza contemporaine sur Biga
- Réaliser des pizzas classiques
Mercredi 8H00 - 12H15 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire – suivi correction (Questions/réponses)
- Terminer l''empâtement de la pizza contemporaine sur Biga (2ème phase)
- Diviser, peser, bouler et bloquer les pâtons
- Nettoyer son poste de travail et son matériel
12H15 - 13H45 : Pause repas dégustation
- Observer et analyser le goût, l''alvéolage, le croustillant et le moelleux des empâtements
13h45 à 14h30 :
- Évaluer la formation à chaud par le stagiaire, évaluer les acquis par le(s) formateur(s), certificat de réalisation, remise de diplôme, photos'
WHERE organization_id = @org_id AND code = 'NIV2C';

-- RS7404 — Fabriquer des pizzas artisanales RS7404
UPDATE training_program SET
  title = 'Fabriquer des pizzas artisanales RS7404',
  days = 5, hours = 35, price = 1750.00,
  audience = 'Professionnels du secteur
• boulangers, pâtissiers, charcutiers-traiteurs, crêpiers, cuisiniers,
• salariés ou indépendants évoluant en restauration traditionnelle, rapide ou ambulante,
• porteurs de projet de reconversion disposant d''un socle professionnel dans les métiers de bouche.
Le cas échéant, prérequis à la validation de la certification :
Candidature individuelle : Le candidat devra présenter une certification professionnelle relevant des métiers de bouche (type CAP, BEP, Titre professionnel) ou justifier d''une expérience professionnelle d''au moins 6 mois dans ce secteur (attestation d''employeur, certificat de travail…).',
  objective_general = 'Fabriquer des pizzas artisanales de l''élaboration de l''empâtement direct & semi-direct jusqu''à la présentation du produit fini.',
  objectives = '- Identifier et peser les ingrédients de base selon une recette donnée.
- Comprendre et appliquer les méthodes d''empâtement direct et semi-direct
- Réaliser un empâtement direct et semi-direct en respectant le temps de pétrissage et de pointage
- Expliquer les différences entre les 2 protocoles.
- Diviser, peser, bouler à la main l''empâtement en maîtrisant le geste technique pour obtenir des pâtons ronds et fermes.
- Étaler un pâton à la main de façon circulaire en conservant un rebord (corniche).
- Réaliser des pizzas artisanales en respectant l''ordre de montage et les grammages définis pour chaque ingrédient selon la fiche recette et en répartissant les éléments de manière esthétique et équilibrée.
- Utiliser la pelle de façon appropriée (enfournement, rotation, défournement).
- Contrôler la cuisson pour obtenir une base bien cuite, ni brûlée ni sous-cuite.
- Choisir le support adéquat (assiette, boîte, packaging) adapté aux standards de l''établissement (restauration sur place ou vente à emporter).
- Présenter une pizza propre et appétissante.
- Identifier les allergènes présents dans les recettes.
- Respecter les règles d''hygiène et de sécurité tout au long de la fabrication et identifier les allergènes contenus dans la pizza
Examen devant un jury
- Fabriquer l''empâtement
- Bouler 6 pâtons,
- Étaler et réaliser 3 pizzas suivi du dressage suivant le type de restauration en respectant les règles d''hygiène et de sécurité tout au long de la fabrication',
  duration_detail = 'Lundi 8h45-12h00 & 13h00 à 17h15
Mardi – Mercredi – Jeudi 8h00-12h00 & 13h00-16h30
Vendredi 8h00-12h00 & 13h00-14h00',
  program_detail = 'Lundi 8H45 - 12H00 :
- Présenter chaque stagiaire avec leur parcours professionnel et leur projet
- Visiter le centre de formation
- Compte rendu des tests de positionnement
- Remise des documents pédagogiques
- Citer les composants du blé, de la farine du type et de sa force
- Nommer les 5 ingrédients de la pâte à pizza avec le poids par unité de calcul
12H00 - 13H00 : Pause repas
13H00 - 17H15 :
- Donner le taux d''hydratation en fonction du W de la farine
- Énumérer les différentes levures et comprendre leurs actions
- Indiquer les différentes matières grasses et leurs rôles
- Expliquer le rôle du sel en panification
- Calculer la température de base pour l''eau de coulage
- Fabriquer une pâte classique au pétrin pour 3 unités de calcul – Pointer, diviser, peser, bouler et bloquer
- Nettoyer son poste de travail et son matériel
Mardi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Fabriquer la pâte individuellement avec adjonctions pour 4 unités de calcul
- Pointer diviser, peser, bloquer
- Effectuer les 1ers gestes d''étalage des pâtons de la veille
- Élaborer une sauce tomate
- Contrôler l''étiquetage avec DLC - DLUO
- Nettoyer son poste de travail
12H00 - 13H00 Pause repas dégustation
13H00 - 16H30 :
- Réaliser une pâte à pizza individuellement avec leur choix d''adjonction ou substitution – Peser, diviser, bouler et Bloquer
- Étaler la pâte individuellement
- Nettoyer son poste de travail et son matériel
Mercredi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-3)
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Fabriquer une pâte imposée pour 4 unités de calcul avec adjonction de pâte fermentée
- Pointer-Diviser, peser, Bouler avec tests de rapidité-Bloquer
- Effectuer le travail de pelles pour enfourner et défourner
- Nettoyer son poste de travail
- Choisir les matières 1ères utilisées pour la réalisation des pizzas et savoir les disposer avant ou après la cuisson
12H30 - 13H00 Pause repas dégustation
13H00 - 16H30 :
- Décrire les différents matériels utilisés
- Étaler, garnir de sauce tomate, cuire les fonds de pâte.
- Fabriquer des calzones en effectuant le chiquetage, enfourner et cuire
- Réaliser et cuire des fonds tomatés
- Nettoyer le poste de travail et son matériel
Jeudi 8H00 - 12H00 :
- Sortir les pâtons de la chambre froide pour futur étalage (h-1)
- Allumer les fours
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Trancher les charcuteries
- Nettoyer, découper les légumes
- Cuire des matières 1ères
- Stocker au froid.
- Réaliser des pizzas classiques
- Nettoyer son poste de travail et le matériel
12H30 - 13H00 Pause repas dégustation
13H00 - 16H30 :
- Analyser, commenter les différents empâtements réalisés sur le 1er et 2ème jour
- Réaliser des pizzas classiques, calzones
- Examiner et tester le stagiaire en situation réelle de fabrication de 3 pizzas de l''étalage à la cuisson (rapidité)
- Nettoyer le poste de travail et son matériel
Vendredi 8H00 - 12H00 :
- Contrôler les acquisitions de chaque stagiaire (Questions/réponses)
- Gérer l''organisation en pizzeria – Accueil client
- Fabriquer une pizza traiteur en plaque par le formateur
Examen devant jury
- Fabriquer l''empâtement
- Bouler 6 pâtons,
- Étaler et réaliser 3 pizzas suivi du dressage suivant le type de restauration en respectant les règles d''hygiène et de sécurité tout au long de la fabrication
12H00 - 13H00 Pause repas dégustation
13H00 - 14H00 :
- Vider tous les stocks de matières 1ères
- Mettre en bacs gastro
- Nettoyer le poste de travail, le matériel et l''espace de travail
- Évaluer la formation à chaud, évaluer les acquis par le(s) formateur(s), certificat de réalisation, remise de diplôme, photos.'
WHERE organization_id = @org_id AND code = 'RS7404';
