"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Search, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserSession } from "@/modules/auth/domain/session";
import Link from "next/link";

function getInitials(name?: string, email?: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return email ? email[0].toUpperCase() : "?";
}

export function UserMenu({ session }: { session: UserSession }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const initials = getInitials(session.name, session.email);
  const displayName = session.name ?? session.email;

  return (
    <div className="flex items-center gap-2.5" ref={ref}>
      <button
        aria-label="Search"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[#7194C8] transition-default hover:border-sky-200/70 hover:bg-white/55 hover:text-[#4369A2] dark:text-[rgba(255,255,255,0.8)] dark:hover:border-[rgba(124,132,252,0.28)] dark:hover:bg-[rgba(99,102,241,0.12)] dark:hover:text-white"
      >
        <Search className="h-4 w-4" />
      </button>

      <button
        className="hidden items-center rounded-full border border-transparent px-2.5 py-1 text-sm font-medium text-[#6A8EC6] transition-default hover:border-sky-200/70 hover:bg-white/55 hover:text-[#31558D] md:inline-flex dark:text-[rgba(255,255,255,0.8)] dark:hover:border-[rgba(124,132,252,0.28)] dark:hover:bg-[rgba(99,102,241,0.12)] dark:hover:text-white"
      >
        Notices
      </button>

      <button
        aria-label="Notifications"
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-200/75 bg-white/70 text-[#6287C0] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-default hover:border-sky-300 hover:bg-white dark:border-[rgba(99,102,241,0.28)] dark:bg-[rgba(28,34,66,0.95)] dark:text-[rgba(255,255,255,0.8)] dark:shadow-none dark:hover:border-[rgba(132,140,255,0.42)] dark:hover:bg-[rgba(38,44,84,0.98)]"
      >
        <Bell className="h-4 w-4" />
        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#E74B6A] px-1 text-[10px] font-semibold leading-none text-white">
          3
        </span>
      </button>

      <button
        aria-label="Open profile menu"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-1.5 py-1 transition-default",
          "border-sky-200/75 bg-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.82)] hover:border-sky-300 hover:bg-white",
          "dark:border-[rgba(99,102,241,0.28)] dark:bg-[rgba(26,32,62,0.95)] dark:shadow-none dark:hover:border-[rgba(132,140,255,0.42)] dark:hover:bg-[rgba(36,42,80,0.98)]",
          open && "ring-2 ring-[#0A66C2]/30 dark:ring-indigo-300/35",
        )}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-[linear-gradient(160deg,#23283A,#111827)] text-[13px] font-semibold text-white dark:bg-[linear-gradient(160deg,#262D45,#151B2D)]">
          {initials}
        </span>
        <span className="hidden max-w-[8rem] truncate pr-1 text-sm font-semibold text-slate-900 md:inline dark:font-medium dark:text-white">
          {displayName}
        </span>
        <ChevronDown className="mr-1 hidden h-4 w-4 text-slate-500 md:inline dark:text-slate-400" />
      </button>

      {open ? (
        <div
          className="absolute right-6 top-[56px] z-50 min-w-[240px] rounded-2xl border p-1.5 shadow-[0_24px_54px_-34px_rgba(15,23,42,0.58)] backdrop-blur-xl dark:shadow-[0_24px_54px_-34px_rgba(0,0,0,0.68)]"
          style={{
            background: "var(--popover)",
            borderColor: "var(--shell-border)",
          }}
        >
          <div className="rounded-xl border border-slate-200/80 bg-white/80 px-3 py-3 dark:border-[rgba(99,102,241,0.16)] dark:bg-[rgba(16,22,44,0.86)]">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{displayName}</p>
            <p className="mt-1 truncate text-xs text-[#6A8EC6] dark:text-[#7C8FB5]">{session.email}</p>
            {session.roles.length > 0 ? (
              <p className="mt-2 truncate text-[11px] text-slate-500 dark:text-slate-400">{session.roles.join(" · ")}</p>
            ) : null}
          </div>

          <Link
            href="/settings"
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-default hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-[rgba(99,102,241,0.08)]"
            onClick={() => setOpen(false)}
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-default hover:bg-red-50 dark:text-red-400 dark:hover:bg-[rgba(239,68,68,0.08)]"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
