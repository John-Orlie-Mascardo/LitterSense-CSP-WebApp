type SensorCardStatus = "normal" | "abnormal" | "offline" | "watch";

export interface LiveSensorData {
  readonly online?: boolean;
  readonly gasUltrasonicOnline?: boolean;
  readonly mq135?: string;
  readonly mq136?: string;
  readonly mq135Raw?: number | null;
  readonly mq136Raw?: number | null;
  readonly rfidEvent?: string;
  readonly lastSessionStatus?: string;
  readonly sessionActive?: boolean;
  readonly distanceCm?: number | null;
}

interface LiveSensorStatusInput {
  readonly sensorData: LiveSensorData | null;
  readonly sensorsLoading: boolean;
  readonly sensorsError: string | null;
}

export interface SensorDisplayStatus {
  readonly value: string;
  readonly status: SensorCardStatus;
  readonly label: string;
}

const getSensorErrorLabel = (error: string) => {
  const normalized = error.toLowerCase();
  if (normalized.includes("unauthorized")) return "Sign in again";
  if (normalized.includes("unable to read device state") || normalized.includes("quota") || normalized.includes("sensor sync failed")) return "Cloud error";
  return "Connection error";
};

const getSensorErrorStatus = (error: string): SensorDisplayStatus => ({
  value: "Unavailable",
  status: "watch",
  label: getSensorErrorLabel(error),
});

const isGasDetected = (label: string, raw: number | null | undefined) => {
  const normalized = label.toLowerCase();
  return raw === 0 || normalized.includes("gas") || normalized.includes("detected");
};

const getLiveAirQualityValue = (
  mq135: string | undefined,
  mq136: string | undefined,
  mq135Raw: number | null | undefined,
  mq136Raw: number | null | undefined,
): "Normal" | "Abnormal" => {
  if (!mq135 || !mq136) return "Normal";
  return isGasDetected(mq135, mq135Raw) || isGasDetected(mq136, mq136Raw)
    ? "Abnormal"
    : "Normal";
};

const getUnavailableSensorStatus = (label: string): SensorDisplayStatus => ({
  value: "Offline",
  status: "offline",
  label,
});

const getLoadingSensorStatus = (): SensorDisplayStatus => ({
  value: "Syncing",
  status: "normal",
  label: "Connecting",
});

const getOnlineSensorStatus = (value: "Normal" | "Abnormal"): SensorDisplayStatus => ({
  value,
  status: value === "Abnormal" ? "abnormal" : "normal",
  label: value,
});

export const getLiveAirQualityStatus = ({
  sensorData,
  sensorsLoading,
  sensorsError,
}: LiveSensorStatusInput): SensorDisplayStatus => {
  if (sensorsError) return getSensorErrorStatus(sensorsError);
  if (sensorsLoading) return getLoadingSensorStatus();
  if (!(sensorData?.gasUltrasonicOnline ?? sensorData?.online)) return getUnavailableSensorStatus("Offline");

  return getOnlineSensorStatus(
    getLiveAirQualityValue(
      sensorData.mq135,
      sensorData.mq136,
      sensorData.mq135Raw,
      sensorData.mq136Raw,
    ),
  );
};

export const getLiveRfidStatus = ({
  sensorData,
  sensorsLoading,
  sensorsError,
}: LiveSensorStatusInput): SensorDisplayStatus => {
  if (sensorsError) return getSensorErrorStatus(sensorsError);
  if (sensorsLoading) return getLoadingSensorStatus();
  if (!sensorData?.online) return getUnavailableSensorStatus("Offline");

  return {
    value: sensorData.sessionActive ? "Online · In use" : "Online · Idle",
    status: "normal",
    label: sensorData.sessionActive ? "Occupied" : "Idle",
  };
};

export const getLiveUltrasonicStatus = ({ sensorData, sensorsLoading, sensorsError }: LiveSensorStatusInput): SensorDisplayStatus => {
  if (sensorsError) return getSensorErrorStatus(sensorsError);
  if (sensorsLoading) return getLoadingSensorStatus();
  if (!(sensorData?.gasUltrasonicOnline ?? sensorData?.online)) return getUnavailableSensorStatus("Offline");
  const distance = sensorData.distanceCm;
  return typeof distance === "number" && Number.isFinite(distance) && distance > 0
    ? { value: `${distance.toFixed(1)} cm`, status: "normal", label: "Online" }
    : { value: "No echo", status: "watch", label: "Online" };
};
