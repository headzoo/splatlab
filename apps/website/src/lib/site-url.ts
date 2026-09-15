const LOCAL_DEV_ORIGIN = "http://localhost:3000";

function normalizeConfiguredOrigin(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProtocol);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    return new URL(parsed.origin);
  } catch {
    return null;
  }
}

/** Stable public site origin for absolute share, embed, and crawler URLs. */
export function resolveSiteOrigin(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    const normalized = normalizeConfiguredOrigin(configured);
    if (normalized) return normalized;
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) {
    const normalized = normalizeConfiguredOrigin(productionHost);
    if (normalized) return normalized;
  }

  const previewHost = process.env.VERCEL_URL?.trim();
  if (previewHost) {
    const normalized = normalizeConfiguredOrigin(previewHost);
    if (normalized) return normalized;
  }

  return new URL(LOCAL_DEV_ORIGIN);
}

export function absoluteSiteUrl(pathname: string, origin = resolveSiteOrigin()): string {
  const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return new URL(normalizedPath, origin).href;
}
