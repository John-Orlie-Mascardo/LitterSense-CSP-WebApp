type SensorCardStatus = "normal" | "abnormal";
type SensorDisplayValue = "Offline" | "Syncing" | "Normal" | "Abnormal" | "Online";

export interface LiveSensorData {
  readonly online?: boolean;
  readonly mq135?: string;
  readonly mq136?: string;
  readonly mq135Raw?: number | null;
  readonly mq136Raw?: number | null;
  readonly rfidEvent?: string;
  readonly lastSessionStatus?: string;
}

interface LiveSensorStatusInput {
  readonly sensorData: LiveSensorData | null;
  readonly sensorsLoading: boolean;
  readonly sensorsError: string | null;
}

export interface SensorDisplayStatus {
  readonly value: SensorDisplayValue;
  readonly status: SensorCardStatus;
  readonly label: string;
}

const getSensorErrorLabel = (error: string | null) => {
  if (!error) return "Check IP";

  const normalized = error.toLowerCase();
  if (normalized.includes("timed out")) return "Timeout";
  if (normalized.includes("returned 404")) return "Missing route";
  if (
    normalized.includes("unavailable") ||
    normalized.includes("fetch failed") ||
    normalized.includes("econnrefused") ||
    normalized.includes("bad port")
  ) {
    return "Server down";
  }

  return "Check IP";
};

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
  status: "abnormal",
  label,
});

const getLoadingSensorStatus = (): SensorDisplayStatus => ({
  value: "Syncing",
  status: "normal",
  label: "Polling",
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
  if (sensorsError) return getUnavailableSensorStatus(getSensorErrorLabel(sensorsError));
  if (sensorsLoading) return getLoadingSensorStatus();
  if (!sensorData?.online) return getUnavailableSensorStatus("No data");

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
  if (sensorsError) return getUnavailableSensorStatus(getSensorErrorLabel(sensorsError));
  if (sensorsLoading) return getLoadingSensorStatus();
  if (!sensorData?.online) return getUnavailableSensorStatus("No data");

  return {
    value: "Online",
    status: "normal",
    label: "Live",
  };
};
