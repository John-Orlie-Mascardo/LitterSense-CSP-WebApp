"use client";

import { motion } from "framer-motion";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled = false }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E6B5E] focus-visible:ring-offset-2 ${
        checked ? "bg-[#1E6B5E]" : "bg-gray-300"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
