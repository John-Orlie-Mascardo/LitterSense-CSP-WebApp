export const SETUP_DEVICE_PROVISION_URL = "http://192.168.4.1/provision";

const LOCALHOST_CONFIG_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

interface DeviceProvisioningBodyInput {
  wifiSsid: string;
  wifiPassword: string;
  configUrl?: string;
}

export function getHardwareConfigUrl(configUrl: string) {
  const trimmedUrl = configUrl.trim();

  if (!trimmedUrl) {
    return "";
  }

  try {
    const url = new URL(trimmedUrl);
    const hostname = url.hostname.toLowerCase();

    if (LOCALHOST_CONFIG_HOSTS.has(hostname)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

const normalizeOrigin = (origin: string) => {
  const trimmedOrigin = origin.trim();

  if (!trimmedOrigin) {
    return "";
  }

  try {
    return new URL(trimmedOrigin).origin;
  } catch {
    return "";
  }
};

export function getHardwareReachableOrigin(browserOrigin: string, fallbackOrigin = "") {
  const normalizedBrowserOrigin = normalizeOrigin(browserOrigin);
  const normalizedFallbackOrigin = normalizeOrigin(fallbackOrigin);

  if (!normalizedBrowserOrigin) {
    return normalizedFallbackOrigin;
  }

  try {
    const browserHostname = new URL(normalizedBrowserOrigin).hostname.toLowerCase();

    if (LOCALHOST_CONFIG_HOSTS.has(browserHostname) && normalizedFallbackOrigin) {
      return normalizedFallbackOrigin;
    }

    return normalizedBrowserOrigin;
  } catch {
    return normalizedFallbackOrigin;
  }
}

export function buildDeviceProvisioningBody({
  wifiSsid,
  wifiPassword,
  configUrl = "",
}: DeviceProvisioningBodyInput) {
  const body = new URLSearchParams({
    ssid: wifiSsid.trim(),
    password: wifiPassword.trim(),
  });
  const hardwareConfigUrl = getHardwareConfigUrl(configUrl);

  if (hardwareConfigUrl) {
    body.set("configUrl", hardwareConfigUrl);
  }

  return body;
}
