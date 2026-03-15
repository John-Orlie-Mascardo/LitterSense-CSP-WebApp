"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

export interface ToastProps {
  id: string;
  message: string;
  type?: "success" | "error" | "info" | "warning";
  duration?: number;
  onClose: (id: string) => void;
}

export function Toast({
  id,
  message,
  type = "info",
  duration = 3000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
    warning: AlertCircle,
  };

  const styles = {
    success: "bg-green-50 border-green-200 text-green-800",
    error: "bg-red-50 border-red-200 text-red-800",
    info: "bg-blue-50 border-blue-200 text-blue-800",
    warning: "bg-amber-50 border-amber-200 text-amber-800",
  };

  const Icon = icons[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${styles[type]}`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <p className="text-sm font-medium flex-1">{message}</p>
      <button
        onClick={() => onClose(id)}
        className="p-1 rounded-lg hover:bg-black/5 transition-colors"
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; message: string; type?: "success" | "error" | "info" | "warning" }>;
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              id={toast.id}
              message={toast.message}
              type={toast.type}
              onClose={onClose}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
