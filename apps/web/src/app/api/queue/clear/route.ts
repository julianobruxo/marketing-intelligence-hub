import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/shared/lib/prisma";
import { getCurrentSession } from "@/modules/auth/application/auth-service";

export async function POST(request: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const prisma = getPrisma();
  await prisma.contentItem.deleteMany({
    where: {},
  });

  revalidatePath("/queue");

  return NextResponse.json({ ok: true });
}
