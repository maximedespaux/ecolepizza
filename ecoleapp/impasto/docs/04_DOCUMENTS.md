# 04 — Génération documentaire

## Pipeline

1. `assembleVariables()` construit la table `{ Jeton: valeur }` (équivalent de la
   feuille « Convert Data ») à partir de l'organisme, du stagiaire, de la
   formation, de la session et de l'entreprise.
2. `renderDocx(templateBuffer, mergeData)` remplit le `.docx` via **docxtemplater**
   (délimiteurs `{ }`).
3. `docxToPdf(docx)` convertit en PDF via **Gotenberg** (LibreOffice headless).
4. Le fichier est nommé (`buildFileName`) et classé (`buildDrivePath`), puis
   enregistré comme `GeneratedDocument` (statut `GENERE`).

## Jetons supportés (orthographe exacte des templates)

```
{Personne} {Adresse} {Téléphone} {Email}
{Semaine de la formation} {Niveau suggérer} {Date} {endDate} {Today}
{Heures} {Jours} {DuréeDétail} {Déroulé} {Objectifs} {ObjectifG} {Public}
{Prix} {Offre} {Acompte}
{Nom entreprise} {Siret} {Civ représentant} {Nom représentant}
{D_Naissance}
```

> ⚠️ Conserver l'orthographe d'origine (`Niveau suggérer`, `Siret` sans accent) :
> ce sont les clés réelles présentes dans les `.docx`.

## Templates (registre : `src/lib/documents/templates.ts`)

24 modèles regroupés par type (Devis ×3, Contrat/Convention ×3, Convocation,
Invitation, Droit image, Émargement ×5, Attestation hygiène, Certificat, CGV,
Fiche semaine, Évaluations…). Chaque entrée porte ses fichiers, ses jetons, et,
si signable, les signataires + niveau + mode OTP par défaut.

## Classement des sorties

```
Documents formation/{annee}/SEM {semaine}/{NOM Prénom}/{num}. {Type}.pdf
```
