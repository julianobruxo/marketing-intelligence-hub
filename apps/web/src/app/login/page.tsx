import { AlertTriangle, Globe } from "lucide-react";

function getLoginErrorMessage(error?: string) {
  if (!error) {
    return null;
  }

  const normalized = error.replace(/\+/g, " ").trim();

  if (normalized === "Access restricted to Zazmic organization") {
    return "Google sign-in succeeded, but this app only allows @zazmic.com accounts. Please sign in with your Zazmic Google account.";
  }

  if (normalized === "Your account is not provisioned in the system. Contact an administrator.") {
    return "Google sign-in succeeded, but your account is not provisioned for Pipeline #1. Please contact an administrator.";
  }

  return normalized;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const loginError = getLoginErrorMessage(error);

  return (
    <main
      className="flex min-h-screen items-center justify-center px-6 py-16"
      style={{
        background: "linear-gradient(160deg, #0F172A 0%, #1E293B 100%)",
      }}
    >
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

      <div
        className="relative w-full max-w-md animate-fade-in-up rounded-xl bg-white px-8 py-10 shadow-2xl"
        style={{ boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}
      >
        <div className="mb-6">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
            style={{ backgroundColor: "#FEF2F1", color: "#E8584A" }}
          >
            Marketing Intelligence Hub
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight leading-snug" style={{ color: "#0F172A" }}>
          Protected internal workflow for Pipeline #1
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "#64748B" }}>
          This platform is designed for the Pipeline #1 content workflow:
          Google Drive spreadsheet selection, normalized import, and internal
          approval tracking.
        </p>

        {loginError && (
          <div
            className="mt-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: "#FECACA",
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
            }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-500" />
            <p className="font-medium">{loginError}</p>
          </div>
        )}

        <div className="mt-7 border-t border-slate-100" />

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
      </div>
    </main>
  );
}
