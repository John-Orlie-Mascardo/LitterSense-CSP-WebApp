"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger",
}: ConfirmDialogProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  const variantStyles = {
    danger: {
      icon: "bg-red-100 text-red-600",
      confirm: "bg-red-600 hover:bg-red-700 text-white",
    },
    warning: {
      icon: "bg-amber-100 text-amber-600",
      confirm: "bg-amber-600 hover:bg-amber-700 text-white",
    },
    info: {
      icon: "bg-blue-100 text-blue-600",
      confirm: "bg-litter-primary hover:bg-[#165a4e] text-white",
    },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          aria-modal="true"
          role="alertdialog"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(event) => event.stopPropagation()}
            className="bg-litter-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-litter-border">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${variantStyles[variant].icon}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h2 className="font-display text-lg font-semibold text-litter-text">
                  {title}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-theme-overlay transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-theme-muted" />
              </button>
            </div>

            {/* Content */}
            <div className="p-4">
              <p className="text-theme-secondary">{message}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 p-4 pt-0">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-theme text-theme-secondary font-medium hover:bg-theme-hover transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors ${variantStyles[variant].confirm}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
