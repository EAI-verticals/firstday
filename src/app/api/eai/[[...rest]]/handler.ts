import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@enterpriseaigroup/core/server';
import {
  resolvePublicApiBaseUrl,
  RoutingResolutionError,
} from '@/lib/platform/session-resolve';
import {
  resolvePublicApiRoutePath,
  UnsupportedPublicApiRouteError,
} from '@/lib/platform/publicapi-route-family';

export interface RouteContext {
  params: Promise<{ rest?: string[] }>;
}

interface TraceHeaderContext {
  correlationId: string;
  requestId: string;
  traceparent: string | null;
  tracestate: string | null;
}

const TRACEPARENT_PATTERN =
  /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i;

function validTraceparent(traceparent: string | null): string | null {
  if (!traceparent) return null;
  const match = traceparent.match(TRACEPARENT_PATTERN);
  if (!match) return null;
  const [, traceId, spanId] = match;
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return null;
  return traceparent;
}

function normalizeHeaderValue(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function deriveTraceHeaderContext(request: NextRequest): TraceHeaderContext {
  const requestId =
    normalizeHeaderValue(request.headers.get('x-request-id')) ??
    globalThis.crypto?.randomUUID?.() ??
    `req_${Date.now().toString(36)}`;
  const correlationId =
    normalizeHeaderValue(request.headers.get('x-correlation-id')) ?? requestId;
  const traceparent = validTraceparent(request.headers.get('traceparent'));
  return {
    correlationId,
    requestId,
    traceparent,
    tracestate: traceparent ? request.headers.get('tracestate') : null,
  };
}

function stampTraceResponseHeaders(
  headers: Headers,
  traceContext: Pick<TraceHeaderContext, 'correlationId' | 'requestId'>,
): Headers {
  headers.set('x-request-id', traceContext.requestId);
  headers.set('x-correlation-id', traceContext.correlationId);
  return headers;
}

function jsonTraceHeaders(
  traceContext: Pick<TraceHeaderContext, 'correlationId' | 'requestId'>,
): Headers {
  return stampTraceResponseHeaders(
    new Headers({ 'Content-Type': 'application/json' }),
    traceContext,
  );
}

function applyTraceRequestHeaders(
  headers: Headers,
  traceContext: TraceHeaderContext,
): void {
  headers.delete('baggage');
  headers.delete('traceparent');
  headers.delete('tracestate');
  headers.set('x-request-id', traceContext.requestId);
  headers.set('x-correlation-id', traceContext.correlationId);
  if (traceContext.traceparent) {
    headers.set('traceparent', traceContext.traceparent);
    if (traceContext.tracestate) {
      headers.set('tracestate', traceContext.tracestate);
    }
  }
}

function getServerTenantId(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_EAI_TENANT_ID ||
    process.env.EAI_TENANT_ID ||
    process.env.TENANT_DEFAULT_ID
  );
}

function getProductSlug(): string {
  return (
    process.env.EAI_PRODUCT_SLUG ||
    process.env.NEXT_PUBLIC_APP_NAME ||
    'eai-app-template'
  );
}

// Content types that should be treated as binary (not logged as text)
const BINARY_CONTENT_TYPES = [
  'application/zip',
  'application/octet-stream',
  'application/pdf',
  'image/',
  'audio/',
  'video/',
];

function isBinaryContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return BINARY_CONTENT_TYPES.some((type) =>
    contentType.toLowerCase().includes(type),
  );
}

function resolveTenantScopedPlatformPath(path: string, tenantId?: string): string {
  if (!tenantId) return path;

  const encodedTenantId = encodeURIComponent(tenantId);
  if (path === 'v4/platform/users/by-email') {
    return `v4/platform/tenants/${encodedTenantId}/users/by-email`;
  }

  const membershipMatch = path.match(/^v4\/platform\/users\/([^/]+)\/memberships$/);
  if (membershipMatch?.[1]) {
    return `v4/platform/tenants/${encodedTenantId}/users/${membershipMatch[1]}/memberships`;
  }

  return path;
}

