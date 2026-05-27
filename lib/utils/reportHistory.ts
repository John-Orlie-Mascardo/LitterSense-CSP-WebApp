import type { PastReport } from "@/lib/interfaces/PastReport";

type FirestoreReportData = Record<string, unknown>;

const parseString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

export function normalizePastReport(
  id: string,
  data: FirestoreReportData,
): PastReport {
  return {
    id,
    catId: parseString(data.catId, "all"),
    catName: parseString(data.catName, "All Cats"),
    range: parseString(data.range),
    generatedOn: parseString(data.generatedOn),
    filename: parseString(data.filename, "LitterSense_Report.pdf"),
  };
}

export function sortPastReports(reports: PastReport[]) {
  return [...reports].sort((a, b) => {
    const bTime = Date.parse(b.generatedOn) || 0;
    const aTime = Date.parse(a.generatedOn) || 0;
    if (bTime !== aTime) return bTime - aTime;
    return b.id.localeCompare(a.id);
  });
}
