import Link from "next/link";
import { AlertTriangle, Globe } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main
      className="flex min-h-screen items-center justify-center px-6 py-16"
      style={{
        background: "linear-gradient(160deg, #0F172A 0%, #1E293B 100%)",
      }}
    >
      {/* Subtle radial glow behind the card */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden="true"
      >
        <div
          className="h-[600px] w-[600px] rounded-full opacity-20"
          style={{
            background:
              "radial-gradient(circle, rgba(232,88,74,0.35) 0%, transparent 70%)",
            filter: "blur(60px)",
          }}
        />
      </div>

      {/* Login card */}
      <div
        className="relative w-full max-w-md animate-fade-in-up rounded-xl bg-white px-8 py-10 shadow-2xl"
        style={{ boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}
      >
        {/* App badge */}
        <div className="mb-6">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: "#FEF2F1", color: "#E8584A" }}
          >
            Marketing Intelligence Hub
          </span>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-semibold tracking-tight leading-snug" style={{ color: "#0F172A" }}>
          Protected internal workflow for Pipeline #1
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "#64748B" }}>
          This platform is designed for the Pipeline #1 content workflow:
          Google Drive spreadsheet selection, normalized import, and internal
          approval tracking.
        </p>

        {/* Error message */}
        {error && (
          <div
            className="mt-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: "#FECACA",
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
            }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
            <p className="font-medium">{error.replace(/\+/g, " ")}</p>
          </div>
        )}

        {/* Divider */}
        <div className="mt-7 border-t border-slate-100" />

        {/* Sign in with Google */}
        <div className="mt-6 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#94A3B8" }}>
            Production access
          </p>
          <a
            href="/api/auth/google/login"
            className="flex w-full items-center justify-center gap-3 rounded-lg px-4 py-3 text-sm font-semibold text-white transition-default"
            style={{
              backgroundColor: "#E8584A",
            }}
          >
            <Globe className="h-4 w-4" />
            Sign in with Google
          </a>
          <p className="text-center text-[11px]" style={{ color: "#94A3B8" }}>
            Restricted to <span className="font-medium">@zazmic.com</span> identities
          </p>
        </div>

        {/* Dev bypass */}
        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#94A3B8" }}>
            Local development
          </p>
          <p className="mt-2 text-xs leading-5" style={{ color: "#94A3B8" }}>
            Set <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">DEV_AUTH_EMAIL</code> in{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">.env</code> to bypass Google OAuth locally.
          </p>
          <Link
            href="/queue"
            className="mt-3 inline-block text-sm font-medium underline underline-offset-4 transition-default"
            style={{ color: "#0A66C2" }}
          >
            Access local queue →
          </Link>
        </div>
      </div>
    </main>
  );
}
