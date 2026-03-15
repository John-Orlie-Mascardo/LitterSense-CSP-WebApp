"use client";

import { motion } from "framer-motion";

interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          onClick={() => !option.disabled && onChange(option.value)}
          className={`relative px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 focus:outline-none ${
            option.disabled
              ? "text-gray-400 cursor-not-allowed"
              : value === option.value
              ? "text-[#1E6B5E]"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {value === option.value && !option.disabled && (
            <motion.div
              layoutId="segmentedControl"
              className="absolute inset-0 bg-white rounded-md shadow-sm"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative z-10">{option.label}</span>
          {option.disabled && (
            <span className="absolute -top-1 -right-1 px-1 py-0.5 text-[8px] bg-gray-300 text-gray-600 rounded">
              Soon
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
