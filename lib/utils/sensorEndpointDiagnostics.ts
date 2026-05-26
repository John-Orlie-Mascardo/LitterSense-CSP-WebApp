export type SensorProxyTargetKind =
  | "empty"
  | "invalid"
  | "loopback"
  | "private-lan"
  | "public";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const isPrivateIpv4 = (hostname: string) => {
  const parts = hostname.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
};

export function classifySensorProxyUrl(sensorUrl: string): SensorProxyTargetKind {
  const trimmedUrl = sensorUrl.trim();

  if (!trimmedUrl) {
    return "empty";
  }

  try {
    const { hostname } = new URL(trimmedUrl);
    const normalizedHostname = hostname.toLowerCase();

    if (LOOPBACK_HOSTS.has(normalizedHostname)) {
      return "loopback";
    }

    if (isPrivateIpv4(normalizedHostname) || normalizedHostname.endsWith(".local")) {
      return "private-lan";
    }

    return "public";
  } catch {
    return "invalid";
  }
}

export function shouldSkipServerSensorProxy(sensorUrl: string, isVercelRuntime: boolean) {
  if (!isVercelRuntime) {
    return false;
  }

  const targetKind = classifySensorProxyUrl(sensorUrl);
  return targetKind === "private-lan" || targetKind === "loopback";
}
