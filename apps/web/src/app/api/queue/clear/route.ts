import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/modules/auth/application/auth-service";
import { getPrisma } from "@/shared/lib/prisma";

const QUEUE_CLEAR_TOKEN_COOKIE = "mih_queue_clear_token";
const QUEUE_CLEAR_TOKEN_MAX_AGE_SECONDS = 10 * 60;

function isAdminSession(session: Awaited<ReturnType<typeof getCurrentSession>>): boolean {
  return Boolean(session && session.roles.includes("ADMIN"));
}

function createQueueClearToken() {
  return randomBytes(32).toString("base64url");
}

function setQueueClearTokenCookie(response: NextResponse, value: string) {
  response.cookies.set(QUEUE_CLEAR_TOKEN_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: QUEUE_CLEAR_TOKEN_MAX_AGE_SECONDS,
  });
}

function clearQueueClearTokenCookie(response: NextResponse) {
  response.cookies.set(QUEUE_CLEAR_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!pair) {
    return null;
  }

  const value = pair.slice(name.length + 1).trim();
  return value.length > 0 ? decodeURIComponent(value) : null;
}

function isMatchingToken(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

type AdminSessionResult =
  | { session: NonNullable<Awaited<ReturnType<typeof getCurrentSession>>>; response: null }
  | { session: null; response: NextResponse };

async function requireAdminSession(): Promise<AdminSessionResult> {
  const session = await getCurrentSession();

  if (!session) {
    return {
      session: null,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  if (!isAdminSession(session)) {
    return {
      session: null,
      response: NextResponse.json({ error: "Admin only" }, { status: 403 }),
    };
  }

  return { session, response: null };
}

export async function GET() {
  const { response } = await requireAdminSession();
  if (response) {
    return response;
  }

  const confirmationToken = createQueueClearToken();
  const nextResponse = NextResponse.json({ confirmationToken });
  setQueueClearTokenCookie(nextResponse, confirmationToken);

  return nextResponse;
}

export async function POST(request: Request) {
  const { session, response } = await requireAdminSession();
  if (response) {
    return response;
  }

  const body = (await request.json().catch(() => null)) as
    | { confirmationToken?: string }
    | null;
  const confirmationToken =
    typeof body?.confirmationToken === "string" ? body.confirmationToken.trim() : "";
  const cookieToken = getCookieValue(request.headers.get("cookie"), QUEUE_CLEAR_TOKEN_COOKIE) ?? "";

  if (!confirmationToken || !cookieToken || !isMatchingToken(cookieToken, confirmationToken)) {
    return NextResponse.json({ error: "Confirmation token invalid" }, { status: 403 });
  }

  const prisma = getPrisma();
  const clearedAt = new Date();
  const items = await prisma.contentItem.findMany({
    where: { deletedAt: null },
    select: { id: true, currentStatus: true },
  });

  if (items.length === 0) {
    const emptyResponse = NextResponse.json({ ok: true, clearedCount: 0 });
    clearQueueClearTokenCookie(emptyResponse);
    return emptyResponse;
  }

  const itemIds = items.map((item) => item.id);

  await prisma.$transaction(async (tx) => {
    await tx.contentItem.updateMany({
      where: { id: { in: itemIds } },
      data: { deletedAt: clearedAt },
    });

    await tx.designRequest.updateMany({
      where: { contentItemId: { in: itemIds }, deletedAt: null },
      data: { deletedAt: clearedAt },
    });

    await tx.contentAsset.updateMany({
      where: { contentItemId: { in: itemIds }, deletedAt: null },
      data: { deletedAt: clearedAt },
    });

    await tx.statusEvent.updateMany({
      where: { contentItemId: { in: itemIds }, deletedAt: null },
      data: { deletedAt: clearedAt },
    });

    await tx.workflowNote.updateMany({
      where: { contentItemId: { in: itemIds }, deletedAt: null },
      data: { deletedAt: clearedAt },
    });

    await tx.approvalRecord.updateMany({
      where: { contentItemId: { in: itemIds }, deletedAt: null },
      data: { deletedAt: clearedAt },
    });

    await tx.statusEvent.createMany({
      data: items.map((item) => ({
        contentItemId: item.id,
        fromStatus: item.currentStatus,
        toStatus: item.currentStatus,
        actorEmail: session.email,
        note: `QUEUE_CLEARED: queue cleared by ${session.email} at ${clearedAt.toISOString()}`,
      })),
    });
  });

  revalidatePath("/queue");

  console.info("[queue/clear] queue cleared", {
    actorEmail: session.email,
    clearedCount: items.length,
    clearedAt: clearedAt.toISOString(),
  });

  const nextResponse = NextResponse.json({ ok: true, clearedCount: items.length });
  clearQueueClearTokenCookie(nextResponse);
  return nextResponse;
}
