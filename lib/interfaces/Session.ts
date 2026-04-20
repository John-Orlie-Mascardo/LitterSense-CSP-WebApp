export interface Session {
  id: string;
  catId: string;
  date: string;
  time: string;
  durationSecs: number;
  mq135Delta: number;
  mq136Delta: number;
  anomaly: boolean;
  anomalyType: string | null;
}
