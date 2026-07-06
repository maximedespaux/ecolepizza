# 03 — Workflows & automatisations

Chaque transition déclenche les actions suivantes (point 17). Implémentation via
Server Actions + file d'événements (`WebhookEvent` / jobs).

```txt
Stagiaire créé
  → créer le dossier Drive (Documents formation/{annee}/SEM {n}/{NOM Prénom})
  → calculer le jeu de documents (templatesForFormation + règles)
  → générer le devis (choixDevis)

Devis signé
  → générer contrat/convention (choixContratConvention)
  → envoyer en signature

Contrat / convention signé
  → envoyer invitation/convocation (inclureConvocation)
  → créer l'événement Google Calendar de la session

Formation terminée
  → envoyer l'évaluation à chaud
  → générer le certificat de réalisation

+6 mois
  → envoyer l'évaluation à froid
```

## Choix des templates (résumé des règles, cf. `src/lib/documents/rules.ts`)

- **Devis** : RS7404 → « Devis RS7404 » ; sinon Particulier → « Devis Particulier » ; sinon « Devis Entreprise ».
- **Contrat vs Convention** : Particulier → Contrat ; Professionnel → Convention.
- **Émargement** : `Feuille d'émargement {jours}J` (ou `5J + hygiène` si NIV1H).
- **Convocation** : RS7404 → Convocation examen ; sinon Invitation.
