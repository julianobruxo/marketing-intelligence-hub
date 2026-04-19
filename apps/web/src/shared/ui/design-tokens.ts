// Shared design tokens for surfaces, typography, layout, and shell chrome.
// Status/tone color logic lives in operational-status.ts.

// ── App-shell structural blue ─────────────────────────────────────────────
// Derived from the LinkedIn blue family (#0A66C2) at ~95-96% lightness.
// Used for: sidebar background, header background, secondary controls.
export const shell = {
  sidebarGradient: "linear-gradient(180deg, #EDF6FF 0%, #E5EFFD 55%, #E8F0FE 100%)",
  headerGradient: "linear-gradient(180deg, rgba(237,246,255,0.97), rgba(229,239,253,0.94))",
  borderColor: "rgba(147, 197, 253, 0.55)",
  subtleBorderColor: "rgba(147, 197, 253, 0.35)",
} as const;

// ── State palette (for queue rows, tabs, and action items) ────────────────
export const stateColors = {
  lavender: { bg: "rgba(245,243,255,0.98)", border: "rgba(196,181,253,0.55)", text: "#6D28D9" },
  orange:   { bg: "rgba(255,247,237,0.98)", border: "rgba(253,186,116,0.55)", text: "#C2410C" },
  crimson:  { bg: "rgba(255,244,246,0.98)", border: "rgba(253,164,175,0.55)", text: "#9F1239" },
  green:    { bg: "rgba(240,253,244,0.98)", border: "rgba(134,239,172,0.55)", text: "#166534" },
  sky:      { bg: "rgba(239,246,255,0.98)", border: "rgba(147,197,253,0.55)", text: "#1E40AF" },
  amber:    { bg: "rgba(255,251,235,0.98)", border: "rgba(253,230,138,0.55)", text: "#92400E" },
} as const;

// ── Surfaces ──────────────────────────────────────────────────────────────
export const surface = {
  card: "rounded-2xl border border-slate-200 bg-white shadow-sm",
  subtle: "rounded-2xl border border-slate-100 bg-slate-50",
  elevated: "rounded-2xl border border-slate-200 bg-white shadow-md",
  command: "rounded-[28px] border border-slate-200 bg-slate-950 text-white shadow-[0_22px_60px_-40px_rgba(15,23,42,0.65)]",
} as const;

// ── Typography ────────────────────────────────────────────────────────────
export const text = {
  eyebrow: "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400",
  label: "text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400",
  body: "text-sm text-slate-600",
  muted: "text-sm text-slate-500",
  faint: "text-xs text-slate-400",
} as const;

// ── Radius ────────────────────────────────────────────────────────────────
export const radius = {
  sm: "rounded-xl",
  md: "rounded-2xl",
  lg: "rounded-[26px]",
  xl: "rounded-[30px]",
  hero: "rounded-[34px]",
} as const;
