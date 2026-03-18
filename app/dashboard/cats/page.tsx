"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  ChevronRight,
  Clock,
  Timer,
  ScanLine,
  Upload,
  Loader2,
  Cat as CatIcon,
} from "lucide-react";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ToastContainer, type ToastProps } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  mockCats,
  mockStats,
  getCatDetailsById,
  type Cat,
} from "@/lib/mockData";
import {
  getStatusColor,
  getStatusLabel,
  calculateAge,
  generateId,
} from "@/lib/formatters";

// Mock last seen data (in a real app this would come from the backend)
const mockLastSeen: Record<string, string> = {
  "1": "12 min ago",
  "2": "34 min ago",
  "3": "2 hr ago",
};

interface CatFormData {
  name: string;
  breed: string;
  dob: string;
  weightKg: string;
  rfidTag: string;
  photo: string | null;
}

const initialFormData: CatFormData = {
  name: "",
  breed: "",
  dob: "",
  weightKg: "",
  rfidTag: "",
  photo: null,
};

export default function CatsPage() {
  const [cats, setCats] = useState<Cat[]>(mockCats);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CatFormData>(initialFormData);
  const [errors, setErrors] = useState<
    Partial<Record<keyof CatFormData, string>>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [toasts, setToasts] = useState<Omit<ToastProps, "onClose">[]>([]);

  const addToast = (message: string, type: ToastProps["type"] = "info") => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof CatFormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Cat name is required";
    }

    // Check for duplicate RFID
    const existingRfids = cats
      .map((c) => getCatDetailsById(c.id)?.rfidTag)
      .filter(Boolean);
    if (formData.rfidTag && existingRfids.includes(formData.rfidTag)) {
      newErrors.rfidTag = "Already registered";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);

    // Mock delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const newCat: Cat = {
      id: generateId(),
      name: formData.name,
      status: "healthy",
      avatar: formData.photo,
    };

    setCats((prev) => [...prev, newCat]);
    setIsModalOpen(false);
    setFormData(initialFormData);
    setIsSaving(false);
    addToast(`${newCat.name} has been added!`, "success");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData((prev) => ({ ...prev, photo: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFAF6] pb-24">
      <TopBar />
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 flex items-start justify-between"
        >
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#1C1C1C] mb-1">
              My Cats
            </h1>
            <p className="text-[#6B7280] text-sm sm:text-base">
              Manage your feline companions
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1E6B5E] text-white rounded-lg font-medium hover:bg-[#165a4e] active:bg-[#124a40] transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Add Cat</span>
          </button>
        </motion.section>

        {/* Cats List */}
        <section className="space-y-4">
          {cats.length === 0 ? (
            <EmptyState
              icon={CatIcon}
              title="No cats yet"
              description="Add your first cat to start monitoring their health."
              action={
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#1E6B5E] text-white rounded-lg font-medium hover:bg-[#165a4e] transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add Your First Cat
                </button>
              }
            />
          ) : (
            cats.map((cat, index) => (
              <CatCard key={cat.id} cat={cat} index={index} />
            ))
          )}
        </section>
      </main>

      <BottomNav />

      {/* Add Cat Modal */}
      <BottomSheet
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setFormData(initialFormData);
          setErrors({});
        }}
        title="Add New Cat"
      >
        <div className="space-y-5">
          {/* Photo Upload */}
          <div className="flex flex-col items-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-[#D4EDE8] flex items-center justify-center overflow-hidden">
                {formData.photo ? (
                  <img
                    src={formData.photo}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-display font-bold text-[#1E6B5E]">
                    {formData.name.charAt(0).toUpperCase() || "?"}
                  </span>
                )}
              </div>
              <label className="absolute bottom-0 right-0 w-8 h-8 bg-[#1E6B5E] rounded-full flex items-center justify-center cursor-pointer hover:bg-[#165a4e] transition-colors shadow-md">
                <Upload className="w-4 h-4 text-white" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-2">Tap to upload photo</p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Cat Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g. Whiskers"
              className={`w-full px-4 py-3 rounded-xl border ${
                errors.name ? "border-red-500" : "border-[#E8E2D9]"
              } focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all`}
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          {/* Breed */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Breed
            </label>
            <input
              type="text"
              value={formData.breed}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, breed: e.target.value }))
              }
              placeholder="e.g. Domestic Shorthair"
              className="w-full px-4 py-3 rounded-xl border border-[#E8E2D9] focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Date of Birth
            </label>
            <input
              type="month"
              value={formData.dob}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, dob: e.target.value }))
              }
              className="w-full px-4 py-3 rounded-xl border border-[#E8E2D9] focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
          </div>

          {/* Weight */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Weight (kg)
            </label>
            <input
              type="number"
              step="0.1"
              value={formData.weightKg}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, weightKg: e.target.value }))
              }
              placeholder="e.g. 4.2"
              className="w-full px-4 py-3 rounded-xl border border-[#E8E2D9] focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all"
            />
          </div>

          {/* RFID Tag */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              RFID Tag ID
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.rfidTag}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, rfidTag: e.target.value }))
                }
                placeholder="Scan or enter RFID tag"
                className={`w-full px-4 py-3 pr-12 rounded-xl border ${
                  errors.rfidTag ? "border-red-500" : "border-[#E8E2D9]"
                } focus:outline-none focus:ring-2 focus:ring-[#1E6B5E] focus:border-transparent transition-all`}
              />
              <button
                type="button"
                title="Tap the RFID button on your LitterSense device to auto-fill"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-[#1E6B5E] transition-colors"
              >
                <ScanLine className="w-5 h-5" />
              </button>
            </div>
            {errors.rfidTag && (
              <p className="text-red-500 text-xs mt-1">{errors.rfidTag}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">
              Tap the RFID button on your LitterSense device to auto-fill
            </p>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setFormData(initialFormData);
                setErrors({});
              }}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-3 rounded-xl bg-[#1E6B5E] text-white font-medium hover:bg-[#165a4e] active:bg-[#124a40] transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Cat"
              )}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

