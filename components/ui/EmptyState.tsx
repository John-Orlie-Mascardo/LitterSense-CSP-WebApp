"use client";

import { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-litter-primary-light flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-litter-primary" />
      </div>
      <h3 className="font-display text-lg font-semibold text-litter-text mb-2">
        {title}
      </h3>
      <p className="text-theme-muted max-w-xs mb-4">{description}</p>
      {action && <div>{action}</div>}
    </motion.div>
  );
}
