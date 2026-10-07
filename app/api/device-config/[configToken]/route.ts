import { getAdminFirestore } from "@/lib/configs/firebase-admin";

export const runtime = "nodejs";

const getString = (value: unknown) => (typeof value === "string" ? value : "");

const getUpdatedAt = (value: unknown) => {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }

  return "";
};

const getErrorCode = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return "";
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error.";
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ configToken: string }> },
) {
  const { configToken } = await context.params;
  if (!/^[A-Za-z0-9_-]{16,}$/.test(configToken)) {
    return Response.json(
      { error: "Invalid config token." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const configSnap = await getAdminFirestore()
      .doc(`deviceConfigs/${configToken}`)
      .get();
    if (!configSnap.exists) {
      return Response.json(
        { error: "Device config not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const data = configSnap.data() ?? {};

    return Response.json(
      {
        configToken,
        deviceName: getString(data.deviceName),
        wifiSsid: getString(data.wifiSsid),
        wifiPassword: getString(data.wifiPassword),
        updatedAt: getUpdatedAt(data.updatedAt),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const code = getErrorCode(error);
    const message = getErrorMessage(error);

    console.error("Failed to read device provisioning config.", {
      configToken,
      code,
      message,
    });

    return Response.json(
      {
        error: "Device config unavailable.",
        code,
        detail: message,
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
