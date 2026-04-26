import { AlertTriangle, BarChart2, Database, Globe, Layers, TrendingUp, Users, Zap } from "lucide-react";

function getLoginErrorMessage(error?: string) {
  if (!error) return null;
  const normalized = error.replace(/\+/g, " ").trim();
  if (normalized === "Access restricted to Zazmic organization") {
    return "Google sign-in succeeded, but this app only allows @zazmic.com accounts. Please sign in with your Zazmic Google account.";
  }
  if (normalized === "Your account is not provisioned in the system. Contact an administrator.") {
    return "Google sign-in succeeded, but your account is not provisioned for Pipeline #1. Please contact an administrator.";
  }
  return normalized;
}

// ─── Floating dashboard mini-cards ───────────────────────────────────────────

function PipelineHealthCard() {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "rgba(10, 14, 36, 0.82)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(18px)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Pipeline Health
        </p>
        <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-3xl font-bold text-white">94%</span>
        <span className="mb-1 text-xs font-semibold text-emerald-400">↑ +12%</span>
      </div>
      <p className="text-[11px] text-slate-500">Items on schedule this week</p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-1.5 rounded-full"
          style={{ width: "94%", background: "linear-gradient(90deg,#E8584A,#F97316)" }}
        />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {[
          { label: "Import", value: "48" },
          { label: "Queue", value: "31" },
          { label: "Done", value: "15" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-white/5 py-2 text-center">
            <p className="text-sm font-bold text-white">{item.value}</p>
            <p className="text-[10px] text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyOutputCard() {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "rgba(10, 14, 36, 0.82)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(18px)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Weekly Output
        </p>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
          +24%
        </span>
      </div>
      <p className="mt-1.5 text-xl font-bold text-white">
        32 <span className="text-sm font-normal text-slate-400">items</span>
      </p>
      <svg
        viewBox="0 0 100 38"
        className="mt-2 h-10 w-full"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="wog" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E8584A" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#E8584A" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points="0,35 12,30 24,22 36,26 48,16 60,9 72,13 86,5 100,2 100,38 0,38"
          fill="url(#wog)"
        />
        <polyline
          points="0,35 12,30 24,22 36,26 48,16 60,9 72,13 86,5 100,2"
          stroke="#E8584A"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
      </div>
    </div>
  );
}

function AiInsightsCard() {
  const bars = [
    { label: "Design", pct: 80, color: "#E8584A" },
    { label: "Copy", pct: 95, color: "#3B82F6" },
    { label: "Review", pct: 62, color: "#8B5CF6" },
    { label: "Posted", pct: 44, color: "#10B981" },
  ];
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "rgba(10, 14, 36, 0.82)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(18px)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          AI Insights
        </p>
        <BarChart2 className="h-3.5 w-3.5 text-violet-400" />
      </div>
      <p className="mt-1 text-sm font-semibold text-white">Content stages</p>
      <div className="mt-3 space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.label} className="flex items-center gap-2">
            <span className="w-11 shrink-0 text-[10px] text-slate-500">{bar.label}</span>
            <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${bar.pct}%`, backgroundColor: bar.color }}
              />
            </div>
            <span className="w-6 text-right text-[10px] text-slate-500">{bar.pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActiveCampaignsCard() {
  const campaigns = [
    { name: "Q2 LinkedIn", count: 12, color: "#E8584A" },
    { name: "Zazmic Brazil", count: 8, color: "#3B82F6" },
    { name: "Yann K.", count: 5, color: "#8B5CF6" },
  ];
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "rgba(10, 14, 36, 0.82)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(18px)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Active Campaigns
        </p>
        <Users className="h-3.5 w-3.5 text-sky-400" />
      </div>
      <p className="mt-1.5 text-xl font-bold text-white">
        3 <span className="text-sm font-normal text-slate-400">running</span>
      </p>
      <div className="mt-3 space-y-2">
        {campaigns.map((c) => (
          <div
            key={c.name}
            className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
          >
            <span className="text-[11px] font-medium text-slate-300">{c.name}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-white">{c.count}</span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: c.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const loginError = getLoginErrorMessage(error);

  const features = [
    { icon: Database, label: "Drive Import", color: "#E8584A" },
    { icon: Layers, label: "Content Queue", color: "#3B82F6" },
    { icon: Zap, label: "Design Sync", color: "#8B5CF6" },
    { icon: Globe, label: "Publish Flow", color: "#10B981" },
  ];

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10"
    >
      {/* ── Background image ── */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('/login_background.png')" }}
        aria-hidden="true"
      />
      {/* Subtle uniform darkening for readability */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(4,7,20,0.28)" }}
        aria-hidden="true"
      />

      {/* ── Left floating cards (xl+) ── */}
      <div
        className="absolute left-5 top-1/2 hidden -translate-y-1/2 flex-col gap-4 xl:flex"
        style={{ width: "230px" }}
      >
        <PipelineHealthCard />
        <WeeklyOutputCard />
      </div>

      {/* ── Right floating cards (xl+) ── */}
      <div
        className="absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col gap-4 xl:flex"
        style={{ width: "230px" }}
      >
        <AiInsightsCard />
        <ActiveCampaignsCard />
      </div>

      {/* ── Center hero card ── */}
      <div
        className="relative z-10 w-full max-w-[460px] animate-fade-in-up rounded-2xl px-8 py-9 sm:px-10"
        style={{
          background: "rgba(8, 12, 30, 0.82)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          boxShadow:
            "0 0 0 1px rgba(232,88,74,0.12), 0 32px 80px rgba(0,0,0,0.65), 0 0 80px rgba(232,88,74,0.07)",
        }}
      >
        {/* Logo */}
        <div className="mb-5 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.jpeg"
            alt="Zazmic"
            className="h-9 w-auto"
          />
        </div>

        {/* Headline */}
        <h1
          className="text-center text-[2rem] font-bold leading-[1.15] tracking-tight"
          style={{
            color: "#E8584A",
            textShadow: "0 0 40px rgba(232,88,74,0.55), 0 0 80px rgba(232,88,74,0.28)",
          }}
        >
          Marketing Intelligence Hub
        </h1>

        <p className="mt-3.5 text-[13.5px] leading-6 text-slate-400">
          Your centralized workflow — from Drive spreadsheet to LinkedIn post.
          Smart import, design automation, and full approval tracking in one
          place.
        </p>

        {/* Feature icons */}
        <div className="mt-6 grid grid-cols-4 gap-2">
          {features.map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex flex-col items-center gap-2">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{
                  background: `${color}18`,
                  border: `1px solid ${color}2e`,
                }}
              >
                <Icon className="h-4 w-4" style={{ color }} />
              </div>
              <span className="text-center text-[10px] leading-tight text-slate-500">
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Divider + label */}
        <div className="mt-7 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-700/50" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Production Access
          </span>
          <div className="h-px flex-1 bg-slate-700/50" />
        </div>

        {/* Error banner */}
        {loginError && (
          <div
            className="mt-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"
            style={{
              borderColor: "rgba(239,68,68,0.28)",
              background: "rgba(239,68,68,0.09)",
              color: "#FCA5A5",
            }}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="font-medium">{loginError}</p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-5 space-y-3">
          <a
            href="/api/auth/google/login"
            className="flex w-full items-center justify-center gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 active:opacity-80"
            style={{
              background: "linear-gradient(135deg,#E8584A 0%,#CC3D30 100%)",
              boxShadow: "0 8px 28px rgba(232,88,74,0.38)",
            }}
          >
            {/* Google G mark */}
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="rgba(255,255,255,0.9)"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="rgba(255,255,255,0.9)"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="rgba(255,255,255,0.9)"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="rgba(255,255,255,0.9)"
              />
            </svg>
            Sign in with Google
          </a>

          <p className="text-center text-[11px] text-slate-500">
            Restricted to{" "}
            <span className="font-semibold text-slate-400">@zazmic.com</span>{" "}
            identities
          </p>
        </div>
      </div>
    </main>
  );
}
