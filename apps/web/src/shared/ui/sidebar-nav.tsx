"use client";

import type React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Download, FileText, PanelsTopLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const items: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}[] = [
  { href: "/queue", label: "Queue", icon: FileText },
  { href: "/import", label: "Import", icon: Download },
  { href: "/templates", label: "Templates", icon: PanelsTopLeft, disabled: true },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-3 flex flex-1 flex-col gap-1 px-3 pb-4">
      {items.map(({ href, label, icon: Icon, disabled }) => {
        const isActive = !disabled && (pathname === href || pathname.startsWith(href + "/"));

        return (
          <Link
            key={href}
            href={disabled ? "#" : href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-[15px] transition-default",
              disabled
                ? "cursor-not-allowed border-transparent font-medium text-slate-400/70 opacity-40 dark:font-semibold dark:text-[rgba(255,255,255,0.4)] dark:opacity-100"
                : isActive
                  ? "border-transparent font-medium bg-[rgba(124,92,252,0.1)] text-[#1a1a2e] dark:font-bold dark:bg-[rgba(124,92,252,0.18)] dark:text-white"
                  : "border-transparent font-medium text-[#6b7280] hover:bg-[rgba(255,255,255,0.6)] hover:text-[#1a1a2e] dark:font-bold dark:text-white dark:hover:bg-[rgba(124,92,252,0.1)]",
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 flex-shrink-0",
                disabled
                  ? "dark:text-[rgba(255,255,255,0.4)]"
                  : "dark:text-white dark:opacity-90",
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
