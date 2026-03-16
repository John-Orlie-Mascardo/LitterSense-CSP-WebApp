"use client";

import { LucideIcon } from "lucide-react";

interface SettingsRowProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  control: React.ReactNode;
  onClick?: () => void;
}

export function SettingsRow({
  icon: Icon,
  label,
  description,
  control,
  onClick,
}: SettingsRowProps) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-4 py-3 px-4 ${
        onClick ? "cursor-pointer active:bg-gray-50" : ""
      }`}
    >
      <div className="w-10 h-10 rounded-xl bg-[#D4EDE8] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-[#1E6B5E]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[#1C1C1C]">{label}</p>
        {description && (
          <p className="text-sm text-gray-500 truncate">{description}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
