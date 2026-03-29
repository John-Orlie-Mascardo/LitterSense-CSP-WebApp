"use client";

import { useState, useRef, useEffect } from "react";
import {
  Tag,
  ChevronDown,
  Search,
  Check,
  Plus,
  X as XIcon,
} from "lucide-react";

// ── Breed data ────────────────────────────────────────────────────────────────
export const PINNED_BREEDS = ["Puspin"];

export const CAT_BREEDS = [
  "Abyssinian", "American Bobtail", "American Curl", "American Shorthair",
  "American Wirehair", "Balinese", "Bengal", "Birman", "Bombay",
  "British Longhair", "British Shorthair", "Burmese", "Burmilla",
  "Chartreux", "Chausie", "Cornish Rex", "Devon Rex", "Domestic Longhair",
  "Domestic Shorthair", "Egyptian Mau", "Exotic Shorthair", "Havana Brown",
  "Himalayan", "Japanese Bobtail", "Javanese", "Khao Manee", "Korat",
  "LaPerm", "Maine Coon", "Manx", "Munchkin", "Nebelung",
  "Norwegian Forest Cat", "Ocicat", "Oriental Shorthair", "Persian",
  "Peterbald", "Pixie-Bob", "Ragamuffin", "Ragdoll", "Russian Blue",
  "Savannah", "Scottish Fold", "Selkirk Rex", "Siamese", "Siberian",
  "Singapura", "Snowshoe", "Somali", "Sphynx", "Thai",
  "Tonkinese", "Toyger", "Turkish Angora", "Turkish Van",
].sort();

// ── BreedPicker ───────────────────────────────────────────────────────────────
export interface BreedPickerProps {
  value: string;
  onChange: (v: string) => void;
  hasError?: boolean;
}

