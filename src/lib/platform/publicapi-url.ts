export function normalizePublicApiBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/v4$/, '');
}

export function buildPublicApiUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, unknown>,
): string {
  const normalizedBaseUrl = normalizePublicApiBaseUrl(baseUrl);
  const normalizedPath = path.replace(/^\/+/, '');
  const url = new URL(
    `${normalizedBaseUrl}/${normalizedPath}`,
    'http://localhost',
  );

  Object.entries(params ?? {}).forEach(([key, value]) => {
    url.searchParams.set(
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    );
  });

  if (url.origin === 'http://localhost') {
    return `${url.pathname}${url.search}`;
  }

  return url.toString();
}
