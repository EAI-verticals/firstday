function stripLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '');
}

function withQuery(path: string, query: string): string {
  return query ? `${path}?${query}` : path;
}

function splitPathAndQuery(path: string): { routePath: string; query: string } {
  const [routePath, query = ''] = stripLeadingSlash(path).split('?', 2);
  return { routePath, query };
}

export class UnsupportedPublicApiRouteError extends Error {
  readonly statusCode = 410;

  constructor(readonly routePath: string) {
    super('Legacy PublicAPI route families are retired; use PublicAPI v4.');
    this.name = 'UnsupportedPublicApiRouteError';
  }
}

export function resolvePublicApiRoutePath(path: string): string {
  const { routePath, query } = splitPathAndQuery(path);
  if (/^v[1-3](?:\/|$)/.test(routePath)) {
    throw new UnsupportedPublicApiRouteError(routePath);
  }

  return withQuery(routePath, query);
}
