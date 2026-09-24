/**
 * The sole SDK owner of v4 resource URL construction and object-type transport
 * normalization. This module performs no I/O and never looks up aliases.
 */
export const OBJECT_TYPE_ROUTING_CONTRACT =
  'eai.object-type-routing/v1' as const;

export type ObjectTypeSlug = string & {
  readonly __objectTypeSlug: unique symbol;
};

export type ObjectTypeReference = string;

type ObjectTypeRoutingReason =
  | 'NAME_PATTERN'
  | 'SLUG_PATTERN'
  | 'SLUG_RESERVED';

export class ObjectTypeRoutingError extends Error {
  readonly code = 'OBJECT_TYPE_IDENTIFIER_INVALID';
  readonly contractVersion = OBJECT_TYPE_ROUTING_CONTRACT;

  constructor(readonly reason: ObjectTypeRoutingReason) {
    super(`Invalid object type identifier (${reason}).`);
    this.name = 'ObjectTypeRoutingError';
  }
}

const NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['operations', 'query', 'search', 'storage']);
const ESTABLISHED_NAME_SLUGS = new Map([['GitHubConnection', 'github-connection']]);

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 0x2f) end -= 1;
  return value.slice(0, end);
}

function isAsciiWhitespace(code: number): boolean {
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

function trimAsciiWhitespace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isAsciiWhitespace(value.charCodeAt(start))) start += 1;
  while (end > start && isAsciiWhitespace(value.charCodeAt(end - 1))) end -= 1;
  return value.slice(start, end);
}

/** Return the resource route-family root without adding dynamic segments. */
export function resourceRoutesBaseUrl(baseUrl: string): string {
  return `${trimTrailingSlashes(baseUrl)}/v4/data/resources`;
}

/** Implements the ordered eai.object-type-routing/v1 derivation algorithm. */
export function deriveObjectTypeSlugV1(value: string): string {
  const normalizedName = trimAsciiWhitespace(value);
  const derivationSource = ESTABLISHED_NAME_SLUGS.get(normalizedName) ?? normalizedName;

  return derivationSource
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\t\n\v\f\r ]+|_+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Asserts that a value is already an exact, transport-safe v1 slug. */
export function assertObjectTypeSlug(value: string): ObjectTypeSlug {
  if (!SLUG_PATTERN.test(value)) {
    throw new ObjectTypeRoutingError('SLUG_PATTERN');
  }
  if (RESERVED_SLUGS.has(value)) {
    throw new ObjectTypeRoutingError('SLUG_RESERVED');
  }
  return value as ObjectTypeSlug;
}

export interface ResourceRouting {
  transportSlug(value: ObjectTypeReference): ObjectTypeSlug;
  transportSlugs(values: readonly ObjectTypeReference[]): ObjectTypeSlug[];
  collection(objectType: ObjectTypeReference): string;
  member(objectType: ObjectTypeReference, resourceId: string): string;
  subresource(
    objectType: ObjectTypeReference,
    resourceId: string,
    ...segments: string[]
  ): string;
  collectionOperation(
    objectType: ObjectTypeReference,
    ...segments: string[]
  ): string;
  query(): string;
  search(): string;
  schema(): string;
  objectTypes(): string;
  objectType(objectTypeId: string): string;
  parent(
    objectType: ObjectTypeReference,
    resourceId: string,
    parentType: ObjectTypeReference,
    parentId: string,
  ): string;
}

class ResourceRoutingV1 implements ResourceRouting {
  private readonly resourcesBaseUrl: string;
  private readonly tenantPath: string;

  constructor(input: { baseUrl: string; tenantId: string }) {
    this.resourcesBaseUrl = resourceRoutesBaseUrl(input.baseUrl);
    this.tenantPath = encodeURIComponent(input.tenantId);
  }

  transportSlug(value: ObjectTypeReference): ObjectTypeSlug {
    if (SLUG_PATTERN.test(value)) {
      return assertObjectTypeSlug(value);
    }
    if (!NAME_PATTERN.test(value)) {
      throw new ObjectTypeRoutingError('NAME_PATTERN');
    }
    return assertObjectTypeSlug(deriveObjectTypeSlugV1(value));
  }

  transportSlugs(values: readonly ObjectTypeReference[]): ObjectTypeSlug[] {
    return values.map((value) => this.transportSlug(value));
  }

  collection(objectType: ObjectTypeReference): string {
    return `${this.resourcesBaseUrl}/${this.tenantPath}/${encodeURIComponent(this.transportSlug(objectType))}`;
  }

  member(objectType: ObjectTypeReference, resourceId: string): string {
    return `${this.collection(objectType)}/${encodeURIComponent(resourceId)}`;
  }

  subresource(
    objectType: ObjectTypeReference,
    resourceId: string,
    ...segments: string[]
  ): string {
    return `${this.member(objectType, resourceId)}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
  }

  collectionOperation(
    objectType: ObjectTypeReference,
    ...segments: string[]
  ): string {
    return `${this.collection(objectType)}/${segments.map((segment) => encodeURIComponent(segment)).join('/')}`;
  }

  query(): string {
    return `${this.resourcesBaseUrl}/${this.tenantPath}/query`;
  }

  search(): string {
    return `${this.resourcesBaseUrl}/${this.tenantPath}/search`;
  }

  schema(): string {
    return `${this.resourcesBaseUrl}/schema/${this.tenantPath}`;
  }

  objectTypes(): string {
    return `${this.resourcesBaseUrl}/object-types`;
  }

  objectType(objectTypeId: string): string {
    return `${this.objectTypes()}/${encodeURIComponent(objectTypeId)}`;
  }

  parent(
    objectType: ObjectTypeReference,
    resourceId: string,
    parentType: ObjectTypeReference,
    parentId: string,
  ): string {
    return this.subresource(
      objectType,
      resourceId,
      'parents',
      this.transportSlug(parentType),
      parentId,
    );
  }
}

export function createResourceRouting(input: {
  baseUrl: string;
  tenantId: string;
}): ResourceRouting {
  return new ResourceRoutingV1(input);
}