export function BreedPicker({ value, onChange, hasError }: BreedPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const filteredPinned = trimmed
    ? PINNED_BREEDS.filter((b) => b.toLowerCase().includes(trimmed.toLowerCase()))
    : PINNED_BREEDS;
  const filteredBreeds = trimmed
    ? CAT_BREEDS.filter((b) => b.toLowerCase().includes(trimmed.toLowerCase()))
    : CAT_BREEDS;
  const allKnown = [...PINNED_BREEDS, ...CAT_BREEDS];
  const showCustomOption =
    trimmed.length > 0 &&
    !allKnown.some((b) => b.toLowerCase() === trimmed.toLowerCase());

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (breed: string) => { onChange(breed); setOpen(false); setQuery(""); };
  const clear = (e: React.MouseEvent) => { e.stopPropagation(); onChange(""); setQuery(""); };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full flex items-center gap-2 px-3.5 py-3 rounded-xl border transition-all text-left ${
          open
            ? "border-litter-primary ring-2 ring-litter-primary/20"
            : hasError
            ? "border-red-500"
            : "border-litter-border"
        } bg-[var(--color-input)]`}
      >
        <Tag className="w-4 h-4 text-litter-muted shrink-0" />
        <span className={`flex-1 text-sm truncate ${value ? "text-litter-text" : "text-[var(--color-placeholder)]"}`}>
          {value || "Select a breed"}
        </span>
        {value ? (
          <XIcon onClick={clear} className="w-4 h-4 text-litter-muted hover:text-red-500 transition-colors shrink-0" />
        ) : (
          <ChevronDown className={`w-4 h-4 text-litter-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-2xl border border-litter-border bg-litter-card shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-litter-border">
            <Search className="w-4 h-4 text-litter-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search breeds…"
              className="flex-1 text-sm bg-transparent text-litter-text placeholder:text-[var(--color-placeholder)] focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>
                <XIcon className="w-3.5 h-3.5 text-litter-muted hover:text-litter-text transition-colors" />
              </button>
            )}
          </div>

          <ul className="max-h-52 overflow-y-auto py-1">
            {filteredPinned.length > 0 && (
              <>
                <li className="px-4 pt-2 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-litter-primary">Philippines</span>
                </li>
                {filteredPinned.map((breed) => (
                  <li key={breed}>
                    <button type="button" onClick={() => select(breed)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-litter-text hover:bg-litter-primary/10 transition-colors text-left">
                      {breed}
                      {value === breed && <Check className="w-4 h-4 text-litter-primary shrink-0" />}
                    </button>
                  </li>
                ))}
                {filteredBreeds.length > 0 && <li className="mx-4 my-1 border-t border-litter-border" />}
              </>
            )}

            {filteredBreeds.length > 0 && (
              <>
                {filteredPinned.length > 0 && (
                  <li className="px-4 pt-1 pb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-litter-muted">All Breeds</span>
                  </li>
                )}
                {filteredBreeds.map((breed) => (
                  <li key={breed}>
                    <button type="button" onClick={() => select(breed)}
                      className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-litter-text hover:bg-litter-primary/10 transition-colors text-left">
                      {breed}
                      {value === breed && <Check className="w-4 h-4 text-litter-primary shrink-0" />}
                    </button>
                  </li>
                ))}
              </>
            )}

            {showCustomOption && (
              <>
                {(filteredPinned.length > 0 || filteredBreeds.length > 0) && (
                  <li className="mx-4 my-1 border-t border-litter-border" />
                )}
                <li>
                  <button type="button" onClick={() => select(trimmed)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-litter-primary hover:bg-litter-primary/10 transition-colors text-left font-medium">
                    <Plus className="w-4 h-4 shrink-0" />
                    Use &ldquo;{trimmed}&rdquo;
                  </button>
                </li>
              </>
            )}

            {filteredPinned.length === 0 && filteredBreeds.length === 0 && !showCustomOption && (
              <li className="px-4 py-3 text-sm text-litter-muted text-center">No breeds found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Date of Birth picker ──────────────────────────────────────────────────────
export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const CURRENT_YEAR = new Date().getFullYear();
export const DOB_YEARS = Array.from({ length: 26 }, (_, i) => CURRENT_YEAR - i);

function daysInMonth(month: string, year: string): number {
  if (!month || !year) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

export interface MonthYearPickerProps {
  value: string; // "YYYY-MM" or "YYYY-MM-DD" or ""
  onChange: (v: string) => void;
  hasError?: boolean;
}

export function MonthYearPicker({ value, onChange, hasError }: MonthYearPickerProps) {
  const parts = value ? value.split("-") : [];
  const initYear  = parts[0] ?? "";
  const initMonth = parts[1] ?? "";
  const initDay   = parts[2] ?? "";

  const [year,  setYear]  = useState(initYear);
  const [month, setMonth] = useState(initMonth);
  const [day,   setDay]   = useState(initDay);

  useEffect(() => {
    const p = value ? value.split("-") : [];
    setYear(p[0] ?? "");
    setMonth(p[1] ?? "");
    setDay(p[2] ?? "");
  }, [value]);

  const emit = (y: string, m: string, d: string) => {
    if (y && m) onChange(d ? `${y}-${m}-${d}` : `${y}-${m}`);
    else onChange("");
  };

  const maxDay = daysInMonth(month, year);
  const dayOptions = Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, "0"));

  const selectClass = (filled: boolean, error?: boolean) =>
    `w-full px-3 py-3 rounded-xl border ${
      error ? "border-red-500" : filled ? "border-litter-primary" : "border-litter-border"
    } bg-[var(--color-input)] text-sm focus:outline-none focus:ring-2 focus:ring-litter-primary focus:border-transparent transition-all appearance-none cursor-pointer ${
      filled ? "text-litter-text" : "text-[var(--color-placeholder)]"
    }`;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-[2]">
          <select value={month} onChange={(e) => { setMonth(e.target.value); emit(year, e.target.value, day); }}
            className={selectClass(!!month, hasError && !month)}>
            <option value="" disabled>Month *</option>
            {MONTHS.map((m, i) => {
              const val = String(i + 1).padStart(2, "0");
              return <option key={val} value={val}>{m}</option>;
            })}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-litter-muted" />
        </div>
        <div className="relative flex-[2]">
          <select value={year} onChange={(e) => { setYear(e.target.value); emit(e.target.value, month, day); }}
            className={selectClass(!!year, hasError && !year)}>
            <option value="" disabled>Year *</option>
            {DOB_YEARS.map((y) => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-litter-muted" />
        </div>
      </div>
      <div className="relative w-full">
        <select value={day} onChange={(e) => { setDay(e.target.value); emit(year, month, e.target.value); }}
          className={selectClass(!!day, false)}>
          <option value="">Day (optional)</option>
          {dayOptions.map((d) => (
            <option key={d} value={d}>{Number(d)}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-litter-muted" />
      </div>
    </div>
  );
}
