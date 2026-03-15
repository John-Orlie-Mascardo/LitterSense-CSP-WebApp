"use client";

import { motion } from "framer-motion";

interface Tab {
  id: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function TabBar({ tabs, activeTab, onChange }: TabBarProps) {
  return (
    <div className="relative border-b border-[#E8E2D9]">
      <div className="flex">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`relative flex-1 py-3 px-4 text-sm font-medium transition-colors duration-200 focus:outline-none ${
              activeTab === tab.id
                ? "text-[#1E6B5E]"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1E6B5E]"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
