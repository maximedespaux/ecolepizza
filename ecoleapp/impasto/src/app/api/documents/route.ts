import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const enrollmentId = req.nextUrl.searchParams.get("enrollmentId");
  if (!enrollmentId) return NextResponse.json({ error: "enrollmentId requis" }, { status: 400 });
  const data = await prisma.generatedDocument.findMany({
    where: { enrollmentId },
    orderBy: { numberPrefix: "asc" },
  });
  return NextResponse.json({ data });
}
