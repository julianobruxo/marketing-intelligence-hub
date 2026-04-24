import Image from "next/image";
import Link from "next/link";
import { Download, FileText, PanelsTopLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserSession } from "@/modules/auth/domain/session";
import { UserMenu } from "./user-menu";

const navigation = [
  { href: "/queue", label: "Queue", icon: FileText },
  { href: "/import", label: "Import", icon: Download },
  { href: "/templates", label: "Templates", icon: PanelsTopLeft, disabled: true },
];

export function AppShell({
  children,
  session,
}: Readonly<{
  children: React.ReactNode;
  session: UserSession;
}>) {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: "var(--page-bg)" }}>
      <div className="relative mx-auto grid min-h-screen max-w-[1640px] lg:grid-cols-[258px_minmax(0,1fr)]">
        <aside
          className="hidden border-r lg:flex lg:flex-col"
          style={{ background: "var(--shell-bg)", borderColor: "var(--shell-border)" }}
        >
          <div className="border-b px-4 py-4" style={{ borderColor: "var(--shell-subtle-border)" }}>
            <div className="rounded-[16px] border border-white/10 bg-[#070B1B] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <Image
                src="/logo.jpeg"
                alt="Zazmic"
                width={190}
                height={80}
                className="h-8 w-auto"
                priority
              />
            </div>
            <h1 className="mt-4 text-[29px] leading-none font-semibold tracking-[-0.04em] text-slate-950 dark:text-slate-100">
              Marketing Intelligence Hub
            </h1>
          </div>

          <nav className="mt-3 flex flex-1 flex-col gap-1.5 px-3 pb-4">
            {navigation.map(({ href, label, icon: Icon, disabled }) => (
              <Link
                key={href}
                href={disabled ? "#" : href}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[18px] font-medium transition-default",
                  disabled
                    ? "cursor-not-allowed border-transparent text-slate-400/70 opacity-40"
                    : "border-transparent text-[#466697] hover:border-sky-200/65 hover:bg-white/55 hover:text-[#213565] hover:shadow-[0_12px_24px_-20px_rgba(10,102,194,0.42)] dark:text-[#8FA2C8] dark:hover:border-[rgba(124,132,252,0.25)] dark:hover:bg-[rgba(98,104,191,0.12)] dark:hover:text-slate-100 dark:hover:shadow-[0_12px_24px_-20px_rgba(90,102,230,0.6)]",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-col">
          <header
            className="sticky top-0 z-30 border-b px-4 py-3 backdrop-blur-xl md:px-5 lg:px-6"
            style={{
              background: "var(--shell-header-bg)",
              borderColor: "var(--shell-border)",
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium tracking-[-0.01em] text-[#6A8EC6] dark:text-[#7C8FB5]">
                Google Drive → Staging → Workflow Queue
              </p>
              <UserMenu session={session} />
            </div>
          </header>

          <main className="flex-1 px-4 py-4 md:px-6 lg:px-8 lg:py-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
