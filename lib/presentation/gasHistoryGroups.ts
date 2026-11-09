/**
 * Groups gas readings (newest first) into rows: back-to-back readings with the same
 * urine and stool status become one row ("Clear, 8:08–8:17 PM, 10 readings"), so a long
 * run of identical readings doesn't bury the detections. Nothing is dropped.
 */
export interface GasReadingLike {
  readonly id: string;
  readonly capturedAt: string | null;
  readonly receivedAt: string;
  readonly mq135Raw: number;
  readonly mq136Raw: number;
}

export interface GasReadingRow<T extends GasReadingLike> {
  readonly key: string;
  readonly urineDetected: boolean;
  readonly stoolDetected: boolean;
  readonly count: number;
  readonly newest: T;
  readonly oldest: T;
}

// Raw value 0 means the sensor detected odor (same rule the history list already used).
const urine = (reading: GasReadingLike) => reading.mq135Raw === 0;
const stool = (reading: GasReadingLike) => reading.mq136Raw === 0;

export function groupGasReadings<T extends GasReadingLike>(readings: readonly T[]): GasReadingRow<T>[] {
  const rows: GasReadingRow<T>[] = [];
  for (const reading of readings) {
    const last = rows[rows.length - 1];
    if (last && last.urineDetected === urine(reading) && last.stoolDetected === stool(reading)) {
      rows[rows.length - 1] = { ...last, count: last.count + 1, oldest: reading };
    } else {
      rows.push({ key: reading.id, urineDetected: urine(reading), stoolDetected: stool(reading), count: 1, newest: reading, oldest: reading });
    }
  }
  return rows;
}
