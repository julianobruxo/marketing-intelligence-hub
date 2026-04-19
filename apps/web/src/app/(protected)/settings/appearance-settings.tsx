"use client";

import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/shared/ui/theme-provider";

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="app-surface-panel overflow-hidden rounded-[24px] dark:border-[rgba(88,108,186,0.34)] dark:bg-[linear-gradient(145deg,rgba(12,17,37,0.96),rgba(10,14,31,0.92))]">
      <div className="border-b border-[var(--surface-border)] px-5 py-4 dark:border-[rgba(88,108,186,0.28)]">
        <h2 className="text-sm font-semibold text-[#1F2E57] dark:text-slate-100">Appearance</h2>
        <p className="mt-0.5 text-xs text-[#5E749B] dark:text-[#8D9AB8]">
          Choose your preferred interface theme
        </p>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 max-w-xs">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={cn(
              "relative flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A66C2] focus-visible:ring-offset-2",
              theme === "light"
                ? "border-[#6D7EF0] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(238,244,255,0.9))] shadow-[0_0_0_4px_rgba(114,138,233,0.2)]"
                : "border-[var(--surface-border)] bg-white/85 hover:border-sky-300/75 hover:shadow-sm dark:border-[rgba(99,102,241,0.24)] dark:bg-[rgba(15,23,42,0.5)] dark:hover:border-[rgba(119,131,255,0.42)]",
            )}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-50 dark:border-[rgba(251,191,36,0.2)] dark:bg-[rgba(251,191,36,0.08)]">
              <Sun className="h-4.5 w-4.5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1F2E57] dark:text-slate-100">Light</p>
              <p className="mt-0.5 text-[11px] leading-4 text-[#5E749B] dark:text-[#8D9AB8]">
                Premium cloud shell
              </p>
            </div>
            {theme === "light" && (
              <span className="absolute right-3 top-3 flex h-2 w-2 rounded-full bg-[#6D7EF0]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={cn(
              "relative flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2",
              theme === "dark"
                ? "border-indigo-300 bg-[linear-gradient(180deg,rgba(36,43,80,0.86),rgba(24,31,61,0.82))] shadow-[0_0_0_4px_rgba(108,120,233,0.22)]"
                : "border-[var(--surface-border)] bg-white/85 hover:border-sky-300/75 hover:shadow-sm dark:border-[rgba(99,102,241,0.24)] dark:bg-[rgba(15,23,42,0.5)] dark:hover:border-[rgba(119,131,255,0.42)]",
            )}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-200/80 dark:bg-[rgba(99,102,241,0.1)] dark:border-[rgba(99,102,241,0.25)]">
              <Moon className="h-4.5 w-4.5 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1F2E57] dark:text-slate-100">Dark</p>
              <p className="mt-0.5 text-[11px] leading-4 text-[#5E749B] dark:text-[#8D9AB8]">
                Deep navy-indigo
              </p>
            </div>
            {theme === "dark" && (
              <span className="absolute right-3 top-3 flex h-2 w-2 rounded-full bg-indigo-400" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
