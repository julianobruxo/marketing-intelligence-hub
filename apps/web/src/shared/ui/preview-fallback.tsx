import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreviewFallbackProps {
  className?: string;
}

export function PreviewFallback({ className }: PreviewFallbackProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[20px] border border-dashed border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.9))] dark:border-[rgba(99,102,241,0.12)] dark:bg-[linear-gradient(180deg,rgba(15,20,38,0.98),rgba(11,16,30,0.9))]",
        className,
      )}
    >
      <ImageOff className="h-4 w-4 text-slate-300 dark:text-slate-600" />
    </div>
  );
}
