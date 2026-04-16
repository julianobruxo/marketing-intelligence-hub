import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/application/auth-service";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCurrentSession();

  redirect(session ? "/queue" : "/login");
}
