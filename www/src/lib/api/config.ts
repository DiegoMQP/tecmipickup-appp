const LOCAL_ORIGIN = "http://localhost:8080";

function normalizeOrigin(value: string) {
  return value.replace(/\/$/, "").replace(/\/api$/i, "");
}

function resolveBaseUrl(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin);
  }

  return LOCAL_ORIGIN;
}

export const apiConfig = {
  /** Origin only. Paths always start with `/api/...`. */
  get baseUrl() {
    return resolveBaseUrl();
  },
  /**
   * Local-only login. Leave unset (or `0`) to use the real API.
   * Set NEXT_PUBLIC_AUTH_BYPASS=1 to skip the backend.
   */
  get bypassAuth() {
    return process.env.NEXT_PUBLIC_AUTH_BYPASS === "1";
  },
};

