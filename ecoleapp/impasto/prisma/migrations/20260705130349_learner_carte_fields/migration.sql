-- AlterTable
ALTER TABLE "Learner" ADD COLUMN     "aRecontacter" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anneeRealisee" TEXT,
ADD COLUMN     "departement" TEXT,
ADD COLUMN     "entrepriseNom" TEXT,
ADD COLUMN     "importSource" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "niveauRealise" TEXT;
