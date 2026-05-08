import { createSign } from "node:crypto";

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

type FirestoreWrite = Record<string, unknown>;

interface ServiceAccountConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
}

interface TokenCache {
  accessToken: string;
  expiresAtMs: number;
}

export interface FirestoreRestDocument {
  id: string;
  path: string;
  data: Record<string, unknown>;
}

export class FirestoreRestError extends Error {
  status: number;
  detail: string;

  constructor(message: string, status: number, detail: string) {
    super(message);
    this.name = "FirestoreRestError";
    this.status = status;
    this.detail = detail;
  }
}

const TOKEN_SCOPE = "https://www.googleapis.com/auth/datastore";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";
const MAX_LIST_DOCUMENTS = 1000;

let tokenCache: TokenCache | null = null;

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

const base64UrlJson = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const normalizePrivateKey = (privateKey: string) =>
  privateKey.replace(/\\n/g, "\n").trim();

const parseServiceAccountJson = () => {
  const jsonValue =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ??
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const base64Value = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const raw = jsonValue || (base64Value ? Buffer.from(base64Value, "base64").toString("utf8") : "");

  if (!raw) return {};

  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error("Invalid Firebase service account JSON.");
  }
};

const getServiceAccountConfig = (): ServiceAccountConfig => {
  const parsed = parseServiceAccountJson();
  const projectId =
    parsed.project_id ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
    "";
  const clientEmail =
    parsed.client_email ?? process.env.FIREBASE_CLIENT_EMAIL ?? "";
  const privateKey =
    parsed.private_key ?? process.env.FIREBASE_PRIVATE_KEY ?? "";
  const tokenUri = parsed.token_uri ?? DEFAULT_TOKEN_URI;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase server credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
    tokenUri,
  };
};

const encodeFirestoreValue = (value: unknown): FirestoreValue => {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (typeof value === "boolean") {
    return { booleanValue: value };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { nullValue: null };
    if (Number.isInteger(value)) return { integerValue: value.toString() };
    return { doubleValue: value };
  }

  if (value instanceof Date) {
    return { timestampValue: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  }

  if (typeof value === "object") {
    return {
      mapValue: {
        fields: encodeFirestoreFields(value as Record<string, unknown>),
      },
    };
  }

  return { stringValue: String(value) };
};

const encodeFirestoreFields = (data: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      encodeFirestoreValue(value),
    ]),
  );

const decodeFirestoreValue = (value: Record<string, unknown>): unknown => {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;

  if ("arrayValue" in value) {
    const arrayValue = value.arrayValue as { values?: Record<string, unknown>[] };
    return (arrayValue.values ?? []).map(decodeFirestoreValue);
  }

  if ("mapValue" in value) {
    const mapValue = value.mapValue as {
      fields?: Record<string, Record<string, unknown>>;
    };
    return decodeFirestoreFields(mapValue.fields ?? {});
  }

  return null;
};

const decodeFirestoreFields = (
  fields: Record<string, Record<string, unknown>>,
) =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      decodeFirestoreValue(value),
    ]),
  );

async function getAccessToken(config: ServiceAccountConfig) {
  if (tokenCache && tokenCache.expiresAtMs > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iss: config.clientEmail,
    scope: TOKEN_SCOPE,
    aud: config.tokenUri,
    iat: now,
    exp: now + 3600,
  });
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(config.privateKey, "base64url");
  const assertion = `${signingInput}.${signature}`;

  const response = await fetch(config.tokenUri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const payloadJson = await response.json().catch(() => ({})) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payloadJson.access_token) {
    throw new FirestoreRestError(
      "Firebase service-account token exchange failed.",
      response.status,
      payloadJson.error_description ?? payloadJson.error ?? response.statusText,
    );
  }

  tokenCache = {
    accessToken: payloadJson.access_token,
    expiresAtMs: Date.now() + (payloadJson.expires_in ?? 3600) * 1000,
  };

  return tokenCache.accessToken;
}

