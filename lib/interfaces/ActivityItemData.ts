export interface ActivityItemData {
  catId: string;
  action: string;
  time: string;
  duration?: string;
  anomaly: boolean;
  anomalyNote?: string;
}
