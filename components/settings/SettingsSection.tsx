"use client";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-theme-muted uppercase tracking-wider mb-3 px-1">
        {title}
      </h3>
      <div className="bg-litter-card rounded-2xl border border-litter-border overflow-hidden">
        {children}
      </div>
    </div>
  );
}
