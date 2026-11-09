/**
 * Which boards have gone quiet, for the Home offline warning.
 *
 * Uses the heartbeat times the app already reads from /api/sensors; it does not
 * change sensor freshness rules (the 15 s / 120 s display timeouts stay as they are).
 * The longer 5-minute window avoids false alarms during short Wi-Fi blips.
 * shortcut: in-app only while Home is open; a server-side push needs the sensor
 * heartbeat logic reworked (see .docs/QA-PHASE1-REPORT.md C1), after the defense.
 */
export const DEVICE_OFFLINE_AFTER_MS = 5 * 60 * 1000;

export type BoardId = "rfid" | "gas-ultrasonic";

export interface OfflineBoard {
  readonly board: BoardId;
  readonly label: string;
  readonly lastSeenAt: string;
}

interface HeartbeatSnapshot {
  readonly rfidUpdatedAt?: string;
  readonly gasUltrasonicUpdatedAt?: string;
  readonly rfidCloudError?: boolean;
  readonly gasUltrasonicCloudError?: boolean;
}

const BOARDS: ReadonlyArray<{
  board: BoardId;
  label: string;
  lastSeen: (snapshot: HeartbeatSnapshot) => string | undefined;
  cloudError: (snapshot: HeartbeatSnapshot) => boolean | undefined;
}> = [
  { board: "rfid", label: "RFID reader", lastSeen: (s) => s.rfidUpdatedAt, cloudError: (s) => s.rfidCloudError },
  { board: "gas-ultrasonic", label: "Gas and doorway sensor", lastSeen: (s) => s.gasUltrasonicUpdatedAt, cloudError: (s) => s.gasUltrasonicCloudError },
];

export function getOfflineBoards(snapshot: HeartbeatSnapshot | null | undefined, now = Date.now()): OfflineBoard[] {
  if (!snapshot) return [];
  return BOARDS.flatMap(({ board, label, lastSeen, cloudError }) => {
    // A cloud read error means we can't tell; a board that never reported isn't "offline".
    if (cloudError(snapshot)) return [];
    const lastSeenAt = lastSeen(snapshot) ?? "";
    const seenAt = Date.parse(lastSeenAt);
    if (!Number.isFinite(seenAt) || now - seenAt <= DEVICE_OFFLINE_AFTER_MS) return [];
    return [{ board, label, lastSeenAt }];
  });
}
