export interface HealthLog {
  id: string;
  catId: string;
  date: string;
  type: "Vet Visit" | "Medication" | "Observation" | "Other";
  note: string;
}
