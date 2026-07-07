// GET /api/documents/[id]/download
// Rend le vrai document Word rempli (modèle École Pizza + données du dossier)
// et le renvoie en téléchargement (.docx). PDF possible plus tard via Gotenberg.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { renderDocx, docxToPdf, gotenbergAvailable } from "@/lib/documents/generate";
import { templateFileFor, templateExists, loadTemplate } from "@/lib/documents/template-files";
import { assembleVariables, type Financement } from "@/lib/documents/rules";
import { ECOLE_PIZZA } from "@/lib/ecole-pizza/organisme";
import { saveFile, readFile, documentKey, signedKey } from "@/lib/storage/local";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const doc = await prisma.generatedDocument.findUnique({
    where: { id },
    include: {
      enrollment: {
        include: {
          learner: { include: { company: true } },
          session: { include: { program: true } },
        },
      },
    },
  });
  if (!doc || !doc.enrollment) return NextResponse.json({ error: "Document introuvable" }, { status: 404 });

  // Contrôle d'accès étudiant : si un learnerId est fourni (espace stagiaire),
  // on vérifie la PROPRIÉTÉ et la COMPLÉTUDE du dossier côté serveur (pas juste l'UI).
  // Les admins (page Documents) n'envoient pas ce paramètre → accès complet.
  const asLearner = _req.nextUrl.searchParams.get("learnerId");
  if (asLearner) {
    if (doc.enrollment.learner.id !== asLearner) {
      return NextResponse.json({ error: "Ce document ne vous appartient pas." }, { status: 403 });
    }
    const dossierComplet = doc.enrollment.devisSigne && doc.enrollment.acompteRecu;
    // Les documents à signer pour débloquer restent accessibles même dossier incomplet.
    const aSigner = doc.type === "DEVIS" || doc.type === "DROIT_IMAGE";
    // Le certificat a sa propre condition (obtenu = signé/archivé).
    const certifOk = doc.type !== "CERTIFICAT_REALISATION" || doc.status === "SIGNE" || doc.status === "ARCHIVE";
    if (!aSigner && (!dossierComplet || !certifOk)) {
      return NextResponse.json({ error: "Dossier incomplet : signez votre devis et attendez la validation de l'acompte." }, { status: 403 });
    }
  }

  // PDF signé (document + attestation) rangé lors de la signature.
  if (_req.nextUrl.searchParams.get("signed") === "1") {
    const signed = readFile(signedKey(doc.organizationId, doc.enrollmentId, doc.id));
    if (!signed) return NextResponse.json({ error: "PDF signé indisponible (document non signé ou moteur PDF absent lors de la signature)." }, { status: 404 });
    const disp = _req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";
    return new NextResponse(new Uint8Array(signed), {
      status: 200,
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `${disp}; filename*=UTF-8''${encodeURIComponent(doc.type + "-signe.pdf")}` },
    });
  }

  const program = doc.enrollment.session.program;
  const filename = templateFileFor(doc.type, {
    financement: doc.enrollment.financement,
    rsCode: program.rsCode,
    jours: program.jours,
    hygiene: program.hygiene,
  });
  if (!filename || !templateExists(filename)) {
    return NextResponse.json({ error: `Aucun modèle disponible pour « ${doc.type} »` }, { status: 404 });
  }

  // Données de fusion recalculées EN DIRECT depuis le dossier (toujours à jour,
  // contrairement au mergeData figé enregistré à la création du document).
  const l = doc.enrollment.learner;
  const merge = assembleVariables({
    organisme: ECOLE_PIZZA,
    stagiaire: {
      civilite: l.civilite, nom: l.nom, prenom: l.prenom,
      adresse: l.adresse, codePostal: l.codePostal, ville: l.ville,
      telephone: l.telephone, email: l.email, dateNaissance: l.dateNaissance,
      financement: doc.enrollment.financement as Financement,
    },
    formation: {
      code: program.code, titre: program.titre, jours: program.jours, heures: program.heures,
      prix: Number(program.prix), public: program.public ?? undefined, objectifs: program.objectifs ?? undefined,
      deroule: program.deroule ?? undefined, dureeDetail: program.dureeDetail ?? undefined,
      hygiene: program.hygiene, rsCode: program.rsCode,
    },
    entreprise: l.company
      ? { nom: l.company.nom, siret: l.company.siret, civRepresentant: l.company.civRepresentant, nomRepresentant: l.company.nomRepresentant }
      : null,
    annee: doc.enrollment.session.annee,
    semaine: doc.enrollment.session.semaine,
  });

  let rendered: Buffer;
  try {
    rendered = renderDocx(loadTemplate(filename), merge as unknown as Record<string, unknown>);
  } catch (e) {
    return NextResponse.json({ error: "Rendu du document impossible", detail: String(e) }, { status: 500 });
  }

  // Range toujours le DOCX rendu dans le stockage de l'application.
  const docxK = documentKey(doc.organizationId, doc.enrollmentId, doc.id, "docx");
  saveFile(docxK, rendered);
  if (doc.docxKey !== docxK) await prisma.generatedDocument.update({ where: { id }, data: { docxKey: docxK } });

  const base = `${doc.numberPrefix ? doc.numberPrefix + ". " : ""}${doc.type} - ${program.titre} - ${l.nom}${l.prenom ? " " + l.prenom : ""}`;
  const wantPdf = _req.nextUrl.searchParams.get("format") === "pdf";

  if (wantPdf) {
    const pdfK = documentKey(doc.organizationId, doc.enrollmentId, doc.id, "pdf");
    let pdf = readFile(pdfK); // cache
    if (!pdf) {
      if (!(await gotenbergAvailable())) {
        return NextResponse.json(
          { error: "Moteur PDF hors ligne. Démarrez OrbStack puis « docker compose up -d gotenberg »." },
          { status: 503 },
        );
      }
      try {
        pdf = await docxToPdf(rendered, base + ".docx");
        saveFile(pdfK, pdf);
        await prisma.generatedDocument.update({ where: { id }, data: { pdfKey: pdfK } });
      } catch (e) {
        return NextResponse.json({ error: "Conversion PDF impossible", detail: String(e) }, { status: 502 });
      }
    }
    // inline=1 → affichage dans le navigateur ; sinon téléchargement.
    const disposition = _req.nextUrl.searchParams.get("inline") === "1" ? "inline" : "attachment";
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(base + ".pdf")}`,
      },
    });
  }

  return new NextResponse(new Uint8Array(rendered), {
    status: 200,
    headers: {
      "Content-Type": DOCX_MIME,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(base + ".docx")}`,
    },
  });
}
