import type { LucideIcon } from 'lucide-react';

export function SettingsIcon({ icon: Icon, className = 'bg-theme-overlay text-theme-muted' }: { icon: LucideIcon; className?: string }) {
  return <span className={`settings-icon ${className}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>;
}
