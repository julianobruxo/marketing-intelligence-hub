import { NextResponse } from "next/server";
import { getPrisma } from "@/shared/lib/prisma";

export async function GET() {
  try {
    const prisma = getPrisma();
    const result = await prisma.$queryRaw`SELECT 1 as "connected"`;
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    console.error("API error connecting to DB:", error.message);
    return NextResponse.json({ success: false, error: error.message, stack: error.stack }, { status: 500 });
  }
}