async function proxyRequest(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  const traceContext = deriveTraceHeaderContext(request);
  // Debug logs must never emit request/target URLs, paths, or tenant scope —
  // those can carry tenant IDs, emails, or other sensitive query parameters.
  console.log('[EAI Proxy] Route hit:', request.method);
  try {
    const params = await context.params;
    const path = params.rest?.join('/') || '';
    const fallbackBaseUrl = process.env.BASE_URL_PUBLIC_API;
    let baseUrl = fallbackBaseUrl;

    // Ensure baseUrl ends with / and path doesn't start with /
    const headers = new Headers(request.headers);
    headers.delete('cookie');
    headers.delete('host');
    headers.delete('tenant');
    headers.delete('x-tenant-id');
    applyTraceRequestHeaders(headers, traceContext);

    // Tenant app data-plane access is always user-delegated. Background work
    // should run through a user-requested platform workflow, not a broad app key.
    const token = await getAccessToken();

    if (token) {
      const resolved = await resolvePublicApiBaseUrl({
        accessToken: token,
        fallbackBaseUrl,
        product: getProductSlug(),
        currentAppHost: request.nextUrl.host,
        requestedTenantId: getServerTenantId(),
      });
      baseUrl = resolved.baseUrl;
      console.log('[EAI Proxy] Using user token');
      headers.set('Authorization', `Bearer ${token}`);
    } else {
      console.log('[EAI Proxy] No user token available');
      return new NextResponse(
        JSON.stringify({
          error: 'Authentication required',
          message:
            'EAI data-plane requests require a signed-in user session. Sign in and retry, or move background work into a user-authorized platform workflow.',
        }),
        {
          status: 401,
          headers: jsonTraceHeaders(traceContext),
        },
      );
    }

    if (!baseUrl) {
      throw new Error('Unable to resolve PublicAPI base URL');
    }

    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const targetPath = resolveTenantScopedPlatformPath(
      resolvePublicApiRoutePath(path),
      getServerTenantId(),
    );
    const targetUrl = new URL(targetPath, normalizedBaseUrl);

    // Preserve query params
    request.nextUrl.searchParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });

    // Keep the tenant header server-authoritative so clients cannot spoof tenant context.
    const serverTenantId = getServerTenantId();
    if (serverTenantId) {
      headers.set('tenant', serverTenantId);
      headers.set('X-Tenant-Id', serverTenantId);
    }

    const fetchOptions: RequestInit & { duplex?: 'half' } = {
      method: request.method,
      headers,
    };

    // Include body for methods that support it
    if (!['GET', 'HEAD'].includes(request.method)) {
      const contentType = request.headers.get('content-type') || '';

      // For JSON requests, read the body as text and forward it
      // This ensures the body is properly sent even if the stream was partially consumed
      if (contentType.includes('application/json')) {
        try {
          const bodyText = await request.text();
          if (bodyText) {
            fetchOptions.body = bodyText;
            console.log(
              '[EAI Proxy] Forwarding JSON body, length:',
              bodyText.length,
            );
          }
        } catch (e) {
          console.log('[EAI Proxy] Could not read JSON body:', e);
        }
      } else if (request.body) {
        // For other content types (FormData/multipart), use stream
        fetchOptions.body = request.body;
        fetchOptions.duplex = 'half';
      }
    }

    const response = await fetch(targetUrl.toString(), fetchOptions);

    const contentType = response.headers.get('content-type');
    const isBinary = isBinaryContentType(contentType);
    console.log('[EAI Proxy] Response status:', response.status);
    if (isBinary) {
      console.log('[EAI Proxy] Binary response, content-type:', contentType);
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');
    stampTraceResponseHeaders(responseHeaders, traceContext);

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[EAI Proxy] Request failed:', error);

    if (error instanceof RoutingResolutionError) {
      return new NextResponse(
        JSON.stringify({
          error: 'Routing resolution failed',
          message: error.message,
          details: error.responseBody,
        }),
        {
          status: error.statusCode,
          headers: jsonTraceHeaders(traceContext),
        },
      );
    }

    if (error instanceof UnsupportedPublicApiRouteError) {
      return new NextResponse(
        JSON.stringify({
          error: 'Legacy PublicAPI route retired',
          message: error.message,
        }),
        {
          status: error.statusCode,
          headers: jsonTraceHeaders(traceContext),
        },
      );
    }

    // Don't expose internal error details to client
    const isConfigError =
      error instanceof Error &&
      (error.message.includes('BASE_URL_PUBLIC_API') ||
        error.message.includes('PublicAPI base URL'));

    return new NextResponse(
      JSON.stringify({
        error: 'Proxy request failed',
        message: isConfigError
          ? 'Service configuration error'
          : 'An error occurred while processing your request',
      }),
      {
        status: 500,
        headers: jsonTraceHeaders(traceContext),
      },
    );
  }
}

export async function handleEaiProxyRequest(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  return proxyRequest(request, context);
}
