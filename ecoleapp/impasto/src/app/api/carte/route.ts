// GET /api/carte — données allégées des stagiaires géolocalisés pour la carte.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const data = await prisma.learner.findMany({
    where: { organizationId: "org-ecole-pizza", lat: { not: null } },
    select: {
      id: true, nom: true, ville: true, codePostal: true, departement: true,
      lat: true, lng: true, niveauRealise: true, anneeRealisee: true,
      entrepriseNom: true, telephone: true, email: true, statut: true, aRecontacter: true,
    },
    orderBy: { nom: "asc" },
  });
  return NextResponse.json({ data });
}
