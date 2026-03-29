"use client";

import { useState } from "react";
import {
  Plus,
  ScanLine,
  Upload,
  Loader2,
  Cat as CatIcon,
  Camera,
  Scale,
  CalendarDays,
  PawPrint,
  X as XIcon,
  Wifi,
} from "lucide-react";
import { BreedPicker, MonthYearPicker } from "@/components/cats/CatFormFields";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ToastContainer, type ToastProps } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCats } from "@/lib/contexts/CatContext";
import type { Cat } from "@/lib/data/mockData";
import {
  getStatusColor,
  calculateAge,
  generateId,
} from "@/lib/utils/formatters";

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
  const { cats, addCat, catDetails: contextCatDetails } = useCats();
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

    if (!formData.breed.trim()) {
      newErrors.breed = "Breed is required";
    }

    if (!formData.dob) {
      newErrors.dob = "Date of birth is required";
    }

    const existingRfids = cats
      .map((c) => contextCatDetails[c.id]?.rfidTag)
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
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const newCat: Cat = {
      id: generateId(),
      name: formData.name,
      status: "healthy",
      avatar: formData.photo,
      isOnline: false,
    };

    const today = new Date().toISOString().split("T")[0];
    const newDetails = {
      breed: formData.breed,
      dob: formData.dob,
      weightKg: formData.weightKg ? parseFloat(formData.weightKg) : 0,
      rfidTag: formData.rfidTag || "—",
      healthInsight: "",
      baseline: {
        avgVisitsPerDay: 0,
        avgDurationSecs: 0,
        mq135DeltaPercent: 0,
        mq136DeltaPercent: 0,
        lastUpdated: today,
      },
    };

    await addCat(newCat, undefined, newDetails);
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
    <div className="min-h-screen bg-litter-bg pb-24">
      <TopBar />
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        {/* Header */}
        <section className="mb-8 pt-6 flex items-end justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold text-litter-text mb-1">
              My Cats
            </h1>
            <p className="text-litter-muted text-sm sm:text-base">
              Manage your feline companions
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-litter-primary text-white rounded-full font-semibold hover:bg-[#165a4e] active:bg-[#124a40] transition-colors shadow-sm text-sm"
          >
            + Add Cat
          </button>
        </section>

        {/* Cats Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cats.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={CatIcon}
                title="No cats yet"
                description="Add your first cat to start monitoring their health."
                action={
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-litter-primary text-white rounded-xl font-medium hover:bg-[#165a4e] transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                    Add Your First Cat
                  </button>
                }
              />
            </div>
          ) : (
            cats.map((cat) => (
              <CatCard key={cat.id} cat={cat} catDetails={contextCatDetails} />
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
        <div className="space-y-6">

          {/* ── Photo Upload ─────────────────────────────── */}
          <label className="group relative flex flex-col items-center justify-center gap-2 cursor-pointer">
            <div className={`relative w-full h-36 rounded-2xl overflow-hidden border-2 border-dashed transition-colors ${formData.photo ? "border-litter-primary" : "border-litter-border hover:border-litter-primary"} bg-litter-primary-light/30`}>
              {formData.photo ? (
                <>
                  <img src={formData.photo} alt="Preview" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                    <Camera className="w-6 h-6 text-white" />
                    <span className="text-white text-xs font-medium">Change photo</span>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-litter-primary/10 flex items-center justify-center group-hover:bg-litter-primary/20 transition-colors">
                    <Upload className="w-5 h-5 text-litter-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-litter-primary">Upload photo</p>
                    <p className="text-xs text-litter-muted mt-0.5">JPG, PNG — tap to browse</p>
                  </div>
                </div>
              )}
            </div>
            {formData.photo && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); setFormData((prev) => ({ ...prev, photo: null })); }}
                className="flex items-center gap-1 text-xs text-litter-muted hover:text-red-500 transition-colors"
              >
                <XIcon className="w-3 h-3" /> Remove photo
              </button>
            )}
            <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
          </label>

          {/* ── Basic Info ───────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-litter-muted">Basic Info</p>

            {/* Cat Name */}
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Cat Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <PawPrint className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-litter-muted pointer-events-none" />
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Whiskers"
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border ${errors.name ? "border-red-500 bg-red-50/5" : "border-litter-border"} bg-[var(--color-input)] text-litter-text placeholder:text-[var(--color-placeholder)] focus:outline-none focus:ring-2 focus:ring-litter-primary focus:border-transparent transition-all`}
                />
              </div>
              {errors.name && <p className="text-red-500 text-xs mt-1 flex items-center gap-1">{errors.name}</p>}
            </div>

            {/* Breed */}
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Breed <span className="text-red-500">*</span>
              </label>
              <BreedPicker
                value={formData.breed}
                onChange={(v) => { setFormData((prev) => ({ ...prev, breed: v })); setErrors((prev) => ({ ...prev, breed: undefined })); }}
                hasError={!!errors.breed}
              />
              {errors.breed && <p className="text-red-500 text-xs mt-1">{errors.breed}</p>}
            </div>
          </div>

          {/* ── Health Details ───────────────────────────── */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-litter-muted">Health Details</p>

            {/* Date of Birth — full width with month/year selects */}
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-litter-muted" />
                  Date of Birth <span className="text-red-500">*</span>
                </span>
              </label>
              <MonthYearPicker
                value={formData.dob}
                onChange={(v) => { setFormData((prev) => ({ ...prev, dob: v })); setErrors((prev) => ({ ...prev, dob: undefined })); }}
                hasError={!!errors.dob}
              />
              {errors.dob && <p className="text-red-500 text-xs mt-1">{errors.dob}</p>}
            </div>

            {/* Weight */}
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">Weight (kg)</label>
              <div className="relative">
                  <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-litter-muted pointer-events-none" />
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={formData.weightKg}
                    onChange={(e) => setFormData((prev) => ({ ...prev, weightKg: e.target.value }))}
                    placeholder="4.2"
                    className="w-full pl-9 pr-2 py-3 rounded-xl border border-litter-border bg-[var(--color-input)] text-litter-text placeholder:text-[var(--color-placeholder)] focus:outline-none focus:ring-2 focus:ring-litter-primary focus:border-transparent transition-all"
                  />
                </div>
              </div>
            </div>

          {/* ── Device ───────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-litter-muted">Device</p>

            <div className="rounded-2xl border border-litter-border bg-litter-primary-light/20 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-litter-primary/10 flex items-center justify-center">
                  <Wifi className="w-4 h-4 text-litter-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-litter-text">RFID Tag ID</p>
                  <p className="text-xs text-litter-muted">Tap the scan button on your LitterSense device</p>
                </div>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={formData.rfidTag}
                  onChange={(e) => setFormData((prev) => ({ ...prev, rfidTag: e.target.value }))}
                  placeholder="Scan or enter RFID tag"
                  className={`w-full px-4 py-3 pr-12 rounded-xl border ${errors.rfidTag ? "border-red-500" : "border-litter-border"} bg-[var(--color-input)] text-litter-text placeholder:text-[var(--color-placeholder)] focus:outline-none focus:ring-2 focus:ring-litter-primary focus:border-transparent transition-all`}
                />
                <button
                  type="button"
                  title="Auto-fill from LitterSense device"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-litter-muted hover:text-litter-primary hover:bg-litter-primary/10 transition-all"
                >
                  <ScanLine className="w-5 h-5" />
                </button>
              </div>
              {errors.rfidTag && <p className="text-red-500 text-xs">{errors.rfidTag}</p>}
            </div>
          </div>

          {/* ── Actions ──────────────────────────────────── */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setIsModalOpen(false);
                setFormData(initialFormData);
                setErrors({});
              }}
              className="flex-1 px-4 py-3 rounded-xl border border-litter-border text-theme-secondary font-medium hover:bg-theme-overlay active:scale-[0.98] transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-3 rounded-xl bg-litter-primary text-white font-semibold hover:bg-[#165a4e] active:bg-[#124a40] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <PawPrint className="w-4 h-4" />
                  Save Cat
                </>
              )}
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

// ── Cat Card ────────────────────────────────────────────────────────────────
interface CatCardProps {
  cat: Cat;
  catDetails: Record<string, any>;
}

const badgeLabel: Record<string, string> = { healthy: "HEALTHY", watch: "WATCH", alert: "ALERT" };

function CatCard({ cat, catDetails }: CatCardProps) {
  const details = catDetails[cat.id];
  const statusColors = getStatusColor(cat.status);

  const dotColor =
    cat.status === "healthy"
      ? "bg-green-500"
      : cat.status === "watch"
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div>
      <Link href={`/dashboard/cats/${cat.id}`}>
        <div className="bg-litter-card rounded-2xl shadow-sm border border-litter-border hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all cursor-pointer overflow-hidden">
          {/* Card top */}
          <div className="p-5 flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-xl shrink-0">
              {cat.avatar ? (
                <img src={cat.avatar} alt={cat.name} className="w-full h-full rounded-full object-cover" />
              ) : (
                cat.name.charAt(0).toUpperCase()
              )}
            </div>

            {/* Name + breed */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-litter-text text-lg leading-tight">{cat.name}</h3>
              <p className="text-sm text-litter-muted mt-0.5">
                {details?.breed || "Unknown breed"} · {details ? calculateAge(details.dob) : "Unknown age"}
              </p>
            </div>

            {/* Status badge */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${statusColors.bg} ${statusColors.text} shrink-0`}>
              <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
              {badgeLabel[cat.status]}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-litter-border mx-5" />

          {/* Stats row */}
          <div className="grid grid-cols-3 divide-x divide-litter-border px-5 py-4">
            <div className="pr-4">
              <p className="text-[10px] font-semibold text-litter-muted uppercase tracking-wider mb-1">Visits</p>
              <p className="font-bold text-litter-text text-lg">--</p>
            </div>
            <div className="px-4">
              <p className="text-[10px] font-semibold text-litter-muted uppercase tracking-wider mb-1">Duration</p>
              <p className="font-bold text-litter-text text-lg">--</p>
            </div>
            <div className="pl-4">
              <p className="text-[10px] font-semibold text-litter-muted uppercase tracking-wider mb-1">Last Visit</p>
              <p className="font-bold text-litter-text text-lg">--</p>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
