/**
 * HistoryDateRangeCalendar.tsx
 *
 * Touch-friendly month calendar for selecting an inclusive Session History range.
 *
 * DONE: month navigation, two-tap range selection, endpoint and middle highlighting
 * PLACEHOLDER: none
 *
 * NEXT: accessibility owners should preserve button labels and focus visibility.
 */

"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { selectCalendarDate } from "@/lib/presentation/sessionHistory";

export interface HistoryDateRangeCalendarProps {
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly onChange: (range: {
    readonly startDate: string;
    readonly endDate: string | null;
  }) => void;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toDateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export function HistoryDateRangeCalendar({
  startDate,
  endDate,
  onChange,
}: HistoryDateRangeCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const initial = startDate ? new Date(`${startDate}T00:00:00`) : new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const leadingDays = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const moveMonth = (amount: number) => {
    setVisibleMonth(new Date(year, month + amount, 1));
  };

  return (
    <div className="w-full rounded-2xl border border-litter-border bg-litter-card p-3">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => moveMonth(-1)}
          aria-label="Previous month"
          className="rounded-lg p-2 text-litter-muted hover:bg-theme-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-litter-primary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-semibold text-litter-text">
          {visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </p>
        <button
          type="button"
          onClick={() => moveMonth(1)}
          aria-label="Next month"
          className="rounded-lg p-2 text-litter-muted hover:bg-theme-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-litter-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="pb-2 text-[10px] font-semibold uppercase text-litter-muted">
            {weekday}
          </span>
        ))}
        {Array.from({ length: leadingDays }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const dateKey = toDateKey(year, month, day);
          const isEndpoint = dateKey === startDate || dateKey === endDate;
          const isRangeMiddle = Boolean(
            startDate && endDate && dateKey > startDate && dateKey < endDate,
          );
          return (
            <button
              key={dateKey}
              type="button"
              aria-label={new Date(year, month, day).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
              aria-pressed={isEndpoint}
              onClick={() => onChange(selectCalendarDate(startDate, endDate, dateKey))}
              className={`min-h-11 rounded-lg text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-litter-primary ${
                isEndpoint
                  ? "range-endpoint bg-litter-primary text-white"
                  : isRangeMiddle
                    ? "range-middle bg-litter-primary-light text-litter-primary"
                    : "text-litter-text hover:bg-theme-overlay"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
