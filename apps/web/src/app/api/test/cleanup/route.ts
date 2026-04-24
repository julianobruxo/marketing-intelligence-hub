import { NextResponse } from "next/server";
import { cleanupE2eData } from "@/modules/testing/e2e-seed";

function isTestOnly() {
  return process.env.NODE_ENV !== "production";
}

export async function POST() {
  if (!isTestOnly()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result = await cleanupE2eData();
  return NextResponse.json({ ok: true, ...result });
}
