/**
 * HistoryFilters.tsx
 *
 * Responsive Session History presets, calendar, cat/state filters, and sort controls.
 *
 * DONE: sticky desktop panel, mobile bottom sheet, six-state multi-select, Apply gate
 * PLACEHOLDER: none
 *
 * NEXT: route owners should keep URL persistence in the History page boundary.
 */

"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { HistoryDateRangeCalendar } from "@/components/history/HistoryDateRangeCalendar";
import type { Cat } from "@/lib/interfaces/Cat";
import {
  BEHAVIOR_STATES,
  type BehaviorStateId,
} from "@/lib/presentation/behaviorStates";
import {
  formatHistoryRange,
  getHistoryPresetRange,
  type HistoryFilters as HistoryFilterValue,
  type HistoryPreset,
} from "@/lib/presentation/sessionHistory";

type DraftFilters = Omit<HistoryFilterValue, "endDate"> & {
  readonly endDate: string | null;
};

const PRESETS: readonly { readonly value: HistoryPreset; readonly label: string }[] = [
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "thisMonth", label: "This month" },
  { value: "custom", label: "Custom" },
];

function FilterFields({
  draft,
  cats,
  onChange,
  onApply,
}: {
  readonly draft: DraftFilters;
  readonly cats: readonly Cat[];
  readonly onChange: (next: DraftFilters) => void;
  readonly onApply: () => void;
}) {
  const choosePreset = (preset: HistoryPreset) => {
    if (preset === "custom") {
      onChange({ ...draft, preset });
      return;
    }
    onChange({ ...draft, ...getHistoryPresetRange(preset), preset });
  };
  const toggleState = (state: BehaviorStateId) => {
    const hasState = draft.states.includes(state);
    if (hasState && draft.states.length === 1) return;
    onChange({
      ...draft,
      states: hasState
        ? draft.states.filter((item) => item !== state)
        : [...draft.states, state],
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-litter-muted">Date range</p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => choosePreset(preset.value)}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                draft.preset === preset.value
                  ? "border-litter-primary bg-litter-primary text-white"
                  : "border-litter-border bg-litter-card text-litter-muted hover:border-litter-primary"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <HistoryDateRangeCalendar
        key={draft.startDate.slice(0, 7)}
        startDate={draft.startDate}
        endDate={draft.endDate}
        onChange={(range) => onChange({ ...draft, ...range, preset: "custom" })}
      />
      <p className="text-sm font-medium text-litter-text">
        {draft.endDate
          ? formatHistoryRange(draft.startDate, draft.endDate)
          : `${new Date(`${draft.startDate}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })} – Choose an end date`}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-litter-text">
          Cat
          <select
            value={draft.catId}
            onChange={(event) => onChange({ ...draft, catId: event.target.value })}
            className="mt-2 w-full rounded-xl border border-litter-border bg-litter-input px-3 py-3 text-litter-text"
          >
            <option value="all">All cats</option>
            {cats.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            <option value="unattributed">Unattributed</option>
          </select>
        </label>
        <label className="text-sm font-medium text-litter-text">
          Sort
          <select
            value={draft.sort}
            onChange={(event) => onChange({
              ...draft,
              sort: event.target.value === "asc" ? "asc" : "desc",
            })}
            className="mt-2 w-full rounded-xl border border-litter-border bg-litter-input px-3 py-3 text-litter-text"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-litter-muted">States</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {BEHAVIOR_STATES.map((state) => (
            <label key={state.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-litter-border px-3 py-2 text-xs font-medium text-litter-text">
              <input
                type="checkbox"
                checked={draft.states.includes(state.id)}
                onChange={() => toggleState(state.id)}
                className="accent-litter-primary"
              />
              <span className={`h-2 w-2 rounded-full ${state.dotClass}`} />
              {state.label}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={onApply}
        disabled={!draft.endDate}
        className="w-full rounded-xl bg-litter-primary px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        Apply filters
      </button>
    </div>
  );
}

export function SessionHistoryFilters({
  filters,
  cats,
  onApply,
}: {
  readonly filters: HistoryFilterValue;
  readonly cats: readonly Cat[];
  readonly onApply: (filters: HistoryFilterValue) => void;
}) {
  const [draft, setDraft] = useState<DraftFilters>(filters);
  const [mobileOpen, setMobileOpen] = useState(false);
  const apply = () => {
    if (!draft.endDate) return;
    onApply({ ...draft, endDate: draft.endDate });
    setMobileOpen(false);
  };

  return (
    <>
      <div className="sticky top-20 z-20 hidden rounded-2xl border border-litter-border bg-litter-card/95 p-4 shadow-sm backdrop-blur md:block">
        <FilterFields draft={draft} cats={cats} onChange={setDraft} onApply={apply} />
      </div>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-litter-border bg-litter-card px-4 py-2 text-sm font-semibold text-litter-text md:hidden"
      >
        <Filter className="h-4 w-4" />
        Filters
      </button>
      <BottomSheet isOpen={mobileOpen} onClose={() => setMobileOpen(false)} title="Session filters">
        <FilterFields draft={draft} cats={cats} onChange={setDraft} onApply={apply} />
      </BottomSheet>
    </>
  );
}
