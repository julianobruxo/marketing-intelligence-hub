import { NextResponse } from "next/server";
import { getPrisma } from "@/shared/lib/prisma";

export async function GET() {
  try {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw`SELECT 1 as "connected"`;
    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("API error connecting to DB:", message);
    return NextResponse.json(
      { success: false, error: "Database connection failed." },
      { status: 500 },
    );
  }
}
