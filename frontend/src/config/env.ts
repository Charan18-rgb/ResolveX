const DEFAULT_API_BASE_URL = "http://localhost:8000";

const envObj = import.meta.env as Record<string, string | undefined>;

export const ENV_CONFIG = {
  apiBaseUrl: envObj["VITE_API_BASE_URL"]?.trim() || DEFAULT_API_BASE_URL,
  appName: "ResolveX",
  appVersion: "2.0.0-unified",
} as const;
