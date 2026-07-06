# 06 — Suivi Qualiopi

Pour chaque session/dossier, suivre les pièces (`QualiopiEvidence`) :

programme transmis · devis signé · contrat/convention signé · convocation envoyée ·
test de positionnement · droit à l'image · émargement · évaluation à chaud ·
évaluation à froid · certificat de réalisation · preuves financeur · réclamations ·
indicateurs qualité.

## Score de conformité (`ConformiteScore` sur `Enrollment`)

- **VERT** : dossier complet.
- **ORANGE** : pièces manquantes non bloquantes.
- **ROUGE** : pièces obligatoires manquantes.

Calcul : un service parcourt les `QualiopiEvidence` requises selon la formation
(hygiène, certifiante…) et met à jour le score à chaque changement de statut
documentaire. Export audit = liste des preuves + liens Drive.
