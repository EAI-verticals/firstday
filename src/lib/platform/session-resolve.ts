export type SessionResolveStatus =
  | 'resolved'
  | 'selection_required'
  | 'blocked';

export interface SessionResolveCandidateTenant {
  id: string;
  slug: string;
  displayName: string;
  depth: number;
  role: string;
  createdAt: string;
  homeRegion?: string | null;
  hqCountryCode?: string | null;
}

export interface SessionResolveResponse {
  status: SessionResolveStatus;
  userId: string;
  product: string;
  activeTenantId?: string | null;
  activeTenantSlug?: string | null;
  homeRegion?: string | null;
  productAllowed: boolean;
  apiBaseUrl?: string | null;
  appBaseUrl?: string | null;
  routingMode:
    | 'redirect'
    | 'in_place'
    | 'api_only'
    | 'selection_required'
    | 'blocked';
  currentHostMatchesTarget?: boolean | null;
  reason?: string | null;
  candidateTenants?: SessionResolveCandidateTenant[];
}

export interface ResolvePublicApiBaseUrlOptions {
  accessToken?: string | null;
  fallbackBaseUrl?: string | null;
  product: string;
  currentAppHost?: string | null;
  requestedTenantId?: string | null;
}

const DEFAULT_BOOTSTRAP_PUBLIC_API_URL = 'https://api.example.com';
const SESSION_RESOLVE_ROUTE = 'v4/identity/session/resolve';

export class RoutingResolutionError extends Error {
  readonly statusCode: number;
  readonly responseBody: SessionResolveResponse | null;

  constructor(
    message: string,
    statusCode: number,
    responseBody: SessionResolveResponse | null = null,
  ) {
    super(message);
    this.name = 'RoutingResolutionError';
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

function normalizeBaseUrl(baseUrl?: string | null): string | null {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return null;
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function getRoutingRedirectUrl(
  routing: SessionResolveResponse | null,
): string | null {
  if (
    !routing ||
    routing.status !== 'resolved' ||
    routing.routingMode !== 'redirect'
  ) {
    return null;
  }

  return normalizeBaseUrl(routing.appBaseUrl);
}

function buildBootstrapResolveUrl(): string {
  const bootstrapBaseUrl = normalizeBaseUrl(
    process.env.ROUTING_BOOTSTRAP_PUBLIC_API_URL ??
      DEFAULT_BOOTSTRAP_PUBLIC_API_URL,
  );

  if (!bootstrapBaseUrl) {
    return `${DEFAULT_BOOTSTRAP_PUBLIC_API_URL}/${SESSION_RESOLVE_ROUTE}`;
  }

  return `${bootstrapBaseUrl}/${SESSION_RESOLVE_ROUTE}`;
}

export async function resolvePublicApiBaseUrl(
  options: ResolvePublicApiBaseUrlOptions,
): Promise<{ baseUrl: string; routing: SessionResolveResponse | null }> {
  const fallbackBaseUrl = normalizeBaseUrl(options.fallbackBaseUrl);

  if (!options.accessToken) {
    if (!fallbackBaseUrl) {
      throw new RoutingResolutionError(
        'No authenticated user token is available and BASE_URL_PUBLIC_API is not configured',
        500,
      );
    }
    return { baseUrl: fallbackBaseUrl, routing: null };
  }

  const response = await fetch(buildBootstrapResolveUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      product: options.product,
      currentAppHost: options.currentAppHost ?? undefined,
      requestedTenantId: options.requestedTenantId ?? undefined,
    }),
  });

  let payload: SessionResolveResponse | null = null;
  try {
    payload = (await response.json()) as SessionResolveResponse;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (fallbackBaseUrl) {
      return { baseUrl: fallbackBaseUrl, routing: payload };
    }

    throw new RoutingResolutionError(
      'Routing bootstrap request failed',
      response.status,
      payload,
    );
  }

  if (!payload) {
    if (fallbackBaseUrl) {
      return { baseUrl: fallbackBaseUrl, routing: null };
    }

    throw new RoutingResolutionError(
      'Routing bootstrap returned an empty response',
      502,
    );
  }

  if (payload.status === 'resolved' && payload.apiBaseUrl) {
    return {
      baseUrl: normalizeBaseUrl(payload.apiBaseUrl) ?? payload.apiBaseUrl,
      routing: payload,
    };
  }

  if (payload.status === 'selection_required') {
    throw new RoutingResolutionError(
      'Tenant selection is required before routing can continue',
      409,
      payload,
    );
  }

  if (payload.status === 'blocked') {
    throw new RoutingResolutionError(
      payload.reason ?? 'Routing decision blocked the current session',
      403,
      payload,
    );
  }

  if (fallbackBaseUrl) {
    return { baseUrl: fallbackBaseUrl, routing: payload };
  }

  throw new RoutingResolutionError(
    'Routing bootstrap did not return apiBaseUrl',
    502,
    payload,
  );
}
