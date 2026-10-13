"use client";

import { LucideIcon } from "lucide-react";
import { SettingsIcon } from './SettingsIcon';

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
      className={`flex items-center gap-3 p-4 ${
        onClick ? "cursor-pointer active:bg-theme-hover" : ""
      }`}
    >
      <SettingsIcon icon={Icon} className="bg-litter-primary-light text-litter-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-litter-text">{label}</p>
        {description && (
          <p className="text-sm text-theme-muted">{description}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
