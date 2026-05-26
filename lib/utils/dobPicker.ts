export interface DobDraft {
  year: string;
  month: string;
  day: string;
}

export function daysInDobMonth(month: string, year: string): number {
  if (!month || !year) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

export function getValidDobDay(
  day: string,
  month: string,
  year: string,
): string {
  if (!day) return "";

  const numericDay = Number(day);
  if (!Number.isInteger(numericDay) || numericDay < 1) return "";

  return numericDay <= daysInDobMonth(month, year)
    ? String(numericDay).padStart(2, "0")
    : "";
}

export function parseDobValue(value: string): DobDraft {
  const parts = value ? value.split("-") : [];
  const year = parts[0] ?? "";
  const month = parts[1] ?? "";
  const day = getValidDobDay(parts[2] ?? "", month, year);

  return { year, month, day };
}

export function formatDobValue(draft: DobDraft): string {
  if (!draft.year || !draft.month) return "";
  return draft.day
    ? `${draft.year}-${draft.month}-${draft.day}`
    : `${draft.year}-${draft.month}`;
}

export function resolveDobDraft(
  current: DobDraft,
  updates: Partial<DobDraft>,
): { draft: DobDraft; value: string } {
  const year = updates.year ?? current.year;
  const month = updates.month ?? current.month;
  const day = getValidDobDay(updates.day ?? current.day, month, year);
  const draft = { year, month, day };

  return {
    draft,
    value: formatDobValue(draft),
  };
}

export function isCompleteDobValue(value: string): boolean {
  const draft = parseDobValue(value);
  return Boolean(draft.year && draft.month);
}
