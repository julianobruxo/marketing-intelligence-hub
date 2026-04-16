import Link from "next/link";
import { FileText, PanelsTopLeft, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { UserSession } from "@/modules/auth/domain/session";

const navigation = [
  { href: "/queue", label: "Queue", icon: FileText },
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
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f4f7fb_0%,#edf2f7_100%)] text-slate-950">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top_left,rgba(71,96,135,0.08),transparent_52%),radial-gradient(circle_at_top_right,rgba(120,144,182,0.08),transparent_44%)]" />
      <div className="relative mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200/80 bg-white/60 px-4 py-5 backdrop-blur lg:flex lg:flex-col">
          <div className="space-y-3">
            <Badge className="w-fit rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50">
              Pipeline #1
            </Badge>
            <div className="space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">
                Marketing Intelligence Hub
              </h1>
              <p className="text-sm leading-5 text-slate-600">
                Internal operating surface for review, approvals, design
                handoffs, and publish readiness.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-[20px] border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Current surface
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              Queue and workbench
            </p>
            <p className="mt-1.5 text-sm leading-5 text-slate-600">
              Workflow state lives here after import.
            </p>
          </div>

          <nav className="mt-6 flex flex-1 flex-col gap-1.5">
            {navigation.map(({ href, label, icon: Icon, disabled }) => (
              <Link
                key={href}
                href={disabled ? "#" : href}
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl border px-3.5 py-2.5 text-sm font-medium transition",
                  disabled
                    ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
                    : "border-slate-200/90 bg-white/90 text-slate-900 hover:border-slate-300 hover:bg-white",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="space-y-2.5 rounded-[20px] border border-slate-200 bg-white/85 p-3.5 shadow-[0_16px_36px_rgba(15,23,42,0.04)]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Signed in
              </p>
              <Badge
                variant="outline"
                className="rounded-full border-slate-300 bg-slate-50 px-2.5 py-0.5 text-[11px] text-slate-700"
              >
                {session.mode === "iap" ? "IAP" : "Dev"}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {session.name ?? session.email}
              </p>
              <p className="mt-1 text-sm text-slate-600">{session.email}</p>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              Roles:{" "}
              {session.roles.length > 0
                ? session.roles.join(", ")
                : "Awaiting assignment"}
            </p>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="border-b border-slate-200/80 bg-white/70 px-4 py-3 backdrop-blur md:px-5 lg:px-6">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Google Sheets -&gt; Zapier/n8n -&gt; Platform -&gt; Canva
                  -&gt; LinkedIn
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Workflow state lives here after import. Automation boundaries
                  stay explicit.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-300 bg-white px-3 py-1 text-slate-700"
                >
                  Protected internal surface
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded-full border-slate-300 bg-white px-3 py-1 text-slate-700"
                >
                  {session.mode === "iap"
                    ? "IAP identity"
                    : "Development identity"}
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
