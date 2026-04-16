import Link from "next/link";
import { Download, FileText, PanelsTopLeft, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { UserSession } from "@/modules/auth/domain/session";

const navigation = [
  { href: "/queue", label: "Queue", icon: FileText },
  { href: "/import", label: "Import", icon: Download },
  {
    href: "/templates",
    label: "Templates",
    icon: PanelsTopLeft,
    disabled: true,
  },
  { href: "/settings", label: "Settings", icon: Settings2, disabled: true },
];

export function AppShell({
  children,
  session,
}: Readonly<{
  children: React.ReactNode;
  session: UserSession;
}>) {
  return (
    <div className="relative min-h-screen" style={{ backgroundColor: "#F0F4F8" }}>
      <div className="relative mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="hidden border-r border-slate-200 bg-white px-4 py-5 lg:flex lg:flex-col shadow-sm">
          {/* Brand */}
          <div className="space-y-3 pb-5 border-b border-slate-100">
            <Badge
              className="w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium hover:bg-slate-50"
              style={{ color: "#64748B" }}
            >
              Pipeline #1
            </Badge>
            <div>
              <h1 className="text-[15px] font-semibold tracking-tight leading-snug" style={{ color: "#0F172A" }}>
                Marketing Intelligence Hub
              </h1>
            </div>
          </div>

          {/* Nav */}
          <nav className="mt-4 flex flex-1 flex-col gap-1">
            {navigation.map(({ href, label, icon: Icon, disabled }) => (
              <Link
                key={href}
                href={disabled ? "#" : href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-default",
                  disabled
                    ? "cursor-not-allowed text-slate-300"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            ))}
          </nav>

          {/* User card */}
          <div
            className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: "#94A3B8" }}>
                Signed in
              </p>
              <Badge
                variant="outline"
                className="rounded-full border-slate-200 bg-white px-2 py-0 text-[10px]"
                style={{ color: "#64748B" }}
              >
                {session.mode === "iap" ? "IAP" : "Dev"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-semibold truncate" style={{ color: "#0F172A" }}>
                {session.name ?? session.email}
              </p>
              <p className="text-xs truncate mt-0.5" style={{ color: "#64748B" }}>
                {session.email}
              </p>
            </div>
            <p className="text-[11px] leading-5" style={{ color: "#94A3B8" }}>
              Roles:{" "}
              {session.roles.length > 0
                ? session.roles.join(", ")
                : "Awaiting assignment"}
            </p>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="border-b border-slate-200/80 bg-white/80 px-4 py-2.5 backdrop-blur md:px-5 lg:px-6">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs" style={{ color: "#94A3B8" }}>
                Google Sheets → Platform → Canva → LinkedIn
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-200 bg-transparent px-2.5 py-0.5 text-[11px]"
                  style={{ color: "#94A3B8" }}
                >
                  Protected internal surface
                </Badge>
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 md:px-6 lg:px-8 lg:py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
