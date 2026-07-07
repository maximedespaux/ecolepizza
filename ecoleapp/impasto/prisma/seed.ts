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
import { imageForCode } from "../src/lib/ecole-pizza/assets";

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

  // 3) Catalogue des formations (ordre = position dans le catalogue ; image par code)
  for (let i = 0; i < FORMATIONS.length; i++) {
    const f = FORMATIONS[i];
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
        ordre: i, image: imageForCode(f.code),
      },
    });
  }

  // 4) Démo : une session RS7404 SEM 38 + un stagiaire inscrit (idempotent).
  const rs = await prisma.trainingProgram.findUnique({
    where: { organizationId_code: { organizationId: org.id, code: "RS7404" } },
  });
  const demoExists = rs
    ? await prisma.trainingSession.findFirst({ where: { organizationId: org.id, programId: rs.id, annee: 2026, semaine: 38 } })
    : true;
  if (rs && !demoExists) {
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

  // 6) Comptabilité — dépenses & produits de démonstration (module A)
  if ((await prisma.expense.count({ where: { organizationId: org.id } })) === 0) {
    const annee = new Date().getFullYear();
    const d = (mois: number, jour: number) => new Date(Date.UTC(annee, mois, jour));
    await prisma.expense.createMany({
      data: [
        { organizationId: org.id, date: d(0, 15), categorie: "MATIERES_PREMIERES", libelle: "Farines & mozzarella (Le 5 Stagioni)", montantHT: 4200 },
        { organizationId: org.id, date: d(1, 5), categorie: "SALAIRES", libelle: "Salaires & charges T1", montantHT: 12000 },
        { organizationId: org.id, date: d(2, 1), categorie: "LOYER", libelle: "Loyer atelier Lannemezan (trimestre)", montantHT: 3600 },
        { organizationId: org.id, date: d(1, 20), categorie: "MARKETING", libelle: "Campagne Meta + flyers", montantHT: 1800 },
        { organizationId: org.id, date: d(2, 10), categorie: "ENERGIE", libelle: "Électricité & gaz (fours)", montantHT: 1400 },
        { organizationId: org.id, date: d(0, 30), categorie: "DIVERS", libelle: "Assurance & fournitures", montantHT: 900 },
      ],
    });
  }
  if ((await prisma.revenueExtra.count({ where: { organizationId: org.id } })) === 0) {
    await prisma.revenueExtra.create({
      data: { organizationId: org.id, date: new Date(Date.UTC(new Date().getFullYear(), 1, 28)), categorie: "COMMISSION", libelle: "Commission apporteur four Gi.Metal", montant: 650 },
    });
  }

  console.log(
    "✅ Seed terminé : organisme + " + FORMATIONS.length + " formations + " +
    PARTENAIRES.length + " partenaires + compta de démo."
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
