"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-lg",
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleBackdropClick}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          aria-modal="true"
          role="dialog"
        >
          <motion.div
            ref={sheetRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={`w-full ${maxWidth} bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden`}
          >
            {/* Handle bar for mobile */}
            <div className="w-full flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-12 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-[#E8E2D9]">
              <h2 className="font-display text-lg font-semibold text-[#1C1C1C]">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E6B5E]"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(90vh-60px)] p-4 sm:p-6">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
