import { getCurrentSession } from "@/modules/auth/application/auth-service";

export async function getActorEmail(fallback = "system"): Promise<string> {
  try {
    const session = await getCurrentSession();
    return session?.email ?? fallback;
  } catch {
    return fallback;
  }
}
