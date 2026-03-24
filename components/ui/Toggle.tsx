"use client";

import { motion } from "framer-motion";

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, disabled = false }: Readonly<ToggleProps>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{ width: 60, height: 30, minHeight: 0, overflow: "hidden", borderRadius: 500 }}
      className={`relative inline-flex items-center transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E6B5E] focus-visible:ring-offset-2 ${
        checked ? "bg-litter-primary" : "bg-gray-300"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30}}
        style={{ width: 18, height: 18, borderRadius: "50%" }}
        className={`inline-block bg-litter-card shadow-md transform ${
          checked ? "translate-x-[37px]" : "translate-x-[5px]"
        }`}
      />
    </button>
  );
}