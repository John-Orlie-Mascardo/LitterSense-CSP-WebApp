/**
 * My Cats Page
 *
 * Cat profile creation and evidence-aware summary cards for registered cats.
 *
 * DONE: profile grid, Storage-backed photo crop/upload, no-data metrics, six-state badges
 *
 * NEXT: Firebase owners must deploy storage.rules before hosted photo uploads.
 */

"use client";

import { usePhotoUpload } from "@/lib/hooks/usePhotoUpload";

import { getSessionActivityDateKey, getLocalDateKey as getTodayDateKey } from "@/lib/utils/sessionDate";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Plus,
  ScanLine,
  Upload,
  Loader2,
  Cat as CatIcon,
  Camera,
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
import { ToastContainer, type ToastParams } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCats } from "@/lib/contexts/CatContext";
import { useAuth } from "@/lib/contexts/AuthContext";
import type { Cat } from "@/lib/interfaces/Cat";
import type { CatDetails } from "@/lib/interfaces/CatDetails";
import type { CatStats } from "@/lib/interfaces/CatStats";
import {
  calculateAge,
  generateId,
} from "@/lib/utils/formatters";
import { cropImageToSquare } from "@/lib/utils/imageCrop";
import {
  CAT_PHOTO_ACCEPT,
  dataUrlToBlob,
  deleteCatPhoto,
  uploadCatPhoto,
  validateCatPhotoFile,
} from "@/lib/utils/catPhoto";
import { BehaviorStateBadge } from "@/components/behavior/BehaviorStateBadge";
import { CatGridSkeleton } from "@/components/ui/AppLoadingSkeletons";
import {
  formatMetricValue,
  getSessionDisplayState,
  getMostSevereState,
  hasEstablishedBaseline,
  hasRecordedCatData,
} from "@/lib/presentation/behaviorStates";
import type { Session } from "@/lib/interfaces/Session";

const AVATAR_PREVIEW_SIZE = 128;
type EnrollmentView = { id?: string; status: string; count: number; tag: string; error: string };

interface PhotoOffset {
  x: number;
  y: number;
}

interface PhotoSize {
  width: number;
  height: number;
}

interface PhotoDragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

const getPhotoPanLimit = (size: PhotoSize | null, zoom: number) => {
  if (!size) return { x: 0, y: 0 };
  const scale =
    Math.max(
      AVATAR_PREVIEW_SIZE / size.width,
      AVATAR_PREVIEW_SIZE / size.height,
    ) * zoom;

  return {
    x: Math.max(0, (size.width * scale - AVATAR_PREVIEW_SIZE) / 2),
    y: Math.max(0, (size.height * scale - AVATAR_PREVIEW_SIZE) / 2),
  };
};

const clampPhotoOffset = (
  offset: PhotoOffset,
  size: PhotoSize | null,
  zoom: number,
) => {
  const limit = getPhotoPanLimit(size, zoom);
  return {
    x: Math.min(limit.x, Math.max(-limit.x, offset.x)),
    y: Math.min(limit.y, Math.max(-limit.y, offset.y)),
  };
};

interface CatFormData {
  name: string;
  breed: string;
  gender: "" | "male" | "female";
  dob: string;
  rfidTag: string;
  photo: string | null;
}

const initialFormData: CatFormData = {
  name: "",
  breed: "",
  gender: "",
  dob: "",
  rfidTag: "",
  photo: null,
};

