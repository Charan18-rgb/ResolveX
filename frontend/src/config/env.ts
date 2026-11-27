const DEFAULT_API_BASE_URL = 'http://localhost:8000'

export const ENV_CONFIG = {
  apiBaseUrl:
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ||
    DEFAULT_API_BASE_URL,
  appName: 'ResolveX',
  appVersion: '0.1.0-frontend',
} as const
