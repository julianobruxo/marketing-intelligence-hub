import { AppearanceSettings } from "./appearance-settings";

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-fade-in-up">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#7B93BC] dark:text-[#8996B7]">
          Workspace
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-[#1F2E57] dark:text-slate-100">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[#5E749B] dark:text-[#8D9AB8]">
          Manage your preferences for this workspace.
        </p>
      </div>

      <AppearanceSettings />
    </div>
  );
}
