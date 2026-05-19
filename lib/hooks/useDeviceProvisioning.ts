"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/configs/firebase";
import { useAuth } from "@/lib/contexts/AuthContext";

const OWNER_DEVICE_CONFIG_DOC_ID = "default";
const DEFAULT_DEVICE_NAME = "LitterSense Unit #1";

export interface DeviceProvisioningConfig {
  deviceName: string;
  wifiSsid: string;
  wifiPassword: string;
  configToken: string;
  updatedAtLabel: string;
}

const createConfigToken = () => {
  const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `cfg_${uuid.replace(/-/g, "")}`;
};

const defaultDeviceProvisioningConfig = (): DeviceProvisioningConfig => ({
  deviceName: DEFAULT_DEVICE_NAME,
  wifiSsid: "",
  wifiPassword: "",
  configToken: createConfigToken(),
  updatedAtLabel: "Not synced yet",
});

const formatUpdatedAt = (value: unknown) => {
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return "Not synced yet";
};

export function useDeviceProvisioning() {
  const { user, loading: authLoading } = useAuth();
  const [deviceConfig, setDeviceConfig] = useState<DeviceProvisioningConfig>(
    defaultDeviceProvisioningConfig,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const hasLocalEditsRef = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setDeviceConfig(defaultDeviceProvisioningConfig());
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const loadConfig = async () => {
      setIsLoading(true);
      hasLocalEditsRef.current = false;

      try {
        const ownerConfigRef = doc(
          db,
          "users",
          user.uid,
          "deviceConfig",
          OWNER_DEVICE_CONFIG_DOC_ID,
        );
        const ownerConfigSnap = await getDoc(ownerConfigRef);
        const ownerConfigData = ownerConfigSnap.data();
        const configToken =
          typeof ownerConfigData?.configToken === "string" && ownerConfigData.configToken
            ? ownerConfigData.configToken
            : createConfigToken();

        const publicConfigRef = doc(db, "deviceConfigs", configToken);
        const publicConfigSnap = await getDoc(publicConfigRef);
        const publicConfigData = publicConfigSnap.data();

        if (isCancelled) return;

        const loadedConfig = {
          deviceName:
            typeof publicConfigData?.deviceName === "string" && publicConfigData.deviceName
              ? publicConfigData.deviceName
              : typeof ownerConfigData?.deviceName === "string" && ownerConfigData.deviceName
                ? ownerConfigData.deviceName
                : DEFAULT_DEVICE_NAME,
          wifiSsid:
            typeof publicConfigData?.wifiSsid === "string" ? publicConfigData.wifiSsid : "",
          wifiPassword:
            typeof publicConfigData?.wifiPassword === "string"
              ? publicConfigData.wifiPassword
              : "",
          configToken,
          updatedAtLabel: formatUpdatedAt(
            publicConfigData?.updatedAt ?? ownerConfigData?.updatedAt,
          ),
        };

        if (!hasLocalEditsRef.current) {
          setDeviceConfig(loadedConfig);
        }
      } catch {
        // Keep any setup-AP edits in place so local provisioning can continue offline.
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadConfig();

    return () => {
      isCancelled = true;
    };
  }, [authLoading, user]);

  const saveDeviceConfig = useCallback(
    async (nextConfig: DeviceProvisioningConfig) => {
      if (!user) {
        throw new Error("Sign in first to manage device provisioning.");
      }

      const wifiSsid = nextConfig.wifiSsid.trim();
      const wifiPassword = nextConfig.wifiPassword.trim();
      const deviceName = nextConfig.deviceName.trim() || DEFAULT_DEVICE_NAME;
      const configToken = nextConfig.configToken.trim() || createConfigToken();
      const previousToken = deviceConfig.configToken;

      setIsSaving(true);

      try {
        const batch = writeBatch(db);

        const ownerConfigRef = doc(
          db,
          "users",
          user.uid,
          "deviceConfig",
          OWNER_DEVICE_CONFIG_DOC_ID,
        );
        batch.set(
          ownerConfigRef,
          {
            configToken,
            deviceName,
            wifiSsid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        const publicConfigRef = doc(db, "deviceConfigs", configToken);
        batch.set(publicConfigRef, {
          ownerId: user.uid,
          configToken,
          deviceName,
          wifiSsid,
          wifiPassword,
          updatedAt: serverTimestamp(),
        });

        if (previousToken && previousToken !== configToken) {
          batch.delete(doc(db, "deviceConfigs", previousToken));
        }

        await batch.commit();

        setDeviceConfig({
          deviceName,
          wifiSsid,
          wifiPassword,
          configToken,
          updatedAtLabel: "Just now",
        });
        hasLocalEditsRef.current = false;
      } finally {
        setIsSaving(false);
      }
    },
    [deviceConfig.configToken, user],
  );

  const regenerateConfigToken = useCallback(() => {
    hasLocalEditsRef.current = true;
    setDeviceConfig((prev) => ({
      ...prev,
      configToken: createConfigToken(),
      updatedAtLabel: prev.updatedAtLabel,
    }));
  }, []);

  const updateDeviceConfig = useCallback<Dispatch<SetStateAction<DeviceProvisioningConfig>>>(
    (nextConfig) => {
      hasLocalEditsRef.current = true;
      setDeviceConfig(nextConfig);
    },
    [],
  );

  const provisioningUrl = useMemo(() => {
    if (globalThis.window === undefined) return "";
    return `${window.location.origin}/api/device-config/${deviceConfig.configToken}`;
  }, [deviceConfig.configToken]);

  return {
    deviceConfig,
    setDeviceConfig: updateDeviceConfig,
    saveDeviceConfig,
    regenerateConfigToken,
    provisioningUrl,
    isLoading,
    isSaving,
  };
}