// Cat Card Component
interface CatCardProps {
  cat: Cat;
  index: number;
}

function CatCard({ cat, index }: CatCardProps) {
  const details = getCatDetailsById(cat.id);
  const stats = mockStats[cat.id];
  const statusColors = getStatusColor(cat.status);
  const statusLabel = getStatusLabel(cat.status);
  const lastSeen = mockLastSeen[cat.id] || "Unknown";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
    >
      <Link href={`/dashboard/cats/${cat.id}`}>
        <div
          className={`bg-white rounded-xl shadow-sm border border-[#E8E2D9] overflow-hidden hover:shadow-md active:scale-[0.99] transition-all cursor-pointer`}
        >
          {/* Left border indicator */}
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 ${statusColors.indicator}`}
          />

          <div className="p-4 flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-[#D4EDE8] flex items-center justify-center text-[#1E6B5E] font-semibold text-xl shrink-0">
              {cat.avatar ? (
                <img
                  src={cat.avatar}
                  alt={cat.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                cat.name.charAt(0).toUpperCase()
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-[#1C1C1C] text-lg">
                {cat.name}
              </h3>
              <p className="text-sm text-gray-500">
                {details?.breed || "Unknown breed"} ·{" "}
                {details ? calculateAge(details.dob) : "Unknown age"}
              </p>

              {/* Status badge */}
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors.bg} ${statusColors.text}`}
                >
                  {statusLabel}
                </span>
              </div>

              {/* Mini stats */}
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  Visits today: {stats?.visits || 0}
                </span>
                <span className="flex items-center gap-1">
                  <Timer className="w-3.5 h-3.5" />
                  Avg: {stats?.avgDuration || "--"}
                </span>
                <span className="hidden sm:flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  Last: {lastSeen}
                </span>
              </div>
            </div>

            {/* Chevron */}
            <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
