// Visuels des niveaux de formation (dossier public/ecole/).
// Sert de valeur par défaut : chaque formation stocke son image en base (éditable),
// et retombe sur ce mapping par code si aucune image n'est renseignée.

export const LEVEL_IMAGES: Record<string, string> = {
  NIV1: "/ecole/niv1.jpg",
  NIV1H: "/ecole/niv1.jpg",
  NIV1PRO: "/ecole/niv1pro.jpg",
  NIV2: "/ecole/niv2.jpg",
  NIV2C: "/ecole/niv2.jpg",
  NAPO: "/ecole/napo.jpg",
  TEGLIA: "/ecole/teglia.jpg",
  RS7404: "/ecole/rs.jpg",
};

// Liste proposée dans le sélecteur d'image du formulaire Formation.
export const LEVEL_IMAGE_CHOICES = [
  { value: "/ecole/niv1.jpg", label: "Niveau I" },
  { value: "/ecole/niv1pro.jpg", label: "Niveau I Pro" },
  { value: "/ecole/niv2.jpg", label: "Niveau II" },
  { value: "/ecole/napo.jpg", label: "Napolitaine" },
  { value: "/ecole/teglia.jpg", label: "In Teglia & Pala" },
  { value: "/ecole/rs.jpg", label: "RS7404 (certifiante)" },
  { value: "/ecole/hero.jpg", label: "Générique atelier" },
];

export const imageForCode = (code: string | null | undefined): string | null =>
  (code ? LEVEL_IMAGES[code.toUpperCase()] : null) ?? null;