export default function CatsPage() {
  const { user } = useAuth();
  const {
    cats,
    addCat,
    catDetails: contextCatDetails,
    getDetailsByCatId,
    getStatsByCatId,
    getSessionsByCatId,
    isLoading: catsLoading,
  } = useCats();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<CatFormData>(initialFormData);
  const [errors, setErrors] = useState<
    Partial<Record<keyof CatFormData, string>>
  >({});
  const photoUpload = usePhotoUpload();
  const { isSaving: isSaving, progress: uploadProgress } = photoUpload;
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoOffset, setPhotoOffset] = useState<PhotoOffset>({ x: 0, y: 0 });
  const [photoSize, setPhotoSize] = useState<PhotoSize | null>(null);
  const photoDragRef = useRef<PhotoDragState | null>(null);
  const [toasts, setToasts] = useState<Omit<ToastParams, "onClose">[]>([]);
  const [enrollmentOpen, setEnrollmentOpen] = useState(false);
  const enrollmentOpenRef = useRef(false);
  const [enrollment, setEnrollment] = useState<EnrollmentView>({ status: "waiting", count: 0, tag: "", error: "" });

  const enrollmentRequest = useCallback(async (method: "GET" | "POST" | "DELETE", id?: string) => {
    if (!user) throw new Error("Sign in before scanning a tag.");
    const response = await fetch("/api/rfid-enrollment", { method, cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}`, ...(id ? { "Content-Type": "application/json" } : {}) }, ...(id ? { body: JSON.stringify({ id }) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Scanner unavailable.");
    return data as EnrollmentView;
  }, [user]);

  const startEnrollment = async () => {
    enrollmentOpenRef.current = true;
    setEnrollmentOpen(true);
    setEnrollment({ status: "starting", count: 0, tag: "", error: "" });
    try {
      const next = await enrollmentRequest("POST");
      if (enrollmentOpenRef.current) setEnrollment(next);
      else void enrollmentRequest("DELETE", next.id).catch(() => {});
    }
    catch (error) { setEnrollment({ status: "error", count: 0, tag: "", error: error instanceof Error ? error.message : "Scanner unavailable." }); }
  };

  const closeEnrollment = () => {
    enrollmentOpenRef.current = false;
    setEnrollmentOpen(false);
    if (enrollment.id && enrollment.status !== "verified") void enrollmentRequest("DELETE", enrollment.id).catch(() => {});
  };

  useEffect(() => {
    if (!enrollmentOpen || !enrollment.id || enrollment.status === "verified" || enrollment.status === "expired") return;
    let active = true;
    let timer: number;
    const poll = async () => {
      try {
        const state = await enrollmentRequest("GET");
        if (active && state.id === enrollment.id) setEnrollment(state);
        if (active && state.status === "expired") setEnrollment((current) => ({ ...current, status: "expired", error: "Scan timed out. Start again." }));
      } catch (error) {
        if (active) setEnrollment((current) => ({ ...current, error: error instanceof Error ? error.message : "Unable to check scanner." }));
      } finally {
        if (active) timer = window.setTimeout(poll, 1000);
      }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [enrollmentOpen, enrollment.id, enrollment.status, enrollmentRequest]);

  useEffect(() => {
    if (!enrollmentOpen || enrollment.status !== "verified" || !enrollment.tag) return;
    const timer = window.setTimeout(() => {
      setFormData((current) => ({ ...current, rfidTag: enrollment.tag }));
      setErrors((current) => ({ ...current, rfidTag: undefined }));
      setEnrollmentOpen(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [enrollmentOpen, enrollment.status, enrollment.tag]);

  const addToast = (message: string, type: ToastParams["type"] = "info") => {
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

    if (!formData.gender) {
      newErrors.gender = "Gender is required";
    }

    if (!formData.dob) {
      newErrors.dob = "Date of birth is required";
    }

    const existingRfids = cats
      .map((c) => contextCatDetails[c.id]?.rfidTag)
      .filter(Boolean);
    if (formData.rfidTag && existingRfids.some((tag) => tag?.toUpperCase() === formData.rfidTag.trim().toUpperCase())) {
      newErrors.rfidTag = "Already registered";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;
    if (!user) {
      addToast("Please sign in again before saving this cat.", "error");
      return;
    }

    const upload = photoUpload.begin();
    const gender = formData.gender as Exclude<CatFormData["gender"], "">;
    const newCatId = generateId();

    const today = new Date().toISOString().split("T")[0];
    const newDetails = {
      breed: formData.breed,
      gender,
      dob: formData.dob,
      rfidTag: formData.rfidTag.trim().toUpperCase() || "—",
      healthInsight: "",
      baseline: {
        avgVisitsPerDay: 0,
        avgDurationSecs: 0,
        mq135DeltaPercent: 0,
        mq136DeltaPercent: 0,
        lastUpdated: today,
      },
    };

    let uploadedPhotoUrl: string | null = null;
    try {
      if (formData.photo && selectedPhotoFile) {
        const croppedDataUrl = await cropImageToSquare(
          formData.photo,
          photoZoom,
          photoOffset,
        );
        uploadedPhotoUrl = await uploadCatPhoto({
          uid: user.uid,
          catId: newCatId,
          blob: await dataUrlToBlob(croppedDataUrl),
          signal: upload.signal,
          onProgress: upload.onProgress,
        });
      }

      const newCat: Cat = {
        id: newCatId,
        name: formData.name.trim(),
        status: "normal",
        avatar: uploadedPhotoUrl,
        isOnline: false,
      };
      upload.signal.throwIfAborted();
      await addCat(newCat, undefined, newDetails);
      if (upload.signal.aborted) return;
      setIsModalOpen(false);
      setFormData(initialFormData);
      setSelectedPhotoFile(null);
      resetPhotoState();
      addToast(`${newCat.name} has been added!`, "success");
    } catch (error) {
      upload.finish();
      console.error("Failed to add cat profile:", error);
      if (uploadedPhotoUrl) {
        try {
          await deleteCatPhoto(user.uid, newCatId);
        } catch (cleanupError) {
          console.error("Failed to clean up an unsaved cat photo:", cleanupError);
        }
      }
      if (upload.signal.aborted) return;
      setErrors((current) => ({
        ...current,
        photo: "We couldn't upload that photo. Please try again.",
      }));
    } finally {
      upload.finish();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validationMessage = validateCatPhotoFile(file);
      if (validationMessage) {
        setErrors((current) => ({ ...current, photo: validationMessage }));
        event.target.value = "";
        return;
      }
      photoUpload.reader.current?.abort();
      const reader = new FileReader();
      photoUpload.reader.current = reader;
      reader.onload = () => {
        setFormData((prev) => ({ ...prev, photo: reader.result as string }));
        setSelectedPhotoFile(file);
        setErrors((current) => ({ ...current, photo: undefined }));
        setPhotoZoom(1);
        setPhotoOffset({ x: 0, y: 0 });
      };
      reader.onerror = () => {
        setErrors((current) => ({
          ...current,
          photo: "We couldn't open that photo. Please choose another image.",
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const resetPhotoState = () => {
    setPhotoZoom(1);
    setPhotoOffset({ x: 0, y: 0 });
    setPhotoSize(null);
  };

  const handlePhotoPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!formData.photo) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    photoDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: photoOffset.x,
      originY: photoOffset.y,
    };
  };

  const handlePhotoPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    const drag = photoDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPhotoOffset(
      clampPhotoOffset(
        {
          x: drag.originX + event.clientX - drag.startX,
          y: drag.originY + event.clientY - drag.startY,
        },
        photoSize,
        photoZoom,
      ),
    );
  };

  const handlePhotoPointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    if (photoDragRef.current?.pointerId === event.pointerId) {
      photoDragRef.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-litter-bg pb-24 lg:pb-10">
      <TopBar />
      <ToastContainer toasts={toasts} onClose={removeToast} />

      <main className="pt-20 px-4 sm:px-6 lg:px-8 max-w-[1440px] mx-auto">
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
          {catsLoading ? (
            <div className="col-span-full"><CatGridSkeleton /></div>
          ) : cats.length === 0 ? (
            <div className="col-span-full">
              <EmptyState
                icon={CatIcon}
                title="No cats yet"
                description="Add your first cat to start recording litter box activity."
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
              <CatCard
                key={cat.id}
                cat={cat}
                details={getDetailsByCatId(cat.id)}
                stats={getStatsByCatId(cat.id)}
                sessions={getSessionsByCatId(cat.id)}
              />
            ))
          )}
        </section>
      </main>

      <BottomNav />

      {/* Add Cat Modal */}
      <BottomSheet
        isOpen={isModalOpen}
        onClose={() => {
          if (enrollmentOpen) return;
          photoUpload.cancel();
          setIsModalOpen(false);
          setFormData(initialFormData);
          setSelectedPhotoFile(null);
          resetPhotoState();
          setErrors({});
        }}
        title="Add New Cat"
      >
        <div className="space-y-6">

          {/* ── Photo Upload ─────────────────────────────── */}
          <div className="flex flex-col items-center justify-center gap-3">
            {formData.photo ? (
              <>
                <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-litter-primary bg-litter-primary-light/30">
                  <Image
                    src={formData.photo}
                    alt="Avatar preview"
                    width={128}
                    height={128}
                    unoptimized
                    className="w-full h-full object-cover cursor-grab touch-none active:cursor-grabbing"
                    draggable={false}
                    onLoad={(event) => {
                      setPhotoSize({
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      });
                    }}
                    onPointerDown={handlePhotoPointerDown}
                    onPointerMove={handlePhotoPointerMove}
                    onPointerUp={handlePhotoPointerUp}
                    onPointerCancel={handlePhotoPointerUp}
                    style={{
                      transform: `translate(${photoOffset.x}px, ${photoOffset.y}px) scale(${photoZoom})`,
                    }}
                  />
                  <label
                    htmlFor="add-cat-photo-input"
                    className="pointer-events-none absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1"
                  >
                    <Camera className="w-6 h-6 text-white" />
                    <span className="text-white text-xs font-medium">Change photo</span>
                  </label>
                </div>
                <div className="w-full max-w-xs">
                  <label className="block text-xs font-medium text-litter-muted mb-1.5">Zoom photo</label>
                  <input
                    type="range"
                    min="1"
                    max="2.5"
                    step="0.05"
                    value={photoZoom}
                    onChange={(event) => {
                      const nextZoom = Number(event.target.value);
                      setPhotoZoom(nextZoom);
                      setPhotoOffset((current) =>
                        clampPhotoOffset(current, photoSize, nextZoom),
                      );
                    }}
                    className="w-full accent-litter-primary"
                  />
                  <p className="text-[11px] text-litter-muted mt-1">Drag the photo to reposition.</p>
                </div>
              </>
            ) : (
              <label
                htmlFor="add-cat-photo-input"
                className="group relative flex w-full h-36 rounded-2xl overflow-hidden border-2 border-dashed border-litter-border hover:border-litter-primary transition-colors bg-litter-primary-light/30 cursor-pointer"
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-litter-primary/10 flex items-center justify-center group-hover:bg-litter-primary/20 transition-colors">
                    <Upload className="w-5 h-5 text-litter-primary" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-litter-primary">Upload photo</p>
                    <p className="text-xs text-litter-muted mt-0.5">JPG, PNG — tap to browse</p>
                  </div>
                </div>
              </label>
            )}
            {formData.photo && (
              <div className="flex items-center gap-3 text-xs">
                <label htmlFor="add-cat-photo-input" className="text-litter-muted hover:text-litter-primary transition-colors cursor-pointer">
                  Change photo
                </label>
                <button
                  type="button"
                  onClick={(event) => { event.preventDefault(); setFormData((prev) => ({ ...prev, photo: null })); setSelectedPhotoFile(null); resetPhotoState(); }}
                  className="flex items-center gap-1 text-litter-muted hover:text-red-500 transition-colors"
                >
                  <XIcon className="w-3 h-3" /> Remove photo
                </button>
              </div>
            )}
            <input id="add-cat-photo-input" type="file" accept={CAT_PHOTO_ACCEPT} onChange={handleFileChange} className="hidden" />
            {errors.photo && <p className="text-red-500 text-xs text-center">{errors.photo}</p>}
          </div>

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
                  onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
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

            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-theme-secondary mb-1.5">
                Gender <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.gender}
                onChange={(event) => {
                  setFormData((prev) => ({
                    ...prev,
                    gender: event.target.value as CatFormData["gender"],
                  }));
                  setErrors((prev) => ({ ...prev, gender: undefined }));
                }}
                className={`w-full px-3.5 py-3 rounded-xl border ${errors.gender ? "border-red-500" : "border-litter-border"} bg-[var(--color-input)] text-sm focus:outline-none focus:ring-2 focus:ring-litter-primary focus:border-transparent transition-all appearance-none cursor-pointer ${formData.gender ? "text-litter-text" : "text-[var(--color-placeholder)]"}`}
              >
                <option value="" disabled>Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              {errors.gender && <p className="text-red-500 text-xs mt-1">{errors.gender}</p>}
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

            {/* NOTE(manuscript): Section 3.3.6 registration no longer includes weight. */}
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
                  onChange={(event) => setFormData((prev) => ({ ...prev, rfidTag: event.target.value }))}
                  placeholder="Scan or enter RFID tag"
                  className={`w-full px-4 py-3 pr-12 rounded-xl border ${errors.rfidTag ? "border-red-500" : "border-litter-border"} bg-[var(--color-input)] text-litter-text placeholder:text-[var(--color-placeholder)] focus:outline-none focus:ring-2 focus:ring-litter-primary focus:border-transparent transition-all`}
                />
                <button
                  type="button"
                  title="Scan and verify RFID tag"
                  aria-label="Scan and verify RFID tag"
                  onClick={startEnrollment}
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
                setSelectedPhotoFile(null);
                resetPhotoState();
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
                  {uploadProgress === null ? "Saving..." : `Uploading photo — ${uploadProgress}%`}
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
      <BottomSheet isOpen={enrollmentOpen} onClose={closeEnrollment} title="Scan RFID Tag">
        <div className="space-y-5 text-litter-text">
          <p className="text-sm text-litter-muted">Hold the same tag near the RFID reader three times. Remove it for at least 3 seconds between scans.</p>
          <p className="text-xs text-litter-muted">After verification, press Save Cat to register the tag with this cat.</p>
          <div className="flex justify-center gap-3" aria-label={`${enrollment.count} of 3 scans confirmed`}>
            {[1, 2, 3].map((step) => <span key={step} className={`flex h-11 w-11 items-center justify-center rounded-full border-2 font-semibold transition-all duration-300 ${step <= enrollment.count ? "border-litter-primary bg-litter-primary text-white scale-110" : "border-litter-border text-litter-muted"}`}>{step <= enrollment.count ? "✓" : step}</span>)}
          </div>
          <div className="rounded-xl border border-litter-border bg-[var(--color-input)] p-4 text-center" aria-live="polite">
            {enrollment.status === "starting" || enrollment.status === "waiting" ? <p className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Connecting to RFID reader… An idle reader may take up to 60 seconds. Wait for “Reader ready” before scanning.</p> : null}
            {enrollment.status === "ready" ? <p>{enrollment.count ? `${enrollment.count} of 3 scans confirmed. Remove the tag, then scan it again.` : "Reader ready. Scan the tag now."}</p> : null}
            {enrollment.status === "verified" ? <p className="flex items-center justify-center gap-2 text-litter-primary"><Loader2 className="h-4 w-4 animate-spin" /> Verifying three matching scans…</p> : null}
            {enrollment.tag && <p className="mt-2 break-all font-mono text-sm">Tag code: {enrollment.tag}</p>}
            {enrollment.error && <p className="mt-2 text-sm text-red-500" role="alert">{enrollment.error}</p>}
          </div>
          {(enrollment.status === "error" || enrollment.status === "expired") && <button type="button" onClick={startEnrollment} className="w-full rounded-xl bg-litter-primary px-4 py-3 font-semibold text-white">Try again</button>}
          <button type="button" onClick={closeEnrollment} className="w-full rounded-xl border border-litter-border px-4 py-3">Cancel scan</button>
        </div>
      </BottomSheet>
    </div>
  );
}

// ── Cat Card ────────────────────────────────────────────────────────────────
interface CatCardProps {
  cat: Cat;
  details?: CatDetails;
  stats?: CatStats;
  sessions: Session[];
}

const formatLastVisit = (iso: string | undefined, hasData: boolean) => {
  if (!hasData || !iso) return "No data yet";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

function CatCard({ cat, details, stats, sessions }: CatCardProps) {
  const hasData = hasRecordedCatData({ sessions, stats });
  const baselineEstablished = hasEstablishedBaseline(details);
  const displayState = getMostSevereState(sessions
    .filter((session) => getSessionActivityDateKey(session) === getTodayDateKey())
    .map((session) => getSessionDisplayState({ ...session, isAttributed: Boolean(session.catId), baselineEstablished })));

  return (
    <div>
      <Link href={`/dashboard/cats/${cat.id}`}>
        <div className="bg-litter-card rounded-2xl shadow-sm border border-litter-border hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] transition-all cursor-pointer overflow-hidden">
          {/* Card top */}
          <div className="p-5 flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-full bg-litter-primary-light flex items-center justify-center text-litter-primary font-bold text-xl shrink-0">
              {cat.avatar ? (
                <Image
                  src={cat.avatar}
                  alt={cat.name}
                  width={56}
                  height={56}
                  unoptimized
                  className="w-full h-full rounded-full object-cover"
                  style={{ width: "100%", height: "100%" }}
                />
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
            <span className="text-xs text-litter-muted">Today</span><BehaviorStateBadge state={displayState} compact className="shrink-0" />
          </div>

          {/* Divider */}
          <div className="border-t border-litter-border mx-5" />

          {/* Stats row */}
          <div className="grid grid-cols-3 divide-x divide-litter-border px-5 py-4">
            <div className="pr-4">
              <p className="text-[10px] font-semibold text-litter-muted uppercase tracking-wider mb-1">Visits</p>
              <p className="font-bold text-litter-text text-lg">
                {formatMetricValue(stats?.visits ?? 0, hasData)}
              </p>
            </div>
            <div className="px-4">
              <p className="text-[10px] font-semibold text-litter-muted uppercase tracking-wider mb-1">Duration</p>
              <p className="font-bold text-litter-text text-lg">
                {formatMetricValue(stats?.avgDuration, hasData)}
              </p>
            </div>
            <div className="pl-4">
              <p className="text-[10px] font-semibold text-litter-muted uppercase tracking-wider mb-1">Last Visit</p>
              <p className="font-bold text-litter-text text-lg">
                {formatLastVisit(stats?.lastVisit, hasData)}
              </p>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
