import { requireSession } from "@/modules/auth/application/auth-service";
import { AppShell } from "@/shared/ui/app-shell";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await requireSession();

  return <AppShell session={session}>{children}</AppShell>;
}
