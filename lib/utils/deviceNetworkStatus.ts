interface DeviceNetworkSummaryInput {
  isLoading: boolean;
  configuredSsid: string;
  connectedSsid?: string | null;
}

export function getDeviceNetworkSummary({
  isLoading,
  configuredSsid,
  connectedSsid,
}: DeviceNetworkSummaryInput) {
  if (isLoading) {
    return "Loading device setup...";
  }

  const liveSsid = connectedSsid?.trim() ?? "";
  if (liveSsid) {
    return `Connected: ${liveSsid}`;
  }

  const savedSsid = configuredSsid.trim();
  if (savedSsid) {
    return `Configured: ${savedSsid}`;
  }

  return "Set owner Wi-Fi and setup URL";
}
