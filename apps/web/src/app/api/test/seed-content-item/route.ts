import { NextRequest, NextResponse } from "next/server";
import { cleanupE2eData, seedContentItem, type E2eSeedKind } from "@/modules/testing/e2e-seed";

const VALID_KINDS = new Set<E2eSeedKind>([
  "canva-ready",
  "nb-ready",
  "design-ready-canva",
  "design-ready-nb",
  "design-failed-canva",
  "design-failed-exhausted-canva",
  "ready-to-post",
]);

function isTestOnly() {
  return process.env.NODE_ENV !== "production";
}

export async function POST(request: NextRequest) {
  if (!isTestOnly()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { kind?: string } | null;
  const kind = typeof body?.kind === "string" ? body.kind.trim() : "";

  if (!VALID_KINDS.has(kind as E2eSeedKind)) {
    return NextResponse.json(
      {
        error: `Invalid seed kind. Valid values: ${Array.from(VALID_KINDS).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const item = await seedContentItem(kind as E2eSeedKind);
  return NextResponse.json({ ok: true, item });
}

export async function DELETE() {
  if (!isTestOnly()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await cleanupE2eData();
  return NextResponse.json({ ok: true, ...result });
}
