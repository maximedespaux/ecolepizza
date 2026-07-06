// Seed de la base : crée l'organisme École Pizza, le catalogue des 9 formations,
// un compte secrétariat, et quelques stagiaires/sessions de démonstration (repris
// des dossiers réels SEM 38/43/50/51).
//
//   npm run db:seed
//
import { PrismaClient } from "@prisma/client";
import { ECOLE_PIZZA } from "../src/lib/ecole-pizza/organisme";
import { FORMATIONS } from "../src/lib/ecole-pizza/catalogue";
import { PARTENAIRES } from "../src/lib/ecole-pizza/partenaires";

const prisma = new PrismaClient();

async function main() {
  // 1) Organisme
  const org = await prisma.organization.upsert({
    where: { id: "org-ecole-pizza" },
    update: {},
    create: {
      id: "org-ecole-pizza",
      raisonSociale: ECOLE_PIZZA.raisonSociale,
      sigle: ECOLE_PIZZA.sigle,
      responsable: ECOLE_PIZZA.responsable,
      siret: ECOLE_PIZZA.siret,
      nda: ECOLE_PIZZA.nda,
      nafApe: ECOLE_PIZZA.nafApe,
      adresse: ECOLE_PIZZA.adresse,
      codePostal: ECOLE_PIZZA.codePostal,
      ville: ECOLE_PIZZA.ville,
      telephone: ECOLE_PIZZA.telephone,
      email: ECOLE_PIZZA.email,
      qualiopi: ECOLE_PIZZA.qualiopi,
      juridiction: ECOLE_PIZZA.juridiction,
    },
  });

  // 2) Compte secrétariat (admin)
  await prisma.user.upsert({
    where: { email: "contact@ecole-pizza.com" },
    update: {},
    create: {
      email: "contact@ecole-pizza.com",
      name: "Maxime Despaux",
      role: "ADMIN_ORGANISME",
      organizationId: org.id,
    },
  });

  // 3) Catalogue des formations
  for (const f of FORMATIONS) {
    await prisma.trainingProgram.upsert({
      where: { organizationId_code: { organizationId: org.id, code: f.code } },
      update: {
        titre: f.titre, jours: f.jours, heures: f.heures, prix: f.prix,
        public: f.public, objectifs: f.objectifs, hygiene: f.hygiene, rsCode: f.rsCode,
      },
      create: {
        organizationId: org.id,
        code: f.code, titre: f.titre, jours: f.jours, heures: f.heures, prix: f.prix,
        public: f.public, objectifs: f.objectifs, hygiene: f.hygiene, rsCode: f.rsCode,
      },
    });
  }

  // 4) Démo : une session RS7404 SEM 38 + un stagiaire inscrit
  const rs = await prisma.trainingProgram.findUnique({
    where: { organizationId_code: { organizationId: org.id, code: "RS7404" } },
  });
  if (rs) {
    const session = await prisma.trainingSession.create({
      data: {
        organizationId: org.id, programId: rs.id, annee: 2026, semaine: 38,
        status: "PLANIFIEE",
      },
    });
    const learner = await prisma.learner.create({
      data: {
        organizationId: org.id, civilite: "Madame", nom: "JOFFRE", prenom: "Élodie",
        ville: "Auch", financement: "PROFESSIONNEL", email: "elodie.joffre@email.fr",
      },
    });
    await prisma.enrollment.create({
      data: {
        learnerId: learner.id, sessionId: session.id,
        financement: "PROFESSIONNEL", prix: rs.prix, crmStage: "INSCRIT",
      },
    });
  }

  // 5) Partenaires commerciaux
  for (const p of PARTENAIRES) {
    const existing = await prisma.partner.findFirst({
      where: { organizationId: org.id, nom: p.nom },
    });
    if (!existing) {
      await prisma.partner.create({
        data: { organizationId: org.id, nom: p.nom, categorie: p.categorie },
      });
    }
  }

  console.log(
    "✅ Seed terminé : organisme + " + FORMATIONS.length + " formations + " +
    PARTENAIRES.length + " partenaires."
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
