import { redirect } from "next/navigation";
import { getPrisma } from "@/shared/lib/prisma";
import { getRequestIdentity } from "../infrastructure/session-source";
import type { UserSession } from "../domain/session";

export async function getCurrentSession(): Promise<UserSession | null> {
  const identity = await getRequestIdentity();

  if (!identity) {
    return null;
  }

  const user = await getPrisma().user.findUnique({
    where: { email: identity.email },
    include: { roles: true },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return {
    ...identity,
    name: user.name ?? undefined,
    roles: user.roles.map(({ role }) => role),
  };
}

export async function requireSession() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}