export class FirestoreRestClient {
  private config: ServiceAccountConfig;

  constructor(config = getServiceAccountConfig()) {
    this.config = config;
  }

  private get documentBaseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      this.config.projectId,
    )}/databases/(default)/documents`;
  }

  private documentName(path: string) {
    return `projects/${this.config.projectId}/databases/(default)/documents/${path}`;
  }

  private documentUrl(path: string) {
    return `${this.documentBaseUrl}/${encodePath(path)}`;
  }

  private async fetchJson<T>(
    url: string,
    init: RequestInit,
    expectedStatuses = [200],
  ): Promise<{ status: number; data: T | null }> {
    const token = await getAccessToken(this.config);
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) as T : null;

    if (!expectedStatuses.includes(response.status)) {
      const detail =
        typeof data === "object" && data !== null && "error" in data
          ? JSON.stringify((data as { error: unknown }).error)
          : text;
      throw new FirestoreRestError(
        `Firestore request failed with ${response.status}.`,
        response.status,
        detail,
      );
    }

    return { status: response.status, data };
  }

  async getDocument(path: string): Promise<FirestoreRestDocument | null> {
    const response = await this.fetchJson<{
      name?: string;
      fields?: Record<string, Record<string, unknown>>;
    }>(
      this.documentUrl(path),
      { method: "GET" },
      [200, 404],
    );

    if (response.status === 404 || !response.data?.name) return null;

    const documentPath = response.data.name.split("/documents/")[1] ?? path;
    const segments = documentPath.split("/");

    return {
      id: segments[segments.length - 1] ?? "",
      path: documentPath,
      data: decodeFirestoreFields(response.data.fields ?? {}),
    };
  }

  async listDocuments(collectionPath: string): Promise<FirestoreRestDocument[]> {
    const documents: FirestoreRestDocument[] = [];
    let pageToken = "";

    do {
      const url = new URL(`${this.documentBaseUrl}/${encodePath(collectionPath)}`);
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const response = await this.fetchJson<{
        documents?: Array<{
          name?: string;
          fields?: Record<string, Record<string, unknown>>;
        }>;
        nextPageToken?: string;
      }>(
        url.toString(),
        { method: "GET" },
        [200, 404],
      );

      if (response.status === 404) return documents;

      for (const document of response.data?.documents ?? []) {
        if (!document.name) continue;
        const documentPath =
          document.name.split("/documents/")[1] ?? collectionPath;
        const segments = documentPath.split("/");
        documents.push({
          id: segments[segments.length - 1] ?? "",
          path: documentPath,
          data: decodeFirestoreFields(document.fields ?? {}),
        });
      }

      pageToken = response.data?.nextPageToken ?? "";
    } while (pageToken && documents.length < MAX_LIST_DOCUMENTS);

    return documents;
  }

  createSetWrite(
    path: string,
    data: Record<string, unknown>,
    options?: { exists?: boolean },
  ): FirestoreWrite {
    return {
      update: {
        name: this.documentName(path),
        fields: encodeFirestoreFields(data),
      },
      ...(options?.exists === undefined
        ? {}
        : { currentDocument: { exists: options.exists } }),
    };
  }

  createIncrementWrite(
    path: string,
    data: Record<string, unknown>,
    increments: Record<string, number>,
  ): FirestoreWrite {
    return {
      update: {
        name: this.documentName(path),
        fields: encodeFirestoreFields(data),
      },
      updateMask: {
        fieldPaths: Object.keys(data),
      },
      updateTransforms: Object.entries(increments).map(([fieldPath, value]) => ({
        fieldPath,
        increment: encodeFirestoreValue(value),
      })),
    };
  }

  async commit(writes: FirestoreWrite[]) {
    if (writes.length === 0) return;

    await this.fetchJson(
      `${this.documentBaseUrl}:commit`,
      {
        method: "POST",
        body: JSON.stringify({ writes }),
      },
      [200],
    );
  }
}

export const getFirestoreRestClient = () => new FirestoreRestClient();
