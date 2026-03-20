"use client";

interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 px-1">
        {title}
      </h3>
      <div className="bg-white rounded-2xl border border-[#E8E2D9] overflow-hidden">
        {children}
      </div>
    </div>
  );
}
