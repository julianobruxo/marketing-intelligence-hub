import type { UserSession } from "@/modules/auth/domain/session";
import { SidebarNav } from "./sidebar-nav";
import { UserMenu } from "./user-menu";

export function AppShell({
  children,
  session,
}: Readonly<{
  children: React.ReactNode;
  session: UserSession;
}>) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative mx-auto grid min-h-screen max-w-[1640px] lg:grid-cols-[258px_minmax(0,1fr)]">
        <aside
          className="hidden border-r lg:flex lg:flex-col"
          style={{ background: "var(--shell-bg)", borderColor: "var(--shell-border)" }}
        >
          <div className="border-b px-4 py-4" style={{ borderColor: "var(--shell-subtle-border)" }}>
            <div className="flex items-center gap-3 rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[rgba(255,255,255,0.5)] px-4 py-3 dark:bg-[#0e0d1a] dark:border-[rgba(255,255,255,0.06)]">
              {/* Zazmic icon mark — SVG rebuild to avoid whitespace issues from PNG */}
              <svg width="34" height="28" viewBox="0 0 52 42" fill="none" aria-hidden="true">
                <path d="M11 37C6 35 4 28 7 20C10 12 20 8 25 13C19 12 13 18 14 28L11 37Z" fill="#c42d48" />
                <path d="M25 13L34 37H28L24 26L18 36H12L25 13Z" fill="#e51c2c" />
                <path d="M25 13L40 37H34L25 13Z" fill="#e51c2c" />
              </svg>
              <span className="text-[19px] font-bold tracking-tight text-[#111827] dark:text-white">
                Zazmic
              </span>
            </div>
            <h1 className="mt-4 text-[18px] leading-tight font-bold tracking-[-0.02em] text-[#1a1a2e] dark:font-extrabold dark:text-white">
              Marketing Intelligence Hub
            </h1>
          </div>

          <SidebarNav />
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
              <p className="flex items-center text-sm font-medium tracking-[-0.01em] text-[#6b7280] dark:font-normal dark:text-[rgba(255,255,255,0.85)]">
                <span>Google Drive</span>
                <span className="mx-1.5 dark:text-[rgba(255,255,255,0.45)]">→</span>
                <span>Staging</span>
                <span className="mx-1.5 dark:text-[rgba(255,255,255,0.45)]">→</span>
                <span>Workflow Queue</span>
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
